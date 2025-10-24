"""FastAPI server with Yjs WebSocket relay and Cards API."""
import os
import logging
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from ypy_websocket import ASGIServer, WebsocketServer, YRoom
from y_py import YDoc
from dotenv import load_dotenv

import cards_api
from cards_api import router as cards_router, init_clients
from gcs_snapshots import load_snapshot, save_snapshot, delete_all_snapshots

# Load environment variables from parent directory's .env file
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Get GCS bucket from environment
GCS_BUCKET = os.getenv("YJS_GCS_BUCKET", "")

# Debounce tracking for snapshots
snapshot_tasks = {}


async def debounced_save_snapshot(sheet_id: str, ydoc: YDoc, delay: float = 0.8):
    """
    Debounced snapshot saving - only saves after delay with no new changes.

    Args:
        sheet_id: Sheet identifier
        ydoc: Y.Doc instance
        delay: Delay in seconds before saving
    """
    # Cancel any existing task for this sheet
    if sheet_id in snapshot_tasks:
        snapshot_tasks[sheet_id].cancel()

    async def save_task():
        try:
            await asyncio.sleep(delay)
            logger.info(f"Saving debounced snapshot for {sheet_id}")
            save_snapshot(GCS_BUCKET, sheet_id, ydoc)
        except asyncio.CancelledError:
            logger.debug(f"Snapshot save cancelled for {sheet_id}")
        finally:
            if sheet_id in snapshot_tasks:
                del snapshot_tasks[sheet_id]

    snapshot_tasks[sheet_id] = asyncio.create_task(save_task())


# Custom YRoom subclass to add snapshot hooks
class NanosheetRoom(YRoom):
    """Custom room with GCS snapshot loading and saving."""

    def __init__(self, room_name: str, *args, **kwargs):
        """Initialize with room name."""
        super().__init__(*args, **kwargs)
        self.room_name = room_name
        self._snapshot_scheduled = False

    async def start(self, **kwargs):
        """Override start to load snapshot and set up observers."""
        # Load snapshot from GCS BEFORE starting (so it's available when clients connect)
        if GCS_BUCKET:
            logger.info(f"Loading snapshot for room: {self.room_name}")
            try:
                success = load_snapshot(GCS_BUCKET, self.room_name, self.ydoc)
                if success:
                    logger.info(f"Successfully loaded snapshot for room: {self.room_name}")
                else:
                    logger.info(f"No snapshot found or snapshot was corrupted for room: {self.room_name}")
            except Exception as e:
                logger.error(f"Failed to load snapshot for room {self.room_name}: {e}")
                logger.info(f"Starting with empty document for room: {self.room_name}")
        else:
            logger.warning("GCS_BUCKET not configured, snapshots disabled")

        # Set up observers on specific Y structures (not all transactions)
        # This avoids triggering on awareness updates
        if GCS_BUCKET:
            try:
                def on_change(event):
                    """Called when rowOrder, colOrder, cells, or cardsMetadata change."""
                    logger.info(f"YDoc structure changed in room: {self.room_name}")
                    asyncio.create_task(debounced_save_snapshot(self.room_name, self.ydoc))

                # Get the Y structures and observe them
                row_order = self.ydoc.get_array('rowOrder')
                col_order = self.ydoc.get_array('colOrder')
                cells = self.ydoc.get_map('cells')
                cards_metadata = self.ydoc.get_map('cardsMetadata')

                # Observe each structure
                row_order.observe(on_change)
                col_order.observe(on_change)
                cells.observe(on_change)
                cards_metadata.observe(on_change)

                logger.info(f"Set up observers for room: {self.room_name}")
            except Exception as e:
                logger.error(f"Failed to set up observers for room {self.room_name}: {e}")
                logger.info(f"Continuing without observers - snapshots will not be saved")

        # Now start the room
        await super().start(**kwargs)


