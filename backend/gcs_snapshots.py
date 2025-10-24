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
        try:
            apply_update(ydoc, snapshot_data)
            logger.info(f"Loaded snapshot for sheet {sheet_id} ({len(snapshot_data)} bytes)")
            return True
        except Exception as apply_error:
            # Snapshot is corrupted or incompatible (e.g., out of bounds errors from deleted cards)
            # Delete ALL snapshots to ensure clean state across all sheets
            logger.error(f"Failed to apply snapshot for sheet {sheet_id}: {apply_error}")
            logger.warning(f"This likely means snapshots are incompatible with current schema")
            logger.info(f"Deleting ALL snapshots from GCS bucket to start fresh")
            try:
                delete_all_snapshots(bucket_name)
                logger.info(f"Successfully deleted all snapshots - all sheets will start fresh")
            except Exception as delete_error:
                logger.error(f"Failed to delete all snapshots: {delete_error}")
            return False

    except Exception as e:
        logger.error(f"Error loading snapshot for sheet {sheet_id}: {e}")
        return False


def delete_all_snapshots(bucket_name: str) -> bool:
    """
    Delete ALL snapshots from the GCS bucket.

    This is used when Yjs encounters irrecoverable errors (like out of bounds)
    that indicate the snapshots are incompatible with the current schema.

    Args:
        bucket_name: GCS bucket name

    Returns:
        True if all snapshots were deleted successfully, False otherwise
    """
    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)

        # List all blobs in the sheets/ prefix
        blobs = list(bucket.list_blobs(prefix="sheets/"))

        if not blobs:
            logger.info("No snapshots found to delete")
            return True

        # Delete all snapshot blobs
        deleted_count = 0
        for blob in blobs:
            try:
                blob.delete()
                deleted_count += 1
                logger.info(f"Deleted snapshot: {blob.name}")
            except Exception as blob_error:
                logger.warning(f"Failed to delete blob {blob.name}: {blob_error}")

        logger.info(f"Deleted {deleted_count} snapshot(s) from GCS bucket {bucket_name}")
        return True

    except Exception as e:
        logger.error(f"Error deleting all snapshots: {e}")
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
