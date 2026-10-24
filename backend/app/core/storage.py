"""Storage client supporting S3/MinIO with automatic local filesystem fallback."""

import logging
from datetime import timedelta
from pathlib import Path
from typing import Optional
import boto3
import google.auth
from botocore.config import Config
from botocore.exceptions import ClientError
from google.auth.transport.requests import Request as GoogleAuthRequest

from app.core.config import settings
from app.core.firebase import get_storage_bucket

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


def _firebase_signing_identity():
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/devstorage.read_write"])
    if not credentials.valid:
        credentials.refresh(GoogleAuthRequest())
    service_account_email = settings.FIREBASE_SERVICE_ACCOUNT_EMAIL or getattr(
        credentials, "service_account_email", None
    )
    if not service_account_email:
        raise RuntimeError("Firebase signed URLs require FIREBASE_SERVICE_ACCOUNT_EMAIL")
    return service_account_email, credentials.token


def create_upload_url(storage_key: str, content_type: str) -> str:
    if settings.STORAGE_TYPE != "firebase":
        raise RuntimeError("Signed Firebase uploads are only enabled with Firebase Storage")
    service_account_email, access_token = _firebase_signing_identity()
    return get_storage_bucket().blob(storage_key).generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=15),
        method="PUT",
        content_type=content_type,
        service_account_email=service_account_email,
        access_token=access_token,
        scheme="https",
    )


def create_download_url(storage_key: str) -> str:
    if settings.STORAGE_TYPE != "firebase":
        raise RuntimeError("Signed Firebase downloads are only enabled with Firebase Storage")
    service_account_email, access_token = _firebase_signing_identity()
    return get_storage_bucket().blob(storage_key).generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=5),
        method="GET",
        service_account_email=service_account_email,
        access_token=access_token,
        scheme="https",
    )


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

    if settings.STORAGE_TYPE == "firebase":
        try:
            get_storage_bucket().reload()
            logger.info("Firebase Storage bucket ready.")
        except Exception as e:
            if settings.is_production:
                raise RuntimeError("Firebase Storage bucket is unavailable") from e
            logger.warning(f"Firebase Storage unavailable: {e}")
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
    if settings.STORAGE_TYPE == "firebase":
        blob = get_storage_bucket().blob(storage_key)
        blob.upload_from_string(data, content_type=content_type)
        return

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
    if settings.STORAGE_TYPE == "firebase":
        try:
            return get_storage_bucket().blob(storage_key).download_as_bytes()
        except Exception as e:
            raise FileNotFoundError(f"Storage key '{storage_key}' was not found in Firebase Storage.") from e

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
    if settings.STORAGE_TYPE == "firebase":
        blob = get_storage_bucket().blob(storage_key)
        if blob.exists():
            blob.delete()
        return

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
