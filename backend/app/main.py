from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.database import init_db, verify_db_connection
from app.api import auth, social_media, ai, google_drive, webhook, google_oauth
import logging
import asyncio
import os
import signal
import sys
from pathlib import Path
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title="Automation Dashboard API",
    description="Backend API for social media automation dashboard",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# Create temp_images directory if it doesn't exist
temp_images_path = Path("temp_images")
temp_images_path.mkdir(exist_ok=True)

# Mount the static files
app.mount("/temp_images", StaticFiles(directory="temp_images"), name="temp_images")

# Add request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    # Log request details
    logger.info(f"🔍 REQUEST: {request.method} {request.url}")
    logger.info(f"🔍 Headers: {dict(request.headers)}")
    logger.info(f"🔍 Origin: {request.headers.get('origin', 'No origin header')}")
    
    response = await call_next(request)
    
    # Log response details
    process_time = time.time() - start_time
    logger.info(f"🔍 RESPONSE: {response.status_code} - {process_time:.4f}s")
    logger.info(f"🔍 Response Headers: {dict(response.headers)}")
    
    return response

# Add CORS middleware with explicit configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else [
        "http://localhost:3000",
        "https://localhost:3000",
        "http://localhost:8000",
        "https://localhost:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Add trusted host middleware for production
if settings.environment == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"]  # Configure with actual domain in production
    )


@app.on_event("startup")
async def startup_event():
    """Initialize the application."""
    logger.info("Starting Automation Dashboard API...")
    
    try:
        # Initialize database models (for Alembic compatibility)
        init_db()
        logger.info("Database models registered")
        
        # Verify database connection
        verify_db_connection()
        logger.info("Database connection verified")
        
    except Exception as e:
        logger.error(f"Database initialization error: {e}")
        # Don't fail startup for database issues
    

    
    # Start bulk composer scheduler for scheduled posts
    try:
        from app.services.bulk_composer_scheduler import bulk_composer_scheduler
        asyncio.create_task(bulk_composer_scheduler.start())
        logger.info("Bulk composer scheduler started for scheduled posts")
    except Exception as e:
        logger.error(f"Failed to start bulk composer scheduler: {e}")

    # Start auto-reply scheduler for Facebook comments
    try:
        from app.services.auto_reply_service import auto_reply_service
        from app.database import get_db
        async def auto_reply_scheduler():
            while True:
                try:
                    db = next(get_db())
                    await auto_reply_service.process_auto_replies(db)
                except Exception as e:
                    logger.error(f"Error in auto-reply scheduler: {e}")
                await asyncio.sleep(60)  
        asyncio.create_task(auto_reply_scheduler())
        logger.info("Auto-reply scheduler started for Facebook comments")
    except Exception as e:
        logger.error(f"Failed to start auto-reply scheduler: {e}")

    # Start Instagram scheduler service
    try:
        from app.services.scheduler_service import scheduler_service
        asyncio.create_task(scheduler_service.start())
        logger.info("Instagram scheduler service started")
    except Exception as e:
        logger.error(f"Failed to start Instagram scheduler service: {e}")

    logger.info("Automation Dashboard API started successfully")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources."""
    logger.info("Shutting down Automation Dashboard API...")
    

    
    # Stop bulk composer scheduler
    try:
        from app.services.bulk_composer_scheduler import bulk_composer_scheduler
        bulk_composer_scheduler.stop()
        logger.info("Bulk composer scheduler stopped")
    except Exception as e:
        logger.error(f"Error stopping bulk composer scheduler: {e}")

    # Stop Instagram scheduler service
    try:
        from app.services.scheduler_service import scheduler_service
        scheduler_service.stop()
        logger.info("Instagram scheduler service stopped")
    except Exception as e:
        logger.error(f"Error stopping Instagram scheduler service: {e}")


# Health check endpoint
@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "message": "Automation Dashboard API",
        "version": "1.0.0",
        "status": "healthy",
        "environment": settings.environment
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "environment": settings.environment,
        "debug": settings.debug,
        "database": "connected"
    }


@app.get("/api/debug/cors")
async def cors_debug():
    """Debug endpoint to test CORS without authentication."""
    return {
        "message": "CORS is working",
        "timestamp": "2025-07-28T05:40:00Z",
        "cors_origins": settings.cors_origins
    }


@app.options("/api/{path:path}")
async def options_handler(path: str):
    """Handle preflight OPTIONS requests explicitly."""
    return JSONResponse(
        status_code=200,
        content={"message": "OK"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Max-Age": "3600",
        }
    )





# Include API routers
app.include_router(auth.router, prefix="/api")
app.include_router(social_media.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(google_drive.router)
app.include_router(webhook.router, prefix="/api")
app.include_router(google_oauth.router, prefix="/api")


# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "message": "The requested resource was not found",
            "status_code": 404
        }
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An internal server error occurred",
            "status_code": 500
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    def signal_handler(sig, frame):
        logger.info("Received shutdown signal, stopping server...")
        sys.exit(0)
    
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)  # Ctrl+C
    signal.signal(signal.SIGTERM, signal_handler)  # Termination signal
    
    try:
        logger.info("Starting FastAPI server...")
        logger.info("Press Ctrl+C to stop the server")
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=settings.debug,
            log_level="info"
        )
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)