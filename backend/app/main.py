"""TrustVault — FastAPI Application Entry Point."""

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.core.security import verify_csrf_token
from app.core.database import engine, Base
from app.core.storage import ensure_bucket_exists
from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.api.routes import (
    audit_router, policy_router, alert_router,
    profile_router, dashboard_router, team_router,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trustvault")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Create tables
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    # Verify configured object storage before accepting traffic.
    try:
        ensure_bucket_exists()
        logger.info("Storage bucket ready.")
    except Exception as e:
        if settings.is_production:
            raise
        logger.warning(f"Could not connect to object storage: {e}")

    logger.info("TrustVault backend started.")
    yield
    logger.info("TrustVault backend shutting down.")


app = FastAPI(
    title="TrustVault API",
    description="Secure Document Sharing with Verifiable Audit Trail",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)


# Security headers middleware
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path not in (
        "/api/auth/login",
        "/api/auth/register",
    ):
        cookie_token = request.cookies.get("csrf_token", "")
        header_token = request.headers.get("X-CSRF-Token", "")
        if not verify_csrf_token(cookie_token, header_token):
            return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
    return await call_next(request)


from fastapi import HTTPException

# Global exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None),
        )
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )



# Register routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(audit_router)
app.include_router(policy_router)
app.include_router(alert_router)
app.include_router(profile_router)
app.include_router(dashboard_router)
app.include_router(team_router)


@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "trustvault"}
