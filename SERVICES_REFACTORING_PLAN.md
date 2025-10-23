# Nanosheet Services Architecture Refactoring Plan

## Executive Summary

This plan outlines the refactoring of nanosheet's backend from a monolithic structure to a modular services architecture, mirroring the proven pattern used in magicpiles. This will enable easier maintenance, testing, and extensibility, particularly for the upcoming MagicPiles Add Button feature integration.

## Current State Analysis

### Nanosheet Backend Structure
```
backend/
├── main.py                # Monolithic FastAPI app with all endpoints
├── cards_api.py          # Card CRUD operations
├── media_utils.py        # Image/video processing utilities
├── requirements.txt
└── gcp-service-account-key.json
```

**Problems:**
- Direct GCS and Datastore client usage scattered across files
- No separation of concerns between business logic and API layer
- Difficult to test individual components
- Hard to extend with new features (e.g., media generation)

### MagicPiles Services Structure
```
services/
├── __init__.py           # Export all services
├── datastore.py          # DatastoreClient - all DB operations
├── storage.py            # StorageService - all GCS operations
├── utils.py              # Background removal and utilities
├── canvas_positions.py   # Canvas-specific logic
├── canvas_state.py       # Canvas state management
├── websocket_channels.py # WebSocket broadcasting
└── media_gen/
    ├── __init__.py       # MediaGeneratorFactory
    ├── base.py           # BaseMediaGenerator
    ├── types.py          # Type definitions
    ├── image.py          # ImageGenerator (kie.ai)
    ├── video.py          # VideoGenerator (fal.ai)
    ├── music.py          # MusicGenerator
    ├── speech.py         # SpeechGenerator
    └── kie_ai_service.py # Kie.ai integration
```

**Advantages:**
- Clear separation of concerns
- Easy to test individual services
- Reusable components across different API endpoints
- Extensible factory pattern for media generation

## Refactoring Goals

1. **Separation of Concerns**: Business logic separate from API endpoints
2. **Testability**: Each service can be unit tested independently
3. **Reusability**: Services can be shared across multiple API routes
4. **Extensibility**: Easy to add new features (media generation, drawing, etc.)
5. **Maintainability**: Clear module boundaries and responsibilities

## Detailed Refactoring Plan

### Phase 1: Create Services Infrastructure

#### Step 1.1: Create Services Directory Structure
```
backend/services/
├── __init__.py
├── datastore.py
├── storage.py
├── utils.py
└── media_gen/
    ├── __init__.py
    ├── base.py
    ├── types.py
    ├── image.py
    ├── video.py
    └── kie_ai_service.py
```

**Code Reuse Strategy:**
- **COPY** `../magicpiles/services/datastore.py` → `backend/services/datastore.py` (minimal changes)
- **COPY** `../magicpiles/services/storage.py` → `backend/services/storage.py` (minimal changes)
- **COPY** `../magicpiles/services/utils.py` → `backend/services/utils.py` (no changes needed)
- **COPY** entire `../magicpiles/services/media_gen/` directory → `backend/services/media_gen/` (minor adaptations)

#### Step 1.2: Create DatastoreClient Service

**File:** `backend/services/datastore.py`

**Source:** `../magicpiles/services/datastore.py` (COPY with modifications)

**Purpose:** Encapsulate all Google Cloud Datastore operations for cards, sheets, and user data.

**Migration Steps:**
1. **COPY** `../magicpiles/services/datastore.py` → `backend/services/datastore.py`
2. **Keep all existing methods** from magicpiles (515 lines of battle-tested code)
3. **Add nanosheet-specific methods:**
   ```python
   # Sheet Operations (NEW for nanosheet)
   def get_sheet(self, sheet_id: str) -> Optional[Entity]
   def create_sheet(self, sheet_id: str, sheet_data: dict) -> Entity
   def update_sheet(self, sheet_id: str, updates: dict) -> Optional[Entity]
   ```
4. **Remove magicpiles-specific methods** (optional, can keep for future):
   - Viewport operations (not needed yet)
   - Canvas-specific pile queries
   - Taste profile methods

**Key Benefit:** We get ~500 lines of tested code including:
- Full CRUD operations
- Soft delete support
- Batch operations
- Undo history tracking
- Session management

#### Step 1.3: Create StorageService

**File:** `backend/services/storage.py`

**Source:** `../magicpiles/services/storage.py` (COPY with minimal changes)

**Purpose:** Manage all Google Cloud Storage operations for media files.

**Migration Steps:**
1. **COPY** `../magicpiles/services/storage.py` → `backend/services/storage.py`
2. **Keep all 595 lines** (fully tested, production-ready)
3. **Minor adaptations:**
   ```python
   # Change default project name
   self.project_name = os.getenv('PROJECT_NAME', 'nanosheet')  # was 'magicpiles'

   # Change default bucket
   self.bucket_name = bucket_name or os.getenv('GCS_BUCKET_NAME', 'es-nanosheet')
   ```
