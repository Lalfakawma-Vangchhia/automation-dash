import React, { useState, useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationCenter.css';

const NotificationCenter = () => {
  const { 
    notifications, 
    isNotificationCenterOpen, 
    setIsNotificationCenterOpen,
    markAsRead,
    markAllAsRead,
    handleNotificationClick,
    permissions,
    updatePreferences
  } = useNotifications();

  const [showSettings, setShowSettings] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const notificationsPerPage = 10;

  // Close notification center when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isNotificationCenterOpen && !event.target.closest('.notification-center')) {
        setIsNotificationCenterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotificationCenterOpen, setIsNotificationCenterOpen]);

  // Mark all as read when opening notification center
  useEffect(() => {
    if (isNotificationCenterOpen && notifications.some(n => !n.isRead)) {
      setTimeout(() => markAllAsRead(), 500);
    }
  }, [isNotificationCenterOpen, notifications, markAllAsRead]);

  if (!isNotificationCenterOpen) return null;

  const totalPages = Math.ceil(notifications.length / notificationsPerPage);
  const startIndex = (currentPage - 1) * notificationsPerPage;
  const paginatedNotifications = notifications.slice(startIndex, startIndex + notificationsPerPage);

  const getNotificationIcon = (type, platform) => {
    const platformIcon = platform === 'facebook' ? '📘' : '📷';
    
    switch (type) {
      case 'pre_posting':
        return '⏰';
      case 'success':
        return '✅';
      case 'failure':
        return '❌';
      default:
        return platformIcon;
    }
  };

  const getNotificationTypeLabel = (type) => {
    switch (type) {
      case 'pre_posting':
        return 'Pre-posting Alert';
      case 'success':
        return 'Success';
      case 'failure':
        return 'Failed';
      default:
        return 'Notification';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const handleSettingsChange = (setting, value) => {
    updatePreferences({ [setting]: value });
  };

  return (
    <div className="notification-center">
      <div className="notification-center-header">
        <div className="notification-center-title">
          <h3>Notifications</h3>
          <span className="notification-count">
            {notifications.length} total
          </span>
        </div>
        
        <div className="notification-center-actions">
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Notification Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
            </svg>
          </button>
          
          <button
            className="close-btn"
            onClick={() => setIsNotificationCenterOpen(false)}
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="notification-settings">
          <h4>Notification Preferences</h4>
          
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={permissions.prePosting}
                onChange={(e) => handleSettingsChange('prePosting', e.target.checked)}
              />
              <span>Pre-posting alerts (10 minutes before)</span>
            </label>
          </div>
          
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={permissions.success}
                onChange={(e) => handleSettingsChange('success', e.target.checked)}
              />
              <span>Success notifications</span>
            </label>
          </div>
          
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={permissions.failure}
                onChange={(e) => handleSettingsChange('failure', e.target.checked)}
              />
              <span>Failure alerts (always enabled)</span>
            </label>
            <small>Failure notifications cannot be disabled for your account security.</small>
          </div>
        </div>
      )}

      <div className="notification-list">
        {notifications.length === 0 ? (
          <div className="empty-notifications">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <h4>No notifications yet</h4>
            <p>You'll see notifications about your scheduled posts here.</p>
          </div>
        ) : (
          <>
            {paginatedNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-item ${notification.type} ${!notification.isRead ? 'unread' : ''}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="notification-icon">
                  {getNotificationIcon(notification.type, notification.platform)}
                </div>
                
                <div className="notification-content">
                  <div className="notification-header">
                    <span className="notification-platform">
                      {notification.platform.toUpperCase()}
                    </span>
                    <span className="notification-type">
                      {getNotificationTypeLabel(notification.type)}
                    </span>
                    <span className="notification-time">
                      {formatTimestamp(notification.timestamp)}
                    </span>
                  </div>
                  
                  <div className="notification-strategy">
                    {notification.strategyName}
                  </div>
                  
                  <div className="notification-message">
                    {notification.message}
                  </div>
                  
                  {notification.error && (
                    <div className="notification-error">
                      Error: {notification.error}
                    </div>
                  )}
                </div>
                
                <div className="notification-arrow">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9,18 15,12 9,6" />
                  </svg>
                </div>
              </div>
            ))}
            
            {totalPages > 1 && (
              <div className="notification-pagination">
                <button
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                >
                  Previous
                </button>
                
                <span className="pagination-info">
                  Page {currentPage} of {totalPages}
                </span>
                
                <button
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;