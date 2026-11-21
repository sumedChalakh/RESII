import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { logoutUser } from '../store/authSlice';
import { 
  FileText, 
  Sparkles, 
  Briefcase, 
  Zap, 
  Trophy, 
  LogOut, 
  User, 
  CreditCard 
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { level, xp } = useSelector((state: RootState) => state.season);

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: FileText },
    { to: '/tailor', label: 'Tailor', icon: Sparkles },
    { to: '/jobs', label: 'Jobs Feed', icon: Briefcase },
    { to: '/auto-apply', label: 'Auto-Apply', icon: Zap },
    { to: '/season', label: 'Season', icon: Trophy },
  ];

  const handleLogout = () => {
    dispatch(logoutUser());
  };

  return (
    <header style={{
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 24px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Brand */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            background: 'var(--color-primary)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: '0.05em'
          }}>
            R
          </div>
          <span style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'var(--color-ink)'
          }}>
            RESII
          </span>
        </Link>

        {/* Center Nav Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {navLinks.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 14,
                  fontWeight: 500,
                  color: isActive ? 'var(--color-primary)' : 'var(--color-muted)',
                  background: isActive ? 'var(--color-primary-light)' : 'transparent',
                  transition: 'all 150ms ease'
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Right Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Season Level Badge */}
          <Link to="/season" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-full)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-primary-dark)'
          }}>
            <span>Lvl {level}</span>
            <div style={{
              width: 40,
              height: 4,
              background: 'var(--color-border)',
              borderRadius: 2,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.min(100, (xp % 200) / 2)}%`,
                height: '100%',
                background: 'var(--color-primary)'
              }} />
            </div>
            <span>{xp} XP</span>
          </Link>

          {/* Account Profile Link */}
          <Link
            to="/account"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-ink)'
            }}
          >
            <div style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--color-accent-light)',
              color: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 600
            }}>
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <span>{user?.name || user?.email?.split('@')[0] || 'User'}</span>
          </Link>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              background: 'none',
              border: 'none',
              padding: 6,
              cursor: 'pointer',
              color: 'var(--color-muted)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
