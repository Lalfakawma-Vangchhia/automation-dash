import React from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationPermissionModal.css';

const NotificationPermissionModal = () => {
  const { showPermissionModal, handlePermissionAllow, handlePermissionBlock } = useNotifications();

  if (!showPermissionModal) return null;

  return (
    <div className="notification-permission-overlay">
      <div className="notification-permission-modal">
        <div className="notification-permission-header">
          <div className="notification-permission-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <h2>Enable Notifications</h2>
        </div>
        
        <div className="notification-permission-content">
          <p>Stay updated with your social media posts! We'll notify you about:</p>
          
          <ul className="notification-benefits">
            <li>
              <span className="benefit-icon">⏰</span>
              <strong>Pre-posting alerts</strong> - 10 minutes before your post goes live
            </li>
            <li>
              <span className="benefit-icon">✅</span>
              <strong>Success notifications</strong> - When your posts are published successfully
            </li>
            <li>
              <span className="benefit-icon">❌</span>
              <strong>Failure alerts</strong> - If something goes wrong with your posts
            </li>
          </ul>
          
          <p className="notification-note">
            You can change these preferences anytime in your notification settings.
          </p>
        </div>
        
        <div className="notification-permission-actions">
          <button 
            className="permission-btn permission-btn-block"
            onClick={handlePermissionBlock}
          >
            Block
          </button>
          <button 
            className="permission-btn permission-btn-allow"
            onClick={handlePermissionAllow}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPermissionModal;