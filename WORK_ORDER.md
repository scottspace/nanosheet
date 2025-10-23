# Nanosheet Services Refactoring - Work Order

## Original Request

"Port the magicpiles add button into this app" - This requires refactoring nanosheet's backend to use the same services architecture as magicpiles.

## What to Do

**Refactor nanosheet backend from monolithic structure to services architecture by copying code from magicpiles.**

This will enable:
1. Adding the MagicPiles add button with drawing, background removal, and AI generation
2. Image generation via kie.ai
3. Video generation via fal.ai
4. Background removal via fal.ai
5. Better code organization and maintainability

## Step-by-Step Instructions

### Step 1: Copy Services from MagicPiles (5 minutes)

```bash
cd /Users/scottpenberthy/work/es/nanosheet

# Create services directory
mkdir -p backend/services/media_gen

# Copy core services
cp ../magicpiles/services/datastore.py backend/services/
cp ../magicpiles/services/storage.py backend/services/
cp ../magicpiles/services/utils.py backend/services/

# Copy entire media generation directory
cp ../magicpiles/services/media_gen/__init__.py backend/services/media_gen/
cp ../magicpiles/services/media_gen/base.py backend/services/media_gen/
cp ../magicpiles/services/media_gen/types.py backend/services/media_gen/
cp ../magicpiles/services/media_gen/image.py backend/services/media_gen/
cp ../magicpiles/services/media_gen/video.py backend/services/media_gen/
cp ../magicpiles/services/media_gen/kie_ai_service.py backend/services/media_gen/

# Note: We're NOT copying music.py and speech.py (not needed yet)
```

### Step 2: Create services/__init__.py (10 minutes)

Create `backend/services/__init__.py` with exports:

```python
"""Nanosheet Services

This package contains service modules for business logic and external integrations.
Adapted from MagicPiles architecture.
"""

from .datastore import DatastoreClient, DatastoreSessionInterface
from .storage import StorageService, init_storage_service, get_storage_service
from .utils import (
    https_to_gs_uri,
    gs_uri_to_https,
    submit_background_removal,
    check_background_removal_status,
    cancel_background_removal,
    process_background_removal_result
)
from .media_gen import (
    MediaGeneratorFactory,
    BaseMediaGenerator,
    ImageGenerator,
    VideoGenerator,
    MediaGenerationRequest,
    MediaGenerationResult,
    PileConstraints
)

__all__ = [
    # Datastore
    'DatastoreClient',
    'DatastoreSessionInterface',

    # Storage
    'StorageService',
    'init_storage_service',
    'get_storage_service',

    # Utilities
    'https_to_gs_uri',
    'gs_uri_to_https',
    'submit_background_removal',
    'check_background_removal_status',
    'cancel_background_removal',
    'process_background_removal_result',

    # Media Generation
    'MediaGeneratorFactory',
    'BaseMediaGenerator',
    'ImageGenerator',
    'VideoGenerator',
    'MediaGenerationRequest',
    'MediaGenerationResult',
    'PileConstraints',
]
```

### Step 3: Adapt StorageService (10 minutes)

Edit `backend/services/storage.py`:

**Line 50:** Change project name:
```python
self.project_name = os.getenv('PROJECT_NAME', 'nanosheet')  # was 'magicpiles'
```

**Line 49:** Change bucket name:
```python
self.bucket_name = bucket_name or os.getenv('GCS_BUCKET_NAME', 'es-nanosheet')
```

**After line 469** (after `_resize_image_with_transparency`), add video thumbnail support from `media_utils.py`:

```python
def create_video_thumbnail(self, video_data: bytes, max_size: int = 512) -> bytes:
    """
    Create a thumbnail from video by extracting first frame at 0.1 seconds.
    Fits within max_size x max_size box, preserving aspect ratio.

    Args:
        video_data: Original video bytes
        max_size: Maximum width/height for thumbnail (default 512)

    Returns:
        bytes: PNG thumbnail data

    Raises:
        Exception: If ffmpeg extraction fails
    """
    import subprocess
    import tempfile
    import os

    try:
        # Write video to temp file
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_video:
            video_path = temp_video.name
            temp_video.write(video_data)

        try:
            # Extract first frame using ffmpeg (at 0.1s to avoid black frames)
            thumbnail_path = video_path.replace('.mp4', '_thumb.jpg')

            # Use ffmpeg to extract frame
            subprocess.run([
                'ffmpeg', '-ss', '0.1', '-i', video_path,
                '-vframes', '1', '-q:v', '2',
                thumbnail_path
            ], check=True, capture_output=True, stderr=subprocess.PIPE)

            # Read the extracted frame
            with open(thumbnail_path, 'rb') as thumb_file:
                frame_data = thumb_file.read()

            # Use existing _resize_image_with_transparency method
            resized_data = self._resize_image_with_transparency(frame_data, max_size)

            # Clean up
            os.unlink(thumbnail_path)

            return resized_data

        finally:
            # Clean up video file
            os.unlink(video_path)

    except subprocess.CalledProcessError as e:
        print(f"[STORAGE] ffmpeg failed: {e.stderr.decode() if e.stderr else 'unknown error'}")
        raise Exception(f"Failed to extract video frame: {e.stderr.decode() if e.stderr else 'unknown error'}")
    except Exception as e:
        print(f"[STORAGE] Error creating video thumbnail: {e}")
        raise
```

