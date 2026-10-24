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
    """Create an S3-compatible client for MinIO, R2, or another S3 service."""
    endpoint_url = settings.S3_ENDPOINT_URL or f"{'https' if settings.MINIO_USE_SSL else 'http'}://{settings.MINIO_ENDPOINT}"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=2,
            read_timeout=3,
            retries={"max_attempts": 1},
        ),
        region_name=settings.S3_REGION,
    )


def _bucket_name() -> str:
    return settings.S3_BUCKET or settings.MINIO_BUCKET


def _use_local_storage() -> bool:
    return settings.STORAGE_TYPE == "local" or (not settings.is_production and _s3_available is False)


def ensure_bucket_exists():
    """Verify configured object storage, or prepare local development storage."""
    global _s3_available

    if settings.STORAGE_TYPE == "local":
        if settings.is_production:
            raise RuntimeError("Local storage is not allowed in production")
        _s3_available = False
        Path(settings.LOCAL_STORAGE_DIR).mkdir(parents=True, exist_ok=True)
        logger.info(f"Using local filesystem storage at: {settings.LOCAL_STORAGE_DIR}")
        return

    try:
        client = get_s3_client()
        try:
            client.head_bucket(Bucket=_bucket_name())
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("404", "NoSuchBucket") and not settings.is_production:
                client.create_bucket(Bucket=_bucket_name())
            else:
                raise
        _s3_available = True
        logger.info(f"S3 object storage connected successfully (bucket: {_bucket_name()}).")
    except Exception as e:
        _s3_available = False
        if settings.is_production:
            raise RuntimeError("Production object storage is unavailable") from e
        logger.warning(
            f"Object storage unavailable ({e}). Falling back to local storage at {settings.LOCAL_STORAGE_DIR}."
        )


def upload_file(storage_key: str, data: bytes, content_type: str = "application/octet-stream"):
    """Upload encrypted file data to object storage, or fall back to local disk storage."""
    global _s3_available
    if _s3_available is None:
        ensure_bucket_exists()

    if _use_local_storage():
        local_path = _get_local_storage_path(storage_key)
        local_path.parent.mkdir(parents=True, exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
        return

    if _s3_available:
        try:
            client = get_s3_client()
            client.put_object(
                Bucket=_bucket_name(),
                Key=storage_key,
                Body=data,
                ContentType=content_type,
            )
            return
        except Exception as e:
            if settings.is_production:
                raise RuntimeError("Production object-storage upload failed") from e
            logger.warning(f"S3 upload failed ({e}). Falling back to local storage.")
            _s3_available = False
            upload_file(storage_key, data, content_type)
            return
    raise RuntimeError("Object storage is unavailable")


def download_file(storage_key: str) -> bytes:
    """Download encrypted file data from local disk or object storage."""
    global _s3_available
    if _use_local_storage():
        local_path = _get_local_storage_path(storage_key)
        if local_path.is_file():
            with open(local_path, "rb") as f:
                return f.read()
        raise FileNotFoundError(f"Storage key '{storage_key}' not found on local disk.")

    # Try S3 if local file not found
    if _s3_available is not False:
        try:
            client = get_s3_client()
            response = client.get_object(Bucket=_bucket_name(), Key=storage_key)
            return response["Body"].read()
        except Exception as e:
            logger.warning(f"S3 download failed for key {storage_key}: {e}")

    raise FileNotFoundError(f"Storage key '{storage_key}' not found on disk or object storage.")


def delete_file(storage_key: str):
    """Delete a file from storage."""
    if _use_local_storage():
        local_path = _get_local_storage_path(storage_key)
        if not local_path.is_file():
            return
        try:
            local_path.unlink()
        except Exception as e:
            logger.warning(f"Failed to delete local file {local_path}: {e}")
        return

    if _s3_available:
        try:
            client = get_s3_client()
            client.delete_object(Bucket=_bucket_name(), Key=storage_key)
        except Exception as e:
            logger.error(f"Failed to delete object {storage_key}: {e}")
