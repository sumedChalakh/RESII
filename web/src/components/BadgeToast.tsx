import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { clearToast } from '../store/seasonSlice';
import { Sparkles, X } from 'lucide-react';

export const BadgeToast: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const recentToast = useSelector((state: RootState) => state.season.recentToast);

  useEffect(() => {
    if (!recentToast) return;
    const timer = setTimeout(() => {
      dispatch(clearToast());
    }, 4000);
    return () => clearTimeout(timer);
  }, [recentToast, dispatch]);

  if (!recentToast) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 1000,
      background: 'var(--color-primary-dark)',
      color: '#ffffff',
      padding: '12px 18px',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      animation: 'slideUp 200ms ease-out'
    }}>
      <Sparkles size={18} color="var(--color-lavender)" />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{recentToast}</span>
      <button
        onClick={() => dispatch(clearToast())}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.7)',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
};
