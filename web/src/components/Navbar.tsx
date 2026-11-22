import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { logoutUser } from '../store/authSlice';
import { ChevronDown, User, LogOut, Trophy, CreditCard } from 'lucide-react';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const navLinks = [
    { to: '/', label: 'Dashboard' },
    { to: '/jobs', label: 'Jobs' },
    { to: '/tailor', label: 'Tailor' },
    { to: '/auto-apply', label: 'Auto apply' },
  ];

  const handleLogout = () => {
    dispatch(logoutUser());
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userName = user?.name || 'Sumed Chalakh';
  const initial = userName.trim()[0]?.toUpperCase() || 'S';

  return (
    <header style={{
      borderBottom: '1px solid #ebe6dd',
      background: '#faf8f5',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 24px',
        height: 58,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Brand: 3 green bars + RESII */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5, width: 22, justifyContent: 'center' }}>
            <div style={{ height: 3.5, background: '#0f9f6e', borderRadius: 2 }} />
            <div style={{ height: 3.5, background: '#0f9f6e', borderRadius: 2 }} />
            <div style={{ height: 3.5, background: '#0f9f6e', borderRadius: 2 }} />
          </div>
          <span style={{
            fontSize: 21,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: '#111827',
            lineHeight: 1
          }}>
            RESII
          </span>
        </Link>

        {/* Center Navigation Pills */}
        <nav style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'transparent',
          padding: 2
        }}>
          {navLinks.map(({ to, label }) => {
            const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#18191a' : '#65615a',
                  background: isActive ? '#eae6df' : 'transparent',
                  transition: 'all 120ms ease',
                  textDecoration: 'none'
                }}
              >
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Right Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }} ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 8
            }}
          >
            {/* Teal initial avatar */}
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#0d9488',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700
            }}>
              {initial}
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#18191a' }}>
              {userName}
            </span>
            <ChevronDown size={15} color="#65615a" />
          </button>

          {/* Profile Dropdown */}
          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 6,
              background: '#ffffff',
              border: '1px solid #e2ddd3',
              borderRadius: 10,
              boxShadow: '0 10px 24px -4px rgba(0, 0, 0, 0.1)',
              minWidth: 190,
              zIndex: 200,
              overflow: 'hidden',
              padding: '6px 0'
            }}>
              <Link
                to="/account"
                onClick={() => setDropdownOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#18191a',
                  textDecoration: 'none'
                }}
              >
                <User size={15} color="#65615a" />
                <span>Account Profile</span>
              </Link>
              <Link
                to="/season"
                onClick={() => setDropdownOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#18191a',
                  textDecoration: 'none'
                }}
              >
                <Trophy size={15} color="#65615a" />
                <span>Season Tracker</span>
              </Link>
              <Link
                to="/billing"
                onClick={() => setDropdownOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#18191a',
                  textDecoration: 'none'
                }}
              >
                <CreditCard size={15} color="#65615a" />
                <span>Subscription & Quotas</span>
              </Link>
              <div style={{ height: 1, background: '#eeeae2', margin: '4px 0' }} />
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  handleLogout();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#b91c1c',
                  background: 'none',
                  border: 'none',
                  width: '100%',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <LogOut size={15} color="#b91c1c" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
