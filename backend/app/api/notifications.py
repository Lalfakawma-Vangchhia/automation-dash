from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import logging

from app.database import get_db
from app.models.user import User
from app.models.notification import NotificationType, NotificationPlatform
from app.services.notification_service import notification_service
from app.api.auth import get_current_user
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

class NotificationResponse(BaseModel):
    id: str
    type: str
    platform: str
    strategy_name: Optional[str]
    message: str
    is_read: bool
    created_at: str
    scheduled_time: Optional[str]
    error_message: Optional[str]
    post_id: Optional[str]

class NotificationPreferencesResponse(BaseModel):
    browser_notifications_enabled: bool
    pre_posting_enabled: bool
    success_enabled: bool
    failure_enabled: bool

class NotificationPreferencesUpdate(BaseModel):
    browser_notifications_enabled: Optional[bool] = None
    pre_posting_enabled: Optional[bool] = None
    success_enabled: Optional[bool] = None
    failure_enabled: Optional[bool] = None

@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user notifications"""
    try:
        notifications = await notification_service.get_user_notifications(
            db=db,
            user_id=current_user.id,
            limit=limit,
            offset=offset
        )
        
        return [
            NotificationResponse(
                id=str(notification.id),
                type=notification.type.value,
                platform=notification.platform.value,
                strategy_name=notification.strategy_name,
                message=notification.message,
                is_read=notification.is_read,
                created_at=notification.created_at.isoformat(),
                scheduled_time=notification.scheduled_time.isoformat() if notification.scheduled_time else None,
                error_message=notification.error_message,
                post_id=str(notification.post_id) if notification.post_id else None
            )
            for notification in notifications
        ]
        
    except Exception as e:
        logger.error(f"Error getting notifications for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get notifications")

@router.post("/notifications/{notification_id}/mark-read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a notification as read"""
    try:
        success = await notification_service.mark_notification_read(
            db=db,
            notification_id=notification_id,
            user_id=current_user.id
        )
        
        if success:
            return {"success": True, "message": "Notification marked as read"}
        else:
            raise HTTPException(status_code=404, detail="Notification not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking notification {notification_id} as read: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark notification as read")

@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all notifications as read"""
    try:
        success = await notification_service.mark_all_notifications_read(
            db=db,
            user_id=current_user.id
        )
        
        if success:
            return {"success": True, "message": "All notifications marked as read"}
        else:
            raise HTTPException(status_code=500, detail="Failed to mark notifications as read")
            
    except Exception as e:
        logger.error(f"Error marking all notifications as read for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark notifications as read")

@router.get("/notification-preferences", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user notification preferences"""
    try:
        preferences = await notification_service.get_user_preferences(
            db=db,
            user_id=current_user.id
        )
        
        return NotificationPreferencesResponse(
            browser_notifications_enabled=preferences.browser_notifications_enabled,
            pre_posting_enabled=preferences.pre_posting_enabled,
            success_enabled=preferences.success_enabled,
            failure_enabled=preferences.failure_enabled
        )
        
    except Exception as e:
        logger.error(f"Error getting notification preferences for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get notification preferences")

@router.put("/notification-preferences", response_model=NotificationPreferencesResponse)
async def update_notification_preferences(
    preferences_update: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user notification preferences"""
    try:
        # Convert to dict and filter out None values
        preferences_data = {
            k: v for k, v in preferences_update.dict().items() 
            if v is not None
        }
        
        preferences = await notification_service.update_user_preferences(
            db=db,
            user_id=current_user.id,
            preferences_data=preferences_data
        )
        
        return NotificationPreferencesResponse(
            browser_notifications_enabled=preferences.browser_notifications_enabled,
            pre_posting_enabled=preferences.pre_posting_enabled,
            success_enabled=preferences.success_enabled,
            failure_enabled=preferences.failure_enabled
        )
        
    except Exception as e:
        logger.error(f"Error updating notification preferences for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update notification preferences")

@router.post("/test-notification")
async def test_notification(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Test endpoint to create a sample notification"""
    try:
        await notification_service.create_notification(
            db=db,
            user_id=current_user.id,
            notification_type=NotificationType.PRE_POSTING,
            platform=NotificationPlatform.INSTAGRAM,
            message="Test notification: Your Daily Motivation strategy will be posted in 10 minutes. If you'd like to change anything before the post is made, now is the time.",
            strategy_name="Daily Motivation Test"
        )
        
        return {"success": True, "message": "Test notification created successfully"}
        
    except Exception as e:
        logger.error(f"Error creating test notification: {e}")
        raise HTTPException(status_code=500, detail="Failed to create test notification")

@router.websocket("/ws/notifications")
async def websocket_notifications(
    websocket: WebSocket,
    token: str,
    db: Session = Depends(get_db)
):
    """WebSocket endpoint for real-time notifications"""
    try:
        # Authenticate user using token
        from app.api.auth import get_user_from_token
        user = await get_user_from_token(token, db)
        
        if not user:
            await websocket.close(code=4001, reason="Invalid token")
            return
        
        await websocket.accept()
        await notification_service.add_websocket_connection(user.id, websocket)
        
        logger.info(f"WebSocket connected for user {user.id}")
        
        try:
            # Keep connection alive and handle incoming messages
            while True:
                data = await websocket.receive_text()
                # Handle any incoming messages if needed
                logger.debug(f"Received WebSocket message from user {user.id}: {data}")
                
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for user {user.id}")
        except Exception as e:
            logger.error(f"WebSocket error for user {user.id}: {e}")
        finally:
            await notification_service.remove_websocket_connection(user.id)
            
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
        try:
            await websocket.close(code=4000, reason="Connection error")
        except:
            pass