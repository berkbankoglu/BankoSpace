import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import './Login.css';

export default function Login({ onLogin, onGuest }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Deep link callback'ini dinle
  useEffect(() => {
    let unlisten;
    import('@tauri-apps/plugin-deep-link').then(({ onOpenUrl }) => {
      onOpenUrl(async (urls) => {
        const url = Array.isArray(urls) ? urls[0] : urls;
        if (!url) return;
        const hashOrQuery = url.includes('#') ? url.split('#')[1] : url.split('?')[1];
        if (!hashOrQuery) return;
        const params = new URLSearchParams(hashOrQuery);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          if (!error && data.session) {
            onLogin(data.session);
          }
        }
      }).then(fn => { unlisten = fn; });
    }).catch(() => {});

    return () => { if (unlisten) unlisten(); };
  }, [onLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (isRegister && password !== passwordConfirm) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Kayıt başarılı! Email adresinizi doğrulayın.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onLogin(data.session);
      }
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'bankospace://auth/callback',
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data?.url) {
        throw new Error('Google OAuth URL alınamadı. Supabase\'de Google provider aktif mi?');
      }
      // Tauri shell plugin ile aç
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(data.url);
      setMessage('Tarayıcıda Google sayfası açıldı. Giriş yaptıktan sonra uygulamaya otomatik dönülecek.');
    } catch (err) {
      console.error('Google login error:', err);
      setError(err.message || 'Google ile giriş başarısız');
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
        <div className="login-subtitle">Kişisel çalışma alanınız</div>

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
            <label>Şifre</label>
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
              <label>Şifre Tekrar</label>
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
            {loading ? '...' : isRegister ? 'Kayıt Ol' : 'Giriş Yap'}
          </button>
        </form>

        <div className="login-toggle">
          {isRegister ? (
            <>Zaten hesabın var mı? <span onClick={() => switchMode(false)}>Giriş Yap</span></>
          ) : (
            <>Hesabın yok mu? <span onClick={() => switchMode(true)}>Kayıt Ol</span></>
          )}
        </div>

        <div className="login-divider"><span>veya</span></div>

        <button className="login-google-btn" onClick={handleGoogleLogin} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Google ile Giriş Yap
        </button>

        <div className="login-divider"><span>veya</span></div>

        <button className="login-guest-btn" onClick={onGuest}>
          Giriş yapmadan devam et
        </button>
      </div>
    </div>
  );
}
