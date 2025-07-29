import React, { useState, useEffect } from 'react';
import apiClient from '../services/apiClient';
import notificationService from '../services/notificationService';

const NotificationDebug = () => {
  const [debugInfo, setDebugInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    // Listen for connection status changes
    const handleConnectionChange = (data) => {
      setConnectionStatus(data.status);
    };

    notificationService.addEventListener('connection', handleConnectionChange);
    setConnectionStatus(notificationService.getConnectionStatus());

    return () => {
      notificationService.removeEventListener('connection', handleConnectionChange);
    };
  }, []);

  const fetchDebugInfo = async () => {
    setLoading(true);
    try {
      const response = await apiClient.debugScheduledPosts();
      setDebugInfo(response);
    } catch (error) {
      console.error('Error fetching debug info:', error);
      setDebugInfo({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const testNotification = async () => {
    try {
      const response = await apiClient.testNotification();
      console.log('Test notification response:', response);
      alert(`Test result: ${response.success ? 'Success' : 'Failed'}\n${response.message}`);
    } catch (error) {
      console.error('Error testing notification:', error);
      alert(`Test failed: ${error.message}`);
    }
  };

  const reconnectWebSocket = () => {
    const token = localStorage.getItem('authToken');
    if (token) {
      notificationService.disconnect();
      setTimeout(() => {
        notificationService.connect(token);
      }, 1000);
    }
  };

  const formatTime = (isoString) => {
    return new Date(isoString).toLocaleString();
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: '10px', 
      right: '10px', 
      background: 'white', 
      border: '1px solid #ccc', 
      padding: '15px', 
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      maxWidth: '400px',
      zIndex: 1000,
      fontSize: '12px'
    }}>
      <h4 style={{ margin: '0 0 10px 0' }}>🔧 Notification Debug</h4>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>WebSocket Status:</strong> 
        <span style={{ 
          color: connectionStatus === 'connected' ? 'green' : 'red',
          marginLeft: '5px'
        }}>
          {connectionStatus}
        </span>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <button onClick={fetchDebugInfo} disabled={loading} style={{ marginRight: '5px' }}>
          {loading ? 'Loading...' : 'Refresh Debug Info'}
        </button>
        <button onClick={testNotification} style={{ marginRight: '5px' }}>
          Test Notification
        </button>
        <button onClick={reconnectWebSocket}>
          Reconnect WS
        </button>
      </div>

      {debugInfo && (
        <div style={{ 
          background: '#f5f5f5', 
          padding: '10px', 
          borderRadius: '4px',
          maxHeight: '300px',
          overflow: 'auto'
        }}>
          {debugInfo.error ? (
            <div style={{ color: 'red' }}>Error: {debugInfo.error}</div>
          ) : (
            <>
              <div><strong>Current Time (UTC):</strong> {formatTime(debugInfo.current_time_utc)}</div>
              <div><strong>Current Time (IST):</strong> {formatTime(debugInfo.current_time_ist)}</div>
              <div><strong>WebSocket Connections:</strong> {debugInfo.websocket_connections}</div>
              <div><strong>Scheduled Posts:</strong> {debugInfo.total_scheduled_posts}</div>
              
              {debugInfo.posts && debugInfo.posts.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <strong>Posts:</strong>
                  {debugInfo.posts.map(post => (
                    <div key={post.id} style={{ 
                      margin: '5px 0', 
                      padding: '5px', 
                      background: post.will_notify_in_10_min ? '#e8f5e8' : 'white',
                      border: '1px solid #ddd',
                      borderRadius: '3px'
                    }}>
                      <div><strong>ID:</strong> {post.id}</div>
                      <div><strong>Prompt:</strong> {post.prompt}</div>
                      <div><strong>Minutes Until:</strong> {post.minutes_until_posting}</div>
                      <div><strong>Will Notify:</strong> {post.will_notify_in_10_min ? '✅ Yes' : '❌ No'}</div>
                      <div><strong>Status:</strong> {post.status}</div>
                      <div><strong>Scheduled (IST):</strong> {formatTime(post.scheduled_datetime_ist)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationDebug;