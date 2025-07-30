import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc

from app.database import get_db
from app.models.notification import Notification, NotificationPreferences, NotificationType, NotificationPlatform
from app.models.user import User
from app.models.scheduled_post import ScheduledPost

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        self.websocket_connections: Dict[int, Any] = {}  # user_id -> websocket connection
    
    async def add_websocket_connection(self, user_id: int, websocket):
        """Add a WebSocket connection for a user"""
        self.websocket_connections[user_id] = websocket
        logger.info(f"Added WebSocket connection for user {user_id}")
    
    async def remove_websocket_connection(self, user_id: int):
        """Remove a WebSocket connection for a user"""
        if user_id in self.websocket_connections:
            del self.websocket_connections[user_id]
            logger.info(f"Removed WebSocket connection for user {user_id}")
    
    async def create_notification(
        self,
        db: Session,
        user_id: int,
        notification_type: NotificationType,
        platform: NotificationPlatform,
        message: str,
        strategy_name: Optional[str] = None,
        post_id: Optional[int] = None,
        scheduled_time: Optional[datetime] = None,
        error_message: Optional[str] = None
    ) -> Notification:
        """Create a new notification"""
        try:
            notification = Notification(
                user_id=user_id,
                post_id=post_id,
                type=notification_type,
                platform=platform,
                strategy_name=strategy_name,
                message=message,
                scheduled_time=scheduled_time,
                error_message=error_message
            )
            
            db.add(notification)
            db.commit()
            db.refresh(notification)
            
            # Send real-time notification via WebSocket
            await self.send_websocket_notification(user_id, notification)
            
            logger.info(f"Created notification {notification.id} for user {user_id}")
            return notification
            
        except Exception as e:
            logger.error(f"Error creating notification: {e}")
            db.rollback()
            raise
    
    async def send_websocket_notification(self, user_id: int, notification: Notification):
        """Send notification via WebSocket if user is connected"""
        if user_id in self.websocket_connections:
            try:
                websocket = self.websocket_connections[user_id]
                notification_data = {
                    "type": "notification",
                    "notification": {
                        "id": str(notification.id),
                        "type": notification.type.value,
                        "platform": notification.platform.value,
                        "strategyName": notification.strategy_name,
                        "message": notification.message,
                        "timestamp": notification.created_at.isoformat(),
                        "isRead": notification.is_read,
                        "postId": str(notification.post_id) if notification.post_id else None,
                        "scheduledTime": notification.scheduled_time.isoformat() if notification.scheduled_time else None,
                        "error": notification.error_message
                    }
                }
                
                await websocket.send_text(str(notification_data).replace("'", '"'))
                logger.info(f"Sent WebSocket notification to user {user_id}")
                
            except Exception as e:
                logger.error(f"Error sending WebSocket notification to user {user_id}: {e}")
                # Remove broken connection
                await self.remove_websocket_connection(user_id)
    
    async def schedule_pre_posting_alert(self, db: Session, post_id: int):
        """Schedule a pre-posting alert for 10 minutes before the post"""
        try:
            # Try to find in ScheduledPost first
            scheduled_post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
            if scheduled_post:
                await self._schedule_scheduled_post_alert(db, scheduled_post)
                return
            
            # Try to find in BulkComposerContent
            from app.models.bulk_composer_content import BulkComposerContent
            bulk_post = db.query(BulkComposerContent).filter(BulkComposerContent.id == post_id).first()
            if bulk_post:
                await self._schedule_bulk_composer_alert(db, bulk_post)
                return
                
            logger.error(f"Post {post_id} not found in ScheduledPost or BulkComposerContent")
            
        except Exception as e:
            logger.error(f"Error scheduling pre-posting alert for post {post_id}: {e}")
    
    async def _schedule_scheduled_post_alert(self, db: Session, scheduled_post: ScheduledPost):
        """Schedule alert for ScheduledPost"""
        try:
            
            # Check if we should send pre-posting notification
            user_prefs = await self.get_user_preferences(db, scheduled_post.user_id)
            if not user_prefs.pre_posting_enabled:
                logger.info(f"Pre-posting notifications disabled for user {scheduled_post.user_id}")
                return
            
            # Calculate 10 minutes before scheduled time
            alert_time = scheduled_post.scheduled_datetime - timedelta(minutes=10)
            
            # Handle timezone-aware comparison
            if scheduled_post.scheduled_datetime.tzinfo is not None:
                # If scheduled_datetime is timezone-aware, convert to UTC for comparison
                current_time = datetime.now(scheduled_post.scheduled_datetime.tzinfo)
            else:
                # If scheduled_datetime is naive, assume it's in UTC
                current_time = datetime.utcnow()
            
            # Only schedule if alert time is in the future
            if alert_time > current_time:
                # Schedule the alert (in a real implementation, you'd use a task queue like Celery)
                delay_seconds = (alert_time - current_time).total_seconds()
                asyncio.create_task(self._send_delayed_scheduled_post_alert(delay_seconds, db, scheduled_post))
                logger.info(f"✅ Scheduled pre-posting alert for Instagram post {scheduled_post.id}")
                logger.info(f"   📅 Scheduled time: {scheduled_post.scheduled_datetime}")
                logger.info(f"   ⏰ Alert time: {alert_time}")
                logger.info(f"   ⏱️ Delay: {delay_seconds} seconds ({delay_seconds/60:.1f} minutes)")
            else:
                logger.info(f"Pre-posting alert time has passed for scheduled post {scheduled_post.id}")
                
        except Exception as e:
            logger.error(f"Error scheduling pre-posting alert for scheduled post {scheduled_post.id}: {e}")
    
    async def _schedule_bulk_composer_alert(self, db: Session, bulk_post):
        """Schedule alert for BulkComposerContent"""
        try:
            # Check if we should send pre-posting notification
            user_prefs = await self.get_user_preferences(db, bulk_post.user_id)
            if not user_prefs.pre_posting_enabled:
                logger.info(f"Pre-posting notifications disabled for user {bulk_post.user_id}")
                return
            
            # Calculate 10 minutes before scheduled time
            alert_time = bulk_post.scheduled_datetime - timedelta(minutes=10)
            
            # Handle timezone-aware comparison
            if bulk_post.scheduled_datetime.tzinfo is not None:
                # If scheduled_datetime is timezone-aware, convert to UTC for comparison
                current_time = datetime.now(bulk_post.scheduled_datetime.tzinfo)
            else:
                # If scheduled_datetime is naive, assume it's in UTC
                current_time = datetime.utcnow()
            
            # Only schedule if alert time is in the future
            if alert_time > current_time:
                # Schedule the alert (in a real implementation, you'd use a task queue like Celery)
                delay_seconds = (alert_time - current_time).total_seconds()
                asyncio.create_task(self._send_delayed_bulk_composer_alert(delay_seconds, db, bulk_post))
                logger.info(f"✅ Scheduled pre-posting alert for bulk composer post {bulk_post.id}")
                logger.info(f"   📅 Scheduled time: {bulk_post.scheduled_datetime}")
                logger.info(f"   ⏰ Alert time: {alert_time}")
                logger.info(f"   ⏱️ Delay: {delay_seconds} seconds ({delay_seconds/60:.1f} minutes)")
            else:
                logger.info(f"Pre-posting alert time has passed for bulk composer post {bulk_post.id}")
                
        except Exception as e:
            logger.error(f"Error scheduling pre-posting alert for bulk composer post {bulk_post.id}: {e}")
    
    async def _send_delayed_scheduled_post_alert(self, delay_seconds: float, db: Session, scheduled_post: ScheduledPost):
        """Send pre-posting alert after delay for ScheduledPost"""
        try:
            await asyncio.sleep(delay_seconds)
            
            # Refresh the scheduled post to get latest status
            db.refresh(scheduled_post)
            
            # Only send if post is still scheduled
            if scheduled_post.status == "scheduled" and scheduled_post.is_active:
                strategy_name = getattr(scheduled_post.strategy_plan, 'name', 'Scheduled Post') if hasattr(scheduled_post, 'strategy_plan') and scheduled_post.strategy_plan else "Scheduled Post"
                platform = NotificationPlatform.INSTAGRAM if scheduled_post.platform == "instagram" else NotificationPlatform.FACEBOOK
                
                message = f"Your {strategy_name} strategy will be posted in 10 minutes. If you'd like to change anything before the post is made, now is the time."
                
                await self.create_notification(
                    db=db,
                    user_id=scheduled_post.user_id,
                    notification_type=NotificationType.PRE_POSTING,
                    platform=platform,
                    message=message,
                    strategy_name=strategy_name,
                    post_id=scheduled_post.id,
                    scheduled_time=scheduled_post.scheduled_datetime
                )
                
                logger.info(f"🔔 Sent pre-posting notification for Instagram post {scheduled_post.id} to user {scheduled_post.user_id}")
                
        except Exception as e:
            logger.error(f"Error sending delayed scheduled post alert: {e}")
    
    async def _send_delayed_bulk_composer_alert(self, delay_seconds: float, db: Session, bulk_post):
        """Send pre-posting alert after delay for BulkComposerContent"""
        try:
            await asyncio.sleep(delay_seconds)
            
            # Refresh the bulk post to get latest status
            db.refresh(bulk_post)
            
            # Only send if post is still scheduled
            if bulk_post.status == "scheduled":
                # Determine platform from social account
                platform = NotificationPlatform.FACEBOOK  # Default to Facebook for bulk composer
                if hasattr(bulk_post, 'social_account') and bulk_post.social_account:
                    if bulk_post.social_account.platform == 'instagram':
                        platform = NotificationPlatform.INSTAGRAM
                
                strategy_name = "Bulk Scheduled Post"
                message = f"Your {strategy_name} will be posted in 10 minutes. If you'd like to change anything before the post is made, now is the time."
                
                await self.create_notification(
                    db=db,
                    user_id=bulk_post.user_id,
                    notification_type=NotificationType.PRE_POSTING,
                    platform=platform,
                    message=message,
                    strategy_name=strategy_name,
                    post_id=bulk_post.id,
                    scheduled_time=bulk_post.scheduled_datetime
                )
                
        except Exception as e:
            logger.error(f"Error sending delayed bulk composer alert: {e}")
    
    async def send_success_notification(
        self,
        db: Session,
        post_id: int,
        platform: str,
        strategy_name: str
    ):
        """Send success notification when post is published"""
        try:
            # Try to find in ScheduledPost first
            scheduled_post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
            if scheduled_post:
                user_id = scheduled_post.user_id
            else:
                # Try to find in BulkComposerContent
                from app.models.bulk_composer_content import BulkComposerContent
                bulk_post = db.query(BulkComposerContent).filter(BulkComposerContent.id == post_id).first()
                if bulk_post:
                    user_id = bulk_post.user_id
                else:
                    logger.error(f"Post {post_id} not found in ScheduledPost or BulkComposerContent")
                    return
            
            # Check if we should send success notification
            user_prefs = await self.get_user_preferences(db, user_id)
            if not user_prefs.success_enabled:
                logger.info(f"Success notifications disabled for user {user_id}")
                return
            
            platform_enum = NotificationPlatform.INSTAGRAM if platform == "instagram" else NotificationPlatform.FACEBOOK
            current_time = datetime.utcnow()
            
            message = f"Your {strategy_name} post has been successfully published at {current_time.strftime('%I:%M %p')}."
            
            await self.create_notification(
                db=db,
                user_id=user_id,
                notification_type=NotificationType.SUCCESS,
                platform=platform_enum,
                message=message,
                strategy_name=strategy_name,
                post_id=post_id
            )
            
        except Exception as e:
            logger.error(f"Error sending success notification for post {post_id}: {e}")
    
    async def send_failure_notification(
        self,
        db: Session,
        post_id: int,
        platform: str,
        strategy_name: str,
        error: str
    ):
        """Send failure notification when post fails to publish"""
        try:
            # Try to find in ScheduledPost first
            scheduled_post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
            if scheduled_post:
                user_id = scheduled_post.user_id
            else:
                # Try to find in BulkComposerContent
                from app.models.bulk_composer_content import BulkComposerContent
                bulk_post = db.query(BulkComposerContent).filter(BulkComposerContent.id == post_id).first()
                if bulk_post:
                    user_id = bulk_post.user_id
                else:
                    logger.error(f"Post {post_id} not found in ScheduledPost or BulkComposerContent")
                    return
            
            # Failure notifications are always sent (cannot be disabled)
            platform_enum = NotificationPlatform.INSTAGRAM if platform == "instagram" else NotificationPlatform.FACEBOOK
            
            message = f"Your {strategy_name} post failed to publish. Reason: {error}. Please check your settings and try again."
            
            await self.create_notification(
                db=db,
                user_id=user_id,
                notification_type=NotificationType.FAILURE,
                platform=platform_enum,
                message=message,
                strategy_name=strategy_name,
                post_id=post_id,
                error_message=error
            )
            
        except Exception as e:
            logger.error(f"Error sending failure notification for post {post_id}: {e}")
    
    async def get_user_notifications(
        self,
        db: Session,
        user_id: int,
        limit: int = 50,
        offset: int = 0
    ) -> List[Notification]:
        """Get notifications for a user"""
        try:
            notifications = db.query(Notification).filter(
                Notification.user_id == user_id
            ).order_by(
                desc(Notification.created_at)
            ).offset(offset).limit(limit).all()
            
            return notifications
            
        except Exception as e:
            logger.error(f"Error getting notifications for user {user_id}: {e}")
            return []
    
    async def mark_notification_read(self, db: Session, notification_id: str, user_id: int) -> bool:
        """Mark a notification as read"""
        try:
            notification = db.query(Notification).filter(
                and_(
                    Notification.id == notification_id,
                    Notification.user_id == user_id
                )
            ).first()
            
            if notification:
                notification.is_read = True
                db.commit()
                logger.info(f"Marked notification {notification_id} as read")
                return True
            else:
                logger.warning(f"Notification {notification_id} not found for user {user_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error marking notification {notification_id} as read: {e}")
            db.rollback()
            return False
    
    async def mark_all_notifications_read(self, db: Session, user_id: int) -> bool:
        """Mark all notifications as read for a user"""
        try:
            db.query(Notification).filter(
                and_(
                    Notification.user_id == user_id,
                    Notification.is_read == False
                )
            ).update({"is_read": True})
            
            db.commit()
            logger.info(f"Marked all notifications as read for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error marking all notifications as read for user {user_id}: {e}")
            db.rollback()
            return False
    
    async def get_user_preferences(self, db: Session, user_id: int) -> NotificationPreferences:
        """Get or create user notification preferences"""
        try:
            preferences = db.query(NotificationPreferences).filter(
                NotificationPreferences.user_id == user_id
            ).first()
            
            if not preferences:
                # Create default preferences
                preferences = NotificationPreferences(user_id=user_id)
                db.add(preferences)
                db.commit()
                db.refresh(preferences)
                logger.info(f"Created default notification preferences for user {user_id}")
            
            return preferences
            
        except Exception as e:
            logger.error(f"Error getting preferences for user {user_id}: {e}")
            db.rollback()
            # Return default preferences
            return NotificationPreferences(
                user_id=user_id,
                browser_notifications_enabled=True,
                pre_posting_enabled=True,
                success_enabled=True,
                failure_enabled=True
            )
    
    async def update_user_preferences(
        self,
        db: Session,
        user_id: int,
        preferences_data: Dict[str, bool]
    ) -> NotificationPreferences:
        """Update user notification preferences"""
        try:
            preferences = await self.get_user_preferences(db, user_id)
            
            # Update preferences
            for key, value in preferences_data.items():
                if hasattr(preferences, key):
                    setattr(preferences, key, value)
            
            # Failure notifications cannot be disabled
            preferences.failure_enabled = True
            
            db.commit()
            db.refresh(preferences)
            
            logger.info(f"Updated notification preferences for user {user_id}")
            return preferences
            
        except Exception as e:
            logger.error(f"Error updating preferences for user {user_id}: {e}")
            db.rollback()
            raise
    
    async def cleanup_old_notifications(self, db: Session, days_old: int = 30):
        """Clean up notifications older than specified days"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_old)
            
            deleted_count = db.query(Notification).filter(
                Notification.created_at < cutoff_date
            ).delete()
            
            db.commit()
            logger.info(f"Cleaned up {deleted_count} old notifications")
            
        except Exception as e:
            logger.error(f"Error cleaning up old notifications: {e}")
            db.rollback()

# Global notification service instance
notification_service = NotificationService()