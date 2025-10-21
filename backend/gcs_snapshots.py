"""GCS snapshot loading and saving for Yjs documents."""
import logging
from google.cloud import storage
from y_py import YDoc, apply_update, encode_state_as_update

logger = logging.getLogger(__name__)


def load_snapshot(bucket_name: str, sheet_id: str, ydoc: YDoc) -> bool:
    """
    Load a Yjs snapshot from GCS and apply it to the provided YDoc.

    Args:
        bucket_name: GCS bucket name
        sheet_id: Sheet identifier (used as room name)
        ydoc: Y.Doc instance to apply snapshot to

    Returns:
        True if snapshot was loaded successfully, False otherwise
    """
    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(f"sheets/{sheet_id}/snapshot.ybin")

        if not blob.exists():
            logger.info(f"No snapshot found for sheet {sheet_id}")
            return False

        # Download the binary snapshot
        snapshot_data = blob.download_as_bytes()

        # Apply the update to the YDoc
        apply_update(ydoc, snapshot_data)

        logger.info(f"Loaded snapshot for sheet {sheet_id} ({len(snapshot_data)} bytes)")
        return True

    except Exception as e:
        logger.error(f"Error loading snapshot for sheet {sheet_id}: {e}")
        return False


def save_snapshot(bucket_name: str, sheet_id: str, ydoc: YDoc) -> bool:
    """
    Save a Yjs document snapshot to GCS.

    Args:
        bucket_name: GCS bucket name
        sheet_id: Sheet identifier (used as room name)
        ydoc: Y.Doc instance to snapshot

    Returns:
        True if snapshot was saved successfully, False otherwise
    """
    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(f"sheets/{sheet_id}/snapshot.ybin")

        # Encode the current state as binary update
        snapshot_data = encode_state_as_update(ydoc)

        # Upload to GCS
        blob.upload_from_string(snapshot_data, content_type="application/octet-stream")

        logger.info(f"Saved snapshot for sheet {sheet_id} ({len(snapshot_data)} bytes)")
        return True

    except Exception as e:
        logger.error(f"Error saving snapshot for sheet {sheet_id}: {e}")
        return False
