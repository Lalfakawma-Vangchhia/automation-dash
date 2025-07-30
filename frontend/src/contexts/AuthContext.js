import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../services/apiClient';
import { useNotifications } from './NotificationContext';

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
      
      // Trigger notification permission check after successful login
      setTimeout(() => {
        const event = new CustomEvent('userLoggedIn');
        window.dispatchEvent(event);
      }, 1000);
      
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

      return new Promise((resolve, reject) => {
        let isResolved = false;
        let checkClosedInterval;
        let timeoutId;
        let popup;

        // Listen for messages from the popup (sent by backend callback)
        const messageListener = (event) => {
          console.log('🔍 Received message:', event.data, 'from origin:', event.origin);

          // Accept messages from our backend origin (both HTTP and HTTPS), and wildcard '*' for dev
          const allowedOrigins = ['http://localhost:8000', 'https://localhost:8000', window.location.origin];

          // For development, also accept messages from any origin if they have the right structure
          const isValidMessage = event.data && (event.data.success || event.data.error);
          const isFromAllowedOrigin = allowedOrigins.includes(event.origin) || event.origin === 'null';

          if (!isFromAllowedOrigin && !isValidMessage) {
            console.log('🔍 Ignoring message from unexpected origin:', event.origin);
            return;
          }

          if (isResolved) {
            console.log('🔍 Message received but already resolved, ignoring');
            return; // Prevent multiple resolutions
          }

          // Check if this is an OAuth success message
          if (event.data && event.data.success && event.data.access_token) {
            console.log('✅ OAuth success received:', event.data);
            isResolved = true;

            // Clear intervals and timeouts
            if (checkClosedInterval) {
              clearInterval(checkClosedInterval);
              checkClosedInterval = null;
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }

            // Backend successfully processed OAuth and sent us the token
            apiClient.setToken(event.data.access_token);
            setUser(event.data.user);
            setIsAuthenticated(true);
            
            // Trigger notification permission check after successful Google login
            setTimeout(() => {
              const loginEvent = new CustomEvent('userLoggedIn');
              window.dispatchEvent(loginEvent);
            }, 1000);

            window.removeEventListener('message', messageListener);

            // Close popup with delay to ensure message processing
            setTimeout(() => {
              try {
                if (popup && !popup.closed) popup.close();
              } catch (e) {
                console.warn('Could not close popup:', e);
              }
            }, 500);

            resolve(event.data);
          } else if (event.data && event.data.error) {
            console.log('❌ OAuth error received:', event.data.error);
            isResolved = true;

            // Clear intervals and timeouts
            if (checkClosedInterval) {
              clearInterval(checkClosedInterval);
              checkClosedInterval = null;
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }

            window.removeEventListener('message', messageListener);

            setTimeout(() => {
              try {
                if (popup && !popup.closed) popup.close();
              } catch (e) {
                console.warn('Could not close popup:', e);
              }
            }, 500);

            reject(new Error(event.data.error));
          } else {
            console.log('🔍 Received message with unexpected format:', event.data);
          }
        };

        // Set up message listener BEFORE opening popup
        window.addEventListener('message', messageListener);
        console.log('🔍 Message listener set up');

        // Open popup window for Google OAuth
        popup = window.open(
          auth_url,
          'google-oauth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );

        if (!popup) {
          window.removeEventListener('message', messageListener);
          reject(new Error('Failed to open OAuth popup. Please allow popups for this site.'));
          return;
        }

        console.log('🔍 Popup opened successfully');

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

        // Handle popup closure detection - use longer delay to allow message processing
        const checkClosed = () => {
          try {
            if (popup && popup.closed) {
              if (!isResolved) {
                console.log('🔍 Popup was closed by user');

                // Check localStorage for OAuth result as fallback
                try {
                  const oauthResult = localStorage.getItem('oauth_result');
                  if (oauthResult) {
                    console.log('🔍 Found OAuth result in localStorage');
                    const result = JSON.parse(oauthResult);
                    localStorage.removeItem('oauth_result');

                    if (result.success && result.access_token) {
                      console.log('✅ OAuth success from localStorage');
                      isResolved = true;
                      cleanup();

                      apiClient.setToken(result.access_token);
                      setUser(result.user);
                      setIsAuthenticated(true);

                      resolve(result);
                      return;
                    } else if (result.error) {
                      console.log('❌ OAuth error from localStorage');
                      isResolved = true;
                      cleanup();
                      reject(new Error(result.error));
                      return;
                    }
                  }
                } catch (e) {
                  console.log('🔍 No valid OAuth result in localStorage');
                }

                // Wait longer before rejecting to allow any pending message events
                setTimeout(() => {
                  if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    reject(new Error('OAuth popup was closed by user'));
                  }
                }, 3000); // Increased delay to 3 seconds
              }
              return;
            }
          } catch (error) {
            // COOP policy blocks access - this is expected in secure contexts
            console.log('🔍 COOP policy active - relying on message listener for popup status');
          }
        };

        // Check popup status less frequently to reduce COOP errors and allow more time for messages
        checkClosedInterval = setInterval(checkClosed, 5000); // Check every 5 seconds

        // Set a reasonable timeout for OAuth process
        timeoutId = setTimeout(() => {
          if (!isResolved) {
            console.log('🔍 OAuth timeout reached');
            isResolved = true;
            cleanup();
            try {
              if (popup && !popup.closed) popup.close();
            } catch (e) {
              console.warn('Could not close popup on timeout:', e);
            }
            reject(new Error('OAuth timeout - please ensure you accept the SSL certificate and try again'));
          }
        }, 300000); // 5 minutes to allow for certificate acceptance and debugging
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