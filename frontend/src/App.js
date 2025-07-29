import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './components/Login';
import notificationService from './services/notificationService';

// Lazy load components for better performance
const Dashboard = lazy(() => import('./components/Dashboard'));
const SocialMediaPage = lazy(() => import('./components/SocialMediaPage'));
const FacebookPage = lazy(() => import('./components/FacebookPage'));
const InstagramPage = lazy(() => import('./components/InstagramPage'));
const LinkedInPage = lazy(() => import('./components/LinkedInPage'));

// Loading component
const LoadingSpinner = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh',
    fontSize: '18px',
    flexDirection: 'column',
    gap: '10px'
  }}>
    <div className="spinner"></div>
    <div>Loading...</div>
  </div>
);

// Error boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: '20px',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h2>Something went wrong</h2>
          <p>Please refresh the page or try again later.</p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Component to maintain WebSocket connection across route changes
function WebSocketManager() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      // Ensure WebSocket connection is maintained on route changes
      console.log('🔄 Route changed, ensuring WebSocket connection');
      setTimeout(() => {
        notificationService.ensureConnection();
      }, 500); // Small delay to ensure page has loaded
    }
  }, [location.pathname, isAuthenticated]);

  // Also check connection status periodically
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        if (!notificationService.isConnected()) {
          console.log('🔄 WebSocket disconnected, attempting to reconnect');
          notificationService.ensureConnection();
        }
      }, 5000); // Check every 5 seconds

      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  return null; // This component doesn't render anything
}

function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <ErrorBoundary>
      {isAuthenticated && <WebSocketManager />}
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        
        {/* Protected routes */}
        {isAuthenticated ? (
          <>
            <Route path="/" element={
              <Layout>
                <Suspense fallback={<LoadingSpinner />}>
                  <Dashboard />
                </Suspense>
              </Layout>
            } />
            <Route path="/social-media" element={
              <Suspense fallback={<LoadingSpinner />}>
                <SocialMediaPage />
              </Suspense>
            } />
            <Route path="/facebook" element={
              <Suspense fallback={<LoadingSpinner />}>
                <FacebookPage />
              </Suspense>
            } />
            <Route path="/instagram" element={
              <Suspense fallback={<LoadingSpinner />}>
                <InstagramPage />
              </Suspense>
            } />
            <Route path="/linkedin" element={
              <Suspense fallback={<LoadingSpinner />}>
                <LinkedInPage />
              </Suspense>
            } />

          </>
        ) : (
          <Route path="*" element={<Login />} />
        )}
      </Routes>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;