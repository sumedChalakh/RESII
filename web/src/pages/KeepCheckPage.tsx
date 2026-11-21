import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { loginDemo } from '../store/authSlice';
import { addXp } from '../store/seasonSlice';
import { Check, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';

export const KeepCheckPage: React.FC = () => {
  const { checkId } = useParams<{ checkId: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);

  const handleClaimResume = async () => {
    setLoading(true);
    try {
      await (dispatch as any)(loginDemo()).unwrap();
      dispatch(addXp({ amount: 100, reason: 'Saved ATS Check to Account' }));
      navigate('/edit/primary');
    } catch {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: 540,
      margin: '60px auto',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: '40px 32px',
      boxShadow: 'var(--shadow-sheet)',
      textAlign: 'center'
    }}>
      <div style={{
        width: 52,
        height: 52,
        borderRadius: '50%',
        background: 'var(--color-primary-light)',
        color: 'var(--color-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px'
      }}>
        <Sparkles size={24} />
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 10px', color: 'var(--color-ink)' }}>
        Keeping Your Résumé
      </h1>
      <p style={{ fontSize: 14, color: 'var(--color-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
        We parsed your resume into an editable document tree. Your 7 ATS fixes and rewritten bullet points have been staged and are ready to apply.
      </p>

      {/* Benefits Checklist */}
      <div style={{
        textAlign: 'left',
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
        marginBottom: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--color-ink)' }}>
          <Check size={16} color="var(--color-success)" />
          <span>7 ATS rewrites pre-loaded in Tree Editor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--color-ink)' }}>
          <Check size={16} color="var(--color-success)" />
          <span>Interactive drag-and-drop block reordering</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--color-ink)' }}>
          <Check size={16} color="var(--color-success)" />
          <span>Export to PDF, Word & two-way Google Docs sync</span>
        </div>
      </div>

      <button
        onClick={handleClaimResume}
        disabled={loading}
        style={{
          width: '100%',
          background: 'var(--color-primary)',
          color: '#ffffff',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: '13px 20px',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10
        }}
      >
        <span>Claim & Open in Tree Editor</span>
        <ArrowRight size={16} />
      </button>
    </div>
  );
};
export default KeepCheckPage;
