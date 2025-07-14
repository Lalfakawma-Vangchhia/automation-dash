#!/usr/bin/env python3
"""
FastAPI server startup script with HTTPS support for Windows.
"""

import uvicorn
import signal
import sys
import os
import ssl
from pathlib import Path
from app.config import get_settings

def main():
    """Start the FastAPI server with HTTPS support."""
    
    settings = get_settings()
    
    def signal_handler(signum, frame):
        print("\n🛑 Received shutdown signal, stopping server...")
        sys.exit(0)
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)   # Ctrl+C
    if hasattr(signal, 'SIGTERM'):
        signal.signal(signal.SIGTERM, signal_handler)  # Termination signal
    
    # Check for SSL certificates
    cert_dir = Path(__file__).parent
    key_path = cert_dir / "localhost-key.pem"
    cert_path = cert_dir / "localhost.pem"
    
    if not key_path.exists() or not cert_path.exists():
        print("❌ SSL certificates not found in backend directory!")
        print("🔐 Please copy certificates from frontend or generate new ones:")
        print("   Copy from: ../frontend/localhost-key.pem")
        print("   Copy from: ../frontend/localhost.pem")
        print("\n🌐 Falling back to HTTP server...")
        
        # Fall back to HTTP
        print("🚀 Starting Automation Dashboard API (HTTP)...")
        print("📍 Server will be available at: http://localhost:8000")
        print("📚 API docs will be at: http://localhost:8000/docs")
        print("⚠️  Note: Facebook login requires HTTPS")
        print("🛑 Press Ctrl+C to stop the server")
        print("-" * 50)
        
        try:
            uvicorn.run(
                "app.main:app",
                host="0.0.0.0",
                port=8000,
                reload=settings.debug,
                log_level="info" if settings.debug else "warning",
                access_log=True,
                use_colors=True,
                loop="asyncio"
            )
        except KeyboardInterrupt:
            print("\n👋 Server stopped by user")
        except Exception as e:
            print(f"❌ Server error: {e}")
            sys.exit(1)
        finally:
            print("✅ Server shutdown complete")
    else:
        # HTTPS configuration
        ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
        
        print("🚀 Starting Automation Dashboard API (HTTPS)...")
        print("📍 Server will be available at: https://localhost:8000")
        print("📚 API docs will be at: https://localhost:8000/docs")
        print("🔒 Secure connection established")
        print("🎉 Facebook login should now work!")
        print("🛑 Press Ctrl+C to stop the server")
        print("-" * 50)
        
        try:
            uvicorn.run(
                "app.main:app",
                host="0.0.0.0",
                port=8000,
                reload=settings.debug,
                log_level="info" if settings.debug else "warning",
                access_log=True,
                use_colors=True,
                loop="asyncio",
                ssl_keyfile=str(key_path),
                ssl_certfile=str(cert_path)
            )
        except KeyboardInterrupt:
            print("\n👋 Server stopped by user")
        except Exception as e:
            print(f"❌ Server error: {e}")
            sys.exit(1)
        finally:
            print("✅ Server shutdown complete")

if __name__ == "__main__":
    main() 