import { useState } from 'react';
import { supabase } from '../supabase';
import './Login.css';

const closeApp = async () => { try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().close(); } catch {} };

// step: 'form' | 'otp'
export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [step, setStep] = useState('form');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (isRegister && step === 'form') {
      if (password !== passwordConfirm) { setError('Passwords do not match.'); return; }
      setLoading(true);
      try {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // OTP kodu email'e gönderildi (Supabase email confirmation)
        setStep('otp');
        setMessage('A verification code has been sent to your email.');
      } catch (err) {
        setError(parseError(err));
      } finally { setLoading(false); }
      return;
    }

    if (isRegister && step === 'otp') {
      setLoading(true);
      try {
        const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'signup' });
        if (error) throw error;
        onLogin(data.session);
      } catch (err) {
        setError('Invalid or expired code. Please try again.');
      } finally { setLoading(false); }
      return;
    }

    // Sign in
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onLogin(data.session);
    } catch (err) {
      setError(parseError(err));
    } finally { setLoading(false); }
  };

  const parseError = (err) => {
    const msg = err.message || '';
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('Network')) return 'Connection failed. Check your internet connection.';
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) return 'Invalid email or password';
    if (msg.includes('Email not confirmed')) return 'Please verify your email first';
    if (msg.includes('User already registered')) return 'An account with this email already exists';
    return msg || 'An error occurred';
  };

  const switchMode = (toRegister) => {
    setIsRegister(toRegister);
    setStep('form');
    setError('');
    setMessage('');
    setPasswordConfirm('');
    setOtpCode('');
  };

  return (
    <div className="login-wrapper">
      {/* Minimal titlebar — sadece kapat, sürükle */}
      <div className="login-titlebar" data-tauri-drag-region>
        <button className="login-close-btn" onClick={closeApp}>×</button>
      </div>
      <div className="login-box">
        <div className="login-logo">BankoSpace</div>
        <div className="login-subtitle">Your personal workspace</div>

        <form onSubmit={handleSubmit} className="login-form">

          {step === 'otp' ? (
            <>
              <div className="login-field">
                <label>Verification Code</label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  required
                  autoFocus
                  maxLength={6}
                  style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: '20px' }}
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              {message && <div className="login-success">{message}</div>}
              <button type="submit" className="login-btn" disabled={loading || otpCode.length < 6}>
                {loading ? '...' : 'Verify'}
              </button>
              <div className="login-toggle" style={{marginTop:'12px'}}>
                <span onClick={() => { setStep('form'); setError(''); setMessage(''); }}>← Back</span>
              </div>
            </>
          ) : (
            <>
              <div className="login-field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required autoFocus />
              </div>
              <div className="login-field">
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              {isRegister && (
                <div className="login-field">
                  <label>Confirm Password</label>
                  <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>
              )}
              {error && <div className="login-error">{error}</div>}
              {message && <div className="login-success">{message}</div>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? '...' : isRegister ? 'Sign Up' : 'Sign In'}
              </button>
              <div className="login-toggle">
                {isRegister ? (
                  <>Already have an account? <span onClick={() => switchMode(false)}>Sign In</span></>
                ) : (
                  <>Don't have an account? <span onClick={() => switchMode(true)}>Sign Up</span></>
                )}
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