### Step 4: Adapt media_gen/__init__.py (5 minutes)

Edit `backend/services/media_gen/__init__.py`:

**Line 52-57:** Remove music and voice from factory:
```python
_generators = {
    'image': ImageGenerator,
    'video': VideoGenerator,
    # Music and speech removed for now - can add later
}
```

**Line 113-138:** Update __all__ exports (remove MusicGenerator and SpeechGenerator):
```python
__all__ = [
    # Factory
    'MediaGeneratorFactory',

    # Base class
    'BaseMediaGenerator',

    # Generators
    'ImageGenerator',
    'VideoGenerator',
    # 'MusicGenerator',  # Removed
    # 'SpeechGenerator',  # Removed

    # Types
    'MediaGenerationRequest',
    'MediaGenerationResult',
    'PileConstraints',
    'BackendJobStatus',
    'MediaType',
    'GenerationStatus',
    'AspectRatio',

    # Constants
    'PASTEL_COLORS',
    'FAILURE_COLOR',
]
```

### Step 5: Update requirements.txt (2 minutes)

Add to `backend/requirements.txt`:

```
fal-client
httpx
requests
```

(Note: ulid-py, Pillow, and ffmpeg-python already present)

### Step 6: Update .env (3 minutes)

Add API keys to your `.env` file (or set as environment variables):

```bash
# Existing
GOOGLE_APPLICATION_CREDENTIALS=gcp-service-account-key.json
GCS_BUCKET_NAME=es-nanosheet

# NEW - Add these
PROJECT_NAME=nanosheet
KIE_KEY=your_kie_api_key_here
FAL_KEY=your_fal_api_key_here
```

### Step 7: Update main.py - Add Service Initialization (15 minutes)

Edit `backend/main.py`:

**Add imports at top:**
```python
from google.cloud import storage
from services import (
    DatastoreClient,
    init_storage_service,
    get_storage_service,
    MediaGeneratorFactory,
    MediaGenerationRequest,
    submit_background_removal,
    check_background_removal_status,
    cancel_background_removal,
    process_background_removal_result
)
```

**Add startup event handler (after app creation):**
```python
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    # Initialize GCS client
    gcs_client = storage.Client()

    # Initialize storage service (global singleton)
    storage_service = init_storage_service(
        client=gcs_client,
        bucket_name=os.getenv('GCS_BUCKET_NAME', 'es-nanosheet')
    )

    # Initialize datastore client
    ds_client = DatastoreClient()

    # Store in app state for access in routes
    app.state.storage_service = storage_service
    app.state.ds_client = ds_client

    print("[STARTUP] Services initialized successfully")
```

### Step 8: Add Media Generation Endpoints (20 minutes)

Add to `backend/main.py`:

```python
@app.post("/api/media/generate")
async def generate_media(
    card_id: str = Form(...),
    prompt: str = Form(...),
    media_type: str = Form(...),  # 'image' or 'video'
    input_files: str = Form("[]"),  # JSON array of GCS URLs
    aspect_ratio: str = Form("1:1"),
    modifier: str = Form(None)
):
    """Generate media using AI (kie.ai for images, fal.ai for videos)"""
    try:
        ds_client = app.state.ds_client
        storage_service = app.state.storage_service

        # Parse input files
        import json
        input_file_list = json.loads(input_files) if input_files else []

        # Get appropriate generator
        generator = MediaGeneratorFactory.get_generator(
            media_type,
            ds_client=ds_client,
            storage_service=storage_service
        )

        # Create request
        request = MediaGenerationRequest(
            card_id=card_id,
            prompt=prompt,
            input_files=input_file_list,
            aspect_ratio=aspect_ratio,
            modifier=modifier
        )

        # Generate (async)
        result = await generator.generate(request)

        return {
            'card_id': card_id,
            'media_url': result.media_url,
            'thumbnail_url': result.thumbnail_url,
            'status': result.status
        }

    except Exception as e:
        logger.error(f"Error generating media: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/background-removal/submit")
async def submit_bg_removal(file: UploadFile):
    """Submit background removal job to fal.ai"""
    try:
        file_data = await file.read()
        request_id = submit_background_removal(file_data)
        return {"request_id": request_id, "status": "submitted"}
    except Exception as e:
        logger.error(f"Error submitting background removal: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/background-removal/status/{request_id}")
async def get_bg_removal_status(request_id: str):
    """Check status of background removal job"""
    try:
        status_info = check_background_removal_status(request_id)

        if status_info['status'] == 'completed':
            # Process result and upload to GCS
            storage_service = get_storage_service()
            result_url = process_background_removal_result(
                status_info['result'],
                storage_service
            )
            return {
                "status": "completed",
                "result_url": result_url
            }
        else:
            return status_info

    except Exception as e:
        logger.error(f"Error checking background removal status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/background-removal/cancel/{request_id}")
async def cancel_bg_removal(request_id: str):
    """Cancel background removal job"""
    try:
        success = cancel_background_removal(request_id)
        return {"cancelled": success}
    except Exception as e:
        logger.error(f"Error cancelling background removal: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 9: Update cards_api.py to Use Services (20 minutes)

Edit `backend/cards_api.py`:

**Replace direct datastore operations with DatastoreClient:**

Before:
```python
def get_card(card_id: str):
    key = ds_client.key('Card', card_id)
    entity = ds_client.get(key)
    return entity
