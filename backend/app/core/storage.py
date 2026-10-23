"""Storage client supporting S3/MinIO with automatic local filesystem fallback."""

import logging
from pathlib import Path
from typing import Optional
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger("trustvault.storage")

_s3_available: Optional[bool] = None


def _get_local_storage_path(storage_key: str) -> Path:
    """Get absolute local path for a storage key, preventing directory traversal."""
    base_dir = Path(settings.LOCAL_STORAGE_DIR).resolve()
    parts = [p for p in storage_key.replace("\\", "/").split("/") if p and p != "." and p != ".."]
    target_path = base_dir.joinpath(*parts).resolve()
    if not str(target_path).startswith(str(base_dir)):
        raise ValueError(f"Invalid storage path traversal attempt: {storage_key}")
    return target_path


def get_s3_client():
    """Create an S3-compatible client for MinIO with fail-fast timeouts."""
    endpoint_url = f"{'https' if settings.MINIO_USE_SSL else 'http'}://{settings.MINIO_ENDPOINT}"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=Config(
            signature_version="s3v4",
            connect_timeout=2,
            read_timeout=3,
            retries={"max_attempts": 1},
        ),
        region_name="us-east-1",
    )


def ensure_bucket_exists():
    """Create the document bucket if MinIO is reachable, or ensure local storage directory exists."""
    global _s3_available
    # Always ensure local storage directory exists as fallback
    Path(settings.LOCAL_STORAGE_DIR).mkdir(parents=True, exist_ok=True)

    if settings.STORAGE_TYPE == "local":
        _s3_available = False
        logger.info(f"Using local filesystem storage at: {settings.LOCAL_STORAGE_DIR}")
        return

    try:
        client = get_s3_client()
        try:
            client.head_bucket(Bucket=settings.MINIO_BUCKET)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("404", "NoSuchBucket"):
                client.create_bucket(Bucket=settings.MINIO_BUCKET)
            else:
                raise
        _s3_available = True
        logger.info(f"MinIO object storage connected successfully (bucket: {settings.MINIO_BUCKET}).")
    except Exception as e:
        _s3_available = False
        logger.warning(
            f"Object storage unavailable ({e}). Falling back to local storage at {settings.LOCAL_STORAGE_DIR}."
        )


def upload_file(storage_key: str, data: bytes, content_type: str = "application/octet-stream"):
    """Upload encrypted file data to object storage, or fall back to local disk storage."""
    global _s3_available
    if _s3_available is None:
        ensure_bucket_exists()

    if _s3_available and settings.STORAGE_TYPE != "local":
        try:
            client = get_s3_client()
            client.put_object(
                Bucket=settings.MINIO_BUCKET,
                Key=storage_key,
                Body=data,
                ContentType=content_type,
            )
            return
        except Exception as e:
            logger.warning(f"S3 upload failed ({e}). Falling back to local storage.")
            _s3_available = False

    # Store on local disk
    local_path = _get_local_storage_path(storage_key)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    with open(local_path, "wb") as f:
        f.write(data)
    logger.info(f"Stored encrypted payload locally: {local_path} ({len(data)} bytes)")


def download_file(storage_key: str) -> bytes:
    """Download encrypted file data from local disk or object storage."""
    global _s3_available
    # Check local filesystem first
    local_path = _get_local_storage_path(storage_key)
    if local_path.is_file():
        with open(local_path, "rb") as f:
            return f.read()

    # Try S3 if local file not found
    if _s3_available is not False:
        try:
            client = get_s3_client()
            response = client.get_object(Bucket=settings.MINIO_BUCKET, Key=storage_key)
            return response["Body"].read()
        except Exception as e:
            logger.warning(f"S3 download failed for key {storage_key}: {e}")

    raise FileNotFoundError(f"Storage key '{storage_key}' not found on disk or object storage.")


def delete_file(storage_key: str):
    """Delete a file from storage."""
    local_path = _get_local_storage_path(storage_key)
    if local_path.is_file():
        try:
            local_path.unlink()
        except Exception as e:
            logger.warning(f"Failed to delete local file {local_path}: {e}")

    if _s3_available is not False:
        try:
            client = get_s3_client()
            client.delete_object(Bucket=settings.MINIO_BUCKET, Key=storage_key)
        except Exception:
            pass
