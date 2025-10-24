"""Cards API endpoints for creating and fetching card metadata."""
import logging
import json
import io
import zipfile
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google.cloud import datastore, storage
from PIL import Image, ImageDraw
import ulid
import asyncio
import media_utils

logger = logging.getLogger(__name__)

router = APIRouter()

# Reference to the WebSocket server (will be set by server.py)
yjs_server = None

# Color palette with matching names (16 colors)
PALETTE = [
    {"name": "Green", "color": "#6BCB77"},
    {"name": "Gold", "color": "#FFD93D"},
    {"name": "Red", "color": "#FF6B6B"},
    {"name": "Blue", "color": "#4D96FF"},
    {"name": "Purple", "color": "#845EC2"},
    {"name": "Pink", "color": "#FF6BA8"},
    {"name": "Orange", "color": "#FF9A56"},
    {"name": "Teal", "color": "#4ECDC4"},
    {"name": "Indigo", "color": "#6A5ACD"},
    {"name": "Coral", "color": "#FF7F7F"},
    {"name": "Lime", "color": "#A8E6CF"},
    {"name": "Amber", "color": "#FFB347"},
    {"name": "Cyan", "color": "#00D9FF"},
    {"name": "Magenta", "color": "#D946EF"},
    {"name": "Mint", "color": "#98D8C8"},
    {"name": "Peach", "color": "#FFB88C"},
]

# Lorem ipsum sentences for random prompts
LOREM_SENTENCES = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "Ut enim ad minim veniam, quis nostrud exercitation ullamco.",
    "Duis aute irure dolor in reprehenderit in voluptate velit.",
    "Excepteur sint occaecat cupidatat non proident sunt in culpa.",
    "Vivamus sagittis lacus vel augue laoreet rutrum faucibus.",
    "Pellentesque habitant morbi tristique senectus et netus.",
    "Mauris blandit aliquet elit, eget tincidunt nibh pulvinar.",
    "Vestibulum ante ipsum primis in faucibus orci luctus.",
    "Curabitur non nulla sit amet nisl tempus convallis quis.",
    "Donec sollicitudin molestie malesuada proin eget tortor.",
    "Nulla porttitor accumsan tincidunt cras ultricies ligula.",
    "Praesent sapien massa, convallis a pellentesque nec egestas.",
    "Quisque velit nisi, pretium ut lacinia in elementum.",
    "Cras ultricies ligula sed magna dictum porta curabitur.",
]

# Datastore client (singleton)
ds_client = None
gcs_client = None
bucket_name = None


def init_clients(gcs_bucket: str):
    """Initialize Datastore and GCS clients."""
    global ds_client, gcs_client, bucket_name

    # Log credentials being used
    import os
    creds_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    logger.info(f"GOOGLE_APPLICATION_CREDENTIALS: {creds_path}")

    # Explicitly specify project to avoid using wrong default
    ds_client = datastore.Client(project='esproto', namespace='nanosheet')
    logger.info(f"Datastore client project: {ds_client.project}")
    logger.info(f"Datastore client namespace: {ds_client.namespace}")

    gcs_client = storage.Client(project='esproto')
    bucket_name = gcs_bucket
    logger.info("Initialized Datastore and GCS clients for project: esproto")


class Card(BaseModel):
    """Card model."""
    cardId: str
    title: str
    color: str
    prompt: str = ""
    number: Optional[int] = None
    media_url: Optional[str] = None
    thumb_url: Optional[str] = None
    media_type: Optional[str] = None  # "image" or "video"
    createdAt: str


class CreateCardRequest(BaseModel):
    """Request to create a new card."""
    title: Optional[str] = None
    color: Optional[str] = None
    prompt: Optional[str] = None
    media_url: Optional[str] = None
    thumb_url: Optional[str] = None
    media_type: Optional[str] = None  # "image" or "video"


class UpdateCardRequest(BaseModel):
    """Request to update a card."""
    title: Optional[str] = None
    color: Optional[str] = None
    prompt: Optional[str] = None
    media_url: Optional[str] = None
    thumb_url: Optional[str] = None
    media_type: Optional[str] = None  # "image" or "video"


