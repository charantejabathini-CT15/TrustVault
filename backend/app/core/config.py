import os
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings
from typing import List

# Find .env file in root or backend
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
ENV_PATH = ROOT_DIR / ".env" if (ROOT_DIR / ".env").exists() else Path(".env")


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # Database
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_DATABASE: str = "trustvault"
    MYSQL_USER: str = "trustvault"
    MYSQL_PASSWORD: str = ""
    MYSQL_SSL_CA: str = ""
    USE_SQLITE: bool = False
    DATABASE_URL_OVERRIDE: str = ""

    # Security
    SECRET_KEY: str = "dev_secret_key_not_for_production_use_a94bc1d2e3f4567890abcdef"
    SESSION_EXPIRY_HOURS: int = 24
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
    ENVIRONMENT: str = "development"

    # Storage
    STORAGE_TYPE: str = "auto"  # "s3", "local", or "auto" (attempts S3 then falls back to local)
    LOCAL_STORAGE_DIR: str = str(ROOT_DIR / "backend" / "data" / "storage")
    S3_ENDPOINT_URL: str = ""
    S3_BUCKET: str = ""
    S3_REGION: str = "auto"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_BUCKET: str = "trustvault-documents"
    MINIO_USE_SSL: bool = False
    AWS_ACCESS_KEY_ID: str = "minioadmin"
    AWS_SECRET_ACCESS_KEY: str = "minioadmin123"

    # Rate Limiting
    LOGIN_RATE_LIMIT_ATTEMPTS: int = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 300

    @property
    def DATABASE_URL(self) -> str:
        if self.DATABASE_URL_OVERRIDE:
            return self.DATABASE_URL_OVERRIDE
        if self.USE_SQLITE:
            db_path = ROOT_DIR / "backend" / "trustvault.db"
            return f"sqlite:///{db_path}"
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def validate_production_settings(self):
        if not self.is_production:
            return self

        if len(self.SECRET_KEY) < 32 or self.SECRET_KEY.startswith("dev_secret_key"):
            raise ValueError("Production requires a unique SECRET_KEY of at least 32 characters")
        if self.STORAGE_TYPE != "s3":
            raise ValueError("Production requires STORAGE_TYPE=s3; local fallback is disabled")
        database_url = self.DATABASE_URL.lower()
        if database_url.startswith("sqlite") or not self.DATABASE_URL_OVERRIDE:
            raise ValueError("Production requires DATABASE_URL_OVERRIDE for a durable database")
        if database_url.startswith(("postgresql://", "postgres://", "postgresql+psycopg://")):
            if not any(mode in database_url for mode in ("sslmode=require", "sslmode=verify-ca", "sslmode=verify-full")):
                raise ValueError("Production PostgreSQL connections must require TLS")
        elif database_url.startswith("mysql"):
            if not self.MYSQL_PASSWORD or not self.MYSQL_SSL_CA:
                raise ValueError("Production MySQL requires MYSQL_PASSWORD and MYSQL_SSL_CA")
        else:
            raise ValueError("Production database must use PostgreSQL or MySQL")
        if self.AWS_ACCESS_KEY_ID == "minioadmin" or self.AWS_SECRET_ACCESS_KEY == "minioadmin123":
            raise ValueError("Production requires non-default object-storage credentials")
        endpoint = self.S3_ENDPOINT_URL or f"{'https' if self.MINIO_USE_SSL else 'http'}://{self.MINIO_ENDPOINT}"
        if not endpoint.startswith("https://") or "localhost" in endpoint or "127.0.0.1" in endpoint:
            raise ValueError("Production requires a remote HTTPS S3 endpoint")
        if not (self.S3_BUCKET or self.MINIO_BUCKET):
            raise ValueError("Production requires an S3 bucket")
        if not self.cors_origins_list or any(not origin.startswith("https://") for origin in self.cors_origins_list):
            raise ValueError("Production CORS_ORIGINS must contain only HTTPS origins")
        return self

    model_config = {
        "env_file": str(ENV_PATH) if ENV_PATH.exists() else ".env",
        "extra": "ignore"
    }


settings = Settings()