```

After:
```python
def get_card(card_id: str):
    from main import app
    ds_client = app.state.ds_client
    return ds_client.get_card(card_id)
```

**Replace direct GCS operations with StorageService:**

Before:
```python
blob = bucket.blob(blob_path)
blob.upload_from_string(data, content_type=content_type)
blob.make_public()
url = blob.public_url
```

After:
```python
from services import get_storage_service
storage_service = get_storage_service()
url = storage_service.upload_media(data, blob_path, content_type)
```

### Step 10: Update Media Upload Endpoint (10 minutes)

Edit the media upload endpoint in `backend/main.py` to use StorageService:

```python
@app.post("/api/media/upload")
async def upload_media(file: UploadFile):
    """Upload media file (image or video)"""
    try:
        storage_service = get_storage_service()

        # Read file data
        file_data = await file.read()

        # Determine media type
        from media_utils import is_video
        is_video_file = is_video(file.filename)
        media_type = 'video' if is_video_file else 'image'

        # Generate card ID
        import ulid
        card_id = ulid.new().str

        # Upload to GCS using StorageService
        input_url = storage_service.upload_input_file(
            file_data,
            media_type,
            file.filename
        )

        # Create thumbnail
        if is_video_file:
            thumb_data = storage_service.create_video_thumbnail(file_data)
        else:
            thumb_data = storage_service.create_thumbnail(file_data)

        # Upload thumbnail
        from datetime import datetime
        thumb_path = f"nanosheet/{datetime.now().strftime('%m-%d-%Y')}/{media_type}/{card_id}_thumb.png"
        thumb_url = storage_service.upload_media(
            thumb_data,
            thumb_path,
            'image/png'
        )

        return {
            'card_id': card_id,
            'media_url': input_url,
            'thumb_url': thumb_url,
            'media_type': media_type
        }

    except Exception as e:
        logger.error(f"Error uploading media: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 11: Install Dependencies (2 minutes)

```bash
cd backend
pip install fal-client httpx requests
```

### Step 12: Test Locally (15 minutes)

```bash
# Start backend
cd backend
uvicorn main:app --reload

# Test in another terminal:
# 1. Upload an image
curl -X POST http://localhost:8000/api/media/upload \
  -F "file=@test_image.jpg"

# 2. Test background removal
curl -X POST http://localhost:8000/api/background-removal/submit \
  -F "file=@test_image.jpg"

# 3. Test image generation (requires KIE_KEY)
curl -X POST http://localhost:8000/api/media/generate \
  -F "card_id=test123" \
  -F "prompt=a serene sunset" \
  -F "media_type=image" \
  -F "aspect_ratio=1:1"
```

### Step 13: Deploy (10 minutes)

```bash
# Add and commit changes
git add .
git commit -m "feat: Add services architecture with media generation

- Copy services from magicpiles (datastore, storage, utils)
- Add media generation (image via kie.ai, video via fal.ai)
- Add background removal via fal.ai
- Add media generation endpoints
- Refactor to use DatastoreClient and StorageService

Reused ~3,700 lines of production code from magicpiles"

# Push
git push

# Deploy to Fly.io
flyctl deploy
```

## Expected Total Time

- File copying: 5 minutes
- Adaptations: 30 minutes
- Integration: 1 hour
- Testing: 15 minutes
- Deploy: 10 minutes

**Total: ~2 hours**

## Success Criteria

- [ ] All services copied from magicpiles
- [ ] Services initialized on startup
- [ ] Image upload with thumbnail works
- [ ] Video upload with thumbnail works
- [ ] Background removal endpoints work
- [ ] Image generation via kie.ai works
- [ ] Video generation via fal.ai works
- [ ] No regressions in existing functionality
- [ ] Successfully deployed to Fly.io

## Notes

- See `SERVICES_REFACTORING_PLAN.md` for detailed architecture explanation
- All copied code is production-tested from magicpiles
- ~3,700 lines of code reused
- Only ~100-200 lines of new code required
