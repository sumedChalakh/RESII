import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { BadgeToast } from './BadgeToast';

export const AppLayout: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1, padding: '28px 24px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </main>
      <BadgeToast />
    </div>
  );
};