4. **Merge with existing `media_utils.py`:**
   - StorageService already has `create_thumbnail()` ✓
   - Add `create_video_thumbnail()` from `media_utils.py` (lines 203-289)
   - StorageService already has all other media utils features

**Key Benefit:** We get ~600 lines of production code including:
- Date-based file organization (`mm-dd-yyyy/media_type/`)
- Short 8-char UUID filenames
- Automatic thumbnail generation
- Metadata JSON writing alongside media
- File cleanup and deletion
- Development mode support (no bucket required)
- Content-type detection

#### Step 1.4: Create Utilities Module

**File:** `backend/services/utils.py`

**Source:** `../magicpiles/services/utils.py` (COPY directly, no changes!)

**Purpose:** Shared utility functions for URL conversion, background removal, etc.

**Migration Steps:**
1. **COPY** `../magicpiles/services/utils.py` → `backend/services/utils.py`
2. **No changes required!** All 260 lines work as-is

**Key Benefit:** We get full background removal integration:
```python
# Already implemented in magicpiles:
def https_to_gs_uri(url: str) -> str
def gs_uri_to_https(uri: str) -> str
def submit_background_removal(image_file) -> str  # fal.ai integration
def check_background_removal_status(request_id: str) -> dict
def cancel_background_removal(request_id: str) -> bool
def process_background_removal_result(result: dict, storage_service) -> str
```

This gives us instant background removal capability for the add button!

### Phase 2: Create Media Generation Services

**COPY ENTIRE DIRECTORY:** `../magicpiles/services/media_gen/` → `backend/services/media_gen/`

This saves us from writing ~2500+ lines of complex code! Here's what we get:

#### Step 2.1: Type Definitions (types.py)

**Source:** `../magicpiles/services/media_gen/types.py` (COPY directly, no changes)

**What we get (177 lines):**
- `MediaGenerationRequest` dataclass
- `MediaGenerationResult` dataclass
- `PileConstraints` for handling canvas positions
- `BackendJobStatus` enum
- `MediaType`, `GenerationStatus`, `AspectRatio` enums
- Color constants (`PASTEL_COLORS`, `FAILURE_COLOR`)

#### Step 2.2: Base Generator (base.py)

**Source:** `../magicpiles/services/media_gen/base.py` (COPY with minor adaptations)

**What we get (785 lines!):**
- Abstract `BaseMediaGenerator` class
- Async generation workflow
- Status update broadcasting
- Card creation in datastore
- Error handling and retry logic
- Progress tracking
- Metadata writing

**Minor adaptations needed:**
- Remove canvas position logic (or keep for future use)
- Simplify to work with nanosheet's grid layout

#### Step 2.3: Image Generator (image.py)

**Source:** `../magicpiles/services/media_gen/image.py` (COPY directly!)

**What we get (373 lines):**
- Full kie.ai integration
- Text-to-image generation
- Image-to-image with reference images
- Aspect ratio handling (1:1, 16:9, 9:16)
- Image editing with modifiers
- Automatic thumbnail creation
- Error handling and retries

**No changes needed!** Works out of the box.

#### Step 2.4: Video Generator (video.py)

**Source:** `../magicpiles/services/media_gen/video.py` (COPY directly!)

**What we get (431 lines):**
- Full fal.ai integration (`luma/dream-machine`)
- Async polling for video completion
- Image-to-video generation
- Automatic video thumbnail extraction
- Progress updates during generation
- Error handling with proper cleanup

**No changes needed!** Works out of the box.

#### Step 2.5: Kie.ai Service (kie_ai_service.py)

**Source:** `../magicpiles/services/media_gen/kie_ai_service.py` (COPY directly!)

**What we get (587 lines):**
- Complete kie.ai API wrapper
- Image generation with all parameters
- Image editing/modification
- Retry logic and error handling
- Logging and debugging

**No changes needed!** Works out of the box.

#### Step 2.6: Factory (__init__.py)

**Source:** `../magicpiles/services/media_gen/__init__.py` (COPY with minor changes)

**What we get:**
- `MediaGeneratorFactory` with all media types
- Clean exports for all classes
- Extensible registration system

**Minor change:**
Remove music and speech generators (can add later):
```python
_generators = {
    'image': ImageGenerator,
    'video': VideoGenerator,
    # 'music': MusicGenerator,    # Remove for now
    # 'voice': SpeechGenerator,   # Remove for now
}
```

### Code Reuse Summary for Phase 2:
- **Total lines copied:** ~2,500+ lines of production code!
- **Time saved:** ~8-12 hours of development
- **Testing saved:** All code already tested in production
- **Changes required:** < 50 lines of adaptation

