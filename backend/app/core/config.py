import os
from pathlib import Path
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

    model_config = {
        "env_file": str(ENV_PATH) if ENV_PATH.exists() else ".env",
        "extra": "ignore"
    }


settings = Settings()