@router.post("/api/cards", response_model=Card)
async def create_card(request: CreateCardRequest = CreateCardRequest()):
    """
    Create a new card in Datastore and optionally mirror to GCS.

    Returns:
        Card: The created card metadata
    """
    import time
    start_time = time.time()

    if ds_client is None:
        raise HTTPException(status_code=500, detail="Datastore client not initialized")

    try:
        # Generate ULID
        card_id = str(ulid.new())
        logger.debug(f"Generated ULID: {time.time() - start_time:.3f}s")

        # Use provided values or generate random ones
        import random
        if request.title and request.color:
            title = request.title
            color = request.color
        else:
            # Pick a random color and use its matching name with number
            card_style = random.choice(PALETTE)
            number = random.randint(1, 99)
            title = request.title or f"{card_style['name']} {number:02d}"
            color = request.color or card_style["color"]
        prompt = request.prompt or random.choice(LOREM_SENTENCES)
        created_at = datetime.now(timezone.utc).isoformat()

        # Get media URLs and type from request
        media_url = request.media_url
        thumb_url = request.thumb_url
        media_type = request.media_type  # "image", "video", or None

        # Save to Datastore
        t1 = time.time()
        key = ds_client.key("Card", card_id)
        entity = datastore.Entity(key=key)
        entity.update({
            "cardId": card_id,
            "title": title,
            "color": color,
            "prompt": prompt,
            "media_url": media_url,
            "thumb_url": thumb_url,
            "media_type": media_type,
            "createdAt": created_at,
        })
        logger.debug(f"Created entity: {time.time() - t1:.3f}s")

        t2 = time.time()
        ds_client.put(entity)
        logger.debug(f"Datastore put: {time.time() - t2:.3f}s")

        # Optionally mirror to GCS as JSON
        if gcs_client and bucket_name:
            try:
                bucket = gcs_client.bucket(bucket_name)
                blob = bucket.blob(f"cards/{card_id}.json")
                card_data = {
                    "cardId": card_id,
                    "title": title,
                    "color": color,
                    "prompt": prompt,
                    "createdAt": created_at,
                }
                if media_url:
                    card_data["media_url"] = media_url
                if thumb_url:
                    card_data["thumb_url"] = thumb_url
                if media_type:
                    card_data["media_type"] = media_type
                card_json = json.dumps(card_data)
                blob.upload_from_string(card_json, content_type="application/json")
            except Exception as e:
                logger.warning(f"Failed to mirror card to GCS: {e}")

        logger.info(f"Created card {card_id}: {title} ({color}) - Total time: {time.time() - start_time:.3f}s")

        return Card(
            cardId=card_id,
            title=title,
            color=color,
            prompt=prompt,
            number=None,
            media_url=media_url,
            thumb_url=thumb_url,
            media_type=media_type,
            createdAt=created_at
        )

    except Exception as e:
        import traceback
        logger.error(f"Error creating card: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


class FetchCardsRequest(BaseModel):
    """Request to fetch multiple cards."""
    cardIds: List[str]


class UpdateShotRequest(BaseModel):
    """Request to update shot metadata."""
    shotId: str
    title: str


@router.patch("/api/cards/{card_id}", response_model=Card)
async def update_card(card_id: str, request: UpdateCardRequest):
    """
    Update a card's metadata (title and/or color).

    Args:
        card_id: Card identifier
        request: UpdateCardRequest with optional title and color

    Returns:
        Card: The updated card metadata
    """
    if ds_client is None:
        raise HTTPException(status_code=500, detail="Datastore client not initialized")

    try:
        # Fetch existing card
        key = ds_client.key("Card", card_id)
        entity = ds_client.get(key)

        if not entity:
            raise HTTPException(status_code=404, detail=f"Card {card_id} not found")

        # Get sheet_id for Yjs broadcast
        sheet_id = entity.get("sheetId")

        # Track which fields are being updated for Yjs broadcast
        updates = {}

        # Update fields if provided (including explicit None to clear fields)
        if request.title is not None:
            entity["title"] = request.title
            updates["title"] = request.title
        if request.color is not None:
            entity["color"] = request.color
            updates["color"] = request.color
        if request.prompt is not None:
            entity["prompt"] = request.prompt
            updates["prompt"] = request.prompt

        # Handle media fields - these can be explicitly set to None to clear
        if "media_url" in request.model_dump(exclude_unset=True):
            entity["media_url"] = request.media_url
            updates["media_url"] = request.media_url
        if "thumb_url" in request.model_dump(exclude_unset=True):
            entity["thumb_url"] = request.thumb_url
            updates["thumb_url"] = request.thumb_url
        if "media_type" in request.model_dump(exclude_unset=True):
            entity["media_type"] = request.media_type
            updates["media_type"] = request.media_type

        # Save to Datastore
        ds_client.put(entity)

        # Broadcast updates to Yjs clients
        if yjs_server and sheet_id and updates:
            try:
                from yjs_sync import YjsSync
                yjs_sync = YjsSync(yjs_server)
                for field, value in updates.items():
                    await yjs_sync.set_card_field(sheet_id, card_id, field, value)
                logger.info(f"Broadcasted card updates to Yjs: {card_id} fields={list(updates.keys())}")
            except Exception as e:
                logger.warning(f"Failed to broadcast to Yjs (non-fatal): {e}")

        # Optionally mirror to GCS
        if gcs_client and bucket_name:
            try:
                bucket = gcs_client.bucket(bucket_name)
                blob = bucket.blob(f"cards/{card_id}.json")
                card_data = {
                    "cardId": entity.get("cardId"),
                    "title": entity.get("title"),
                    "color": entity.get("color"),
                    "prompt": entity.get("prompt", ""),
                    "createdAt": entity.get("createdAt"),
                }
                if entity.get("media_url"):
                    card_data["media_url"] = entity.get("media_url")
                if entity.get("thumb_url"):
                    card_data["thumb_url"] = entity.get("thumb_url")
                card_json = json.dumps(card_data)
                blob.upload_from_string(card_json, content_type="application/json")
            except Exception as e:
                logger.warning(f"Failed to mirror card to GCS: {e}")

        logger.info(f"Updated card {card_id}: title={entity.get('title')}, color={entity.get('color')}")

        return Card(
            cardId=entity.get("cardId"),
            title=entity.get("title"),
            color=entity.get("color"),
            prompt=entity.get("prompt", ""),
            number=entity.get("number"),
            media_url=entity.get("media_url"),
            thumb_url=entity.get("thumb_url"),
            media_type=entity.get("media_type"),
            createdAt=entity.get("createdAt")
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating card: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/cards/batch", response_model=List[Card])
async def fetch_cards(request: FetchCardsRequest):
    """
    Batch fetch card metadata by IDs.

    Args:
        request: FetchCardsRequest with list of card IDs

    Returns:
        List[Card]: List of card metadata
    """
    if ds_client is None:
        raise HTTPException(status_code=500, detail="Datastore client not initialized")

    if not request.cardIds:
        return []

    try:
        card_ids = request.cardIds

        if not card_ids:
            return []

        # Batch fetch from Datastore
        keys = [ds_client.key("Card", card_id) for card_id in card_ids]
        entities = ds_client.get_multi(keys)

        cards = []
        for entity in entities:
            if entity:
                cards.append(Card(
                    cardId=entity.get("cardId"),
                    title=entity.get("title", "Untitled"),
                    color=entity.get("color", "#CCCCCC"),
                    prompt=entity.get("prompt", ""),
                    number=entity.get("number"),
                    media_url=entity.get("media_url"),
                    thumb_url=entity.get("thumb_url"),
                    media_type=entity.get("media_type"),
                    createdAt=entity.get("createdAt", "")
                ))

        logger.info(f"Fetched {len(cards)} cards")
        return cards

    except Exception as e:
        logger.error(f"Error fetching cards: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/media/upload")
async def upload_media(file: UploadFile = File(...)):
    """
    Upload image or video file and create thumbnail.
    Stores original and thumbnail in GCS with date-based paths.

    Args:
        file: Uploaded image or video file

    Returns:
        dict: Contains media_url, thumb_url, media_type, and file metadata
    """
    if gcs_client is None or bucket_name is None:
        raise HTTPException(status_code=500, detail="GCS client not initialized")

    try:
        # Validate file type - allow images and videos
        filename = file.filename or "upload"
        is_image = media_utils.is_image(filename)
        is_video = media_utils.is_video(filename)

        if not is_image and not is_video:
            raise HTTPException(
                status_code=400,
                detail="Only image files (PNG, JPEG, WebP, GIF) and video files (MP4, MOV, WebM) are allowed"
            )

        # Determine media type
        media_type = "image" if is_image else "video"

        # Read file data
        file_data = await file.read()

        if not file_data:
            raise HTTPException(status_code=400, detail="Empty file")

        # Check file size (max 10MB for images, 100MB for videos)
        max_size = 10 * 1024 * 1024 if is_image else 100 * 1024 * 1024
        if len(file_data) > max_size:
            max_mb = 10 if is_image else 100
            raise HTTPException(status_code=400, detail=f"File size must be less than {max_mb}MB")

        # Get file extension
        extension = filename.split('.')[-1].lower() if '.' in filename else ('png' if is_image else 'mp4')

        # Generate unique ID
        file_id = str(ulid.new())

        # Determine content type
        content_type = media_utils.get_content_type(filename)

        # Upload original media
        media_path = media_utils.generate_media_path(file_id, extension, is_thumbnail=False)
        media_url = media_utils.upload_to_gcs(
            gcs_client,
            bucket_name,
            media_path,
            file_data,
            content_type
        )

        # Create and upload thumbnail
        thumb_url = None
        if is_image:
            try:
                thumb_data = media_utils.create_thumbnail(file_data, max_size=512)
                thumb_path = media_utils.generate_media_path(file_id, 'png', is_thumbnail=True)
                thumb_url = media_utils.upload_to_gcs(
                    gcs_client,
                    bucket_name,
                    thumb_path,
                    thumb_data,
                    'image/png'
                )
                logger.info(f"Created image thumbnail: {thumb_path}")
            except Exception as e:
                logger.warning(f"Failed to create image thumbnail: {e}")
                thumb_url = media_url
        elif is_video:
            try:
                thumb_data = media_utils.create_video_thumbnail(file_data, max_size=512)
                thumb_path = media_utils.generate_media_path(file_id, 'png', is_thumbnail=True)
                thumb_url = media_utils.upload_to_gcs(
                    gcs_client,
                    bucket_name,
                    thumb_path,
                    thumb_data,
                    'image/png'
                )
                logger.info(f"Created video thumbnail: {thumb_path}")
            except Exception as e:
                logger.warning(f"Failed to create video thumbnail: {e}")
                thumb_url = media_url

        logger.info(f"Uploaded {media_type}: {media_path} (size: {len(file_data)} bytes)")

        return {
            "media_url": media_url,
            "thumb_url": thumb_url,
            "media_type": media_type,
            "file_id": file_id,
            "filename": filename,
            "content_type": content_type,
            "size": len(file_data)
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Error uploading media: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/media/upload-card")
async def upload_card(
    file: UploadFile = File(...),
    sheet_id: str = Form(...),
    card_id: str = Form(...),
    lane_id: str = Form(...),
    insert_index: int = Form(0),
    title: str = Form(None)
):
    """
    Upload a file and create a complete card atomically.
    This handles:
    1. Uploading media to GCS
    2. Creating card entity in Datastore
    3. Updating Yjs with card metadata
    4. Inserting card at the front of the lane in the correct position

    Args:
        file: Uploaded media file
        sheet_id: Sheet/room identifier
        card_id: Pre-generated card ID from frontend
        lane_id: Lane (column in vertical mode) to insert card into
        insert_index: Position offset (0=first card, 1=second card, etc.)
        title: Optional card title (defaults to filename)

    Returns:
        Card: The created card metadata
    """
    if ds_client is None or gcs_client is None or bucket_name is None:
        raise HTTPException(status_code=500, detail="Required clients not initialized")

    try:
        filename = file.filename or "upload"
        card_title = title or filename

        # Step 1: Create loading placeholder in Yjs immediately (so UI shows spinner right away)
        from yjs_sync import YjsSync
        yjs_sync = YjsSync(yjs_server)

        placeholder_data = {
            'title': card_title,
            'color': '#CCCCCC',
            'prompt': '',
            'isLoading': True
        }

        await yjs_sync.sync_card_to_sheet(
            sheet_id=sheet_id,
            card_id=card_id,
            card_data=placeholder_data
        )

        # Insert card at the front of the lane with proper position offset
        # insert_index=0 -> position 1, insert_index=1 -> position 2, etc.
        await yjs_sync.insert_card_at_front_of_lane(
            sheet_id=sheet_id,
            lane_id=lane_id,
            card_id=card_id,
            position_offset=insert_index
        )

        logger.info(f"Created loading placeholder for card {card_id} at position {1 + insert_index} in lane {lane_id}")

        # Step 2: Upload media (this is the slow part)
        filename = file.filename or "upload"
        is_image = media_utils.is_image(filename)
        is_video = media_utils.is_video(filename)

        if not is_image and not is_video:
            raise HTTPException(
                status_code=400,
                detail="Only image and video files are allowed"
            )

        media_type = "image" if is_image else "video"
        file_data = await file.read()

        if not file_data:
            raise HTTPException(status_code=400, detail="Empty file")

        # Check file size
        max_size = 10 * 1024 * 1024 if is_image else 100 * 1024 * 1024
        if len(file_data) > max_size:
            max_mb = 10 if is_image else 100
            raise HTTPException(status_code=400, detail=f"File size must be less than {max_mb}MB")

        extension = filename.split('.')[-1].lower() if '.' in filename else ('png' if is_image else 'mp4')
        file_id = str(ulid.new())
        content_type = media_utils.get_content_type(filename)

        # Upload original media
        media_path = media_utils.generate_media_path(file_id, extension, is_thumbnail=False)
        media_url = media_utils.upload_to_gcs(
            gcs_client,
            bucket_name,
            media_path,
            file_data,
            content_type
        )

        # Create and upload thumbnail
        thumb_url = None
        if is_image:
            try:
                thumb_data = media_utils.create_thumbnail(file_data, max_size=512)
                thumb_path = media_utils.generate_media_path(file_id, 'png', is_thumbnail=True)
                thumb_url = media_utils.upload_to_gcs(
                    gcs_client,
                    bucket_name,
                    thumb_path,
                    thumb_data,
                    'image/png'
                )
            except Exception as e:
                logger.warning(f"Failed to create image thumbnail: {e}")
                thumb_url = media_url
        elif is_video:
            try:
                thumb_data = media_utils.create_video_thumbnail(file_data, max_size=512)
                thumb_path = media_utils.generate_media_path(file_id, 'png', is_thumbnail=True)
                thumb_url = media_utils.upload_to_gcs(
                    gcs_client,
                    bucket_name,
                    thumb_path,
                    thumb_data,
                    'image/png'
                )
            except Exception as e:
                logger.warning(f"Failed to create video thumbnail: {e}")
                thumb_url = media_url

        logger.info(f"Uploaded {media_type}: {media_path} (size: {len(file_data)} bytes)")

        # Step 3: Create card entity in Datastore (source of truth)
        card_data = {
            "title": card_title,
            "color": "#CCCCCC",
            "prompt": "",
            "media_url": media_url,
            "thumb_url": thumb_url,
            "media_type": media_type
        }

        entity = datastore.Entity(key=ds_client.key("Card", card_id))
        entity.update({
            "cardId": card_id,
            **card_data
        })
        ds_client.put(entity)
        logger.info(f"Created card in Datastore: {card_id}")

        # Step 4: Update Yjs with final card data (removes isLoading, adds media)
        final_card_data = {
            **card_data,
            "isLoading": False  # Clear loading state
        }

        sync_success = await yjs_sync.sync_card_to_sheet(
            sheet_id=sheet_id,
            card_id=card_id,
            card_data=final_card_data
        )

        if not sync_success:
            logger.warning(f"Card {card_id} saved to Datastore but failed to update in Yjs")

        logger.info(f"Updated card {card_id} in Yjs with final data (cleared loading state)")

        return {
            "cardId": card_id,
            "title": card_title,
            "color": "#CCCCCC",
            "prompt": "",
            "media_url": media_url,
            "thumb_url": thumb_url,
            "media_type": media_type
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Error uploading media: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/shots/{sheet_id}")
async def get_shots(sheet_id: str):
    """
    Get all shot titles for a sheet.

    Args:
        sheet_id: Sheet identifier

    Returns:
        dict: Map of shotId -> title
    """
    if ds_client is None:
        raise HTTPException(status_code=500, detail="Datastore client not initialized")

    try:
        # Query all shots for this sheet
        query = ds_client.query(kind="Shot")
        query.add_filter("sheetId", "=", sheet_id)
        shots = list(query.fetch())

        shot_titles = {}
        for shot in shots:
            shot_titles[shot.get("shotId")] = shot.get("title", "")

        logger.info(f"Fetched {len(shot_titles)} shot titles for sheet {sheet_id}")
        return shot_titles

    except Exception as e:
        logger.error(f"Error fetching shots: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/shots/update")
async def update_shot(request: UpdateShotRequest):
    """
    Update shot metadata (like title).
    Note: This stores in Datastore but real-time sync happens via Yjs.

    Args:
        request: UpdateShotRequest with shotId and title

    Returns:
        dict: Success status
    """
    if ds_client is None:
        raise HTTPException(status_code=500, detail="Datastore client not initialized")

    try:
        shot_id = request.shotId
        title = request.title

        # For now, we'll just use Yjs for shot titles
        # This endpoint can be used for backup/persistence if needed
        logger.info(f"Shot title update requested: {shot_id}: {title}")
        return {"status": "success", "shotId": shot_id, "title": title}

    except Exception as e:
        logger.error(f"Error updating shot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class RegenerateSheetRequest(BaseModel):
    """Request to regenerate a sheet with variable-length columns."""
    num_cols: int = 8
    cards_per_col: Optional[List[int]] = None  # If None, will randomize 3-12 per column


@router.post("/api/sheets/{sheet_id}/regenerate")
async def regenerate_sheet(sheet_id: str, request: RegenerateSheetRequest = RegenerateSheetRequest()):
    """
    Regenerate a sheet by clearing it and creating new cards.

    Args:
        sheet_id: Sheet identifier
        request: Configuration for regeneration (num_cols and cards_per_col)

    Returns:
        dict: Status and metadata about regeneration
    """
    if yjs_server is None:
        raise HTTPException(status_code=500, detail="YJS server not initialized")

    if ds_client is None:
        raise HTTPException(status_code=500, detail="Datastore client not initialized")

    try:
        import random

        # Generate or use provided cards_per_col
        num_cols = request.num_cols
        if request.cards_per_col is None:
            cards_per_col = [random.randint(3, 20) for _ in range(num_cols)]
        else:
            cards_per_col = request.cards_per_col

        total_cards = sum(cards_per_col)
        max_rows = max(cards_per_col)

        logger.info(f"Regenerating sheet {sheet_id} with {num_cols} cols, cards_per_col={cards_per_col}, total={total_cards}")

        # Get the room (this will create it if it doesn't exist)
        room_name = f"/yjs/{sheet_id}"
        room = await yjs_server.get_room(room_name)

        # Wait for room to be ready
        if not room.ready:
            await room.start()

        # Clear the Yjs document and populate with new data
        logger.info(f"Clearing Yjs document for {sheet_id}")

        # Get Y structures (simple 2D grid)
        row_order = room.ydoc.get_array('rowOrder')
        col_order = room.ydoc.get_array('colOrder')
        cells = room.ydoc.get_map('cells')
        cards_metadata = room.ydoc.get_map('cardsMetadata')

        # Use a transaction to modify the document
        logger.info(f"Before clear: rows={len(row_order)}, cols={len(col_order)}, cells={len(list(cells.keys()))}, cardsMetadata={len(list(cards_metadata.keys()))}")

        # Delete old cards from Datastore
        old_card_ids = list(cards_metadata.keys())
        if old_card_ids:
            logger.info(f"Deleting {len(old_card_ids)} old cards from Datastore")
            old_keys = [ds_client.key("Card", card_id) for card_id in old_card_ids]
            ds_client.delete_multi(old_keys)
            logger.info(f"Deleted {len(old_card_ids)} old cards from Datastore")

        # Wipe all media from GCS (for prototype - removes everything in media/)
        if gcs_client and bucket_name:
            try:
                bucket = gcs_client.bucket(bucket_name)
                logger.info(f"Wiping all media from GCS bucket {bucket_name}/media/")

                # List all blobs in the media/ prefix
                blobs = list(bucket.list_blobs(prefix="media/"))
                logger.info(f"Found {len(blobs)} media files to delete")

                # Delete all media blobs in batches
                if blobs:
                    # GCS delete_blobs can handle batches efficiently
                    blob_names = [blob.name for blob in blobs]
                    for blob_name in blob_names:
                        bucket.delete_blob(blob_name)

                    logger.info(f"Deleted {len(blobs)} media files from GCS")

                # Also delete the snapshot to force fresh regeneration
                snapshot_blob = bucket.blob(f"sheets/{sheet_id}/snapshot.ybin")
                if snapshot_blob.exists():
                    snapshot_blob.delete()
                    logger.info(f"Deleted snapshot for sheet {sheet_id}")
            except Exception as e:
                logger.warning(f"Failed to wipe GCS media (non-fatal): {e}")

        with room.ydoc.begin_transaction() as txn:
            # Clear existing data
            if len(row_order) > 0:
                row_order.delete_range(txn, 0, len(row_order))
            if len(col_order) > 0:
                col_order.delete_range(txn, 0, len(col_order))

            # Clear all cells
            for key in list(cells.keys()):
                cells.pop(txn, key)

            # Clear all card metadata
            for card_id in list(cards_metadata.keys()):
                cards_metadata.pop(txn, card_id)

            logger.info(f"After clear: rows={len(row_order)}, cols={len(col_order)}, cells={len(list(cells.keys()))}, cardsMetadata={len(list(cards_metadata.keys()))}")

            # Add columns
            for i in range(num_cols):
                col_id = f"c-{i}"
                col_order.append(txn, col_id)

            logger.info(f"After adding columns: cols={len(col_order)}")

        # Create all cards
        logger.info(f"Creating {total_cards} cards")
        all_cards = []
        all_entities = []

        for i in range(total_cards):
            card_id = str(ulid.new())
            card_style = random.choice(PALETTE)
            number = random.randint(1, 99)
            title = f"{card_style['name']} {number:02d}"
            color = card_style["color"]
            prompt = random.choice(LOREM_SENTENCES)
            created_at = datetime.now(timezone.utc).isoformat()

            # Prepare entity for batch write
            key = ds_client.key("Card", card_id)
            entity = datastore.Entity(key=key)
            entity.update({
                "cardId": card_id,
                "title": title,
                "color": color,
                "prompt": prompt,
                "createdAt": created_at,
            })
            all_entities.append(entity)

            all_cards.append({
                "cardId": card_id,
                "title": title,
                "color": color,
                "prompt": prompt
            })

        # Batch write all cards to Datastore at once
        logger.info(f"Batch writing {len(all_entities)} cards to Datastore")
        ds_client.put_multi(all_entities)
        logger.info(f"Batch write complete")

        # Add rows and assign cards within a transaction
        with room.ydoc.begin_transaction() as txn:
            # Create max_rows rows
            for i in range(max_rows):
                row_id = f"r-{ulid.new()}"
                row_order.append(txn, row_id)

            # Assign cards to columns (variable length per column)
            card_index = 0
            for col_idx in range(num_cols):
                col_id = f"c-{col_idx}"
                num_cards_in_col = cards_per_col[col_idx]

                # Assign cards to this column
                for row_idx in range(num_cards_in_col):
                    if card_index < len(all_cards):
                        row_id = list(row_order)[row_idx]
                        card = all_cards[card_index]
                        cell_key = f"{row_id}:{col_id}"
                        cells.set(txn, cell_key, {"cardId": card["cardId"]})
                        card_index += 1

        logger.info(f"Sheet {sheet_id} regenerated successfully: rows={len(row_order)}, cols={len(col_order)}, cells={len(list(cells.keys()))}")

        return {
            "status": "success",
            "sheetId": sheet_id,
            "rows": max_rows,
            "cols": num_cols,
            "cards_per_col": cards_per_col,
            "total_cards": len(all_cards)
        }

    except Exception as e:
        import traceback
        logger.error(f"Error regenerating sheet: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


def _generate_color_png(color: str) -> io.BytesIO:
    """
    Generate a 16:9 PNG image with a solid color.

    Args:
        color: Hex color string (e.g., "#FF6B6B")

    Returns:
        BytesIO buffer containing the PNG image
    """
    # Create 16:9 image (1920x1080)
    width, height = 1920, 1080

    # Convert hex color to RGB
    color_rgb = tuple(int(color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))

    # Create image with solid color
    img = Image.new('RGB', (width, height), color_rgb)

    # Save image to buffer
    img_buffer = io.BytesIO()
    img.save(img_buffer, format='PNG')
    img_buffer.seek(0)

    return img_buffer


@router.post("/api/columns/{col_id}/download")
async def download_column(col_id: str, request: dict):
    """
    Download a column as a zip file containing:
    - cards.json: metadata for all cards in the column
    - content/: directory with numbered PNG files (1.png, 2.png, etc.)
      - If card has media_url, download the actual media file
      - If card has no media_url, generate a color PNG

    Request body should contain:
    - columnCards: array of card objects in order
    - columnTitle: title of the column
    """
    try:
        import httpx

        column_cards = request.get("columnCards", [])
        column_title = request.get("columnTitle", "column")

        if not column_cards:
            raise HTTPException(status_code=400, detail="No cards provided")

        # Create in-memory zip file
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Build cards.json
            cards_json = []
            for idx, card in enumerate(column_cards, start=1):
                cards_json.append({
                    "id": idx,
                    "cardId": card.get("cardId"),
                    "title": card.get("title"),
                    "color": card.get("color"),
                    "prompt": card.get("prompt", ""),
                    "source": f"content/{idx}.png"
                })

            # Write cards.json to zip
            zip_file.writestr("cards.json", json.dumps(cards_json, indent=2))

            # Generate content for each card
            async with httpx.AsyncClient(timeout=30.0) as client:
                for idx, card in enumerate(column_cards, start=1):
                    media_url = card.get("media_url")

                    if media_url:
                        # Download the actual media file
                        try:
                            logger.info(f"Downloading media for card {idx}: {media_url}")
                            response = await client.get(media_url)
                            response.raise_for_status()

                            # Add downloaded media to zip as PNG
                            # (Note: This assumes the media_url points to an image)
                            zip_file.writestr(f"content/{idx}.png", response.content)
                            logger.info(f"Downloaded media for card {idx} ({len(response.content)} bytes)")
                        except Exception as e:
                            logger.warning(f"Failed to download media for card {idx}: {e}, falling back to color PNG")
                            # Fall back to generating color PNG
                            img_buffer = _generate_color_png(card.get("color", "#CCCCCC"))
                            zip_file.writestr(f"content/{idx}.png", img_buffer.getvalue())
                    else:
                        # Generate color PNG for cards without media
                        img_buffer = _generate_color_png(card.get("color", "#CCCCCC"))
                        zip_file.writestr(f"content/{idx}.png", img_buffer.getvalue())

        # Prepare zip for download
        zip_buffer.seek(0)

        # Sanitize column title for filename
        safe_title = "".join(c for c in column_title if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_title = safe_title.replace(' ', '_')
        if not safe_title:
            safe_title = "column"

        filename = f"{safe_title}.zip"

        logger.info(f"Generated zip for column {col_id}: {len(column_cards)} cards")

        return StreamingResponse(
            io.BytesIO(zip_buffer.getvalue()),
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating column download: {e}")
        raise HTTPException(status_code=500, detail=str(e))
