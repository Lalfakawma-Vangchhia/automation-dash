import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../services/apiClient';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          apiClient.setToken(token); // Ensure API client has the token
          const userData = await apiClient.getCurrentUser();
          setUser(userData);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // Clear invalid token
        localStorage.removeItem('authToken');
        apiClient.setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await apiClient.login(email, password);
      setUser(response.user);
      setIsAuthenticated(true);
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const register = async (userData) => {
    try {
      const response = await apiClient.register(userData);
      return response;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const sendOTP = async (email) => {
    try {
      const response = await apiClient.sendOTP(email);
      return response;
    } catch (error) {
      console.error('Send OTP failed:', error);
      throw error;
    }
  };

  const verifyOTP = async (email, otp) => {
    try {
      const response = await apiClient.verifyOTP(email, otp);
      return response;
    } catch (error) {
      console.error('OTP verification failed:', error);
      throw error;
    }
  };

  const resendOTP = async (email) => {
    try {
      const response = await apiClient.resendOTP(email);
      return response;
    } catch (error) {
      console.error('Resend OTP failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await apiClient.logout();
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const loginWithGoogle = async () => {
    try {
      // Get Google OAuth URL from backend
      const response = await apiClient.getGoogleOAuthUrl();
      const { auth_url } = response;
      
      // Open popup window for Google OAuth
      const popup = window.open(
        auth_url,
        'google-oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        throw new Error('Failed to open OAuth popup. Please allow popups for this site.');
      }
      
      return new Promise((resolve, reject) => {
        let isResolved = false;
        let checkClosedInterval;
        let timeoutId;
        
        // Cleanup function
        const cleanup = () => {
          window.removeEventListener('message', messageListener);
          if (checkClosedInterval) {
            clearInterval(checkClosedInterval);
            checkClosedInterval = null;
          }
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        };
        
        // Listen for messages from the popup (sent by backend callback)
        const messageListener = (event) => {
          console.log('Received message:', event.data, 'from origin:', event.origin);
          
          // Accept messages from our backend origin
          const backendOrigin = 'https://localhost:8000';
          if (event.origin !== backendOrigin && event.origin !== window.location.origin) {
            console.log('Ignoring message from unexpected origin:', event.origin);
            return;
          }
          
          if (isResolved) return; // Prevent multiple resolutions
          
          if (event.data.success && event.data.access_token) {
            console.log('OAuth success received:', event.data);
            // Backend successfully processed OAuth and sent us the token
            isResolved = true;
            apiClient.setToken(event.data.access_token);
            setUser(event.data.user);
            setIsAuthenticated(true);
            
            cleanup();
            try {
              popup.close();
            } catch (e) {
              console.warn('Could not close popup:', e);
            }
            resolve(event.data);
          } else if (event.data.error) {
            console.log('OAuth error received:', event.data.error);
            isResolved = true;
            cleanup();
            try {
              popup.close();
            } catch (e) {
              console.warn('Could not close popup:', e);
            }
            reject(new Error(event.data.error));
          }
        };
        
        window.addEventListener('message', messageListener);
        
        // Simplified popup closed check - disable COOP-problematic checks
        // Instead, rely primarily on the timeout and message listener
        let popupCheckAttempts = 0;
        const maxPopupCheckAttempts = 5; // Only try a few times
        
        const checkClosed = () => {
          popupCheckAttempts++;
          
          try {
            // Try to access popup.closed, but don't rely on it heavily
            if (popup.closed) {
              if (!isResolved) {
                console.log('Popup was closed by user');
                isResolved = true;
                cleanup();
                reject(new Error('OAuth popup was closed by user'));
              }
              return;
            }
          } catch (error) {
            // COOP policy blocks access - this is expected
            console.log('COOP policy prevents popup.closed check, attempt:', popupCheckAttempts);
          }
          
          // After a few failed attempts, stop trying to check popup.closed
          if (popupCheckAttempts >= maxPopupCheckAttempts) {
            console.log('Stopping popup.closed checks due to COOP policy');
            if (checkClosedInterval) {
              clearInterval(checkClosedInterval);
              checkClosedInterval = null;
            }
          }
        };
        
        // Start checking popup status, but be prepared for COOP failures
        checkClosedInterval = setInterval(checkClosed, 2000); // Check every 2 seconds instead of 1
        
        // Shorter timeout since we can't reliably detect popup closure
        timeoutId = setTimeout(() => {
          if (!isResolved) {
            console.log('OAuth timeout reached');
            isResolved = true;
            cleanup();
            try {
              popup.close();
            } catch (e) {
              console.warn('Could not close popup on timeout:', e);
            }
            reject(new Error('OAuth timeout - please try again'));
          }
        }, 120000); // 2 minutes instead of 5
      });
    } catch (error) {
      console.error('Google OAuth failed:', error);
      throw error;
    }
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    register,
    logout,
    loginWithGoogle,
    sendOTP,
    verifyOTP,
    resendOTP,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 