#!/usr/bin/env python3
"""
Test script for the notification system
Run this to test notifications without scheduling actual posts
"""

import asyncio
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from backend.app.database import get_db
from backend.app.services.notification_service import notification_service
from backend.app.models.notification import NotificationType, NotificationPlatform

async def test_notifications():
    """Test the notification system"""
    print("🧪 Testing Notification System...")
    
    # Get database session
    db = next(get_db())
    
    try:
        # Test creating a pre-posting notification
        print("📝 Creating pre-posting notification...")
        await notification_service.create_notification(
            db=db,
            user_id=1,  # Assuming user ID 1 exists
            notification_type=NotificationType.PRE_POSTING,
            platform=NotificationPlatform.FACEBOOK,
            message="Your Daily Motivation strategy will be posted in 10 minutes. If you'd like to change anything before the post is made, now is the time.",
            strategy_name="Daily Motivation"
        )
        
        # Test creating a success notification
        print("✅ Creating success notification...")
        await notification_service.create_notification(
            db=db,
            user_id=1,
            notification_type=NotificationType.SUCCESS,
            platform=NotificationPlatform.INSTAGRAM,
            message="Your Product Showcase post has been successfully published at 2:30 PM.",
            strategy_name="Product Showcase"
        )
        
        # Test creating a failure notification
        print("❌ Creating failure notification...")
        await notification_service.create_notification(
            db=db,
            user_id=1,
            notification_type=NotificationType.FAILURE,
            platform=NotificationPlatform.FACEBOOK,
            message="Your Behind the Scenes post failed to publish. Reason: Invalid access token. Please check your settings and try again.",
            strategy_name="Behind the Scenes",
            error_message="Invalid access token"
        )
        
        # Test getting user notifications
        print("📋 Getting user notifications...")
        notifications = await notification_service.get_user_notifications(db, user_id=1, limit=10)
        
        print(f"📊 Found {len(notifications)} notifications:")
        for notif in notifications:
            print(f"  - {notif.type.value}: {notif.message[:50]}...")
        
        print("✅ Notification system test completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_notifications())