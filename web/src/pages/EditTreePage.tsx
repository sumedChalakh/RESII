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
  ExternalLink 
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
      })
      .catch((err) => {
        console.warn('Using seeded local tree:', err);
      });
  }, [resumeId]);

  const applyRewrite = (secIdx: number, blkIdx: number, lineIdx: number, newText: string) => {
    const updated = JSON.parse(JSON.stringify(sections));
    updated[secIdx].blocks[blkIdx].lines[lineIdx].text = newText;
    delete updated[secIdx].blocks[blkIdx].lines[lineIdx].rewrite;
    setSections(updated);
    setAtsScore((prev) => Math.min(99, prev + 2));
    dispatch(addXp({ amount: 20, reason: 'Applied ATS Bullet Rewrite' }));
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
      text: 'Developed scalable services resulting in measurable efficiency improvements.',
      rewrite: 'Spearheaded end-to-end service optimization, enhancing query throughput by 35%.'
    });
    setSections(updated);
  };

  const handleSave = async (forceVersion?: number) => {
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
          document: { header, sections }
        })
      });

      if (res.status === 409) {
        // Concurrency conflict detected!
        const conflict = await res.json();
        setConflictDetail(conflict.detail);
        setShowConflictModal(true);
        setSaving(false);
        return;
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
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
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

          <a
            href={`/api/v3/resumes/${resumeId || 'primary'}/export/pdf`}
            download
            style={{
              background: 'var(--color-surface-card)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              textDecoration: 'none'
            }}
          >
            <Download size={14} />
            <span>Export PDF</span>
          </a>

          <a
            href={`/api/v3/resumes/${resumeId || 'primary'}/export/docx`}
            download
            style={{
              background: 'var(--color-surface-card)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              textDecoration: 'none'
            }}
          >
            <Download size={14} />
            <span>Export Word</span>
          </a>

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

                  {/* Lines List with Suggested Rewrites */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {blk.lines.map((line, lineIdx) => (
                      <div
                        key={line.id}
                        style={{
                          background: 'var(--color-surface-elevated)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 12
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ color: 'var(--color-primary)', fontWeight: 700, marginTop: 2 }}>•</span>
                          <input
                            type="text"
                            value={line.text}
                            onChange={(e) => handleUpdateLine(secIdx, blkIdx, lineIdx, e.target.value)}
                            style={{
                              flex: 1,
                              border: 'none',
                              background: 'transparent',
                              fontSize: 14,
                              color: 'var(--color-ink)',
                              outline: 'none',
                              lineHeight: 1.4
                            }}
                          />
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
                    ))}

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>
              A4 Sheet Preview ({pageCount} Page Budget)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link
                to="/v3/resumes/primary/google-docs"
                title="Edit in Google Docs"
                style={{
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <ExternalLink size={12} />
                <span>Docs</span>
              </Link>
              <a
                href={`/api/v3/resumes/${resumeId || 'primary'}/export/pdf`}
                download
                title="Download PDF"
                style={{
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  color: 'inherit',
                  textDecoration: 'none'
                }}
              >
                <Download size={12} />
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
            padding: 24,
            fontSize: 11,
            color: '#1a1d1e',
            lineHeight: 1.45
          }}>
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