### Phase 3: Refactor API Layer

#### Step 3.1: Update main.py

**Changes:**
```python
from google.cloud import datastore, storage
from services import DatastoreClient, StorageService, MediaGeneratorFactory
from services import init_storage_service, get_storage_service

# Initialize services on startup
@app.on_event("startup")
async def startup_event():
    # Initialize GCS client
    gcs_client = storage.Client()

    # Initialize storage service
    storage_service = init_storage_service(client=gcs_client,
                                          bucket_name=GCS_BUCKET_NAME)

    # Initialize datastore client
    ds_client = DatastoreClient()

    # Store in app state
    app.state.storage_service = storage_service
    app.state.ds_client = ds_client
```

#### Step 3.2: Update cards_api.py

**Before:**
```python
def create_card(card_data: dict):
    # Direct datastore operations
    key = ds_client.key('Card', card_id)
    entity = datastore.Entity(key=key)
    # ...
```

**After:**
```python
def create_card(card_data: dict):
    # Use service
    ds_client = app.state.ds_client
    entity = ds_client.create_card(card_id, card_data)
    return entity
```

#### Step 3.3: Create Media Upload Endpoint

**File:** `backend/main.py` or `backend/api/media.py`

```python
@app.post("/api/media/upload")
async def upload_media(file: UploadFile):
    """Upload media file (image or video)"""
    storage_service = get_storage_service()
    ds_client = app.state.ds_client

    # Read file data
    file_data = await file.read()

    # Determine media type
    is_video_file = is_video(file.filename)
    media_type = 'video' if is_video_file else 'image'

    # Generate card ID
    card_id = ulid.new().str

    # Upload to GCS
    input_url = storage_service.upload_input_file(
        file_data, media_type, file.filename
    )

    # Create thumbnail
    if is_video_file:
        thumb_data = storage_service.create_video_thumbnail(file_data)
    else:
        thumb_data = storage_service.create_thumbnail(file_data)

    # Upload thumbnail
    thumb_url = storage_service.upload_media(
        thumb_data,
        f"nanosheet/{datetime.now().strftime('%m-%d-%Y')}/{media_type}/{card_id}_thumb.png",
        'image/png'
    )

    return {
        'card_id': card_id,
        'media_url': input_url,
        'thumb_url': thumb_url,
        'media_type': media_type
    }
```

#### Step 3.4: Create Media Generation Endpoint

```python
@app.post("/api/media/generate")
async def generate_media(
    card_id: str,
    prompt: str,
    media_type: str,  # 'image' or 'video'
    input_files: List[str] = [],
    aspect_ratio: str = '1:1',
    modifier: Optional[str] = None
):
    """Generate media using AI"""
    ds_client = app.state.ds_client
    storage_service = app.state.storage_service

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
        input_files=input_files,
        aspect_ratio=aspect_ratio,
        modifier=modifier
    )

    # Start generation (async)
    result = await generator.generate(request)

    return {
        'media_url': result.media_url,
        'thumbnail_url': result.thumbnail_url,
        'status': result.status
    }
```

### Phase 4: Environment Configuration

#### Step 4.1: Update .env

Add necessary API keys:
```bash
# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=gcp-service-account-key.json
GCS_BUCKET_NAME=es-nanosheet

# Media Generation APIs
KIE_KEY=your_kie_api_key
FAL_KEY=your_fal_api_key

# Project Config
PROJECT_NAME=nanosheet
ENVIRONMENT=production
```

#### Step 4.2: Update requirements.txt

Add new dependencies:
```
fal-client
httpx  # For async HTTP requests
ulid-py  # For card ID generation
```

### Phase 5: Migration Steps (Using Code Reuse!)

#### Step 5.1: Implementation Order (Fast Track!)

**Total estimated time: 3-4 hours** (down from 14-18 hours!)

1. **Create services directory structure** (2 minutes)
   ```bash
   mkdir -p backend/services/media_gen
   ```

2. **Copy all services from magicpiles** (5 minutes)
   ```bash
   # Copy core services
   cp ../magicpiles/services/datastore.py backend/services/
   cp ../magicpiles/services/storage.py backend/services/
   cp ../magicpiles/services/utils.py backend/services/

   # Copy entire media_gen directory
   cp -r ../magicpiles/services/media_gen/* backend/services/media_gen/
   ```

3. **Create services/__init__.py** (10 minutes)
   - Import and export all services
   - Based on magicpiles pattern but simplified

4. **Adapt StorageService** (15 minutes)
   - Change project name to 'nanosheet'
   - Change bucket to 'es-nanosheet'
   - Add `create_video_thumbnail()` from `media_utils.py`

5. **Adapt DatastoreClient** (20 minutes)
   - Add sheet operations (3 new methods)
   - Optionally remove pile-specific methods

