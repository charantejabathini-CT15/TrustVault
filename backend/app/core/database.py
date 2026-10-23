"""Database engine and session management."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from typing import Generator

from app.core.config import settings


import logging
from pathlib import Path

logger = logging.getLogger("trustvault.db")

db_url = settings.DATABASE_URL

def _init_engine(url: str):
    if url.startswith("sqlite"):
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            echo=False,
        )
    try:
        eng = create_engine(
            url,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            echo=False,
        )
        # Test connection
        with eng.connect() as conn:
            pass
        return eng
    except Exception as e:
        if not settings.is_production:
            logger.warning(f"MySQL connection failed ({e}). Falling back to local SQLite database for development.")
            db_path = Path(__file__).resolve().parent.parent.parent / "trustvault.db"
            return create_engine(
                f"sqlite:///{db_path}",
                connect_args={"check_same_thread": False},
                echo=False,
            )
        raise

engine = _init_engine(db_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
