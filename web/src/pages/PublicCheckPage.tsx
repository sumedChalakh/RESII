import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Upload, CheckCircle2, AlertTriangle, ArrowRight, Sparkles, FileText } from 'lucide-react';

export const PublicCheckPage: React.FC = () => {
  const { checkId } = useParams<{ checkId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/public/checks/${checkId || 'demo'}`)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [checkId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <Sparkles size={32} color="var(--color-primary)" style={{ animation: 'spin 2s linear infinite' }} />
        <h2 style={{ fontSize: 18, marginTop: 16 }}>Scanning resume against modern ATS algorithms…</h2>
      </div>
    );
  }

  const check = data || {
    id: checkId,
    ats_score: 78,
    target_score: 95,
    filename: 'Sample_Resume.pdf',
    headline: 'Strong engineering foundation, but missing quantitative impact & ATS keywords.',
    findings: [],
    suggested_rewrites: []
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Header Banner */}
      <div style={{
        background: 'var(--color-primary-dark)',
        color: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        padding: '32px 36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 24,
        boxShadow: 'var(--shadow-sheet)'
      }}>
        <div style={{ maxWidth: 520 }}>
          <div style={{
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-lavender)',
            fontWeight: 700,
            marginBottom: 8
          }}>
            RESII Free ATS Check
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 10px' }}>
            {check.headline}
          </h1>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.85, lineHeight: 1.5 }}>
            Scanned file: <strong>{check.filename}</strong>. Fix the items below to reach the 90+ interview threshold.
          </p>
        </div>

        {/* Big Score Card */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 28px',
          textAlign: 'center',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{ fontSize: 44, fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>
            {check.ats_score}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-lavender)', marginTop: 4 }}>
            ATS SCORE (Target: {check.target_score}+)
          </div>
        </div>
      </div>

      {/* Suggested Rewrites & Findings */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20
      }}>
        {check.findings?.map((f: any, idx: number) => (
          <div
            key={idx}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 20
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-ink)' }}>
                {f.category}
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: f.status === 'pass' ? 'var(--color-success)' : 'var(--color-warn)'
              }}>
                {f.score}/100
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5 }}>
              {f.message}
            </p>
          </div>
        ))}
      </div>

      {/* Rewrites Section */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 28
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>
          Suggested AI Rewrites for Your Bullet Points
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {check.suggested_rewrites?.map((r: any, idx: number) => (
            <div
              key={idx}
              style={{
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
                background: 'var(--color-surface-elevated)'
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 4 }}>
                ORIGINAL LINE:
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-danger)', marginBottom: 12, textDecoration: 'line-through' }}>
                {r.original}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)', marginBottom: 4 }}>
                RESII ATS REWRITE:
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
                {r.improved}
              </div>
            </div>
          ))}
        </div>

        {/* CTA Bridge to Keep */}
        <div style={{
          marginTop: 24,
          paddingTop: 20,
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
              Keep this check and apply all fixes instantly?
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              Converts to your editable primary resume with one click.
            </div>
          </div>
          <Link
            to={`/check/${check.id}/keep`}
            style={{
              background: 'var(--color-primary)',
              color: '#ffffff',
              borderRadius: 'var(--radius-md)',
              padding: '12px 22px',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <span>Save & Apply Fixes</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
};
export default PublicCheckPage;
