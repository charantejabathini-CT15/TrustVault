"""Database engine and session management."""

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from typing import Generator

from app.core.config import settings


import logging
from pathlib import Path

logger = logging.getLogger("trustvault.db")

db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = "postgresql://" + db_url.removeprefix("postgres://")
parsed_db_url = make_url(db_url)
if parsed_db_url.drivername == "postgresql":
    db_url = parsed_db_url.set(drivername="postgresql+psycopg").render_as_string(hide_password=False)

def _init_engine(url: str):
    if url.startswith("sqlite"):
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            echo=False,
        )
    try:
        connect_args = {}
        if parsed_db_url.drivername == "postgresql":
            connect_args["prepare_threshold"] = None
        if parsed_db_url.drivername.startswith("mysql") and settings.MYSQL_SSL_CA:
            connect_args["ssl"] = {"ca": settings.MYSQL_SSL_CA}
        eng = create_engine(
            url,
            pool_pre_ping=True,
            pool_size=3,
            max_overflow=2,
            echo=False,
            connect_args=connect_args,
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