6. **Adapt media_gen/__init__.py** (5 minutes)
   - Remove music and speech from factory
   - Keep just image and video

7. **Adapt base.py** (30 minutes)
   - Remove or stub out canvas position logic
   - Simplify for grid layout

8. **Update main.py** (45 minutes)
   - Initialize services on startup
   - Store in app.state
   - Add media generation endpoints
   - Add background removal endpoints

9. **Update cards_api.py** (30 minutes)
   - Replace direct datastore calls with DatastoreClient
   - Replace direct GCS calls with StorageService

10. **Testing** (45 minutes)
    - Test image generation
    - Test video generation
    - Test background removal
    - Test file upload with thumbnails

11. **Deploy to staging** (15 minutes)
    - Update .env with API keys
    - Update requirements.txt
    - Deploy to Fly.io
    - Smoke test

#### Step 5.2: Backwards Compatibility

During migration:
- Keep old implementations alongside new services
- Use feature flags to toggle between old/new
- Gradual endpoint migration
- Monitor for errors in production

### Phase 6: Port MagicPiles Add Button

Once services are in place, porting the add button becomes straightforward:

#### Components to Port:

1. **Frontend Add Modal** (`magicpiles/src/lib/AddModal.svelte`)
   - Drawing canvas with tools
   - Background removal UI
   - Prompt input with JSON formatting
   - Attachment gallery
   - Preview with transparent background

2. **Background Removal Integration**
   - Use `services/utils.py` functions
   - Submit job to fal.ai
   - Poll for completion
   - Display result

3. **Media Generation Integration**
   - Use `MediaGeneratorFactory`
   - Support both image and video
   - Handle async generation with progress updates
   - Store results in GCS with metadata

4. **API Endpoints**
   - `POST /api/background-removal/submit`
   - `GET /api/background-removal/status/{request_id}`
   - `POST /api/background-removal/cancel/{request_id}`
   - `POST /api/media/generate` (already covered)

## Success Criteria

- [ ] All datastore operations go through DatastoreClient
- [ ] All GCS operations go through StorageService
- [ ] Media generation works for images via ImageGenerator
- [ ] Media generation works for videos via VideoGenerator
- [ ] Background removal integrated and working
- [ ] Metadata JSON files written alongside media
- [ ] All existing API endpoints still functional
- [ ] Tests pass for each service
- [ ] Add button from magicpiles successfully ported
- [ ] Production deployment successful with no regressions

## Risk Mitigation

### Risks:
1. **Breaking existing functionality** during refactor
2. **API key costs** for kie.ai and fal.ai
3. **Async generation complexity** for videos
4. **GCS storage costs** from metadata and thumbnails

### Mitigations:
1. Incremental migration with feature flags
2. Set usage limits in API dashboards
3. Implement polling with timeouts and cancellation
4. Use GCS lifecycle rules to delete old temp files

## Timeline Estimate (With Code Reuse!)

### Original Estimate (Writing from Scratch):
- **Phase 1** (Services Infrastructure): 2-3 hours
- **Phase 2** (Media Generation): 3-4 hours
- **Phase 3** (API Refactoring): 2-3 hours
- **Phase 4** (Configuration): 30 minutes
- **Phase 5** (Migration & Testing): 2-3 hours
- **Phase 6** (Port Add Button): 4-5 hours
- **Total:** ~14-18 hours

### NEW Estimate (Copying from MagicPiles):
- **Phase 1** (Copy Services): 30 minutes (just file copies!)
- **Phase 2** (Copy Media Gen): 15 minutes (already done with cp -r!)
- **Phase 3** (Adapt & Integrate): 1.5 hours (minor adaptations)
- **Phase 4** (Configuration): 30 minutes
- **Phase 5** (Testing): 45 minutes
- **Phase 6** (Port Add Button): 2 hours (also copying from magicpiles!)
- **Total:** ~3-4 hours

### Time Saved: ~10-14 hours!

### Code Reuse Summary:
- **DatastoreClient:** 515 lines (100% reused)
- **StorageService:** 595 lines (100% reused)
- **utils.py:** 260 lines (100% reused)
- **media_gen/types.py:** 177 lines (100% reused)
- **media_gen/base.py:** 785 lines (~90% reused)
- **media_gen/image.py:** 373 lines (100% reused)
- **media_gen/video.py:** 431 lines (100% reused)
- **media_gen/kie_ai_service.py:** 587 lines (100% reused)
- **Total reused code:** ~3,700 lines!
- **New code required:** ~100-200 lines

## Next Steps

1. Review and approve this plan
2. Set up API keys for kie.ai and fal.ai
3. Create feature branch: `feature/services-refactor`
4. Begin Phase 1: Create services infrastructure
5. Implement incrementally with tests
6. Deploy to staging for validation
7. Port add button once services are stable
