#!/usr/bin/env python3
"""
Debug script for the notification system
Run this to test and troubleshoot notification issues
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta
import pytz

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from backend.app.database import get_db
from backend.app.services.notification_service import notification_service
from backend.app.models.notification import NotificationType, NotificationPlatform
from backend.app.models.scheduled_post import ScheduledPost
from backend.app.models.user import User

async def debug_notifications():
    """Debug the notification system"""
    print("🔍 Debugging Notification System...")
    
    # Get database session
    db = next(get_db())
    
    try:
        # 1. Check if users exist
        print("\n1️⃣ Checking users...")
        users = db.query(User).all()
        print(f"   Found {len(users)} users")
        for user in users[:3]:  # Show first 3 users
            print(f"   - User {user.id}: {user.email}")
        
        if not users:
            print("   ❌ No users found! Please create a user first.")
            return
        
        test_user = users[0]
        
        # 2. Check scheduled posts
        print("\n2️⃣ Checking scheduled Instagram posts...")
        instagram_posts = db.query(ScheduledPost).filter(
            ScheduledPost.platform == "instagram",
            ScheduledPost.status == "scheduled"
        ).all()
        
        print(f"   Found {len(instagram_posts)} scheduled Instagram posts")
        
        current_time = datetime.now(pytz.timezone("Asia/Kolkata"))
        print(f"   Current time (IST): {current_time}")
        
        for post in instagram_posts[:5]:  # Show first 5 posts
            print(f"   - Post {post.id}: {post.scheduled_datetime} (User: {post.user_id})")
            
            # Check if this post should have a notification soon
            time_until_post = post.scheduled_datetime - current_time
            minutes_until = time_until_post.total_seconds() / 60
            
            if 0 < minutes_until <= 15:  # Posts within 15 minutes
                print(f"     ⚠️  This post is {minutes_until:.1f} minutes away!")
                print(f"     📅 Scheduled: {post.scheduled_datetime}")
                print(f"     ⏰ Alert should be at: {post.scheduled_datetime - timedelta(minutes=10)}")
        
        # 3. Check notification preferences
        print("\n3️⃣ Checking notification preferences...")
        prefs = await notification_service.get_user_preferences(db, test_user.id)
        print(f"   User {test_user.id} preferences:")
        print(f"   - Browser notifications: {prefs.browser_notifications_enabled}")
        print(f"   - Pre-posting alerts: {prefs.pre_posting_enabled}")
        print(f"   - Success notifications: {prefs.success_enabled}")
        print(f"   - Failure notifications: {prefs.failure_enabled}")
        
        # 4. Check existing notifications
        print("\n4️⃣ Checking existing notifications...")
        notifications = await notification_service.get_user_notifications(db, test_user.id, limit=10)
        print(f"   Found {len(notifications)} notifications for user {test_user.id}")
        
        for notif in notifications[:3]:  # Show first 3
            print(f"   - {notif.type.value}: {notif.message[:50]}... (Read: {notif.is_read})")
        
        # 5. Test creating a notification
        print("\n5️⃣ Testing notification creation...")
        test_notification = await notification_service.create_notification(
            db=db,
            user_id=test_user.id,
            notification_type=NotificationType.PRE_POSTING,
            platform=NotificationPlatform.INSTAGRAM,
            message="🧪 DEBUG: Test pre-posting notification created at " + current_time.strftime("%H:%M:%S"),
            strategy_name="Debug Test"
        )
        print(f"   ✅ Created test notification: {test_notification.id}")
        
        # 6. Test scheduling a future notification
        print("\n6️⃣ Testing future notification scheduling...")
        
        # Create a test scheduled post for 2 minutes from now
        future_time = current_time + timedelta(minutes=2)
        
        from backend.app.models.scheduled_post import ScheduledPost, PostType, FrequencyType
        test_post = ScheduledPost(
            user_id=test_user.id,
            social_account_id=1,  # Assuming social account exists
            prompt="Debug test post",
            scheduled_datetime=future_time,
            post_type=PostType.PHOTO,
            platform="instagram",
            status="scheduled",
            is_active=True,
            frequency=FrequencyType.DAILY,
            post_time=future_time.strftime("%H:%M")
        )
        
        db.add(test_post)
        db.commit()
        db.refresh(test_post)
        
        print(f"   📝 Created test post {test_post.id} scheduled for {future_time}")
        
        # Schedule notification for this test post
        await notification_service.schedule_pre_posting_alert(db, test_post.id)
        print(f"   ⏰ Scheduled pre-posting alert for test post")
        print(f"   📅 Post time: {future_time}")
        print(f"   🔔 Alert should fire at: {future_time - timedelta(minutes=10)}")
        
        # 7. Summary
        print("\n📊 SUMMARY:")
        print(f"   - Users: {len(users)}")
        print(f"   - Scheduled Instagram posts: {len(instagram_posts)}")
        print(f"   - Existing notifications: {len(notifications)}")
        print(f"   - Test notification created: ✅")
        print(f"   - Future alert scheduled: ✅")
        
        print("\n🔧 TROUBLESHOOTING TIPS:")
        print("   1. Check backend logs for notification scheduling messages")
        print("   2. Verify WebSocket connection is working in browser dev tools")
        print("   3. Check browser notification permissions")
        print("   4. Ensure timezone handling is correct (IST vs UTC)")
        print("   5. Test with the 'Test Notification' button on dashboard")
        
        print("\n✅ Debug completed successfully!")
        
    except Exception as e:
        print(f"❌ Debug failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(debug_notifications())