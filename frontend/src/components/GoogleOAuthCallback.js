import React, { useEffect } from 'react';

function GoogleOAuthCallback() {
  useEffect(() => {
    // Extract code from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    
    if (code) {
      // Send code to parent window
      window.opener?.postMessage({ code }, window.location.origin);
    } else if (error) {
      // Send error to parent window
      window.opener?.postMessage({ error }, window.location.origin);
    } else {
      // No code or error found
      window.opener?.postMessage({ error: 'No authorization code received' }, window.location.origin);
    }
    
    // Close the popup window
    window.close();
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'Arial, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '20px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '10px',
        backdropFilter: 'blur(10px)'
      }}>
        <h2>Processing authentication...</h2>
        <p>Please wait while we complete your login.</p>
      </div>
    </div>
  );
}

export default GoogleOAuthCallback;