import asyncio
import logging
from datetime import datetime, timedelta
from typing import List
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.scheduled_post import ScheduledPost, FrequencyType
from app.models.social_account import SocialAccount
from app.models.post import Post, PostStatus, PostType
from app.services.groq_service import groq_service
from app.services.facebook_service import facebook_service
from app.services.auto_reply_service import auto_reply_service
from app.services.instagram_service import instagram_service
from app.services.cloudinary_service import cloudinary_service
import pytz
from pytz import timezone, UTC
import base64
import io
from app.api.notification_ws import active_connections
import json

logger = logging.getLogger(__name__)

# Track which posts have already been notified to prevent duplicates
_notified_posts = set()

class SchedulerService:
    def __init__(self):
        self.running = False
        self.check_interval = 30  # Check every 30 seconds for better notification accuracy
    
    def is_base64_image(self, data):
        return data and isinstance(data, str) and data.startswith("data:image/")

    def extract_base64(self, data):
        if "," in data:
            return data.split(",", 1)[1]
        return data

    async def notify_upcoming_scheduled_posts(self):
        """Notify users 10 minutes before their scheduled post is published via WebSocket"""
        db: Session = None
        try:
            db = next(get_db())
            
            # Use consistent timezone logic - UTC for all comparisons
            now_utc = datetime.utcnow()
            ten_min_later = now_utc + timedelta(minutes=10)
            
            logger.info(f"🔔 Checking for notifications at {now_utc.strftime('%H:%M:%S')} UTC")
            logger.info(f"🔔 Looking for posts scheduled around {ten_min_later.strftime('%H:%M:%S')} UTC")
            
            # Find posts scheduled for 10 minutes from now (±5 minute window for better coverage)
            # Convert UTC times to timezone-aware for comparison
            from pytz import UTC
            now_utc_aware = now_utc.replace(tzinfo=UTC)
            ten_min_later_aware = ten_min_later.replace(tzinfo=UTC)
            
            # Use a wider window to catch timezone-aware posts
            upcoming_posts = db.query(ScheduledPost).filter(
                ScheduledPost.status == "scheduled",
                ScheduledPost.scheduled_datetime >= ten_min_later_aware - timedelta(minutes=5),
                ScheduledPost.scheduled_datetime <= ten_min_later_aware + timedelta(minutes=5),
                ScheduledPost.is_active == True
            ).all()
            
            logger.info(f"🔔 Found {len(upcoming_posts)} posts for notification")
            
            for post in upcoming_posts:
                try:
                    # Calculate actual minutes until posting - handle timezone-aware datetime
                    if post.scheduled_datetime.tzinfo is not None:
                        # Convert timezone-aware scheduled_datetime to UTC for comparison
                        scheduled_utc = post.scheduled_datetime.astimezone(UTC)
                        time_diff = scheduled_utc - now_utc_aware
                    else:
                        # Handle naive datetime (assume UTC)
                        time_diff = post.scheduled_datetime - now_utc
                    
                    minutes_until = int(time_diff.total_seconds() / 60)
                    
                    logger.info(f"🔔 Post {post.id} scheduled for {post.scheduled_datetime}, {minutes_until} minutes from now")
                    if post.scheduled_datetime.tzinfo is not None:
                        logger.info(f"🔔 Post {post.id} - scheduled_utc: {scheduled_utc}, now_utc: {now_utc_aware}")
                    else:
                        logger.info(f"🔔 Post {post.id} - naive datetime, treating as UTC")
                    
                    # Check if we've already notified for this post to prevent duplicates
                    notification_key = f"{post.id}_{minutes_until}"
                    
                    # Notify if it's between 8-12 minutes (10-minute advance notification)
                    if 8 <= minutes_until <= 12:
                        # Only send notification once per post (when it first enters the 8-12 minute window)
                        if post.id not in _notified_posts:
                            _notified_posts.add(post.id)
                            
                            message = {
                                "type": "scheduled_post_reminder",
                                "post_id": post.id,
                                "scheduled_time": post.scheduled_datetime.isoformat() if post.scheduled_datetime else None,
                                "minutes_until": minutes_until,
                                "prompt": post.prompt[:100] + "..." if len(post.prompt) > 100 else post.prompt,
                                "post_type": post.post_type.value if hasattr(post.post_type, 'value') else str(post.post_type),
                                "message": f"Your scheduled post is set to be published in {minutes_until} minutes. If you need to make any changes, please do so now."
                            }
                            
                            user_id = post.user_id
                            logger.info(f"🔔 Sending ONE-TIME notification to user {user_id} for post {post.id} ({minutes_until} minutes until posting)")
                            
                            if user_id in active_connections:
                                sent_count = 0
                                for ws in active_connections[user_id][:]:  # Create a copy to avoid modification during iteration
                                    try:
                                        await ws.send_text(json.dumps(message))
                                        sent_count += 1
                                        logger.info(f"✅ Notification sent to user {user_id} via WebSocket")
                                    except Exception as ws_error:
                                        logger.warning(f"⚠️ Failed to send notification via WebSocket: {ws_error}")
                                        # Remove broken connection
                                        try:
                                            active_connections[user_id].remove(ws)
                                        except ValueError:
                                            pass
                                
                                if sent_count == 0:
                                    logger.warning(f"⚠️ No active WebSocket connections for user {user_id}")
                                else:
                                    logger.info(f"✅ Sent ONE-TIME notification to {sent_count} WebSocket connections for user {user_id}")
                            else:
                                logger.warning(f"⚠️ User {user_id} has no active WebSocket connections")
                        else:
                            logger.debug(f"🔔 Post {post.id} already notified, skipping duplicate notification")
                    
                    # Clean up notified posts that are no longer in the notification window or have been executed
                    elif minutes_until < 8 or post.status != "scheduled":
                        if post.id in _notified_posts:
                            _notified_posts.discard(post.id)
                            logger.debug(f"🧹 Cleaned up notification tracking for post {post.id}")
                    else:
                        logger.debug(f"🔔 Post {post.id} is {minutes_until} minutes away, not in notification window (8-12 minutes)")
                        
                except Exception as post_error:
                    logger.error(f"❌ Error processing notification for post {post.id}: {post_error}")
                    
        except Exception as e:
            logger.error(f"❌ Error in notify_upcoming_scheduled_posts: {e}")
            import traceback
            logger.error(f"❌ Traceback: {traceback.format_exc()}")
        finally:
            if db:
                try:
                    db.close()
                except Exception as close_error:
                    logger.error(f"❌ Error closing database connection: {close_error}")

    async def send_post_status_notification(self, scheduled_post: ScheduledPost, status: str, message: str):
        """Send post execution status notification to user"""
        try:
            notification_message = {
                "type": "scheduled_post_status",
                "post_id": scheduled_post.id,
                "status": status,
                "message": message,
                "prompt": scheduled_post.prompt[:100] + "..." if len(scheduled_post.prompt) > 100 else scheduled_post.prompt,
                "post_type": scheduled_post.post_type.value if hasattr(scheduled_post.post_type, 'value') else str(scheduled_post.post_type),
                "timestamp": datetime.utcnow().isoformat(),
                "instagram_post_id": scheduled_post.post_id if status == "success" else None
            }
            
            user_id = scheduled_post.user_id
            logger.info(f"📱 Sending {status} notification to user {user_id} for post {scheduled_post.id}")
            
            if user_id in active_connections:
                sent_count = 0
                for ws in active_connections[user_id][:]:
                    try:
                        await ws.send_text(json.dumps(notification_message))
                        sent_count += 1
                        logger.info(f"✅ Status notification sent to user {user_id} via WebSocket")
                    except Exception as ws_error:
                        logger.warning(f"⚠️ Failed to send status notification via WebSocket: {ws_error}")
                        try:
                            active_connections[user_id].remove(ws)
                        except ValueError:
                            pass
                
                if sent_count > 0:
                    logger.info(f"✅ Sent {status} notification to {sent_count} WebSocket connections for user {user_id}")
                else:
                    logger.warning(f"⚠️ No active WebSocket connections for user {user_id}")
            else:
                logger.warning(f"⚠️ User {user_id} has no active WebSocket connections for status notification")
                
        except Exception as e:
            logger.error(f"❌ Error sending post status notification: {e}")

    async def start(self):
        """Start the scheduler service"""
        if self.running:
            logger.info("Scheduler service already running")
            return
        
        self.running = True
        logger.info("🚀 Scheduler service started - checking every 30 seconds")
        
        while self.running:
            try:
                current_time = datetime.utcnow()
                logger.info(f"🕐 Scheduler cycle at {current_time.strftime('%Y-%m-%d %H:%M:%S')} UTC")
                
                await self.notify_upcoming_scheduled_posts()
                await self.process_scheduled_posts()
                await self.process_auto_replies()
                await asyncio.sleep(self.check_interval)
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
                await asyncio.sleep(self.check_interval)
    
    def stop(self):
        """Stop the scheduler service"""
        self.running = False
        logger.info("🛑 Scheduler service stopped")
    
    async def process_scheduled_posts(self):
        """Process all scheduled posts that are due for execution"""
        db: Session = None
        try:
            # Get database session
            db = next(get_db())
            # Find all scheduled Instagram posts that are due for execution
            now_local = datetime.now(timezone("Asia/Kolkata"))
            logger.info(f"[DEBUG] Scheduler now (Asia/Kolkata): {now_local}")
            all_posts = db.query(ScheduledPost).filter(
                ScheduledPost.is_active == True,
                ScheduledPost.status == "scheduled",
                ScheduledPost.platform == "instagram"
            ).all()
            for post in all_posts:
                logger.info(f"[DEBUG] Post {post.id} scheduled_datetime: {post.scheduled_datetime} (type: {type(post.scheduled_datetime)})")
            # Query for due posts (works with Asia/Kolkata or UTC depending on now)
            now_utc = now_local.astimezone(UTC)
            due_posts = db.query(ScheduledPost).filter(
                ScheduledPost.status.in_(['scheduled', 'ready']),
                ScheduledPost.platform == 'instagram',
                ScheduledPost.scheduled_datetime <= now_utc,
                ScheduledPost.is_active == True
            ).all()
            logger.info(f"✅ Found {len(due_posts)} posts ready to publish at {now_local}")
            # NOTE: If you migrate all scheduled_datetime to UTC, set now = datetime.utcnow() and ensure all DB times are UTC.
            if due_posts:
                logger.info(f"📅 Found {len(due_posts)} scheduled Instagram posts due for execution")
            else:
                logger.info(f"🔍 No scheduled Instagram posts due for execution at {now_local}")
            for scheduled_post in due_posts:
                try:
                    await self.execute_scheduled_instagram_post(scheduled_post, db)
                except Exception as e:
                    logger.error(f"Failed to execute scheduled Instagram post {scheduled_post.id}: {e}")
        except Exception as e:
            logger.error(f"Error processing scheduled Instagram posts: {e}")
        finally:
            if db:
                db.close()

    async def generate_and_upload_image(self, prompt: str, post_type: str = "feed") -> dict:
        """Generate AI image and upload to Cloudinary"""
        try:
            logger.info(f"🎨 Generating AI image for prompt: '{prompt[:50]}...'")
            
            # Generate image using Instagram service
            image_result = await instagram_service.generate_instagram_image_with_ai(prompt, post_type)
            
            if not image_result["success"]:
                return {"success": False, "error": f"Image generation failed: {image_result.get('error')}"}
            
            # Convert base64 to image data
            image_base64 = image_result["image_base64"]
            image_data = base64.b64decode(image_base64)
            
            # Upload to Cloudinary
            upload_result = cloudinary_service.upload_image_with_instagram_transform(image_data)
            
            if not upload_result["success"]:
                return {"success": False, "error": f"Cloudinary upload failed: {upload_result.get('error')}"}
            
            logger.info(f"✅ Successfully generated and uploaded image to Cloudinary: {upload_result['url']}")
            return {
                "success": True,
                "cloudinary_url": upload_result["url"],
                "original_prompt": prompt,
                "post_type": post_type
            }
            
        except Exception as e:
            logger.error(f"Error generating and uploading image: {e}")
            return {"success": False, "error": str(e)}

    async def generate_and_upload_video(self, prompt: str) -> dict:
        """Generate AI video and upload to Cloudinary (placeholder for future implementation)"""
        try:
            logger.info(f"🎬 Generating AI video for prompt: '{prompt[:50]}...'")
            
            # TODO: Implement video generation with AI service
            # For now, return an error indicating video generation is not yet implemented
            return {
                "success": False, 
                "error": "Video generation with AI is not yet implemented. Please provide a video URL for reel posts."
            }
            
        except Exception as e:
            logger.error(f"Error generating and uploading video: {e}")
            return {"success": False, "error": str(e)}

    async def execute_scheduled_instagram_post(self, scheduled_post: ScheduledPost, db: Session):
        """Execute a single scheduled Instagram post"""
        try:
            logger.info(f"🔄 Executing scheduled Instagram post {scheduled_post.id}: '{scheduled_post.prompt[:50]}...'")
            logger.info(f"📋 Post type: {scheduled_post.post_type.value if hasattr(scheduled_post.post_type, 'value') else scheduled_post.post_type}")
            
            # Validate presence of caption
            if not scheduled_post.prompt:
                logger.error(f"❌ Scheduled post {scheduled_post.id} missing caption. Marking as failed.")
                scheduled_post.status = "failed"
                scheduled_post.is_active = False
                scheduled_post.last_executed = datetime.utcnow()
                db.commit()
                return
            
            # Check for appropriate media based on post type
            post_type = scheduled_post.post_type.value if hasattr(scheduled_post.post_type, 'value') else scheduled_post.post_type
            has_media = False
            
            # Generate and upload images if needed
            if post_type == "photo":
                # Convert base64 image_url to Cloudinary URL if needed
                if scheduled_post.image_url and self.is_base64_image(scheduled_post.image_url):
                    logger.info(f"☁️ Converting base64 image_url to Cloudinary for post {scheduled_post.id}")
                    try:
                        base64_data = self.extract_base64(scheduled_post.image_url)
                        image_data = base64.b64decode(base64_data)
                        upload_result = cloudinary_service.upload_image_with_instagram_transform(image_data)
                        if upload_result["success"]:
                            scheduled_post.image_url = upload_result["url"]
                            db.commit()
                            logger.info(f"✅ Converted and updated image_url to Cloudinary: {scheduled_post.image_url}")
                        else:
                            logger.error(f"❌ Cloudinary upload failed: {upload_result.get('error')}")
                            scheduled_post.status = "failed"
                            scheduled_post.is_active = False
                            scheduled_post.last_executed = datetime.utcnow()
                            db.commit()
                            return
                    except Exception as e:
                        logger.error(f"❌ Error converting base64 image to Cloudinary: {e}")
                        scheduled_post.status = "failed"
                        scheduled_post.is_active = False
                        scheduled_post.last_executed = datetime.utcnow()
                        db.commit()
                        return
                if not scheduled_post.image_url:
                    logger.info(f"🎨 No image URL found for photo post, generating AI image...")
                    image_result = await self.generate_and_upload_image(scheduled_post.prompt, "feed")
                    if image_result["success"]:
                        scheduled_post.image_url = image_result["cloudinary_url"]
                        logger.info(f"✅ Updated scheduled post with Cloudinary image URL: {scheduled_post.image_url}")
                    else:
                        logger.error(f"❌ Failed to generate image: {image_result.get('error')}")
                        scheduled_post.status = "failed"
                        scheduled_post.is_active = False
                        scheduled_post.last_executed = datetime.utcnow()
                        db.commit()
                        return
                
                has_media = bool(scheduled_post.image_url)
                logger.info(f"📸 Photo post - Image URL: {scheduled_post.image_url}")
                
            elif post_type == "carousel":
                if not scheduled_post.media_urls or len(scheduled_post.media_urls) == 0:
                    logger.info(f"🎨 No media URLs found for carousel post, generating AI images...")
                    # Generate 3-5 images for carousel
                    num_images = min(5, max(3, len(scheduled_post.prompt) // 100 + 3))  # Dynamic number based on prompt length
                    carousel_urls = []
                    
                    for i in range(num_images):
                        # Create variations of the prompt for diversity
                        variation_prompt = f"{scheduled_post.prompt} - variation {i+1}"
                        image_result = await self.generate_and_upload_image(variation_prompt, "feed")
                        if image_result["success"]:
                            carousel_urls.append(image_result["cloudinary_url"])
                        else:
                            logger.error(f"❌ Failed to generate carousel image {i+1}: {image_result.get('error')}")
                    
                    if len(carousel_urls) >= 3:
                        scheduled_post.media_urls = carousel_urls
                        logger.info(f"✅ Updated scheduled post with {len(carousel_urls)} Cloudinary image URLs for carousel")
                    else:
                        logger.error(f"❌ Failed to generate enough images for carousel")
                        scheduled_post.status = "failed"
                        scheduled_post.is_active = False
                        scheduled_post.last_executed = datetime.utcnow()
                        db.commit()
                        return
                
                has_media = bool(scheduled_post.media_urls and len(scheduled_post.media_urls) > 0)
                logger.info(f"🖼️ Carousel post - Media URLs: {scheduled_post.media_urls}")
                
            elif post_type == "reel":
                if not scheduled_post.video_url:
                    logger.info(f"🎬 No video URL found for reel post, attempting to generate AI video...")
                    video_result = await self.generate_and_upload_video(scheduled_post.prompt)
                    if video_result["success"]:
                        scheduled_post.video_url = video_result["cloudinary_url"]
                        logger.info(f"✅ Updated scheduled post with Cloudinary video URL: {scheduled_post.video_url}")
                    else:
                        logger.error(f"❌ Failed to generate video: {video_result.get('error')}")
                        scheduled_post.status = "failed"
                        scheduled_post.is_active = False
                        scheduled_post.last_executed = datetime.utcnow()
                        db.commit()
                        return
                
                # Handle thumbnail for reels
                if scheduled_post.reel_thumbnail_url and self.is_base64_image(scheduled_post.reel_thumbnail_url):
                    logger.info(f"☁️ Converting base64 thumbnail to Cloudinary for reel post {scheduled_post.id}")
                    try:
                        base64_data = self.extract_base64(scheduled_post.reel_thumbnail_url)
                        thumbnail_data = base64.b64decode(base64_data)
                        upload_result = cloudinary_service.upload_thumbnail_with_instagram_transform(thumbnail_data)
                        if upload_result["success"]:
                            scheduled_post.reel_thumbnail_url = upload_result["url"]
                            db.commit()
                            logger.info(f"✅ Converted and updated thumbnail to Cloudinary: {scheduled_post.reel_thumbnail_url}")
                        else:
                            logger.warning(f"⚠️ Cloudinary thumbnail upload failed: {upload_result.get('error')}")
                            # Continue without thumbnail rather than failing the entire post
                    except Exception as e:
                        logger.warning(f"⚠️ Error converting base64 thumbnail to Cloudinary: {e}")
                        # Continue without thumbnail rather than failing the entire post
                
                has_media = bool(scheduled_post.video_url)
                logger.info(f"🎬 Reel post - Video URL: {scheduled_post.video_url}, Thumbnail URL: {scheduled_post.reel_thumbnail_url}")
            
            if not has_media:
                logger.error(f"❌ Scheduled post {scheduled_post.id} missing required media for {post_type} post. Marking as failed.")
                scheduled_post.status = "failed"
                scheduled_post.is_active = False
                scheduled_post.last_executed = datetime.utcnow()
                db.commit()
                return
            
            # Get the social account
            social_account = db.query(SocialAccount).filter(
                SocialAccount.id == scheduled_post.social_account_id
            ).first()
            if not social_account:
                logger.error(f"❌ Social account {scheduled_post.social_account_id} not found in database")
                return
            if not social_account.is_connected:
                logger.error(f"❌ Social account {scheduled_post.social_account_id} ({social_account.display_name}) is not connected")
                return
            logger.info(f"✅ Found connected Instagram account: {social_account.display_name} (ID: {social_account.id})")
            
            # Get access token and Instagram user ID
            page_access_token = social_account.platform_data.get("page_access_token")
            instagram_user_id = social_account.platform_user_id
            if not page_access_token or not instagram_user_id:
                logger.error(f"❌ Missing Instagram user ID or access token for account {social_account.id}")
                scheduled_post.status = "failed"
                db.commit()
                return
            
            # Post to Instagram based on post type
            try:
                if post_type == "photo":
                    # Single photo post
                    result = await instagram_service.create_post(
                        instagram_user_id=instagram_user_id,
                        page_access_token=page_access_token,
                        caption=scheduled_post.prompt,
                        image_url=scheduled_post.image_url
                    )
                elif post_type == "carousel":
                    # Carousel post with multiple images
                    result = await instagram_service.create_carousel_post(
                        instagram_user_id=instagram_user_id,
                        page_access_token=page_access_token,
                        caption=scheduled_post.prompt,
                        image_urls=scheduled_post.media_urls
                    )
                elif post_type == "reel":
                    # Reel post with video
                    result = await instagram_service.create_post(
                        instagram_user_id=instagram_user_id,
                        page_access_token=page_access_token,
                        caption=scheduled_post.prompt,
                        video_url=scheduled_post.video_url,
                        is_reel=True,
                        thumbnail_url=scheduled_post.reel_thumbnail_url  # Add thumbnail URL for reels
                    )
                else:
                    logger.error(f"❌ Unknown post type: {post_type}")
                    scheduled_post.status = "failed"
                    db.commit()
                    return
                
                if result and result.get("success"):
                    scheduled_post.status = "posted"
                    # Save the Instagram post/media ID
                    scheduled_post.post_id = result.get("post_id") or result.get("creation_id")
                    logger.info(f"✅ Successfully posted scheduled {post_type} to Instagram: {scheduled_post.id}, post_id: {scheduled_post.post_id}")
                    
                    # Send success notification
                    await self.send_post_status_notification(scheduled_post, "success", "Your scheduled post has been successfully published to Instagram!")
                else:
                    scheduled_post.status = "failed"
                    error_msg = result.get('error', 'Unknown error') if result else 'No response from Instagram API'
                    logger.error(f"❌ Failed to post {post_type} to Instagram: {error_msg}")
                    
                    # Send failure notification
                    await self.send_post_status_notification(scheduled_post, "failed", f"Failed to publish your scheduled post: {error_msg}")
            except Exception as ig_error:
                logger.error(f"Instagram posting error: {ig_error}")
                scheduled_post.status = "failed"
                
                # Send failure notification for exceptions
                await self.send_post_status_notification(scheduled_post, "failed", f"Failed to publish your scheduled post: {str(ig_error)}")
            
            scheduled_post.is_active = False
            scheduled_post.last_executed = datetime.utcnow()
            db.commit()
            logger.info(f"✅ Scheduled Instagram post {scheduled_post.id} executed (final status: {scheduled_post.status}).")
        except Exception as e:
            logger.error(f"Error executing scheduled Instagram post {scheduled_post.id}: {e}")
            scheduled_post.status = "failed"
            db.commit()
    
    def calculate_next_execution(self, post_time: str, frequency: FrequencyType) -> datetime:
        """Calculate the next execution time based on frequency"""
        try:
            time_parts = post_time.split(":")
            hour = int(time_parts[0])
            minute = int(time_parts[1])
        except (ValueError, IndexError):
            # Default to current time + frequency if time parsing fails
            hour = datetime.utcnow().hour
            minute = datetime.utcnow().minute
        
        now = datetime.utcnow()
        
        if frequency == FrequencyType.DAILY:
            next_exec = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            next_exec += timedelta(days=1)
        elif frequency == FrequencyType.WEEKLY:
            next_exec = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            next_exec += timedelta(weeks=1)
        elif frequency == FrequencyType.MONTHLY:
            next_exec = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            # Add approximately 30 days for monthly
            next_exec += timedelta(days=30)
        else:
            # Default to daily
            next_exec = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            next_exec += timedelta(days=1)
        
        return next_exec

    async def process_auto_replies(self):
        """Process auto-replies for all active automation rules"""
        db: Session = None
        try:
            # Get database session
            db = next(get_db())
            
            # Process Facebook auto-replies
            await auto_reply_service.process_auto_replies(db)
            
            # Process Instagram auto-replies
            from app.services.instagram_auto_reply_service import instagram_auto_reply_service
            await instagram_auto_reply_service.process_auto_replies(db)
            
        except Exception as e:
            logger.error(f"Error processing auto-replies: {e}")
        finally:
            if db:
                db.close()

# Create global scheduler instance
scheduler_service = SchedulerService() 