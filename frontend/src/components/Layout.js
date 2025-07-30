import React from 'react';
import NotificationBell from './NotificationBell';
import NotificationCenter from './NotificationCenter';

function Layout({ children }) {
  return (
    <div className="App">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="brand-section">
            <h1 className="company-name">ThorSignia</h1>
            <p className="company-tagline">Enterprise Automation Platform</p>
          </div>
          <div className="header-actions">
            <div className="notification-container">
              <NotificationBell />
              <NotificationCenter />
            </div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

export default Layout; 