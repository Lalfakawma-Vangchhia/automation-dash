import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  
  const navigate = useNavigate();
  const { login, register, loginWithGoogle, sendOTP, verifyOTP, resendOTP } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    // Add timeout to prevent infinite hanging
    const timeout = setTimeout(() => {
      setMessage('Error: Request timed out. Please check if the backend server is running.');
      setLoading(false);
    }, 10000); // 10 second timeout
    
    try {
      if (isRegister) {
        // Validate passwords match
        if (password !== confirmPassword) {
          setMessage('Error: Passwords do not match');
          return;
        }
        
        console.log('Attempting registration...');
        const response = await register({
          email,
          password,
          confirm_password: confirmPassword,
          username,
          full_name: fullName,
        });
        
        console.log('Registration response:', response);
        setRegisteredEmail(email);
        setShowOTPVerification(true);
        setMessage(response.message || 'Registration successful! Please check your email for the verification code.');
      } else {
        console.log('Attempting login with:', { email });
        console.log('API URL:', process.env.REACT_APP_API_URL || 'http://localhost:8000/api');
        
        const response = await login(email, password);
        console.log('Login response:', response);
        
        setMessage('Login successful!');
        // Clear the timeout on success
        clearTimeout(timeout);
        
        // Navigate to dashboard after successful login
        navigate('/');
      }
    } catch (error) {
      console.error('Login/Register error:', error);
      
      if (error.message.includes('Email not verified')) {
        setRegisteredEmail(email);
        setShowOTPVerification(true);
        setMessage('Please verify your email before logging in. Check your email for the verification code.');
      } else {
        setMessage(`Error: ${error.message}`);
        
        // Log more details for debugging
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          setMessage('Error: Cannot connect to backend server. Please ensure the backend is running on http://localhost:8000');
        }
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const handleOTPVerification = async (e) => {
    e.preventDefault();
    setOtpLoading(true);
    setMessage('');
    
    try {
      const response = await verifyOTP(registeredEmail, otp);
      console.log('OTP verification response:', response);
      
      setMessage('Email verified successfully! You can now log in.');
      setShowOTPVerification(false);
      setIsRegister(false);
      setOtp('');
      
      // Clear form fields
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setFullName('');
      setUsername('');
      
    } catch (error) {
      console.error('OTP verification error:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setOtpLoading(true);
    setMessage('');
    
    try {
      const response = await resendOTP(registeredEmail);
      console.log('Resend OTP response:', response);
      setMessage('Verification code resent to your email.');
    } catch (error) {
      console.error('Resend OTP error:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isRegister) {
      setMessage('Google OAuth is only available for login. Please switch to login mode.');
      return;
    }

    setGoogleLoading(true);
    setMessage('');

    try {
      console.log('Attempting Google OAuth login...');
      const response = await loginWithGoogle();
      console.log('Google OAuth response:', response);

      // Force reload to ensure global state is updated
      window.location.href = '/';
    } catch (error) {
      console.error('Google OAuth error:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setGoogleLoading(false);
    }
  };

  const containerStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  };

  const glassCardStyle = {
    background: 'rgba(255, 255, 255, 0.25)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 25px 45px rgba(0, 0, 0, 0.1)',
    padding: '40px',
    width: '100%',
    maxWidth: '420px',
    position: 'relative',
    overflow: 'hidden'
  };

  const titleStyle = {
    fontSize: '2rem',
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: '30px',
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
  };

  const formGroupStyle = {
    marginBottom: '20px',
    position: 'relative'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: '8px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
  };

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    fontSize: '1rem',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: '#ffffff',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box',
    outline: 'none'
  };

  const inputFocusStyle = {
    ...inputStyle,
    border: '1px solid rgba(255, 255, 255, 0.6)',
    background: 'rgba(255, 255, 255, 0.3)',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
  };

  const buttonStyle = {
    width: '100%',
    padding: '16px',
    fontSize: '1rem',
    fontWeight: '600',
    color: '#ffffff',
    background: loading 
      ? 'rgba(255, 255, 255, 0.2)' 
      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '12px',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.3s ease',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    opacity: loading ? 0.7 : 1
  };

  const switchButtonStyle = {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: '0.9rem',
    fontWeight: '500',
    transition: 'all 0.3s ease',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
  };

  const messageStyle = {
    marginTop: '20px',
    padding: '16px',
    borderRadius: '12px',
    fontSize: '0.9rem',
    fontWeight: '500',
    textAlign: 'center',
    background: message.includes('Error') 
      ? 'rgba(239, 68, 68, 0.2)' 
      : 'rgba(34, 197, 94, 0.2)',
    color: '#ffffff',
    border: `1px solid ${message.includes('Error') 
      ? 'rgba(239, 68, 68, 0.3)' 
      : 'rgba(34, 197, 94, 0.3)'}`,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
  };

  const switchTextStyle = {
    textAlign: 'center',
    marginTop: '24px',
    color: '#ffffff',
    fontSize: '0.9rem',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
  };

  return (
    <div style={containerStyle}>
      <div style={glassCardStyle}>
        {showOTPVerification ? (
          <>
            <h2 style={titleStyle}>Verify Your Email</h2>
            <div style={{
              textAlign: 'center',
              marginBottom: '30px',
              color: '#ffffff',
              fontSize: '0.9rem',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
            }}>
              We've sent a verification code to<br />
              <strong>{registeredEmail}</strong>
            </div>
            
            <form onSubmit={handleOTPVerification}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Verification Code</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{
                    ...inputStyle,
                    textAlign: 'center',
                    fontSize: '1.5rem',
                    letterSpacing: '8px',
                    fontWeight: 'bold'
                  }}
                  onFocus={(e) => Object.assign(e.target.style, {
                    ...inputFocusStyle,
                    textAlign: 'center',
                    fontSize: '1.5rem',
                    letterSpacing: '8px',
                    fontWeight: 'bold'
                  })}
                  onBlur={(e) => Object.assign(e.target.style, {
                    ...inputStyle,
                    textAlign: 'center',
                    fontSize: '1.5rem',
                    letterSpacing: '8px',
                    fontWeight: 'bold'
                  })}
                  placeholder="000000"
                  maxLength="6"
                  required
                />
              </div>
              
              <button
                type="submit"
                disabled={otpLoading || otp.length !== 6}
                style={{
                  ...buttonStyle,
                  opacity: (otpLoading || otp.length !== 6) ? 0.5 : 1,
                  cursor: (otpLoading || otp.length !== 6) ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={(e) => {
                  if (!otpLoading && otp.length === 6) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!otpLoading && otp.length === 6) {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                  }
                }}
              >
                {otpLoading ? 'Verifying...' : 'Verify Email'}
              </button>
            </form>
            
            <div style={{
              textAlign: 'center',
              marginTop: '24px',
              color: '#ffffff',
              fontSize: '0.9rem'
            }}>
              Didn't receive the code?{' '}
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={otpLoading}
                style={{
                  ...switchButtonStyle,
                  opacity: otpLoading ? 0.5 : 1,
                  cursor: otpLoading ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={(e) => {
                  if (!otpLoading) {
                    e.target.style.color = '#f0f8ff';
                    e.target.style.textShadow = '0 0 8px rgba(255, 255, 255, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!otpLoading) {
                    e.target.style.color = '#ffffff';
                    e.target.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
                  }
                }}
              >
                Resend Code
              </button>
            </div>
            
            <div style={switchTextStyle}>
              <button
                type="button"
                onClick={() => {
                  setShowOTPVerification(false);
                  setOtp('');
                  setMessage('');
                }}
                style={switchButtonStyle}
                onMouseEnter={(e) => {
                  e.target.style.color = '#f0f8ff';
                  e.target.style.textShadow = '0 0 8px rgba(255, 255, 255, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = '#ffffff';
                  e.target.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
                }}
              >
                ← Back to Login
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={titleStyle}>
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </h2>
            
            <form onSubmit={handleSubmit}>
              {isRegister && (
                <>
                  <div style={formGroupStyle}>
                    <label style={labelStyle}>Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputStyle)}
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                  
                  <div style={formGroupStyle}>
                    <label style={labelStyle}>Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputStyle)}
                      placeholder="Choose a username"
                      required
                    />
                  </div>
                </>
              )}
              
              <div style={formGroupStyle}>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                  onBlur={(e) => Object.assign(e.target.style, inputStyle)}
                  placeholder="Enter your email"
                  required
                />
              </div>
              
              <div style={formGroupStyle}>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                  onBlur={(e) => Object.assign(e.target.style, inputStyle)}
                  placeholder="Enter your password"
                  required
                />
              </div>
              
              {isRegister && (
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={inputStyle}
                    onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                    onBlur={(e) => Object.assign(e.target.style, inputStyle)}
                    placeholder="Confirm your password"
                    required
                  />
                </div>
              )}
              
              <button
                type="submit"
                disabled={loading}
                style={buttonStyle}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                  }
                }}
              >
                {loading ? 'Processing...' : (isRegister ? 'Create Account' : 'Sign In')}
              </button>
            </form>
            
            {!isRegister && (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '24px 0',
                  color: '#ffffff',
                  fontSize: '0.9rem'
                }}>
                  <div style={{
                    flex: 1,
                    height: '1px',
                    background: 'rgba(255, 255, 255, 0.3)'
                  }}></div>
                  <span style={{ margin: '0 16px' }}>or</span>
                  <div style={{
                    flex: 1,
                    height: '1px',
                    background: 'rgba(255, 255, 255, 0.3)'
                  }}></div>
                </div>
                
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  style={{
                    width: '100%',
                    padding: '16px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#333333',
                    background: googleLoading 
                      ? 'rgba(255, 255, 255, 0.7)' 
                      : '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    cursor: googleLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    opacity: googleLoading ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!googleLoading) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!googleLoading) {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {googleLoading ? 'Connecting...' : 'Continue with Google'}
                </button>
              </>
            )}
            
            <div style={switchTextStyle}>
              {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setMessage('');
                  setConfirmPassword('');
                }}
                style={switchButtonStyle}
                onMouseEnter={(e) => {
                  e.target.style.color = '#f0f8ff';
                  e.target.style.textShadow = '0 0 8px rgba(255, 255, 255, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = '#ffffff';
                  e.target.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
                }}
              >
                {isRegister ? 'Sign In' : 'Create Account'}
              </button>
            </div>
          </>
        )}
        
        {message && (
          <div style={messageStyle}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

export default Login; 