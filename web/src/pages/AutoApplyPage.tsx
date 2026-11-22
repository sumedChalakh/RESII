import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { addXp } from '../store/seasonSlice';
import { 
  Zap, 
  Play, 
  Pause, 
  ShieldCheck, 
  History, 
  Settings, 
  Save, 
  Sparkles, 
  Building2, 
  Send 
} from 'lucide-react';

interface SubmissionItem {
  id: string;
  company: string;
  role: string;
  submitted_at: string;
  match_percentage: number;
  tailored_resume: string;
  status: string;
  form_provider: string;
}

export const AutoApplyPage: React.FC = () => {
  const dispatch = useDispatch();

  const [isRunning, setIsRunning] = useState(true);
  const [minSalary, setMinSalary] = useState(170000);
  const [minMatchThreshold, setMinMatchThreshold] = useState(85);
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Facts store
  const [workAuth, setWorkAuth] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [highestEdu, setHighestEdu] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('');
  const [savingFacts, setSavingFacts] = useState(false);

  // Submissions history
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [triggering, setTriggering] = useState(false);

  // Load preferences, facts, and history from backend
  useEffect(() => {
    // Preferences
    fetch('/api/auto-apply/preferences')
      .then((res) => res.json())
      .then((data) => {
        setIsRunning(data.enabled ?? true);
        setMinSalary(data.min_salary ?? 170000);
        setMinMatchThreshold(data.min_match_threshold ?? 85);
        setRemoteOnly(data.remote_only ?? true);
        setDailyLimit(data.daily_submission_limit ?? 10);
      })
      .catch(console.error);

    // Facts
    fetch('/api/auto-apply/facts')
      .then((res) => res.json())
      .then((data) => {
        if (data.facts) {
          setWorkAuth(data.facts.work_authorization || '');
          setYearsExp(data.facts.years_of_experience || '');
          setHighestEdu(data.facts.highest_education || '');
          setNoticePeriod(data.facts.notice_period || '');
        }
      })
      .catch(console.error);

    // History
    fetch('/api/auto-apply/history')
      .then((res) => res.json())
      .then((data) => {
        setSubmissions(data.submissions || []);
      })
      .catch(console.error);
  }, []);

  const handleToggleRunning = async () => {
    const nextState = !isRunning;
    setIsRunning(nextState);
    try {
      await fetch('/api/auto-apply/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPreferences(true);
    try {
      await fetch('/api/auto-apply/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          min_salary: minSalary,
          min_match_threshold: minMatchThreshold,
          remote_only: remoteOnly,
          daily_submission_limit: dailyLimit
        })
      });
      dispatch(addXp({ amount: 20, reason: 'Updated Auto-Apply Filter Criteria' }));
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSaveFacts = async () => {
    setSavingFacts(true);
    try {
      await fetch('/api/auto-apply/facts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facts: {
            work_authorization: workAuth,
            years_of_experience: yearsExp,
            highest_education: highestEdu,
            notice_period: noticePeriod
          }
        })
      });
      dispatch(addXp({ amount: 25, reason: 'Updated Screening Questions Fact Vault' }));
    } catch (e) {
      console.error(e);
    } finally {
      setSavingFacts(false);
    }
  };

  const handleTriggerCycle = async () => {
    setTriggering(true);
    try {
      const res = await fetch('/api/auto-apply/trigger', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || 'Fact vault synchronized with RESII Extension Assistant.');
        dispatch(addXp({ amount: 20, reason: 'Synchronized Candidate Fact Vault' }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Top Banner with Control Switch */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 20,
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 'var(--radius-md)',
            background: isRunning ? 'var(--color-primary)' : 'var(--color-surface-elevated)',
            color: isRunning ? '#ffffff' : 'var(--color-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}>
            <Zap size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Application Assistant & Fact Vault</h1>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                background: isRunning ? 'var(--color-success-bg)' : 'var(--color-surface-elevated)',
                color: isRunning ? 'var(--color-success)' : 'var(--color-muted)'
              }}>
                {isRunning ? '● ASSISTANT ACTIVE' : '○ PAUSED'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-muted)' }}>
              Powers the RESII Extension Assistant to autofill verified facts on Greenhouse, Lever, Workday, and LinkedIn while keeping you in complete submission control.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleTriggerCycle}
            disabled={triggering}
            style={{
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: triggering ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Sparkles size={16} />
            <span>{triggering ? 'Syncing Vault…' : 'Sync Fact Vault'}</span>
          </button>

          <button
            onClick={handleToggleRunning}
            style={{
              background: isRunning ? 'var(--color-surface-elevated)' : 'var(--color-primary)',
              color: isRunning ? 'var(--color-text)' : '#ffffff',
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
            {isRunning ? <Pause size={16} /> : <Play size={16} />}
            <span>{isRunning ? 'Pause Engine' : 'Resume Auto-Apply'}</span>
          </button>
        </div>
      </div>

      {/* Two Column Grid: Screening Answers (Facts Store) & Execution Logs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 24 }}>
        {/* Screening Question Facts Store */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} color="var(--color-primary)" />
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Candidate Facts & Criteria Vault</h2>
            </div>
            <button
              onClick={handleSaveFacts}
              disabled={savingFacts}
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Save size={14} />
              <span>{savingFacts ? 'Saving…' : 'Save Facts'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Work Authorization</label>
              <input
                type="text"
                value={workAuth}
                onChange={(e) => setWorkAuth(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Years of Professional Experience</label>
              <input
                type="text"
                value={yearsExp}
                onChange={(e) => setYearsExp(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Highest Education Degree & Institution</label>
              <input
                type="text"
                value={highestEdu}
                onChange={(e) => setHighestEdu(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Notice Period / Availability</label>
              <input
                type="text"
                value={noticePeriod}
                onChange={(e) => setNoticePeriod(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Min Salary ($)</label>
                <input
                  type="number"
                  value={minSalary}
                  onChange={(e) => setMinSalary(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Min ATS Match (%)</label>
                <input
                  type="number"
                  value={minMatchThreshold}
                  onChange={(e) => setMinMatchThreshold(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Execution Logs */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={18} color="var(--color-primary)" />
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Autonomous Submission Log</h2>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{submissions.length} Total</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 440, overflowY: 'auto' }}>
            {submissions.map((sub) => (
              <div
                key={sub.id}
                style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>{sub.company}</span>
                  <span style={{
                    fontSize: 11,
                    color: 'var(--color-success)',
                    background: 'var(--color-success-bg)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700
                  }}>
                    ✓ {sub.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{sub.role}</div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                  {sub.tailored_resume} • via {sub.form_provider}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{sub.match_percentage}% ATS Match</span>
                  <span>{new Date(sub.submitted_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
export default AutoApplyPage;
