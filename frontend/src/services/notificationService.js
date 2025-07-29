// WebSocket Notification Service for Real-time Updates
class NotificationService {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.listeners = new Map();
    this.isConnecting = false;
    this.shouldReconnect = true;
  }

  // Connect to WebSocket with authentication
  connect(token) {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      console.log('🔌 WebSocket already connected or connecting');
      return;
    }

    if (!token) {
      console.error('❌ No authentication token provided for WebSocket connection');
      return;
    }

    // Store token for reconnection attempts
    this.token = token;
    this.shouldReconnect = true;
    this.isConnecting = true;
    
    try {
      // Determine WebSocket protocol based on current page protocol
      const isHttps = window.location.protocol === 'https:';
      const wsProtocol = isHttps ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//localhost:8000/ws/notifications?token=${encodeURIComponent(token)}`;
      
      console.log('🔌 Connecting to WebSocket:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        
        // Notify listeners about connection
        this.notifyListeners('connection', { status: 'connected' });
      };
      
      this.ws.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data);
          console.log('📨 Received notification:', notification);
          
          // Handle different notification types
          this.handleNotification(notification);
          
        } catch (error) {
          console.error('❌ Error parsing notification:', error);
        }
      };
      
      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket connection closed:', event.code, event.reason);
        this.isConnecting = false;
        
        // Notify listeners about disconnection
        this.notifyListeners('connection', { status: 'disconnected', code: event.code, reason: event.reason });
        
        // Always attempt to reconnect unless explicitly disconnected by user
        if (this.shouldReconnect) {
          console.log('🔄 WebSocket closed, attempting to reconnect...');
          this.attemptReconnect();
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnecting = false;
        
        // Notify listeners about error
        this.notifyListeners('connection', { status: 'error', error });
      };
      
    } catch (error) {
      console.error('❌ Error creating WebSocket connection:', error);
      this.isConnecting = false;
    }
  }

  // Handle different types of notifications
  handleNotification(notification) {
    const { type } = notification;
    
    switch (type) {
      case 'scheduled_post_reminder':
        this.handleScheduledPostReminder(notification);
        break;
      case 'scheduled_post_status':
        this.handleScheduledPostStatus(notification);
        break;
      case 'test_notification':
        this.handleTestNotification(notification);
        break;
      default:
        console.log('📨 Unknown notification type:', type);
        this.notifyListeners('notification', notification);
    }
  }

  // Handle scheduled post reminder notifications
  handleScheduledPostReminder(notification) {
    console.log('⏰ Scheduled post reminder:', notification);
    
    // Show browser notification if permission granted
    this.showBrowserNotification(
      'Scheduled Post Reminder',
      `Your post "${notification.prompt}" will be published in ${notification.minutes_until} minutes`,
      'reminder'
    );
    
    // Notify listeners
    this.notifyListeners('scheduled_post_reminder', notification);
  }

  // Handle scheduled post status notifications
  handleScheduledPostStatus(notification) {
    console.log('📱 Scheduled post status:', notification);
    
    const isSuccess = notification.status === 'success';
    const title = isSuccess ? 'Post Published Successfully!' : 'Post Publication Failed';
    const icon = isSuccess ? 'success' : 'error';
    
    // Show browser notification
    this.showBrowserNotification(title, notification.message, icon);
    
    // Notify listeners
    this.notifyListeners('scheduled_post_status', notification);
  }

  // Handle test notifications
  handleTestNotification(notification) {
    console.log('🧪 Test notification:', notification);
    
    // Show browser notification
    this.showBrowserNotification(
      'WebSocket Test',
      notification.message || 'WebSocket connection is working correctly!',
      'info'
    );
    
    // Notify listeners
    this.notifyListeners('test_notification', notification);
  }

  // Show browser notification
  showBrowserNotification(title, body, type = 'info') {
    // Check if browser supports notifications
    if (!('Notification' in window)) {
      console.log('📱 Browser does not support notifications');
      return;
    }

    // Check notification permission
    if (Notification.permission === 'granted') {
      const options = {
        body,
        icon: this.getNotificationIcon(type),
        badge: '/favicon.ico',
        tag: `scheduled-post-${type}`,
        requireInteraction: type === 'error', // Keep error notifications visible
        silent: false
      };

      const notification = new Notification(title, options);
      
      // Auto-close after 5 seconds for non-error notifications
      if (type !== 'error') {
        setTimeout(() => notification.close(), 5000);
      }
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } else if (Notification.permission !== 'denied') {
      // Request permission
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          this.showBrowserNotification(title, body, type);
        }
      });
    }
  }

  // Get notification icon based on type
  getNotificationIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      reminder: '⏰',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  // Attempt to reconnect with exponential backoff
  attemptReconnect(token = null) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.notifyListeners('connection', { status: 'failed', reason: 'Max reconnection attempts reached' });
      return;
    }

    // Use stored token if no token provided
    const reconnectToken = token || this.token;
    if (!reconnectToken) {
      console.error('❌ No token available for reconnection');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect(reconnectToken);
      }
    }, delay);
  }

  // Add event listener
  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  // Remove event listener
  removeEventListener(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  // Notify all listeners for an event
  notifyListeners(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in notification listener for ${event}:`, error);
        }
      });
    }
  }

  // Request notification permission
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      console.log('📱 Browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  // Disconnect WebSocket
  disconnect() {
    this.shouldReconnect = false;
    this.token = null;
    
    if (this.ws) {
      this.ws.close(1000, 'User disconnected');
      this.ws = null;
    }
    
    console.log('🔌 WebSocket disconnected by user');
  }

  // Ensure connection is maintained (call this on route changes)
  ensureConnection() {
    if (this.token && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
      console.log('🔄 Ensuring WebSocket connection is active');
      this.connect(this.token);
    }
  }

  // Force reconnection
  forceReconnect() {
    if (this.token) {
      console.log('🔄 Force reconnecting WebSocket');
      this.disconnect();
      setTimeout(() => {
        this.shouldReconnect = true;
        this.connect(this.token);
      }, 1000);
    }
  }

  // Get connection status
  getConnectionStatus() {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
    }
  }

  // Check if connected
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance
const notificationService = new NotificationService();

export default notificationService;