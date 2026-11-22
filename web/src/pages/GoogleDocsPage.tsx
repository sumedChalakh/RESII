import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, FileText, Download, AlertCircle } from 'lucide-react';

interface GoogleDocsStatus {
  resume_id: string;
  connected: boolean;
  status: string;
  message: string;
  google_doc_id?: string | null;
  google_doc_url?: string | null;
  last_synced_at?: string | null;
  download_docx_url?: string;
  download_pdf_url?: string;
}

export const GoogleDocsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [docStatus, setDocStatus] = useState<GoogleDocsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchStatus = () => {
    setLoading(true);
    fetch(`/api/v3/resumes/${id || 'primary'}/google-docs`)
      .then((res) => res.json())
      .then((data) => {
        setDocStatus(data);
      })
      .catch((err) => {
        setErrorMsg('Failed to fetch Google Docs integration status.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStatus();
  }, [id]);

  const handleSync = async () => {
    setSyncing(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v3/resumes/${id || 'primary'}/google-docs`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'Google Docs synchronization is unconfigured.');
      } else {
        fetchStatus();
      }
    } catch (e: any) {
      setErrorMsg('Failed to synchronize with Google Docs.');
    } finally {
      setSyncing(false);
    }
  };

  const isConnected = docStatus?.connected === true;
  const isUnconfigured = docStatus?.status === 'unconfigured';

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link to="/" style={{ color: 'var(--color-muted)' }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Google Docs Integration</h1>
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
            background: isConnected ? 'var(--color-primary-light)' : 'var(--color-surface-elevated)',
            color: isConnected ? 'var(--color-primary)' : 'var(--color-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ExternalLink size={22} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {isConnected ? 'Resume Connected to Google Docs' : 'Google Docs Live Sync (Setup Required)'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              {docStatus?.message || 'Direct 2-way synchronization with Google Docs.'}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div style={{
            background: '#fee2e2',
            color: '#b91c1c',
            border: '1px solid #fca5a5',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {isConnected && docStatus?.google_doc_url ? (
            <a
              href={docStatus.google_doc_url}
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
          ) : (
            <>
              <a
                href={`/api/v3/resumes/${id || 'primary'}/export/docx`}
                download
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textDecoration: 'none'
                }}
              >
                <Download size={16} />
                <span>Download DOCX for Google Docs</span>
              </a>

              <a
                href={`/api/v3/resumes/${id || 'primary'}/export/pdf`}
                download
                style={{
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-ink)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textDecoration: 'none'
                }}
              >
                <FileText size={16} />
                <span>Download PDF</span>
              </a>
            </>
          )}

          <button
            onClick={handleSync}
            disabled={syncing || isUnconfigured}
            style={{
              background: 'var(--color-surface-card)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: isUnconfigured ? 'not-allowed' : 'pointer',
              opacity: isUnconfigured ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Checking Sync…' : 'Sync Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default GoogleDocsPage;
