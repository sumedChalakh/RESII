import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';
import { loginDemo, fetchSession } from '../store/authSlice';
import { Sparkles, ArrowRight, Lock } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  const handleDemoLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await dispatch(loginDemo()).unwrap();
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: password || 'demo123' })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Invalid email or password');
      }
      await dispatch(fetchSession()).unwrap();
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: 24
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sheet)',
        padding: '36px 32px'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 44,
            height: 44,
            background: 'var(--color-primary)',
            borderRadius: 'var(--radius-md)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            fontSize: 20,
            fontWeight: 800
          }}>
            R
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', color: 'var(--color-ink)' }}>
            Welcome to RESII
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)' }}>
            AI-powered resume tailoring, ATS scanner & auto-apply
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--color-danger-bg)',
            color: 'var(--color-danger)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            marginBottom: 20
          }}>
            {error}
          </div>
        )}

        {/* 1-Click Demo Login Highlight */}
        <button
          onClick={handleDemoLogin}
          disabled={loading}
          style={{
            width: '100%',
            background: 'var(--color-primary)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '13px 18px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: 'var(--shadow-sm)',
            transition: 'background 150ms ease'
          }}
        >
          <Sparkles size={18} color="var(--color-lavender)" />
          <span>1-Click Instant Demo Login</span>
          <ArrowRight size={16} />
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          margin: '22px 0',
          gap: 12
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          <span style={{ fontSize: 12, color: 'var(--color-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>or email</span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--color-ink)' }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="demo@resii.com"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-elevated)',
                fontSize: 14,
                color: 'var(--color-ink)'
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--color-ink)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="demo123"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-elevated)',
                fontSize: 14,
                color: 'var(--color-ink)'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: 'var(--color-surface-card)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '11px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Sign in with email
          </button>
        </form>

        {/* Public Funnel Check Link */}
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: 'var(--color-muted)' }}>
          Want to test your resume first?{' '}
          <Link to="/check/demo" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
            Run free ATS check →
          </Link>
        </div>
      </div>
    </div>
  );
};
export default LoginPage;
