"""Media utilities for image/video processing and storage."""
import io
import logging
from datetime import datetime
from typing import Tuple, Optional
from PIL import Image
from google.cloud import storage

logger = logging.getLogger(__name__)


def generate_media_path(file_id: str, extension: str, is_thumbnail: bool = False) -> str:
    """
    Generate date-based GCS path for media file.
    Format: mm-dd-yyyy/ULID.ext or mm-dd-yyyy/ULID_thumb.ext

    Args:
        file_id: Unique file identifier (ULID)
        extension: File extension (e.g., "png", "jpg", "mp4")
        is_thumbnail: Whether this is a thumbnail

    Returns:
        str: GCS blob path (e.g., "01-15-2025/abc123.png")
    """
    # Get current date in mm-dd-yyyy format
    date_prefix = datetime.now().strftime("%m-%d-%Y")

    # Add thumb suffix if needed
    suffix = "_thumb" if is_thumbnail else ""

    # Build path
    return f"{date_prefix}/{file_id}{suffix}.{extension}"


def create_thumbnail(image_data: bytes, max_size: int = 512) -> bytes:
    """
    Create a thumbnail that fits within max_size x max_size box.
    Preserves aspect ratio.

    Args:
        image_data: Original image bytes
        max_size: Maximum width/height for thumbnail (default 512)

    Returns:
        bytes: PNG thumbnail data
    """
    try:
        # Open image from bytes
        img = Image.open(io.BytesIO(image_data))

        # Convert to RGB if necessary (handles RGBA, P, etc.)
        if img.mode in ('RGBA', 'LA', 'P'):
            # Create white background
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Calculate new size maintaining aspect ratio
        width, height = img.size
        if width > height:
            new_width = min(width, max_size)
            new_height = int(height * (new_width / width))
        else:
            new_height = min(height, max_size)
            new_width = int(width * (new_height / height))

        # Resize image
        img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Save to bytes
        output = io.BytesIO()
        img_resized.save(output, format='PNG', optimize=True)
        output.seek(0)

        logger.info(f"Created thumbnail: {width}x{height} -> {new_width}x{new_height}")
        return output.getvalue()

    except Exception as e:
        logger.error(f"Error creating thumbnail: {e}")
        raise


def get_image_dimensions(image_data: bytes) -> Tuple[int, int]:
    """
    Get image dimensions.

    Args:
        image_data: Image bytes

    Returns:
        Tuple[int, int]: (width, height)
    """
    try:
        img = Image.open(io.BytesIO(image_data))
        return img.size
    except Exception as e:
        logger.error(f"Error getting image dimensions: {e}")
        raise


def upload_to_gcs(
    gcs_client: storage.Client,
    bucket_name: str,
    blob_path: str,
    data: bytes,
    content_type: str
) -> str:
    """
    Upload data to Google Cloud Storage.

    Args:
        gcs_client: GCS client instance
        bucket_name: GCS bucket name
        blob_path: Path within bucket (e.g., "media/abc123.png")
        data: File data as bytes
        content_type: MIME type (e.g., "image/png")

    Returns:
        str: Public URL to the uploaded file
    """
    try:
        bucket = gcs_client.bucket(bucket_name)
        blob = bucket.blob(blob_path)

        # Upload with content type
        blob.upload_from_string(data, content_type=content_type)

        # Make publicly accessible
        blob.make_public()

        # Return public URL
        public_url = blob.public_url
        logger.info(f"Uploaded to GCS: {blob_path} -> {public_url}")

        return public_url

    except Exception as e:
        logger.error(f"Error uploading to GCS: {e}")
        raise


def get_content_type(filename: str) -> str:
    """
    Determine content type from filename.

    Args:
        filename: File name with extension

    Returns:
        str: MIME type
    """
    ext = filename.lower().split('.')[-1] if '.' in filename else ''

    content_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'webm': 'video/webm',
    }

    return content_types.get(ext, 'application/octet-stream')


def is_video(filename: str) -> bool:
    """
    Check if filename is a video file.

    Args:
        filename: File name with extension

    Returns:
        bool: True if video file
    """
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    video_exts = {'mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'm4v'}
    return ext in video_exts


def is_image(filename: str) -> bool:
    """
    Check if filename is an image file.

    Args:
        filename: File name with extension

    Returns:
        bool: True if image file
    """
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    image_exts = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif'}
    return ext in image_exts


def create_video_thumbnail(video_data: bytes, max_size: int = 512) -> bytes:
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

            # Use PIL to resize it to fit within max_size box (same as image thumbnails)
            img = Image.open(io.BytesIO(frame_data))

            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Calculate new size maintaining aspect ratio
            width, height = img.size
            if width > height:
                new_width = min(width, max_size)
                new_height = int(height * (new_width / width))
            else:
                new_height = min(height, max_size)
                new_width = int(width * (new_height / height))

            # Resize image
            img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Save to bytes
            output = io.BytesIO()
            img_resized.save(output, format='PNG', optimize=True)
            output.seek(0)

            logger.info(f"Created video thumbnail: {width}x{height} -> {new_width}x{new_height}")

            # Clean up
            os.unlink(thumbnail_path)

            return output.getvalue()

        finally:
            # Clean up video file
            os.unlink(video_path)

    except subprocess.CalledProcessError as e:
        logger.error(f"ffmpeg failed: {e.stderr.decode() if e.stderr else 'unknown error'}")
        raise Exception(f"Failed to extract video frame: {e.stderr.decode() if e.stderr else 'unknown error'}")
    except Exception as e:
        logger.error(f"Error creating video thumbnail: {e}")
        raise
