import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { setProfile, validateUsername, validateHandle, avatarColor, initials, loginEmailFor, accountSubtitle } from '../utils/profile';
import { listAccounts, forgetAccount } from '../utils/accounts';
import { isTauri, windowControls, startWindowDrag } from '../platform';
import logo from '../assets/logo.svg';
import './Login.css';

const CONFIRM_REDIRECT = 'https://banko-space.vercel.app/confirmed.html';

// supabase-js reports any failed function call as a generic "non-2xx" error;
// the reason the function actually gave is in the response body.
async function functionError(error) {
  try {
    const body = await error?.context?.json();
    if (body?.error) return new Error(body.error);
  } catch { /* body was not JSON */ }
  if (error?.context?.status === 404) return new Error('Quick sign-up is not set up on the server yet.');
  return error;
}

// step: 'form' | 'confirm' | 'forgot' | 'recover-otp' | 'new-password'
//
// Recovery goes through a 6-digit code rather than an emailed link, for the
// same reason signup does: a link opens the browser, and the desktop app is
// where the session has to land.
export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  // Quick account: username, email and password, signed in on the spot — the
  // email is kept for contact and never confirmed. Exclusive with isRegister.
  const [isQuick, setIsQuick] = useState(false);
  const [step, setStep] = useState('form');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [otpCode, setOtpCode] = useState('');
  // The session verifyOtp hands back — held until the new password is saved,
  // so the user lands logged in instead of typing their password again.
  const [recoverySession, setRecoverySession] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Accounts already signed in on this machine. Adding one leaves you here, so
  // without this there would be no way back to the account you came from
  // except typing its password again.
  const [saved, setSaved] = useState(listAccounts);

  const resumeAccount = async (account) => {
    setError('');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
      });
      if (error || !data?.session) throw error || new Error('no session');
      onLogin(data.session);
    } catch {
      setSaved(forgetAccount(account.id));
      setError('That saved sign-in has expired. Please enter the password.');
      setEmail(account.email || '');
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (step === 'forgot') {
      setLoading(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setOtpCode('');
        setStep('recover-otp');
        setMessage('If an account exists for that address, a reset code is on its way.');
      } catch (err) {
        setError(parseError(err));
      } finally { setLoading(false); }
      return;
    }

    if (step === 'recover-otp') {
      setLoading(true);
      try {
        const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'recovery' });
        if (error) throw error;
        if (!data?.session) throw new Error('no session');
        setRecoverySession(data.session);
        setPassword('');
        setPasswordConfirm('');
        setStep('new-password');
      } catch (err) {
        setError('Invalid or expired code. Please try again.');
      } finally { setLoading(false); }
      return;
    }

    if (step === 'new-password') {
      if (password !== passwordConfirm) { setError('Passwords do not match.'); return; }
      setLoading(true);
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onLogin(recoverySession);
      } catch (err) {
        setError(parseError(err));
      } finally { setLoading(false); }
      return;
    }

    if (isQuick && step === 'form') {
      const handleProblem = validateHandle(username);
      if (handleProblem) { setError(handleProblem); return; }
      if (password !== passwordConfirm) { setError('Passwords do not match.'); return; }
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('quick-signup', {
          body: { username: username.trim(), email: email.trim(), password },
        });
        if (error) throw await functionError(error);
        if (data?.error) throw new Error(data.error);
        const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
          email: loginEmailFor(username), password,
        });
        if (signInError) throw signInError;
        setProfile({ username: username.trim() });
        onLogin(signedIn.session);
      } catch (err) {
        setError(parseError(err));
      } finally { setLoading(false); }
      return;
    }

    if (isRegister && step === 'form') {
      const nameProblem = validateUsername(username);
      if (nameProblem) { setError(nameProblem); return; }
      if (password !== passwordConfirm) { setError('Passwords do not match.'); return; }
      setLoading(true);
      try {
        // The name rides along on the auth record so it survives signing in on
        // a second device before any data has synced.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.trim() },
            // Where the emailed link lands after Supabase has confirmed the
            // account. A fixed public page rather than this app: the desktop
            // build has no address a browser can open, and the default would
            // send people to a dead localhost tab.
            emailRedirectTo: CONFIRM_REDIRECT,
          },
        });
        if (error) throw error;
        setStep('confirm');
        setMessage('');
      } catch (err) {
        setError(parseError(err));
      } finally { setLoading(false); }
      return;
    }

    if (isRegister && step === 'confirm') {
      // The form's only job here is the "I've confirmed" button.
      checkConfirmed(true);
      return;
    }

    // Sign in — the box takes an email or a quick account's username.
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmailFor(email), password });
      if (error) throw error;
      onLogin(data.session);
    } catch (err) {
      setError(parseError(err));
    } finally { setLoading(false); }
  };

  // Confirmation happens in the browser, not here — so once the account is
  // live we finish the job ourselves instead of making the user sign in again.
  // Supabase rejects signInWithPassword with "Email not confirmed" until the
  // link is opened, which makes it a clean readiness check. It runs when the
  // window regains focus (exactly when they come back from the email) and on a
  // slow timer as a backstop, rather than in a tight poll that would run into
  // the auth rate limit.
  const checkingRef = useRef(false);
  const checkConfirmed = useCallback(async (manual) => {
    if (checkingRef.current) return;
    if (!email || !password) return;
    checkingRef.current = true;
    if (manual) { setLoading(true); setError(''); }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (username.trim()) setProfile({ username: username.trim() });
      onLogin(data.session);
    } catch (err) {
      if (manual) {
        const msg = err?.message || '';
        setError(msg.includes('Email not confirmed') || msg.includes('not confirmed')
          ? 'Not confirmed yet. Open the link in the email, then try again.'
          : parseError(err));
      }
    } finally {
      checkingRef.current = false;
      if (manual) setLoading(false);
    }
  }, [email, password, username, onLogin]);

  useEffect(() => {
    if (step !== 'confirm') return;
    const onFocus = () => checkConfirmed(false);
    window.addEventListener('focus', onFocus);
    const timer = setInterval(() => checkConfirmed(false), 15000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(timer); };
  }, [step, checkConfirmed]);

  const resendConfirmation = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup', email, options: { emailRedirectTo: CONFIRM_REDIRECT },
      });
      if (error) throw error;
      setMessage('Sent again. It can take a minute to arrive.');
    } catch (err) {
      setError(parseError(err));
    } finally { setLoading(false); }
  };

  const parseError = (err) => {
    const msg = err.message || '';
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('Network')) return 'Connection failed. Check your internet connection.';
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) return 'Wrong email, username or password.';
    if (msg.includes('Email not confirmed')) return 'Please verify your email first';
    if (msg.includes('User already registered')) return 'An account with this email already exists';
    if (msg.includes('same password') || msg.includes('should be different')) return 'Pick a password you have not used before.';
    if (msg.includes('For security purposes') || msg.includes('rate limit') || msg.includes('Too many')) return 'Too many attempts. Wait a minute and try again.';
    return msg || 'An error occurred';
  };

  const switchMode = (toRegister, quick = false) => {
    setIsRegister(toRegister && !quick);
    setIsQuick(quick);
    setStep('form');
    setError('');
    setMessage('');
    setPasswordConfirm('');
    setUsername('');
    setOtpCode('');
  };

  const backToSignIn = () => {
    setIsRegister(false);
    setIsQuick(false);
    setStep('form');
    setError('');
    setMessage('');
    setPassword('');
    setPasswordConfirm('');
    setOtpCode('');
    setRecoverySession(null);
  };

  const resendResetCode = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setMessage('A new code has been sent.');
    } catch (err) {
      setError(parseError(err));
    } finally { setLoading(false); }
  };

  return (
    <div className="login-wrapper">
      {/* Minimal titlebar — sadece kapat, sürükle (web'de tarayıcı kendi chrome'unu kullanır) */}
      {isTauri && (
        <div className="login-titlebar" onMouseDown={startWindowDrag}>
          <button className="login-minimize-btn" onClick={windowControls.minimize}>─</button>
          <button className="login-close-btn" onClick={windowControls.close}>×</button>
        </div>
      )}
      <div className="login-box">
        <div className="login-logo">
          <img src={logo} alt="BankoSpace" className="login-logo-img" />
        </div>
        <div className="login-subtitle">Your personal workspace</div>

        <form onSubmit={handleSubmit} className="login-form">

          {step === 'forgot' ? (
            <>
              <div className="login-step-head">
                <div className="login-step-title">Reset your password</div>
                <div className="login-step-hint">We&rsquo;ll email you a code to confirm it&rsquo;s you.</div>
              </div>
              <div className="login-field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required autoFocus />
              </div>
              {error && <div className="login-error">{error}</div>}
              {message && <div className="login-success">{message}</div>}
              <button type="submit" className="login-btn" disabled={loading || !email}>
                {loading ? '...' : 'Send code'}
              </button>
              <div className="login-toggle" style={{ marginTop: '12px' }}>
                <span onClick={backToSignIn}>← Back to sign in</span>
              </div>
            </>
          ) : step === 'recover-otp' ? (
            <>
              <div className="login-step-head">
                <div className="login-step-title">Enter the code</div>
                <div className="login-step-hint">Sent to {email}</div>
              </div>
              <div className="login-field">
                <label>Reset Code</label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Code from the email"
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: '20px' }}
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              {message && <div className="login-success">{message}</div>}
              <button type="submit" className="login-btn" disabled={loading || otpCode.length < 6}>
                {loading ? '...' : 'Verify'}
              </button>
              <div className="login-toggle" style={{ marginTop: '12px' }}>
                <span onClick={resendResetCode}>Resend code</span>
                {' · '}
                <span onClick={backToSignIn}>Back to sign in</span>
              </div>
            </>
          ) : step === 'new-password' ? (
            <>
              <div className="login-step-head">
                <div className="login-step-title">Choose a new password</div>
                <div className="login-step-hint">At least 6 characters.</div>
              </div>
              <div className="login-field">
                <label>New Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoFocus />
              </div>
              <div className="login-field">
                <label>Confirm New Password</label>
                <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              {error && <div className="login-error">{error}</div>}
              {message && <div className="login-success">{message}</div>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? '...' : 'Save password'}
              </button>
            </>
          ) : step === 'confirm' ? (
            <>
              <div className="login-confirm">
                <div className="login-confirm-icon">&#9993;</div>
                <div className="login-step-title">Confirm your email</div>
                <div className="login-step-hint">
                  We sent a confirmation link to <b>{email}</b>. Open it, and this
                  window will sign you in on its own &mdash; nothing else to type.
                </div>
                <div className="login-confirm-waiting">
                  <span className="login-confirm-dot" />
                  Waiting for confirmation&hellip;
                </div>
              </div>
              {error && <div className="login-error">{error}</div>}
              {message && <div className="login-success">{message}</div>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? '...' : "I've confirmed — continue"}
              </button>
              <div className="login-toggle" style={{marginTop:'12px'}}>
                <span onClick={resendConfirmation}>Send it again</span>
                {' · '}
                <span onClick={backToSignIn}>Back to sign in</span>
              </div>
            </>
          ) : (
            <>
              {isQuick && (
                <div className="login-step-head">
                  <div className="login-step-title">Quick account</div>
                  <div className="login-step-hint">No confirmation email &mdash; you&rsquo;re in right away, and you sign in later with your username.</div>
                </div>
              )}
              {!isRegister && !isQuick && saved.length > 0 && (
                <div className="login-saved">
                  <div className="login-saved-label">Continue as</div>
                  {saved.map(a => {
                    const name = a.username || (a.email || '').split('@')[0] || 'Account';
                    return (
                      <button
                        type="button"
                        key={a.id}
                        className="login-saved-row"
                        disabled={loading}
                        onClick={() => resumeAccount(a)}
                      >
                        <span className="login-saved-avatar" style={{ background: avatarColor(a, name) }}>
                          {initials(name)}
                        </span>
                        <span className="login-saved-text">
                          <span className="login-saved-name">{name}</span>
                          <span className="login-saved-mail">{accountSubtitle(a.email, a.contactEmail)}</span>
                        </span>
                      </button>
                    );
                  })}
                  <div className="login-saved-sep"><span>or sign in</span></div>
                </div>
              )}
              {(isRegister || isQuick) && (
                <div className="login-field">
                  <label>Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={isQuick ? 'You sign in with this' : 'How your name appears in the app'}
                    required
                    maxLength={24}
                    autoFocus
                    autoComplete="username"
                  />
                </div>
              )}
              <div className="login-field">
                <label>{isRegister || isQuick ? 'Email' : 'Email or username'}</label>
                <input
                  type={isRegister || isQuick ? 'email' : 'text'}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={isRegister || isQuick ? 'email@example.com' : 'email or username'}
                  required
                  autoFocus={!isRegister && !isQuick}
                  autoComplete={isRegister || isQuick ? 'email' : 'username'}
                />
              </div>
              <div className="login-field">
                <div className="login-label-row">
                  <label>Password</label>
                  {!isRegister && !isQuick && (
                    <button
                      type="button"
                      className="login-link-btn"
                      onClick={() => { setStep('forgot'); setError(''); setMessage(''); }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              {(isRegister || isQuick) && (
                <div className="login-field">
                  <label>Confirm Password</label>
                  <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>
              )}
              {error && <div className="login-error">{error}</div>}
              {message && <div className="login-success">{message}</div>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? '...' : isQuick ? 'Create account' : isRegister ? 'Sign Up' : 'Sign In'}
              </button>
              <div className="login-toggle">
                {isRegister || isQuick ? (
                  <>Already have an account? <span onClick={() => switchMode(false)}>Sign In</span></>
                ) : (
                  <>Don't have an account? <span onClick={() => switchMode(true)}>Sign Up</span>
                    {' · '}<span onClick={() => switchMode(false, true)}>Quick account</span></>
                )}
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
