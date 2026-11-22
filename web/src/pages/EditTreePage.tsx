import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { addXp } from '../store/seasonSlice';
import { 
  Sparkles, 
  ArrowLeft, 
  Save, 
  Download, 
  Check, 
  AlertCircle, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  ExternalLink,
  RefreshCw,
  Briefcase,
  ChevronDown,
  User,
  Mail,
  Phone,
  MapPin,
  Globe
} from 'lucide-react';

interface ResumeLine {
  id: string;
  text: string;
  rewrite?: string;
}

interface ResumeBlock {
  id: string;
  role: string;
  company: string;
  period: string;
  lines: ResumeLine[];
}

interface ResumeSection {
  id: string;
  title: string;
  blocks: ResumeBlock[];
}

export const EditTreePage: React.FC = () => {
  const { resumeId } = useParams<{ resumeId: string }>();
  const dispatch = useDispatch();

  const [version, setVersion] = useState(4);
  const [atsScore, setAtsScore] = useState(88);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictDetail, setConflictDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [tightened, setTightened] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewMode, setPreviewMode] = useState<'original' | 'tree'>('original');
  const [aiLoadingLineId, setAiLoadingLineId] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<number>(Date.now());
  const [refreshingPreview, setRefreshingPreview] = useState(false);

  // Resume header
  const [header, setHeader] = useState<{
    name: string;
    title: string;
    email: string;
    phone: string;
    location: string;
    links: string[];
  }>({
    name: 'Alex Rivera',
    title: 'Senior Software Engineer',
    email: 'alex@resii.dev',
    phone: '(555) 234-5678',
    location: 'San Francisco, CA',
    links: ['github.com/alexrivera', 'linkedin.com/in/alexrivera']
  });

  // Resume structure
  const [sections, setSections] = useState<ResumeSection[]>([
    {
      id: 'sec_exp',
      title: 'Professional Experience',
      blocks: [
        {
          id: 'blk_1',
          role: 'Senior Full-Stack Engineer',
          company: 'CloudScale Systems',
          period: '2022 – Present',
          lines: [
            {
              id: 'l1',
              text: 'Engineered high-throughput FastAPI services, reducing P99 latency by 34% across 2M daily queries.',
              rewrite: 'Architected distributed FastAPI & Redis caching layer, decreasing P99 latency by 42% across 2.5M daily queries.'
            },
            {
              id: 'l2',
              text: 'Orchestrated bi-weekly Agile sprints for a 6-engineer pod, increasing story velocity by 22%.',
              rewrite: 'Directed 6-engineer cross-functional pod using Agile Kanban, accelerating sprint feature throughput by 28%.'
            },
            {
              id: 'l3',
              text: 'Led migration of frontend components from legacy React classes to modern Vite & Redux Toolkit architecture.',
              rewrite: 'Spearheaded legacy migration to React 18, Vite and Redux Toolkit, decreasing bundle build time by 65%.'
            }
          ]
        }
      ]
    },
    {
      id: 'sec_edu',
      title: 'Education',
      blocks: [
        {
          id: 'blk_edu_1',
          role: 'B.S. in Computer Science',
          company: 'University of California, Berkeley',
          period: '2018 – 2022',
          lines: [
            {
              id: 'l4',
              text: 'Coursework: Distributed Systems, Database Internals, Machine Learning, Operating Systems.'
            }
          ]
        }
      ]
    }
  ]);

  // Load document from API on mount
  useEffect(() => {
    fetch(`/api/v3/resumes/${resumeId || 'primary'}/document`)
      .then((res) => {
        const ver = res.headers.get('X-Resume-Version');
        const pCnt = res.headers.get('X-Page-Count');
        const tight = res.headers.get('X-Tightened');
        if (ver) setVersion(parseInt(ver));
        if (pCnt) setPageCount(parseInt(pCnt));
        if (tight) setTightened(tight === 'true');
        return res.json();
      })
      .then((data) => {
        if (data.document?.header) {
          setHeader(data.document.header);
        }
        if (data.document?.sections) {
          setSections(data.document.sections);
        }
        if (data.ats_score) {
          setAtsScore(data.ats_score);
        }
        if (data.page_count || data.layout?.page_count) {
          setPageCount(data.page_count || data.layout?.page_count || 1);
        }
      })
      .catch((err) => {
        console.warn('Using seeded local tree:', err);
      });
  }, [resumeId]);

  const saveDocumentToServer = async (docToSave: { header: any; sections: any }, forceVersion?: number) => {
    setSaving(true);
    setSaveSuccess(false);
    const verToSend = forceVersion !== undefined ? forceVersion : version;

    try {
      const res = await fetch(`/api/v3/resumes/${resumeId || 'primary'}/document`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Resume-Version': verToSend.toString()
        },
        body: JSON.stringify({
          version: verToSend,
          document: docToSave
        })
      });

      if (res.status === 409) {
        const conflict = await res.json();
        setConflictDetail(conflict.detail);
        setShowConflictModal(true);
        setSaving(false);
        return false;
      }

      if (res.ok) {
        const data = await res.json();
        setVersion(data.version);
        setAtsScore(data.ats_score);
        if (data.layout) {
          setPageCount(data.layout.page_count);
          setTightened(data.layout.tightened);
        }
        setSaveSuccess(true);
        dispatch(addXp({ amount: 15, reason: 'Saved Resume Version' }));
        setTimeout(() => setSaveSuccess(false), 2500);
        return true;
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
    return false;
  };

  const applyRewrite = async (secIdx: number, blkIdx: number, lineIdx: number, newText: string) => {
    const updated = JSON.parse(JSON.stringify(sections));
    updated[secIdx].blocks[blkIdx].lines[lineIdx].text = newText;
    delete updated[secIdx].blocks[blkIdx].lines[lineIdx].rewrite;
    setSections(updated);
    setAtsScore((prev) => Math.min(99, prev + 2));
    dispatch(addXp({ amount: 20, reason: 'Applied ATS Bullet Rewrite' }));
    // Automatically save to backend so the rewrite is immediately persisted!
    await saveDocumentToServer({ header, sections: updated });
    // Switch to live updated preview so the user sees the changes on their resume sheet
    setPreviewMode('tree');
  };

  const requestAiRewrite = async (secIdx: number, blkIdx: number, lineIdx: number, bulletText: string) => {
    const line = sections[secIdx]?.blocks[blkIdx]?.lines[lineIdx];
    if (!line || !bulletText.trim()) return;
    setAiLoadingLineId(line.id);
    try {
      const res = await fetch('/api/v3/resumes/ai-rewrite-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bullet_text: bulletText,
          target_role: header.title || 'AI / Machine Learning Engineer',
          company: sections[secIdx]?.blocks[blkIdx]?.company || ''
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rewrite) {
          const updated = JSON.parse(JSON.stringify(sections));
          updated[secIdx].blocks[blkIdx].lines[lineIdx].rewrite = data.rewrite;
          setSections(updated);
        }
      }
    } catch (err) {
      console.error('AI rewrite error:', err);
    } finally {
      setAiLoadingLineId(null);
    }
  };

  const handleUpdateLine = (secIdx: number, blkIdx: number, lineIdx: number, text: string) => {
    const updated = [...sections];
    updated[secIdx].blocks[blkIdx].lines[lineIdx].text = text;
    setSections(updated);
  };

  const handleDeleteLine = (secIdx: number, blkIdx: number, lineIdx: number) => {
    const updated = [...sections];
    updated[secIdx].blocks[blkIdx].lines.splice(lineIdx, 1);
    setSections(updated);
  };

  const handleAddLine = (secIdx: number, blkIdx: number) => {
    const updated = [...sections];
    updated[secIdx].blocks[blkIdx].lines.push({
      id: `l_${Date.now()}`,
      text: ''
    });
    setSections(updated);
  };

  const handleSave = async (forceVersion?: number) => {
    await saveDocumentToServer({ header, sections }, forceVersion);
  };

  const handleRefreshPreview = async () => {
    setRefreshingPreview(true);
    await saveDocumentToServer({ header, sections });
    setPreviewKey(Date.now());
    setTimeout(() => setRefreshingPreview(false), 400);
  };

  // Simulate remote update to trigger optimistic concurrency conflict modal
  const triggerConflictSimulation = () => {
    setConflictDetail({
      server_version: version + 1,
      client_version: version
    });
    setShowConflictModal(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Action Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        paddingBottom: 16,
        borderBottom: '1px solid var(--color-border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--color-muted)', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{header.title || 'Resume Editor'}</h1>
              <span style={{
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 6px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-muted)'
              }}>
                v{version}
              </span>
              <Link
                to="/jobs"
                style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 'var(--radius-full)',
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#059669',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Briefcase size={11} />
                <span>Jobs (20k)</span>
              </Link>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
              Candidate: <strong>{header.name}</strong> • Page budget: {pageCount} page • Tightened: {tightened ? 'Yes' : 'No'}
            </div>
          </div>
        </div>

        {/* Live Score Ring, Exports & Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-success-bg)',
            color: 'var(--color-success)',
            fontWeight: 700,
            fontSize: 14
          }}>
            <Sparkles size={16} />
            <span>{atsScore} ATS SCORE</span>
          </div>

          {/* Live [↻ Update preview] button */}
          <button
            type="button"
            onClick={handleRefreshPreview}
            disabled={refreshingPreview}
            title="Saves document and refreshes preview sheet"
            style={{
              background: '#0e6245',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 700,
              cursor: refreshingPreview ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 5px rgba(14, 98, 69, 0.25)',
              transition: 'background 150ms ease'
            }}
          >
            <RefreshCw size={14} className={refreshingPreview ? 'spin' : ''} />
            <span>{refreshingPreview ? 'Updating…' : 'Update preview'}</span>
          </button>

          {/* Unified Download Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setDownloadOpen(!downloadOpen)}
              style={{
                background: 'var(--color-surface-card)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Download size={14} />
              <span>Download</span>
              <ChevronDown size={14} />
            </button>
            {downloadOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 6,
                background: '#ffffff',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                width: 250,
                zIndex: 60,
                display: 'flex',
                flexDirection: 'column',
                padding: 6
              }}>
                <a
                  href={`/api/v3/resumes/${resumeId || 'primary'}/export/pdf`}
                  download
                  onClick={() => setDownloadOpen(false)}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--color-ink)',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>PDF (Print replica document)</span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>.pdf</span>
                </a>
                <a
                  href={`/api/v3/resumes/${resumeId || 'primary'}/export/docx`}
                  download
                  onClick={() => setDownloadOpen(false)}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--color-ink)',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>DOCX (Word format for ATS)</span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>.docx</span>
                </a>
                <Link
                  to="/v3/resumes/primary/google-docs"
                  onClick={() => setDownloadOpen(false)}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--color-ink)',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>Google Docs</span>
                  <ExternalLink size={12} color="var(--color-muted)" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setDownloadOpen(false);
                    const plain = `${header.name}\n${header.title}\n${header.email} • ${header.phone} • ${header.location}\n\n` +
                      sections.map(s => `${s.title.toUpperCase()}\n` + s.blocks.map(b => `${b.role} - ${b.company} (${b.period})\n` + b.lines.map(l => `• ${l.text}`).join('\n')).join('\n\n')).join('\n\n');
                    const blob = new Blob([plain], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${header.name.replace(/\s+/g, '_')}_Resume.txt`;
                    a.click();
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--color-ink)',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left'
                  }}
                >
                  <span>Raw Plain Text</span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>.txt</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={triggerConflictSimulation}
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Simulate Tab Conflict
          </button>

          <button
            onClick={() => handleSave()}
            disabled={saving}
            style={{
              background: saveSuccess ? 'var(--color-success)' : 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '9px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background 150ms ease'
            }}
          >
            {saveSuccess ? <Check size={16} /> : <Save size={16} />}
            <span>{saving ? 'Saving…' : saveSuccess ? 'Saved v' + version : 'Save Resume'}</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column View: Tree Editor & Live Sheet Preview */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(420px, 1.4fr) minmax(360px, 1fr)',
        gap: 28,
        alignItems: 'start'
      }}>
        {/* Left: Tree Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top: Dedicated Contact & Profile Header Card */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 20
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              paddingBottom: 8,
              borderBottom: '1px solid var(--color-border-subtle)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={16} color="var(--color-primary)" />
                <span style={{ fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Contact & Profile Details
                </span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-faint)', fontWeight: 600 }}>
                Header Info
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
                  Full Candidate Name
                </label>
                <input
                  type="text"
                  value={header.name}
                  onChange={(e) => setHeader({ ...header, name: e.target.value })}
                  placeholder="e.g. Sumed Chalakh"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    fontSize: 13,
                    fontWeight: 600,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
                  Headline / Target Role
                </label>
                <input
                  type="text"
                  value={header.title}
                  onChange={(e) => setHeader({ ...header, title: e.target.value })}
                  placeholder="e.g. Data Scientist | AI/ML Engineer"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    fontSize: 13,
                    fontWeight: 600,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={header.email}
                  onChange={(e) => setHeader({ ...header, email: e.target.value })}
                  placeholder="email@example.com"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
                  Phone Number
                </label>
                <input
                  type="text"
                  value={header.phone}
                  onChange={(e) => setHeader({ ...header, phone: e.target.value })}
                  placeholder="+91 8329935523"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
                  Location
                </label>
                <input
                  type="text"
                  value={header.location}
                  onChange={(e) => setHeader({ ...header, location: e.target.value })}
                  placeholder="Nagpur, Maharashtra, India"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          </div>
          {sections.map((sec, secIdx) => (
            <div
              key={sec.id}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 20
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
                paddingBottom: 8,
                borderBottom: '1px solid var(--color-border-subtle)'
              }}>
                <span style={{ fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {sec.title}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-faint)', fontWeight: 600 }}>
                  Structured Section
                </span>
              </div>

              {sec.blocks.map((blk, blkIdx) => (
                <div key={blk.id} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{blk.role}</span>
                      <span style={{ margin: '0 6px', color: 'var(--color-faint)' }}>•</span>
                      <span style={{ color: 'var(--color-muted)', fontSize: 14 }}>{blk.company}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--color-faint)' }}>{blk.period}</span>
                  </div>

                  {/* Lines List with Suggested Rewrites & Line Budget */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {blk.lines.map((line, lineIdx) => {
                      const charCount = (line.text || '').length;
                      const lineCount = Math.max(1, Math.ceil(charCount / 85));
                      const isOverflowEdge = (charCount > 85 && charCount <= 110) || (charCount > 170 && charCount <= 200);

                      return (
                        <div
                          key={line.id}
                          style={{
                            background: 'var(--color-surface-elevated)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            padding: 12
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <span style={{ color: 'var(--color-primary)', fontWeight: 700, marginTop: 6 }}>•</span>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <textarea
                                value={line.text}
                                onChange={(e) => handleUpdateLine(secIdx, blkIdx, lineIdx, e.target.value)}
                                rows={Math.max(2, Math.ceil(charCount / 65))}
                                style={{
                                  width: '100%',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: 'var(--radius-sm)',
                                  background: '#ffffff',
                                  fontSize: 13,
                                  color: 'var(--color-ink)',
                                  padding: '8px 10px',
                                  outline: 'none',
                                  lineHeight: 1.45,
                                  resize: 'vertical',
                                  fontFamily: 'inherit',
                                  boxSizing: 'border-box'
                                }}
                                placeholder="Enter or edit bullet statement..."
                              />
                              {isOverflowEdge && (
                                <div style={{
                                  fontSize: 11,
                                  color: '#b45309',
                                  background: '#fef3c7',
                                  border: '1px solid #fde68a',
                                  padding: '4px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6
                                }}>
                                  <AlertCircle size={12} />
                                  <span>Wraps to {lineCount} lines in PDF — shorten a few words to save 1 line</span>
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                              <span
                                title={`Approximately ${lineCount} line${lineCount > 1 ? 's' : ''} on standard PDF format`}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: 'var(--radius-full)',
                                  background: lineCount === 1 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                  color: lineCount === 1 ? '#059669' : '#d97706',
                                  border: `1px solid ${lineCount === 1 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                }}
                              >
                                {lineCount}L
                              </span>
                              <button
                                type="button"
                                onClick={() => requestAiRewrite(secIdx, blkIdx, lineIdx, line.text)}
                                disabled={aiLoadingLineId === line.id || !line.text.trim()}
                                title="Generate ATS bullet rewrite with OpenRouter AI"
                                style={{
                                  background: 'rgba(14, 165, 233, 0.1)',
                                  border: '1px solid #bae6fd',
                                  color: '#0284c7',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '4px 8px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <Sparkles size={12} />
                                <span>{aiLoadingLineId === line.id ? 'Writing…' : 'AI Rewrite'}</span>
                              </button>
                              <button
                                onClick={() => handleDeleteLine(secIdx, blkIdx, lineIdx)}
                                title="Delete bullet"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--color-faint)',
                                  cursor: 'pointer',
                                  padding: 2
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                        {line.rewrite && (
                          <div style={{
                            marginTop: 10,
                            paddingTop: 10,
                            borderTop: '1px dashed var(--color-border)',
                            background: 'var(--color-primary-light)',
                            padding: 10,
                            borderRadius: 'var(--radius-sm)'
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              color: 'var(--color-primary-dark)',
                              marginBottom: 4
                            }}>
                              <Sparkles size={14} />
                              <span>RESII Suggested ATS Rewrite</span>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--color-ink)', marginBottom: 8, lineHeight: 1.4 }}>
                              • {line.rewrite}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => applyRewrite(secIdx, blkIdx, lineIdx, line.rewrite!)}
                                style={{
                                  background: 'var(--color-primary)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '4px 10px',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Apply this rewrite
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                    <button
                      onClick={() => handleAddLine(secIdx, blkIdx)}
                      style={{
                        alignSelf: 'flex-start',
                        background: 'none',
                        border: '1px dashed var(--color-border)',
                        color: 'var(--color-muted)',
                        borderRadius: 'var(--radius-md)',
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 4
                      }}
                    >
                      <Plus size={14} />
                      <span>Add bullet point</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Right: Realistic Paper Sheet Preview */}
        <div style={{
          position: 'sticky',
          top: 84,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sheet)',
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setPreviewMode('original')}
                style={{
                  background: previewMode === 'original' ? '#0e6245' : 'var(--color-surface-card)',
                  color: previewMode === 'original' ? '#ffffff' : 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Original Template ({pageCount}P)
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('tree')}
                style={{
                  background: previewMode === 'tree' ? '#0e6245' : 'var(--color-surface-card)',
                  color: previewMode === 'tree' ? '#ffffff' : 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Live Edited Resume ({pageCount}P)
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleRefreshPreview}
                disabled={refreshingPreview}
                title="Saves document and refreshes preview sheet"
                style={{
                  background: '#0e6245',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: refreshingPreview ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <RefreshCw size={11} className={refreshingPreview ? 'spin' : ''} />
                <span>{refreshingPreview ? 'Updating…' : 'Update preview'}</span>
              </button>
              <Link
                to="/v3/resumes/primary/google-docs"
                title="Edit in Google Docs"
                style={{
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border)',
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <ExternalLink size={11} />
                <span>Docs</span>
              </Link>
              <a
                href={`/api/v3/resumes/${resumeId || 'primary'}/export/pdf`}
                download
                title="Download PDF"
                style={{
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border)',
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  color: 'inherit',
                  textDecoration: 'none'
                }}
              >
                <Download size={11} />
                <span>PDF</span>
              </a>
            </div>
          </div>

          {/* Paper View */}
          <div style={{
            background: '#ffffff',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            minHeight: '750px',
            position: 'relative'
          }}>
            {previewMode === 'original' ? (
              <iframe
                key={previewKey}
                src={`/api/v3/resumes/${resumeId || 'primary'}/raw?t=${previewKey}#toolbar=0&navpanes=0&scrollbar=0`}
                style={{
                  width: '100%',
                  height: '750px',
                  border: 'none',
                  background: '#ffffff'
                }}
                title="Exact Original Template Preview"
              />
            ) : (
              <div style={{ padding: 24, fontSize: 11, color: '#1a1d1e', lineHeight: 1.45 }}>
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{header.name.toUpperCase()}</div>
                  <div style={{ color: '#555', fontSize: 10 }}>
                    {[header.location, header.email, header.phone, ...header.links].filter(Boolean).join(' • ')}
                  </div>
                </div>

                {sections.map((s) => (
                  <div key={s.id} style={{ marginBottom: 12 }}>
                    <div style={{ borderBottom: '1px solid #1a1d1e', fontWeight: 800, fontSize: 10, letterSpacing: '0.06em', marginBottom: 4 }}>
                      {s.title.toUpperCase()}
                    </div>
                    {s.blocks.map((b) => (
                      <div key={b.id} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 10 }}>
                          <span>{b.role} — {b.company}</span>
                          <span>{b.period}</span>
                        </div>
                        {b.lines.map((l, i) => (
                          <div key={i} style={{ fontSize: 10, color: '#333', marginLeft: 6 }}>• {l.text}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Optimistic Concurrency Conflict Modal */}
      {showConflictModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20
        }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            maxWidth: 460,
            width: '100%',
            padding: 24,
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, color: 'var(--color-warn)' }}>
              <AlertCircle size={22} />
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>
                This line changed in another tab too
              </h3>
            </div>
            <p style={{ fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.5, margin: '0 0 20px' }}>
              Another open session updated <code>X-Resume-Version</code> from v{version} to v{conflictDetail?.server_version || version + 1}. Do you want to overwrite it with your current edits, or keep the remote state?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConflictModal(false)}
                style={{
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConflictModal(false);
                  const serverVer = conflictDetail?.server_version || version + 1;
                  setVersion(serverVer);
                  handleSave(serverVer);
                }}
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Keep mine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default EditTreePage;
