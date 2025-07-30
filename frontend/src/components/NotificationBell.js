import React from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationBell.css';

const NotificationBell = () => {
  const { 
    unreadCount, 
    isNotificationCenterOpen, 
    setIsNotificationCenterOpen 
  } = useNotifications();

  const handleClick = () => {
    setIsNotificationCenterOpen(!isNotificationCenterOpen);
  };

  return (
    <div className="notification-bell-container">
      <button 
        className={`notification-bell ${unreadCount > 0 ? 'has-notifications' : ''}`}
        onClick={handleClick}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          className={`bell-icon ${unreadCount > 0 ? 'shake' : ''}`}
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};

export default NotificationBell;