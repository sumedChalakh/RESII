import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <h1 style={{ fontSize: 44, fontWeight: 800, margin: '0 0 10px', color: 'var(--color-primary)' }}>404</h1>
      <p style={{ fontSize: 16, color: 'var(--color-muted)', margin: '0 0 24px' }}>
        The page you are looking for does not exist on RESII.
      </p>
      <Link
        to="/"
        style={{
          background: 'var(--color-primary)',
          color: '#ffffff',
          borderRadius: 'var(--radius-md)',
          padding: '10px 20px',
          fontWeight: 600,
          fontSize: 14
        }}
      >
        Return to Dashboard
      </Link>
    </div>
  );
};
export default NotFoundPage;