# Custom WebsocketServer to use our custom room
class NanosheetServer(WebsocketServer):
    """Custom WebSocket server using NanosheetRoom."""

    async def get_room(self, name: str) -> NanosheetRoom:
        """Override to create our custom room type."""
        # Strip /yjs/ prefix from room name if present
        room_name = name.replace('/yjs/', '')

        if name not in self.rooms:
            self.rooms[name] = NanosheetRoom(
                room_name=room_name,
                ready=self.rooms_ready,
                ystore=None,
                log=self.log,
            )
        return self.rooms[name]

    async def send(self, message: bytes, room: NanosheetRoom):
        """Override send to catch WebSocket close errors."""
        try:
            await super().send(message, room)
        except RuntimeError as e:
            if "after sending 'websocket.close'" in str(e):
                logger.debug(f"Attempted to send to closed WebSocket in room {room.room_name}, ignoring")
            else:
                raise


# Create WebSocket server with custom room class
yws = NanosheetServer(rooms_ready=True, auto_clean_rooms=False)

# Make yjs_server available to cards_api
cards_api.yjs_server = yws


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup
    logger.info("Starting nanosheet server")
    if GCS_BUCKET:
        logger.info(f"GCS bucket: {GCS_BUCKET}")
        init_clients(GCS_BUCKET)
    else:
        logger.warning("YJS_GCS_BUCKET not set - persistence disabled")

    # Start the WebSocket server
    async with yws:
        logger.info("WebSocket server started")
        yield

    # Shutdown
    logger.info("Shutting down nanosheet server")


# Create FastAPI app
app = FastAPI(
    title="Nanosheet API",
    description="Collaborative micro-sheet backend",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom ASGI wrapper to handle WebSocket errors gracefully
class SafeASGIServer:
    """Wrapper around ASGIServer that catches WebSocket close errors."""

    def __init__(self, yws_server):
        self.asgi_server = ASGIServer(yws_server)
        self.yws_server = yws_server

    async def __call__(self, scope, receive, send):
        """ASGI application callable."""
        # Check if WebSocket server is running
        if not self.yws_server.started.is_set():
            logger.error("WebSocket server is not running, rejecting connection")
            # Send WebSocket close immediately
            if scope["type"] == "websocket":
                await send({
                    "type": "websocket.close",
                    "code": 1011,  # Internal error
                    "reason": "Server not ready"
                })
            return

        async def safe_send(message):
            """Wrapper around send that catches close errors."""
            try:
                await send(message)
            except RuntimeError as e:
                if "after sending 'websocket.close'" in str(e) or "response already completed" in str(e):
                    logger.debug(f"WebSocket already closed, ignoring send: {e}")
                else:
                    raise

        try:
            await self.asgi_server(scope, receive, safe_send)
        except RuntimeError as e:
            if "WebsocketServer is not running" in str(e):
                logger.error("WebSocket server stopped unexpectedly")
                if scope["type"] == "websocket":
                    try:
                        await send({
                            "type": "websocket.close",
                            "code": 1011,
                            "reason": "Server stopped"
                        })
                    except:
                        pass  # Already closed
            else:
                raise


# Mount Yjs WebSocket server using ASGI
safe_asgi_server = SafeASGIServer(yws)
app.mount("/yjs", safe_asgi_server)

# Include Cards API router
app.include_router(cards_router)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/health")
async def health_alt():
    """Alternative health check endpoint for Fly.io."""
    return {"status": "healthy"}


# Mount static files
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

    @app.get("/")
    async def serve_frontend():
        """Serve the frontend index.html."""
        return FileResponse(str(static_dir / "index.html"))

    @app.get("/{full_path:path}")
    async def catch_all(full_path: str):
        """Catch all route to serve frontend for client-side routing."""
        # Check if it's an API or WebSocket route
        if full_path.startswith(("api/", "yjs/", "health")):
            return {"error": "Not found"}, 404

        # Try to serve static file
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))

        # Otherwise serve index.html for SPA routing
        return FileResponse(str(static_dir / "index.html"))
else:
    @app.get("/")
    async def root():
        """API info when static files not available."""
        return {
            "service": "nanosheet",
            "version": "0.1.0",
            "gcs_bucket": GCS_BUCKET or "not configured"
        }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
