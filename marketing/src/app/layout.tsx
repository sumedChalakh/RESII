import './globals.css';
import React from 'react';

export const metadata = {
  title: 'RESII — AI-Powered Career & Resume Platform',
  description: 'ATS resume checking, interactive editing, job-specific tailoring, and auto-apply.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
