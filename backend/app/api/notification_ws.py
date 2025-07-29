from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status, Depends
from jose import jwt, JWTError
from app.config import get_settings
from app.models.user import User
from app.database import get_db
from app.api.auth import get_current_user
from sqlalchemy.orm import Session
from typing import Dict, List
from datetime import datetime
import logging
import json

# Create separate routers for WebSocket and HTTP endpoints
ws_router = APIRouter()  # For WebSocket endpoints (no prefix)
http_router = APIRouter()  # For HTTP endpoints (with /api prefix)
router = APIRouter()  # Main router that includes both

logger = logging.getLogger(__name__)

settings = get_settings()
SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm

# In-memory store: user_id -> list of WebSocket connections
active_connections: Dict[int, List[WebSocket]] = {}

def get_user_id_from_token(token: str, db: Session) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            return None
        user = db.query(User).filter(User.email == email).first()
        if user:
            return user.id
    except JWTError:
        return None
    return None

# WebSocket endpoint (no prefix)
@ws_router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    db = next(get_db())
    token = websocket.query_params.get("token")
    user_id = get_user_id_from_token(token, db)
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    if user_id not in active_connections:
        active_connections[user_id] = []
    active_connections[user_id].append(websocket)
    try:
        while True:
            await websocket.receive_text()  # Keep connection alive
    except WebSocketDisconnect:
        active_connections[user_id].remove(websocket)
        if not active_connections[user_id]:
            del active_connections[user_id]

# HTTP endpoints (with /api prefix)
@http_router.post("/test-notification")
async def test_notification(current_user: User = Depends(get_current_user)):
    """Send a test notification to the current user via WebSocket"""
    import json
    
    user_id = current_user.id
    message = {
        "type": "test_notification",
        "message": "WebSocket connection is working correctly!",
        "timestamp": datetime.now().isoformat(),
        "user_id": user_id
    }
    
    if user_id in active_connections:
        sent_count = 0
        for ws in active_connections[user_id]:
            try:
                await ws.send_text(json.dumps(message))
                sent_count += 1
            except Exception as e:
                logger.warning(f"Failed to send test notification to WebSocket: {e}")
        
        return {
            "success": True,
            "message": f"Test notification sent to {sent_count} WebSocket connection(s)",
            "connections": sent_count
        }
    else:
        return {
            "success": False,
            "message": "No active WebSocket connections found for user",
            "connections": 0
        }

@http_router.get("/debug/scheduled-posts")
async def debug_scheduled_posts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Debug endpoint to check scheduled posts and their timing"""
    from app.models.scheduled_post import ScheduledPost
    import pytz
    
    now_utc = datetime.utcnow()
    now_ist = now_utc.replace(tzinfo=pytz.UTC).astimezone(pytz.timezone("Asia/Kolkata"))
    
    # Get all scheduled posts for the user
    posts = db.query(ScheduledPost).filter(
        ScheduledPost.user_id == current_user.id,
        ScheduledPost.status == "scheduled",
        ScheduledPost.is_active == True
    ).all()
    
    debug_info = {
        "current_time_utc": now_utc.isoformat(),
        "current_time_ist": now_ist.isoformat(),
        "total_scheduled_posts": len(posts),
        "websocket_connections": len(active_connections.get(current_user.id, [])),
        "posts": []
    }
    
    for post in posts:
        if post.scheduled_datetime:
            # Handle timezone-aware datetime properly
            if post.scheduled_datetime.tzinfo is not None:
                # Convert to UTC for comparison
                scheduled_utc = post.scheduled_datetime.astimezone(pytz.UTC)
                time_diff = scheduled_utc - now_utc.replace(tzinfo=pytz.UTC)
            else:
                # Assume naive datetime is UTC
                time_diff = post.scheduled_datetime - now_utc
            
            minutes_until = int(time_diff.total_seconds() / 60)
            
            debug_info["posts"].append({
                "id": post.id,
                "prompt": post.prompt[:50] + "..." if len(post.prompt) > 50 else post.prompt,
                "scheduled_datetime_utc": post.scheduled_datetime.isoformat(),
                "scheduled_datetime_ist": post.scheduled_datetime.replace(tzinfo=pytz.UTC).astimezone(pytz.timezone("Asia/Kolkata")).isoformat() if post.scheduled_datetime.tzinfo else "N/A",
                "minutes_until_posting": minutes_until,
                "will_notify_in_10_min": (8 <= minutes_until <= 12) or (1 <= minutes_until <= 3),
                "status": post.status,
                "is_active": post.is_active
            })
    
    return debug_info

# Include both routers in the main router
router.include_router(ws_router)
router.include_router(http_router, prefix="/api") 