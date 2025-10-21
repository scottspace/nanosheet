"""Cards API endpoints for creating and fetching card metadata."""
import logging
import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google.cloud import datastore, storage
import ulid
import asyncio

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
    createdAt: str


class CreateCardRequest(BaseModel):
    """Request to create a new card."""
    title: Optional[str] = None
    color: Optional[str] = None
    prompt: Optional[str] = None


class UpdateCardRequest(BaseModel):
    """Request to update a card."""
    title: Optional[str] = None
    color: Optional[str] = None
    prompt: Optional[str] = None


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
            # Pick a random color and use its matching name
            card_style = random.choice(PALETTE)
            title = request.title or card_style["name"]
            color = request.color or card_style["color"]
        prompt = request.prompt or random.choice(LOREM_SENTENCES)
        number = random.randint(1, 99)
        created_at = datetime.now(timezone.utc).isoformat()

        # Save to Datastore
        t1 = time.time()
        key = ds_client.key("Card", card_id)
        entity = datastore.Entity(key=key)
        entity.update({
            "cardId": card_id,
            "title": title,
            "color": color,
            "prompt": prompt,
            "number": number,
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
                card_json = json.dumps({
                    "cardId": card_id,
                    "title": title,
                    "color": color,
                    "prompt": prompt,
                    "number": number,
                    "createdAt": created_at,
                })
                blob.upload_from_string(card_json, content_type="application/json")
            except Exception as e:
                logger.warning(f"Failed to mirror card to GCS: {e}")

        logger.info(f"Created card {card_id}: {title} ({color}) - Total time: {time.time() - start_time:.3f}s")

        return Card(
            cardId=card_id,
            title=title,
            color=color,
            prompt=prompt,
            number=number,
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

        # Update fields if provided
        if request.title is not None:
            entity["title"] = request.title
        if request.color is not None:
            entity["color"] = request.color
        if request.prompt is not None:
            entity["prompt"] = request.prompt

        # Save to Datastore
        ds_client.put(entity)

        # Optionally mirror to GCS
        if gcs_client and bucket_name:
            try:
                bucket = gcs_client.bucket(bucket_name)
                blob = bucket.blob(f"cards/{card_id}.json")
                card_json = json.dumps({
                    "cardId": entity.get("cardId"),
                    "title": entity.get("title"),
                    "color": entity.get("color"),
                    "prompt": entity.get("prompt", ""),
                    "createdAt": entity.get("createdAt"),
                })
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
                    createdAt=entity.get("createdAt", "")
                ))

        logger.info(f"Fetched {len(cards)} cards")
        return cards

    except Exception as e:
        logger.error(f"Error fetching cards: {e}")
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

        # Use a transaction to modify the document
        logger.info(f"Before clear: rows={len(row_order)}, cols={len(col_order)}, cells={len(list(cells.keys()))}")

        with room.ydoc.begin_transaction() as txn:
            # Clear existing data
            if len(row_order) > 0:
                row_order.delete_range(txn, 0, len(row_order))
            if len(col_order) > 0:
                col_order.delete_range(txn, 0, len(col_order))

            # Clear all cells
            for key in list(cells.keys()):
                cells.pop(txn, key)

            logger.info(f"After clear: rows={len(row_order)}, cols={len(col_order)}, cells={len(list(cells.keys()))}")

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
            title = card_style["name"]
            color = card_style["color"]
            prompt = random.choice(LOREM_SENTENCES)
            number = random.randint(1, 99)  # Random number 1-99
            created_at = datetime.now(timezone.utc).isoformat()

            # Prepare entity for batch write
            key = ds_client.key("Card", card_id)
            entity = datastore.Entity(key=key)
            entity.update({
                "cardId": card_id,
                "title": title,
                "color": color,
                "prompt": prompt,
                "number": number,
                "createdAt": created_at,
            })
            all_entities.append(entity)

            all_cards.append({
                "cardId": card_id,
                "title": title,
                "color": color,
                "prompt": prompt,
                "number": number
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
