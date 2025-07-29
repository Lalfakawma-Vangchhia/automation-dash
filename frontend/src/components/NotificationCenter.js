import React, { useState, useEffect } from 'react';
import notificationService from '../services/notificationService';
import './NotificationCenter.css';

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Request notification permission on component mount
    notificationService.requestNotificationPermission();

    // Listen for connection status changes
    const handleConnectionChange = (data) => {
      setConnectionStatus(data.status);
    };

    // Listen for scheduled post reminders
    const handleScheduledPostReminder = (notification) => {
      addNotification({
        id: `reminder-${notification.post_id}-${Date.now()}`,
        type: 'reminder',
        title: 'Scheduled Post Reminder',
        message: `Your post "${notification.prompt}" will be published in ${notification.minutes_until} minutes`,
        timestamp: new Date(),
        data: notification
      });
    };

    // Listen for scheduled post status updates
    const handleScheduledPostStatus = (notification) => {
      const isSuccess = notification.status === 'success';
      addNotification({
        id: `status-${notification.post_id}-${Date.now()}`,
        type: isSuccess ? 'success' : 'error',
        title: isSuccess ? 'Post Published!' : 'Post Failed',
        message: notification.message,
        timestamp: new Date(),
        data: notification
      });
    };

    // Listen for test notifications
    const handleTestNotification = (notification) => {
      addNotification({
        id: `test-${Date.now()}`,
        type: 'info',
        title: 'Test Notification',
        message: notification.message,
        timestamp: new Date(),
        data: notification
      });
    };

    // Add event listeners
    notificationService.addEventListener('connection', handleConnectionChange);
    notificationService.addEventListener('scheduled_post_reminder', handleScheduledPostReminder);
    notificationService.addEventListener('scheduled_post_status', handleScheduledPostStatus);
    notificationService.addEventListener('test_notification', handleTestNotification);

    // Cleanup listeners on unmount
    return () => {
      notificationService.removeEventListener('connection', handleConnectionChange);
      notificationService.removeEventListener('scheduled_post_reminder', handleScheduledPostReminder);
      notificationService.removeEventListener('scheduled_post_status', handleScheduledPostStatus);
      notificationService.removeEventListener('test_notification', handleTestNotification);
    };
  }, []);

  const addNotification = (notification) => {
    setNotifications(prev => [notification, ...prev]);
    setIsVisible(true);

    // Auto-remove notification after 10 seconds for non-error notifications
    if (notification.type !== 'error') {
      setTimeout(() => {
        removeNotification(notification.id);
      }, 10000);
    }
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const getNotificationIcon = (type) => {
    const icons = {
      success: '✅',
      error: '❌',
      reminder: '⏰',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  };

  const getConnectionStatusIcon = () => {
    const icons = {
      connected: '🟢',
      connecting: '🟡',
      disconnected: '🔴',
      error: '❌'
    };
    return icons[connectionStatus] || '⚪';
  };

  const formatTime = (timestamp) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const testNotification = async () => {
    try {
      const apiClient = (await import('../services/apiClient')).default;
      const response = await apiClient.testNotification();
      console.log('🧪 Test notification response:', response);
      
      if (!response.success) {
        // Show local notification if WebSocket test failed
        addNotification({
          id: `test-local-${Date.now()}`,
          type: 'error',
          title: 'WebSocket Test Failed',
          message: response.message || 'Failed to send test notification via WebSocket',
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('❌ Error testing notification:', error);
      addNotification({
        id: `test-error-${Date.now()}`,
        type: 'error',
        title: 'Test Failed',
        message: `Failed to test notification: ${error.message}`,
        timestamp: new Date()
      });
    }
  };

  return (
    <div className="notification-center">
      {/* Notification Bell Icon */}
      <div 
        className={`notification-bell ${notifications.length > 0 ? 'has-notifications' : ''}`}
        onClick={() => setIsVisible(!isVisible)}
        title={`${notifications.length} notifications`}
      >
        🔔
        {notifications.length > 0 && (
          <span className="notification-count">{notifications.length}</span>
        )}
      </div>

      {/* Connection Status Indicator */}
      <div 
        className={`connection-status ${connectionStatus}`}
        title={`WebSocket: ${connectionStatus}`}
      >
        {getConnectionStatusIcon()}
      </div>

      {/* Notifications Panel */}
      {isVisible && (
        <div className="notifications-panel">
          <div className="notifications-header">
            <h3>Notifications</h3>
            <div className="notifications-actions">
              {notifications.length > 0 && (
                <button 
                  className="clear-all-btn"
                  onClick={clearAllNotifications}
                  title="Clear all notifications"
                >
                  Clear All
                </button>
              )}
              <button 
                className="close-btn"
                onClick={() => setIsVisible(false)}
                title="Close notifications"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="notifications-list">
            {notifications.length === 0 ? (
              <div className="no-notifications">
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map(notification => (
                <div 
                  key={notification.id}
                  className={`notification-item ${notification.type}`}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">
                      {notification.title}
                    </div>
                    <div className="notification-message">
                      {notification.message}
                    </div>
                    <div className="notification-time">
                      {formatTime(notification.timestamp)}
                    </div>
                  </div>
                  <button 
                    className="notification-close"
                    onClick={() => removeNotification(notification.id)}
                    title="Dismiss notification"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Connection Status Footer */}
          <div className="notifications-footer">
            <div className={`connection-info ${connectionStatus}`}>
              {getConnectionStatusIcon()} WebSocket: {connectionStatus}
            </div>
            <button 
              className="test-notification-btn"
              onClick={testNotification}
              disabled={connectionStatus !== 'connected'}
              title={connectionStatus === 'connected' ? 'Test WebSocket notification' : 'WebSocket not connected'}
            >
              🧪 Test
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;