import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [permissions, setPermissions] = useState({
    granted: false,
    prePosting: true,
    success: true,
    failure: true
  });
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [websocket, setWebsocket] = useState(null);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedPermissions = localStorage.getItem('notificationPermissions');
    if (savedPermissions) {
      setPermissions(JSON.parse(savedPermissions));
    }

    const savedNotifications = localStorage.getItem('notifications');
    if (savedNotifications) {
      const parsed = JSON.parse(savedNotifications);
      setNotifications(parsed);
      setUnreadCount(parsed.filter(n => !n.isRead).length);
    }
  }, []);

  // Save permissions to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('notificationPermissions', JSON.stringify(permissions));
  }, [permissions]);

  // Save notifications to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Request browser notification permissions
  const requestPermissions = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      
      setPermissions(prev => ({ ...prev, granted }));
      
      if (granted) {
        // Test notification
        new Notification('Notifications Enabled!', {
          body: 'You will now receive alerts about your scheduled posts.',
          icon: '/favicon.ico'
        });
      }
      
      return granted;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }, []);

  // Add new notification
  const addNotification = useCallback((notification) => {
    const newNotification = {
      id: Date.now().toString(),
      timestamp: new Date(),
      isRead: false,
      ...notification
    };

    setNotifications(prev => {
      const updated = [newNotification, ...prev];
      // Keep only last 100 notifications
      return updated.slice(0, 100);
    });

    setUnreadCount(prev => prev + 1);

    // Show browser notification if permissions granted and enabled
    if (permissions.granted && shouldShowBrowserNotification(notification.type)) {
      showBrowserNotification(newNotification);
    }

    return newNotification;
  }, [permissions]);

  // Check if browser notification should be shown based on user preferences
  const shouldShowBrowserNotification = useCallback((type) => {
    switch (type) {
      case 'pre_posting':
        return permissions.prePosting;
      case 'success':
        return permissions.success;
      case 'failure':
        return permissions.failure;
      default:
        return true;
    }
  }, [permissions]);

  // Show browser notification
  const showBrowserNotification = useCallback((notification) => {
    if (!permissions.granted) return;

    const options = {
      body: notification.message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: notification.id,
      requireInteraction: notification.type === 'failure',
      actions: notification.type === 'pre_posting' ? [
        { action: 'edit', title: 'Edit Post' },
        { action: 'dismiss', title: 'Dismiss' }
      ] : []
    };

    const browserNotification = new Notification(
      `${notification.platform.toUpperCase()} - ${notification.strategyName}`,
      options
    );

    browserNotification.onclick = () => {
      handleNotificationClick(notification);
      browserNotification.close();
    };

    // Auto-close after 10 seconds for non-failure notifications
    if (notification.type !== 'failure') {
      setTimeout(() => browserNotification.close(), 10000);
    }
  }, [permissions]);

  // Handle notification click
  const handleNotificationClick = useCallback((notification) => {
    // Mark as read
    markAsRead(notification.id);
    
    // Navigate based on notification type
    switch (notification.type) {
      case 'pre_posting':
      case 'failure':
        // Navigate to bulk composer
        if (notification.platform === 'facebook') {
          window.location.href = '/facebook';
        } else if (notification.platform === 'instagram') {
          window.location.href = '/instagram';
        }
        break;
      case 'success':
        // Navigate to social media dashboard or specific post
        window.location.href = `/${notification.platform}`;
        break;
      default:
        break;
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((notificationId) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === notificationId 
          ? { ...notification, isRead: true }
          : notification
      )
    );
    
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(notification => ({ ...notification, isRead: true }))
    );
    setUnreadCount(0);
  }, []);

  // Update notification preferences
  const updatePreferences = useCallback(async (newPreferences) => {
    setPermissions(prev => ({ ...prev, ...newPreferences }));
    
    // Save to backend if user is authenticated
    try {
      await apiClient.updateNotificationPreferences(newPreferences);
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    }
  }, []);

  // Setup WebSocket connection for real-time notifications
  const setupWebSocket = useCallback(() => {
    if (websocket) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:8000'}/ws/notifications?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected for notifications');
      setWebsocket(ws);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          addNotification(data.notification);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, attempting to reconnect...');
      setWebsocket(null);
      // Reconnect after 5 seconds
      setTimeout(setupWebSocket, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [websocket, addNotification]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (websocket) {
        websocket.close();
      }
    };
  }, [websocket]);

  // Load notifications from backend
  const loadNotifications = useCallback(async () => {
    try {
      const response = await apiClient.getNotifications();
      if (response.success) {
        setNotifications(response.data);
        setUnreadCount(response.data.filter(n => !n.isRead).length);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }, []);

  // Initialize notifications and WebSocket when user is authenticated
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      loadNotifications();
      setupWebSocket();
    }
  }, [loadNotifications, setupWebSocket]);

  // Check if user should see permission modal
  const checkPermissionModal = useCallback(() => {
    const hasSeenModal = localStorage.getItem('hasSeenNotificationModal');
    const token = localStorage.getItem('authToken');
    
    if (token && !hasSeenModal && !permissions.granted) {
      setShowPermissionModal(true);
    }
  }, [permissions.granted]);

  // Listen for login events
  useEffect(() => {
    const handleUserLogin = () => {
      setTimeout(() => {
        checkPermissionModal();
      }, 500);
    };

    window.addEventListener('userLoggedIn', handleUserLogin);
    return () => window.removeEventListener('userLoggedIn', handleUserLogin);
  }, [checkPermissionModal]);

  // Handle permission modal response
  const handlePermissionAllow = useCallback(async () => {
    const granted = await requestPermissions();
    setShowPermissionModal(false);
    localStorage.setItem('hasSeenNotificationModal', 'true');
    
    if (granted) {
      // Load user preferences from backend
      try {
        const response = await apiClient.getNotificationPreferences();
        if (response.success) {
          setPermissions(prev => ({ ...prev, ...response.data }));
        }
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
      }
    }
  }, [requestPermissions]);

  const handlePermissionBlock = useCallback(() => {
    setShowPermissionModal(false);
    localStorage.setItem('hasSeenNotificationModal', 'true');
    setPermissions(prev => ({ ...prev, granted: false }));
  }, []);

  const value = {
    notifications,
    unreadCount,
    permissions,
    isNotificationCenterOpen,
    showPermissionModal,
    setIsNotificationCenterOpen,
    addNotification,
    markAsRead,
    markAllAsRead,
    updatePreferences,
    requestPermissions,
    handleNotificationClick,
    checkPermissionModal,
    handlePermissionAllow,
    handlePermissionBlock,
    loadNotifications
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};