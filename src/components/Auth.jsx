import { useState, useEffect } from 'react';
import { signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

function Auth({ user: userProp, onAuthChange }) {
  const [user, setUser] = useState(userProp || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authMode, setAuthMode] = useState('options');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showWarning, setShowWarning] = useState(false);

  // Sync with prop (for header Auth component)
  useEffect(() => {
    if (userProp !== undefined) {
      setUser(userProp);
      setLoading(false);
    }
  }, [userProp]);

  // Check auth state and redirect result (only for fullscreen login, not header)
  useEffect(() => {
    // Skip if userProp is provided (means this is header component)
    if (userProp !== undefined) {
      return;
    }

    // Listen to auth state changes (auto-login on app start)
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('Auth state changed:', currentUser);
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
        if (onAuthChange) {
          onAuthChange(currentUser);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [onAuthChange, userProp]);

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      const result = await signInWithEmailAndPassword(auth, email, password);
      setUser(result.user);
      if (onAuthChange) {
        onAuthChange(result.user);
      }
    } catch (error) {
      console.error('Error signing in:', error);
      setError(error.message);
    }
  };

  const handleEmailSignUp = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      setUser(result.user);
      if (onAuthChange) {
        onAuthChange(result.user);
      }
    } catch (error) {
      console.error('Error signing up:', error);
      setError(error.message);
    }
  };

  const handleSkipLogin = () => {
    const offlineUser = {
      uid: 'offline-user',
      email: 'offline@local',
      displayName: 'Offline Mode',
      photoURL: null
    };

    setUser(offlineUser);
    onAuthChange(offlineUser);
  };

  const handleSignOut = async () => {
    try {
      if (user && user.uid !== 'offline-user') {
        await signOut(auth);
      }
      setUser(null);
      if (onAuthChange) {
        onAuthChange(null);
      }
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // FULLSCREEN LOGIN (used by App.jsx when !user)
  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>BankoSpace</h1>
          <p className="auth-subtitle">Sync your data across all devices</p>

          {error && (
            <div className="auth-error">
              <p>{error}</p>
            </div>
          )}

          {authMode === 'options' && (
            <>
              <button className="auth-option-btn signin-btn" onClick={() => setAuthMode('email-signin')}>
                🔐 Sign In
              </button>

              <button className="auth-option-btn signup-btn" onClick={() => setAuthMode('email-signup')}>
                ✨ Create Account
              </button>

              <div className="divider">
                <span>or</span>
              </div>

              <button
                className="skip-login-btn"
                onClick={() => setShowWarning(true)}
              >
                Continue Without Login (Offline)
              </button>

              {showWarning && (
                <div className="offline-warning">
                  <h3>⚠️ Offline Mode Disadvantages:</h3>
                  <ul>
                    <li>❌ Your data won't sync to other devices</li>
                    <li>❌ No automatic backup</li>
                    <li>❌ Data will be lost if you change computers</li>
                    <li>✅ Works only on this device</li>
                  </ul>
                  <div className="warning-buttons">
                    <button className="confirm-skip-btn" onClick={handleSkipLogin}>
                      I Understand, Continue
                    </button>
                    <button className="cancel-skip-btn" onClick={() => setShowWarning(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {authMode === 'email-signin' && (
            <>
              <form onSubmit={handleEmailSignIn} className="email-form">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-input"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input"
                  required
                />
                <button type="submit" className="auth-submit-btn">
                  Sign In
                </button>
              </form>
              <p className="auth-switch">
                Don't have an account?{' '}
                <span onClick={() => setAuthMode('email-signup')}>Sign Up</span>
              </p>
              <button className="back-btn" onClick={() => setAuthMode('options')}>
                ← Back
              </button>
            </>
          )}

          {authMode === 'email-signup' && (
            <>
              <form onSubmit={handleEmailSignUp} className="email-form">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-input"
                  required
                />
                <input
                  type="password"
                  placeholder="Password (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input"
                  minLength={6}
                  required
                />
                <button type="submit" className="auth-submit-btn">
                  Sign Up
                </button>
              </form>
              <p className="auth-switch">
                Already have an account?{' '}
                <span onClick={() => setAuthMode('email-signin')}>Sign In</span>
              </p>
              <button className="back-btn" onClick={() => setAuthMode('options')}>
                ← Back
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // HEADER USER INFO (used by App.jsx header when user exists)
  return (
    <div className="user-info">
      {user.photoURL ? (
        <img src={user.photoURL} alt={user.displayName} className="user-avatar" />
      ) : (
        <div className="user-avatar user-avatar-placeholder">
          {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
        </div>
      )}
      <span className="user-name">{user.displayName || user.email}</span>
      <button className="signout-btn" onClick={handleSignOut}>Sign Out</button>
    </div>
  );
}

export default Auth;
