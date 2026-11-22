import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { addXp } from '../store/seasonSlice';
import { User, Chrome, HardDrive, Download, Trash2, CheckCircle2, Save, Mail, Bell, Cpu, AlertCircle, RefreshCw, Sliders } from 'lucide-react';

export const AccountPage: React.FC = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);

  const [name, setName] = useState(user?.name || 'Alex Rivera');
  const [title, setTitle] = useState('Senior Full-Stack Engineer');
  const [location, setLocation] = useState('San Francisco, CA');
  const [bio, setBio] = useState('Specializing in high-throughput distributed architectures, React 18, and Vite.');
  const [driveConnected, setDriveConnected] = useState(true);
  const [googleEmail, setGoogleEmail] = useState<string | null>('alex.rivera.work@gmail.com');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);

  // AI Provider State
  const [aiProvider, setAiProvider] = useState('mock');
  const [aiModel, setAiModel] = useState('mock-grounded-v1');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ status: string; message: string; latency_ms?: number } | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSavedSuccess, setAiSavedSuccess] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/account/profile')
      .then((res) => res.json())
      .then((data) => {
        if (data.name) setName(data.name);
        if (data.title) setTitle(data.title);
        if (data.location) setLocation(data.location);
        if (data.bio) setBio(data.bio);
      })
      .catch(console.error);

    fetch('/api/account/preferences')
      .then((res) => res.json())
      .then((data) => {
        if (data.email_job_alerts !== undefined) setEmailAlerts(data.email_job_alerts);
        if (data.email_weekly_digest !== undefined) setWeeklyDigest(data.email_weekly_digest);
      })
      .catch(console.error);

    fetch('/api/account/google-drive/status')
      .then((res) => res.json())
      .then((data) => {
        setDriveConnected(data.connected);
        setGoogleEmail(data.email);
      })
      .catch(console.error);

    // Fetch AI Provider Configuration
    fetch('/api/v3/tailor/providers/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.provider) setAiProvider(data.provider);
        if (data.model) setAiModel(data.model);
        if (data.base_url) setAiBaseUrl(data.base_url);
      })
      .catch(console.error);
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, title, location, bio })
      });

      await fetch('/api/account/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_job_alerts: emailAlerts, email_weekly_digest: weeklyDigest })
      });

      setSavedSuccess(true);
      dispatch(addXp({ amount: 15, reason: 'Updated Profile Information' }));
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDrive = async () => {
    try {
      if (driveConnected) {
        await fetch('/api/account/google-drive/disconnect', { method: 'POST' });
        setDriveConnected(false);
        setGoogleEmail(null);
      } else {
        const res = await fetch('/api/account/google-drive/connect', { method: 'POST' });
        const data = await res.json();
        setDriveConnected(true);
        setGoogleEmail(data.email);
        dispatch(addXp({ amount: 30, reason: 'Connected Google Drive Sync' }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiSaving(true);
    try {
      await fetch('/api/v3/tailor/providers/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel,
          base_url: aiBaseUrl || undefined,
          api_key: aiApiKey || undefined
        })
      });
      setAiSavedSuccess(true);
      setTimeout(() => setAiSavedSuccess(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setAiSaving(false);
    }
  };

  const handleTestAiProvider = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await fetch('/api/v3/tailor/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel,
          base_url: aiBaseUrl || undefined,
          api_key: aiApiKey || undefined
        })
      });
      const data = await res.json();
      setAiTestResult({
        status: data.status,
        message: data.message || `Connected to ${data.provider} (${data.model})`,
        latency_ms: data.latency_ms
      });
    } catch (e: any) {
      setAiTestResult({
        status: 'error',
        message: e?.message || 'Connection test failed'
      });
    } finally {
      setAiTesting(false);
    }
  };

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>Account & Integrations</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)' }}>
          Manage your career profile, Google Cloud storage connections, and job notification channels.
        </p>
      </div>

      {/* Profile Form */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={18} color="var(--color-primary)" />
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Candidate Profile Details</h2>
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Sign-in Email (Read-only)</label>
              <input
                type="email"
                disabled
                value={user?.email || 'demo@resii.com'}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-muted)', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Target Professional Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Executive Bio / Summary</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)', color: 'var(--color-text)', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                alignSelf: 'flex-start',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '9px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Save size={14} />
              <span>{saving ? 'Saving…' : 'Save Profile'}</span>
            </button>

            {savedSuccess && (
              <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={16} /> Saved!
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Connected Cloud Integrations */}
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
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Connected Integrations & Cloud Sync</h2>

        {/* Google Drive */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-elevated)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <HardDrive size={22} color="var(--color-primary)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Google Drive Sync</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {driveConnected ? `Connected as ${googleEmail}` : 'Import resumes directly from Drive and sync two-way edits'}
              </div>
            </div>
          </div>
          <button
            onClick={handleToggleDrive}
            style={{
              background: driveConnected ? 'var(--color-surface)' : 'var(--color-primary)',
              color: driveConnected ? 'var(--color-text)' : '#fff',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {driveConnected ? 'Disconnect' : 'Connect Google Drive'}
          </button>
        </div>

        {/* Chrome Extension */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-elevated)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Chrome size={22} color="var(--color-accent)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>RESII Autofill Chrome Extension</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                1-click instant autofill on LinkedIn, Greenhouse, Lever, and Workday forms
              </div>
            </div>
          </div>
          <button
            onClick={() => alert('Opening Chrome Web Store listing for RESII Extension')}
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Installed (v1.2.0)
          </button>
        </div>
      </div>

      {/* AI Tailoring Provider & Inference Configuration */}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Cpu size={22} color="var(--color-primary)" />
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>AI Inference Engine & Provider Settings</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-muted)' }}>
                Configure local or cloud LLM inference for evidence-grounded resume tailoring and match evaluation.
              </p>
            </div>
          </div>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-primary)',
            border: '1px solid var(--color-border)'
          }}>
            Zero Fabrication Invariant
          </span>
        </div>

        <form onSubmit={handleSaveAiConfig} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Provider Adapter</label>
              <select
                value={aiProvider}
                onChange={(e) => {
                  const val = e.target.value;
                  setAiProvider(val);
                  if (val === 'mock') setAiModel('mock-grounded-v1');
                  else if (val === 'openrouter') { setAiModel('deepseek/deepseek-r1:free'); setAiBaseUrl('https://openrouter.ai/api/v1'); }
                  else if (val === 'huggingface') { setAiModel('meta-llama/Llama-3.2-3B-Instruct'); setAiBaseUrl('https://api-inference.huggingface.co/models'); }
                  else if (val === 'ollama') setAiModel('llama3.2');
                  else if (val === 'freeflow') setAiModel('deepseek-r1-distill-qwen-14b');
                  else if (val === 'gemini') setAiModel('gemini-1.5-flash');
                  else if (val === 'openai') setAiModel('gpt-4o-mini');
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  boxSizing: 'border-box'
                }}
              >
                <option value="openrouter">OpenRouter (deepseek/deepseek-r1:free)</option>
                <option value="huggingface">Hugging Face Inference API</option>
                <option value="mock">Deterministic Mock AI (Grounded Offline)</option>
                <option value="ollama">Local Ollama (http://127.0.0.1:11434)</option>
                <option value="freeflow">FreeFlow AI Gateway (http://127.0.0.1:8000/v1)</option>
                <option value="gemini">Google Gemini API (Official SDK)</option>
                <option value="openai">Hosted OpenAI-Compatible Endpoint</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Model Identifier</label>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="e.g. mock-grounded-v1, llama3.2, gemini-1.5-flash"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Custom Base URL (Optional)</label>
              <input
                type="text"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder={aiProvider === 'ollama' ? 'http://127.0.0.1:11434' : aiProvider === 'freeflow' ? 'http://127.0.0.1:8000/v1' : 'https://api.openai.com/v1'}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>API Key (Masked & Encrypted)</label>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="Leave blank to preserve existing or for local providers"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {aiTestResult && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${aiTestResult.status === 'success' || aiTestResult.status === 'online' ? 'var(--color-success)' : 'var(--color-danger)'}`,
              background: aiTestResult.status === 'success' || aiTestResult.status === 'online' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {aiTestResult.status === 'success' || aiTestResult.status === 'online' ? (
                  <CheckCircle2 size={16} color="var(--color-success)" />
                ) : (
                  <AlertCircle size={16} color="var(--color-danger)" />
                )}
                <span>{aiTestResult.message}</span>
              </div>
              {aiTestResult.latency_ms && (
                <span style={{ fontWeight: 600, fontSize: 12 }}>{aiTestResult.latency_ms} ms</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <button
              type="button"
              onClick={handleTestAiProvider}
              disabled={aiTesting}
              style={{
                background: 'var(--color-surface-elevated)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: aiTesting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <RefreshCw size={15} className={aiTesting ? 'animate-spin' : ''} />
              <span>{aiTesting ? 'Testing Health…' : 'Test Provider Connection'}</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {aiSavedSuccess && (
                <span style={{ color: 'var(--color-success)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                  <CheckCircle2 size={16} /> Saved!
                </span>
              )}
              <button
                type="submit"
                disabled={aiSaving}
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: aiSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Save size={15} />
                <span>{aiSaving ? 'Saving…' : 'Save AI Settings'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
export default AccountPage;
