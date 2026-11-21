import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';

export const GoogleDocsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(true);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setSynced(true);
    }, 800);
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link to="/" style={{ color: 'var(--color-muted)' }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Google Docs Live Handoff</h1>
      </div>

      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ExternalLink size={22} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Resume Connected to Google Docs</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              Edits made in Google Docs or RESII can be synchronized with one click.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a
            href="https://docs.google.com"
            target="_blank"
            rel="noreferrer"
            style={{
              background: 'var(--color-primary)',
              color: '#fff',
              borderRadius: 'var(--radius-md)',
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span>Open in Google Docs</span>
            <ExternalLink size={16} />
          </a>

          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              background: 'var(--color-surface-card)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Syncing Docs…' : 'Sync Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default GoogleDocsPage;
