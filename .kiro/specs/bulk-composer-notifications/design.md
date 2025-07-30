# Design Document

## Overview

The notification system for the bulk composer feature provides comprehensive real-time alerts for scheduled social media posts across Facebook and Instagram platforms. The system consists of browser notifications, a notification center UI component, permission management, and backend integration with the existing scheduler service to trigger notifications at appropriate times.

## Architecture

### Frontend Architecture
```
App.js
├── NotificationProvider (Context)
├── Layout
│   ├── NotificationBell (Header Component)
│   └── NotificationCenter (Modal/Panel)
├── BulkComposer (Facebook)
└── IgBulkComposer (Instagram)
```

### Backend Architecture
```
Scheduler Service
├── NotificationService
│   ├── Pre-posting Alerts (10 min before)
│   ├── Success Notifications
│   └── Failure Notifications
├── WebSocket/SSE Connection
└── Notification Storage (Database)
```

## Components and Interfaces

### 1. NotificationContext (Frontend)
**Purpose:** Global state management for notifications across the application

**State:**
```javascript
{
  notifications: [],
  unreadCount: 0,
  permissions: {
    granted: boolean,
    prePosting: boolean,
    success: boolean,
    failure: boolean
  },
  isNotificationCenterOpen: boolean
}
```

**Methods:**
- `requestPermissions()` - Request browser notification permissions
- `addNotification(notification)` - Add new notification to state
- `markAsRead(notificationId)` - Mark notification as read
- `markAllAsRead()` - Mark all notifications as read
- `updatePreferences(preferences)` - Update notification preferences

### 2. NotificationBell Component
**Purpose:** Header component showing notification icon with unread count

**Props:**
```javascript
{
  unreadCount: number,
  onClick: () => void
}
```

**Features:**
- Bell icon with red badge for unread count
- Click handler to open notification center
- Animated bell shake for new notifications

### 3. NotificationCenter Component
**Purpose:** Modal/panel displaying all notifications with management options

**Props:**
```javascript
{
  isOpen: boolean,
  onClose: () => void,
  notifications: Notification[],
  onNotificationClick: (notification) => void
}
```

**Features:**
- List of notifications with timestamps
- Platform-specific icons (Facebook/Instagram)
- Notification type indicators (pre-posting, success, failure)
- Settings panel for notification preferences
- Pagination for large notification lists

### 4. NotificationPermissionModal Component
**Purpose:** Modal for requesting notification permissions on login

**Props:**
```javascript
{
  isOpen: boolean,
  onAllow: () => void,
  onBlock: () => void
}
```

**Features:**
- Clear explanation of notification benefits
- Allow/Block buttons
- Remember user choice in localStorage

### 5. Backend NotificationService
**Purpose:** Service to handle notification logic and delivery

**Methods:**
```python
class NotificationService:
    async def schedule_pre_posting_alert(post_id, scheduled_time)
    async def send_success_notification(post_id, platform, strategy_name)
    async def send_failure_notification(post_id, platform, strategy_name, error)
    async def get_user_notifications(user_id, limit, offset)
    async def mark_notification_read(notification_id)
```

### 6. WebSocket/SSE Integration
**Purpose:** Real-time communication between backend and frontend

**Events:**
- `notification:pre_posting` - 10 minutes before post
- `notification:success` - Post published successfully
- `notification:failure` - Post failed to publish
- `notification:settings_updated` - User preferences changed

## Data Models

### Notification Model (Frontend)
```javascript
{
  id: string,
  type: 'pre_posting' | 'success' | 'failure',
  platform: 'facebook' | 'instagram',
  strategyName: string,
  message: string,
  timestamp: Date,
  isRead: boolean,
  postId: string,
  scheduledTime?: Date,
  error?: string
}
```

### Database Schema (Backend)
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    post_id UUID REFERENCES scheduled_posts(id),
    type VARCHAR(20) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    strategy_name VARCHAR(255),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    scheduled_time TIMESTAMP,
    error_message TEXT
);

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) UNIQUE,
    browser_notifications_enabled BOOLEAN DEFAULT TRUE,
    pre_posting_enabled BOOLEAN DEFAULT TRUE,
    success_enabled BOOLEAN DEFAULT TRUE,
    failure_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Error Handling

### Browser Notification Failures
- **Permission Denied:** Store notification in center only, show user how to enable manually
- **Browser Not Supported:** Graceful fallback to notification center only
- **Network Issues:** Queue notifications and retry when connection restored

### Backend Failures
- **Database Errors:** Log error, continue with in-memory notifications
- **WebSocket Disconnection:** Implement reconnection logic with exponential backoff
- **Scheduler Service Down:** Store notifications for delivery when service restarts

### User Experience Errors
- **Notification Center Load Failure:** Show error message with retry button
- **Permission Request Failure:** Provide clear instructions for manual enablement
- **Settings Save Failure:** Show error toast and revert to previous settings

## Testing Strategy

### Unit Tests
- **NotificationContext:** Test state management and methods
- **NotificationBell:** Test rendering and click handlers
- **NotificationCenter:** Test notification display and interactions
- **NotificationService:** Test notification creation and delivery logic

### Integration Tests
- **Permission Flow:** Test complete permission request and storage
- **Notification Delivery:** Test end-to-end notification from scheduler to UI
- **WebSocket Communication:** Test real-time notification delivery
- **Database Operations:** Test notification storage and retrieval

### End-to-End Tests
- **Complete User Journey:** Login → Permission → Schedule Post → Receive Notifications
- **Cross-Platform Testing:** Test notifications for both Facebook and Instagram
- **Error Scenarios:** Test behavior when permissions denied or network fails
- **Performance Testing:** Test with large numbers of notifications

## Implementation Flow

### 1. Permission Request Flow
```
User Login → Check Stored Preferences → Show Permission Modal (if needed) → 
Request Browser Permissions → Store User Choice → Initialize Notification Context
```

### 2. Notification Delivery Flow
```
Scheduler Service → Check Notification Time → Create Notification Record → 
Send via WebSocket → Frontend Receives → Show Browser Notification → 
Store in Notification Center → Update Unread Count
```

### 3. User Interaction Flow
```
User Clicks Bell → Open Notification Center → Display Notifications → 
User Clicks Notification → Navigate to Relevant Page → Mark as Read → 
Update Unread Count
```

## Security Considerations

### Data Privacy
- Store minimal user data in notifications
- Encrypt sensitive notification content
- Implement proper user data deletion on account removal

### Permission Management
- Respect user's notification preferences
- Provide easy opt-out mechanisms
- Clear data retention policies

### API Security
- Authenticate all notification API requests
- Rate limit notification endpoints
- Validate notification data before storage

## Performance Optimizations

### Frontend
- Lazy load notification center component
- Implement virtual scrolling for large notification lists
- Cache notification preferences in localStorage
- Debounce notification updates to prevent UI thrashing

### Backend
- Index notification tables for efficient queries
- Implement notification batching for bulk operations
- Use connection pooling for WebSocket connections
- Cache user preferences to reduce database queries

### Real-time Communication
- Implement heartbeat mechanism for WebSocket health
- Use compression for notification payloads
- Implement client-side reconnection with exponential backoff
- Queue notifications during disconnection periods