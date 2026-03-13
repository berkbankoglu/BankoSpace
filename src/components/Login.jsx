import { useState } from 'react';
import { supabase } from '../supabase';
import './Login.css';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
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

          {error && <div className="login-error">{error}</div>}
          {message && <div className="login-success">{message}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? '...' : isRegister ? 'Kayıt Ol' : 'Giriş Yap'}
          </button>
        </form>

        <div className="login-toggle">
          {isRegister ? (
            <>Zaten hesabın var mı? <span onClick={() => { setIsRegister(false); setError(''); setMessage(''); }}>Giriş Yap</span></>
          ) : (
            <>Hesabın yok mu? <span onClick={() => { setIsRegister(true); setError(''); setMessage(''); }}>Kayıt Ol</span></>
          )}
        </div>
      </div>
    </div>
  );
}
