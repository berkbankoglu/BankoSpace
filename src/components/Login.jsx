import { useState } from 'react';
import { supabase } from '../supabase';
import './Login.css';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (isRegister && password !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Registration successful! Please verify your email.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onLogin(data.session);
      }
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Network')) {
        setError('Connection failed. Check your internet connection.');
      } else if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        setError('Invalid email or password');
      } else if (msg.includes('Email not confirmed')) {
        setError('Please verify your email first');
      } else if (msg.includes('User already registered')) {
        setError('An account with this email already exists');
      } else {
        setError(msg || 'An error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (toRegister) => {
    setIsRegister(toRegister);
    setError('');
    setMessage('');
    setPasswordConfirm('');
  };

  return (
    <div className="login-wrapper">
      <div className="login-box">
        <div className="login-logo">BankoSpace</div>
        <div className="login-subtitle">Your personal workspace</div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              autoFocus
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          {isRegister && (
            <div className="login-field">
              <label>Confirm Password</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
          {message && <div className="login-success">{message}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? '...' : isRegister ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="login-toggle">
          {isRegister ? (
            <>Already have an account? <span onClick={() => switchMode(false)}>Sign In</span></>
          ) : (
            <>Don't have an account? <span onClick={() => switchMode(true)}>Sign Up</span></>
          )}
        </div>

      </div>
    </div>
  );
}
