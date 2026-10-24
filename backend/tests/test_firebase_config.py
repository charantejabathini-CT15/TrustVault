import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_accepts_cloud_sql_socket_and_firebase_storage():
    settings = Settings(
        _env_file=None,
        ENVIRONMENT="production",
        SECRET_KEY="a-unique-production-key-with-enough-entropy",
        DATABASE_URL_OVERRIDE=(
            "postgresql+psycopg://trustvault:password@/trustvault"
            "?host=/cloudsql/project:region:instance"
        ),
        STORAGE_TYPE="firebase",
        FIREBASE_PROJECT_ID="trustvault-pvt",
        FIREBASE_STORAGE_BUCKET="trustvault-pvt.firebasestorage.app",
        CORS_ORIGINS="https://trustvault-pvt.web.app",
    )

    assert settings.is_production
    assert settings.STORAGE_TYPE == "firebase"


def test_production_rejects_unencrypted_postgres_tcp():
    with pytest.raises(ValidationError, match="must require TLS"):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            SECRET_KEY="a-unique-production-key-with-enough-entropy",
            DATABASE_URL_OVERRIDE="postgresql+psycopg://user:pass@db.example.test/app",
            STORAGE_TYPE="firebase",
            CORS_ORIGINS="https://trustvault-pvt.web.app",
        )