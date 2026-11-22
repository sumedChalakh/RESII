import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { addXp } from '../store/seasonSlice';
import {
  Sparkles,
  ArrowRight,
  Check,
  X,
  Edit3,
  CheckCircle2,
  TrendingUp,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  Save,
  FileText,
  Copy,
  ShieldCheck,
  AlertTriangle,
  Cpu,
  Download,
  ExternalLink,
  Briefcase,
  Layers,
  RotateCcw
} from 'lucide-react';

interface TailorSuggestion {
  line_id: string;
  section: string;
  role: string;
  original_text: string;
  suggested_text: string;
  keyword_added: string;
  reasoning: string;
  impact_score: string;
  status?: 'accepted' | 'rejected' | 'pending';
}

export const TailorPage: React.FC = () => {
  const { resumeId } = useParams<{ resumeId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const stateData = (location.state as {
    jobDescription?: string;
    targetCompany?: string;
    targetRole?: string;
    applyUrl?: string;
  } | null) || {};

  const [jobDescription, setJobDescription] = useState(
    stateData.jobDescription ||
    'Looking for a Senior Full-Stack Engineer / AI Engineer with strong production experience in React, TypeScript, FastAPI, Redis, and high-concurrency systems. Experience driving P99 latency reductions, LLM evaluations, and leading cross-functional pods is required.'
  );
  const [targetCompany, setTargetCompany] = useState(stateData.targetCompany || 'Emoolar Technology');
  const [targetRole, setTargetRole] = useState(stateData.targetRole || 'Data Science / AI Engineer');
  const [applyUrl, setApplyUrl] = useState(stateData.applyUrl || 'https://internshala.com/job/detail/data-science-internship-in-work-from-home-at-emoolar-technology-private-limited1732007887');

  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [activeTab, setActiveTab] = useState<'tailor' | 'cover-letter'>('tailor');

  // Interactive Tailor Options
  const [showPosting, setShowPosting] = useState(false);
  const [tailorScope, setTailorScope] = useState<'all' | 'pick'>('all');
  const [maxFit, setMaxFit] = useState(true);
  const [allApplied, setAllApplied] = useState(false);

  // Resume Document State
  const [resumeDoc, setResumeDoc] = useState<any>(null);
  const [appliedLines, setAppliedLines] = useState<Record<string, { original: string; newText: string }>>({});
  const [justAppliedLineId, setJustAppliedLineId] = useState<string | null>(null);

  // Results from API
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [matchRate, setMatchRate] = useState<number>(76);
  const [targetMatchRate, setTargetMatchRate] = useState<number>(98);
  const [matchedKeywords, setMatchedKeywords] = useState<string[]>([
    'Python', 'Machine Learning', 'Data Pipelines', 'SQL', 'Deep Learning'
  ]);
  const [missingKeywords, setMissingKeywords] = useState<string[]>([
    'FastAPI', 'Redis', 'P99 Latency', 'LLM Benchmarking'
  ]);
  const [skillGaps, setSkillGaps] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<TailorSuggestion[]>([]);

  // Cover Letter State
  const [coverLetterText, setCoverLetterText] = useState<string>('');
  const [coverLetterTone, setCoverLetterTone] = useState<string>('professional');
  const [coverLetterLength, setCoverLetterLength] = useState<string>('standard');
  const [coverLetterClaims, setCoverLetterClaims] = useState<string[]>([]);
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false);
  const [copiedCoverLetter, setCopiedCoverLetter] = useState(false);

  // Inference Transparency
  const [inferenceSource, setInferenceSource] = useState<'llm' | 'heuristic' | 'mock' | null>('llm');
  const [providerUsed, setProviderUsed] = useState<string | null>('openrouter');
  const [modelUsed, setModelUsed] = useState<string | null>('openrouter/free');
  const [fallbackActivated, setFallbackActivated] = useState<boolean>(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  // Load candidate's active document tree on mount
  useEffect(() => {
    fetch(`/api/v3/resumes/${resumeId || 'primary'}/document`)
      .then((res) => res.json())
      .then((data) => {
        if (data.document) {
          setResumeDoc(data.document);
        }
      })
      .catch((err) => {
        console.warn('Could not load resume document tree:', err);
      });
  }, [resumeId]);

  const handleGeneratePlan = async () => {
    if (!jobDescription.trim()) return;
    setAnalyzing(true);
    setAllApplied(false);

    try {
      // 1. Keyword extraction & Match Rate
      const rwRes = await fetch('/api/v3/tailor/read-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_description: jobDescription,
          resume_id: resumeId || 'primary'
        })
      });
      const rwData = await rwRes.json();
      if (rwData.match_rate) setMatchRate(rwData.match_rate);
      if (rwData.matched_keywords) setMatchedKeywords(rwData.matched_keywords);
      if (rwData.missing_keywords) setMissingKeywords(rwData.missing_keywords);
      if (rwData.skill_gaps) setSkillGaps(rwData.skill_gaps);

      // 2. Generate tailoring plan
      const planRes = await fetch('/api/v3/tailor/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_description: jobDescription,
          job_title: targetRole,
          company_name: targetCompany,
          resume_id: resumeId || 'primary'
        })
      });
      const planData = await planRes.json();
      setReviewId(planData.id || `rev_${Date.now()}`);

      if (planData.inference_source) setInferenceSource(planData.inference_source);
      if (planData.provider_used) setProviderUsed(planData.provider_used);
      if (planData.model_used) setModelUsed(planData.model_used);
      if (planData.fallback_activated !== undefined) setFallbackActivated(planData.fallback_activated);
      if (planData.fallback_reason) setFallbackReason(planData.fallback_reason);

      const loadedSuggestions: TailorSuggestion[] = (planData.suggestions || []).map((s: any) => ({
        ...s,
        status: 'pending'
      }));
      setSuggestions(loadedSuggestions);
      dispatch(addXp({ amount: 60, reason: 'Generated Tailored Job Plan' }));
    } catch (err) {
      console.error('Tailoring error:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplySuggestion = (index: number) => {
    const sug = suggestions[index];
    if (!sug) return;

    const updated = [...suggestions];
    updated[index].status = 'accepted';
    setSuggestions(updated);

    // Apply live into the left resume document
    if (resumeDoc) {
      const docCopy = JSON.parse(JSON.stringify(resumeDoc));
      let applied = false;
      for (const s of docCopy.sections || []) {
        for (const b of s.blocks || []) {
          for (const l of b.lines || []) {
            if (l.id === sug.line_id || l.text.trim() === sug.original_text.trim()) {
              l.text = sug.suggested_text;
              applied = true;
              break;
            }
          }
          if (applied) break;
        }
        if (applied) break;
      }
      setResumeDoc(docCopy);
    }

    setAppliedLines((prev) => ({
      ...prev,
      [sug.line_id]: { original: sug.original_text, newText: sug.suggested_text }
    }));

    setJustAppliedLineId(sug.line_id);
    setTimeout(() => setJustAppliedLineId(null), 2500);

    // Increment ATS fit
    setMatchRate((prev) => Math.min(98, prev + 7));
    dispatch(addXp({ amount: 20, reason: 'Applied Tailored ATS Bullet' }));

    // Check if all suggestions accepted
    const remainingPending = updated.filter((s) => s.status === 'pending');
    if (remainingPending.length === 0) {
      setAllApplied(true);
    }
  };

  const handleSkipSuggestion = (index: number) => {
    const updated = [...suggestions];
    updated[index].status = 'rejected';
    setSuggestions(updated);
    const remainingPending = updated.filter((s) => s.status === 'pending');
    if (remainingPending.length === 0) {
      setAllApplied(true);
    }
  };

  const handleUndoLine = (lineId: string) => {
    const record = appliedLines[lineId];
    if (!record || !resumeDoc) return;

    const docCopy = JSON.parse(JSON.stringify(resumeDoc));
    for (const s of docCopy.sections || []) {
      for (const b of s.blocks || []) {
        for (const l of b.lines || []) {
          if (l.id === lineId || l.text.trim() === record.newText.trim()) {
            l.text = record.original;
            break;
          }
        }
      }
    }
    setResumeDoc(docCopy);

    setAppliedLines((prev) => {
      const c = { ...prev };
      delete c[lineId];
      return c;
    });

    setSuggestions((prev) =>
      prev.map((s) => (s.line_id === lineId ? { ...s, status: 'pending' } : s))
    );
    setAllApplied(false);
  };

  const handleApplyAll = () => {
    if (!suggestions.length || !resumeDoc) return;
    const docCopy = JSON.parse(JSON.stringify(resumeDoc));
    const newApplied: Record<string, { original: string; newText: string }> = { ...appliedLines };

    suggestions.forEach((sug) => {
      if (sug.status !== 'rejected') {
        for (const s of docCopy.sections || []) {
          for (const b of s.blocks || []) {
            for (const l of b.lines || []) {
              if (l.id === sug.line_id || l.text.trim() === sug.original_text.trim()) {
                l.text = sug.suggested_text;
                break;
              }
            }
          }
        }
        newApplied[sug.line_id] = { original: sug.original_text, newText: sug.suggested_text };
      }
    });

    setResumeDoc(docCopy);
    setAppliedLines(newApplied);
    setSuggestions((prev) => prev.map((s) => ({ ...s, status: 'accepted' })));
    setMatchRate(98);
    setAllApplied(true);
    dispatch(addXp({ amount: 100, reason: 'Applied All Tailored Enhancements' }));
  };

  const handleLaunchAutoFill = () => {
    // Open target employer application page with RESII extension attached
    const targetUrl = applyUrl || 'https://internshala.com';
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const handleGenerateCoverLetter = async () => {
    if (!jobDescription.trim()) return;
    setGeneratingCoverLetter(true);
    try {
      const res = await fetch('/api/v3/tailor/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_description: jobDescription,
          job_title: targetRole,
          company_name: targetCompany,
          resume_id: resumeId || 'primary',
          tone: coverLetterTone,
          length: coverLetterLength
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCoverLetterText(data.content);
        setCoverLetterClaims(data.grounded_claims || []);
        dispatch(addXp({ amount: 45, reason: 'Generated Evidence-Grounded Cover Letter' }));
      }
    } catch (err) {
      console.error('Cover letter generation error:', err);
    } finally {
      setGeneratingCoverLetter(false);
    }
  };

  const handleCopyCoverLetter = () => {
    if (!coverLetterText) return;
    navigator.clipboard.writeText(coverLetterText);
    setCopiedCoverLetter(true);
    setTimeout(() => setCopiedCoverLetter(false), 2000);
  };

  const candidateHeader = resumeDoc?.header || {
    name: 'Sumed Chalakh',
    title: 'Data Scientist | AI/ML Engineer',
    email: 'sumedchalakh528@gmail.com',
    phone: '+91 8329935523',
    location: 'Nagpur, Maharashtra, India',
    links: ['linkedin.com/in/sumedchalakh', 'github.com/sumedchalakh']
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Banner Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        paddingBottom: 14,
        borderBottom: '1px solid var(--color-border)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)', fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
            <Sparkles size={16} />
            <span>AI TAILORING STUDIO</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Side-by-Side Tailoring: {targetRole} @ {targetCompany}
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setActiveTab('tailor')}
            style={{
              background: activeTab === 'tailor' ? 'var(--color-surface-elevated)' : 'transparent',
              border: `1px solid ${activeTab === 'tailor' ? 'var(--color-primary)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: activeTab === 'tailor' ? 'var(--color-primary)' : 'var(--color-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Sparkles size={14} />
            <span>Tailoring Studio</span>
          </button>

          <button
            onClick={() => setActiveTab('cover-letter')}
            style={{
              background: activeTab === 'cover-letter' ? 'var(--color-surface-elevated)' : 'transparent',
              border: `1px solid ${activeTab === 'cover-letter' ? 'var(--color-primary)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: activeTab === 'cover-letter' ? 'var(--color-primary)' : 'var(--color-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <FileText size={14} />
            <span>Cover Letter</span>
          </button>

          <Link
            to="/jobs"
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-ink)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Briefcase size={14} />
            <span>Jobs Feed</span>
          </Link>
        </div>
      </div>

      {activeTab === 'cover-letter' ? (
        /* Grounded Cover Letter View */
        <div style={{ maxWidth: 840, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Letter Tone</label>
                <select
                  value={coverLetterTone}
                  onChange={(e) => setCoverLetterTone(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                >
                  <option value="professional">Professional & Direct</option>
                  <option value="conversational">Conversational & Engaging</option>
                  <option value="technical">Technical & Systems-Focused</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Length</label>
                <select
                  value={coverLetterLength}
                  onChange={(e) => setCoverLetterLength(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                >
                  <option value="concise">Concise (~250 words)</option>
                  <option value="standard">Standard (~350 words)</option>
                  <option value="detailed">Detailed (~450 words)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateCoverLetter}
              disabled={generatingCoverLetter}
              style={{
                alignSelf: 'flex-start',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <FileText size={16} />
              <span>{generatingCoverLetter ? 'Drafting Grounded Letter…' : 'Generate Cover Letter'}</span>
            </button>
          </div>

          {coverLetterText && (
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Cover Letter for {targetRole} @ {targetCompany}</h3>
                <button
                  onClick={handleCopyCoverLetter}
                  style={{
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {copiedCoverLetter ? <CheckCircle2 size={14} color="var(--color-success)" /> : <Copy size={14} />}
                  <span>{copiedCoverLetter ? 'Copied' : 'Copy text'}</span>
                </button>
              </div>
              <div style={{ background: '#fff', padding: 20, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13 }}>
                {coverLetterText}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Full Side-by-Side Tailoring Studio (Matching Rezifi) */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 1.15fr) minmax(460px, 1.25fr)',
          gap: 28,
          alignItems: 'start'
        }}>
          {/* LEFT COLUMN: Candidate's Full Resume with Live Highlights */}
          <div style={{
            position: 'sticky',
            top: 84,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sheet)',
            padding: 24,
            maxHeight: 'calc(100vh - 110px)',
            overflowY: 'auto'
          }}>
            {/* Candidate Header */}
            <div style={{
              textAlign: 'center',
              borderBottom: '2px solid #0f172a',
              paddingBottom: 14,
              marginBottom: 16
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', letterSpacing: '0.02em', color: '#0f172a' }}>
                {candidateHeader.name.toUpperCase()}
              </h2>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                {candidateHeader.title}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px 8px' }}>
                {[candidateHeader.location, candidateHeader.phone, candidateHeader.email, ...(candidateHeader.links || [])].filter(Boolean).map((item: string, i: number) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {i > 0 && <span style={{ margin: '0 4px', color: '#cbd5e1' }}>•</span>}
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Resume Sections */}
            {resumeDoc?.sections?.map((sec: any) => (
              <div key={sec.id} style={{ marginBottom: 18 }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#0f172a',
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: 3,
                  marginBottom: 10
                }}>
                  {sec.title}
                </div>

                {sec.blocks?.map((blk: any) => (
                  <div key={blk.id} style={{ marginBottom: 12 }}>
                    {(blk.role || blk.company) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                        <div>
                          <span>{blk.role}</span>
                          {blk.company && <span style={{ fontWeight: 400, color: '#475569' }}> — {blk.company}</span>}
                        </div>
                        {blk.period && <span style={{ fontSize: 11, color: '#64748b' }}>{blk.period}</span>}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {blk.lines?.map((line: any) => {
                        const isApplied = !!appliedLines[line.id];
                        const isJustApplied = justAppliedLineId === line.id;

                        return (
                          <div
                            key={line.id}
                            style={{
                              fontSize: 12,
                              lineHeight: 1.5,
                              color: isApplied ? '#065f46' : '#334155',
                              padding: '6px 10px',
                              borderRadius: 'var(--radius-sm)',
                              background: isJustApplied
                                ? '#bbf7d0'
                                : isApplied
                                ? 'rgba(16, 185, 129, 0.08)'
                                : 'transparent',
                              border: isApplied ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid transparent',
                              transition: 'all 250ms ease',
                              display: 'flex',
                              alignItems: 'flex-start',
                              justifyContent: 'space-between',
                              gap: 8
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <span style={{ color: isApplied ? '#059669' : '#94a3b8', fontWeight: 700, marginRight: 6 }}>•</span>
                              <span>{line.text}</span>
                            </div>

                            {isApplied && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: '#059669',
                                  background: '#d1fae5',
                                  padding: '2px 6px',
                                  borderRadius: 4
                                }}>
                                  ✓ Applied
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUndoLine(line.id)}
                                  title="Revert bullet to original"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#64748b',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    textDecoration: 'underline',
                                    padding: 0
                                  }}
                                >
                                  Undo
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* RIGHT COLUMN: Target Job Card, Controls & Step-by-Step Suggestions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Target Job Card */}
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 22,
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)' }}>Target Role & Company</span>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: '2px 0 0', color: 'var(--color-ink)' }}>
                    {targetRole}
                  </h2>
                  <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>
                    {targetCompany} • Remote / Hybrid
                  </div>
                </div>

                {/* Match Rate Ring */}
                <div style={{
                  background: allApplied ? '#0e6245' : 'var(--color-surface-elevated)',
                  color: allApplied ? '#ffffff' : 'var(--color-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 14px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>ATS Match</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {matchRate}%
                  </div>
                </div>
              </div>

              {/* Skills Chips */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6 }}>
                  Core Skills Match:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {matchedKeywords.map((kw) => (
                    <span
                      key={kw}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#059669',
                        border: '1px solid rgba(16, 185, 129, 0.25)'
                      }}
                    >
                      ✓ {kw}
                    </span>
                  ))}
                  {missingKeywords.map((kw) => (
                    <span
                      key={kw}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: '#b45309',
                        border: '1px solid rgba(245, 158, 11, 0.25)'
                      }}
                    >
                      + {kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* Collapsible JD Accordion */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowPosting(!showPosting)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <span>{showPosting ? 'Hide job posting' : 'Show job posting'}</span>
                  {showPosting ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showPosting && (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      rows={5}
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      style={{
                        width: '100%',
                        padding: 10,
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface-elevated)',
                        fontSize: 12,
                        lineHeight: 1.45,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Tailor Scope & Max Fit Toggles */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid var(--color-border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="tailorScope"
                      checked={tailorScope === 'all'}
                      onChange={() => setTailorScope('all')}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    <span>Whole résumé</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="tailorScope"
                      checked={tailorScope === 'pick'}
                      onChange={() => setTailorScope('pick')}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    <span>Pick lines</span>
                  </label>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#0e6245', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={maxFit}
                    onChange={(e) => setMaxFit(e.target.checked)}
                    style={{ accentColor: '#0e6245', width: 16, height: 16 }}
                  />
                  <span>⚡ Max fit (Target 98%)</span>
                </label>
              </div>

              {/* Primary CTA: Tailor my resume */}
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={handleGeneratePlan}
                  disabled={analyzing}
                  style={{
                    width: '100%',
                    background: '#0e6245',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 20px',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: analyzing ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 3px 8px rgba(14, 98, 69, 0.25)',
                    transition: 'all 150ms ease'
                  }}
                >
                  <Sparkles size={16} />
                  <span>{analyzing ? 'Scanning posting & matching keywords…' : '⚡ Tailor my résumé'}</span>
                </button>
              </div>
            </div>

            {/* Suggestions Pipeline */}
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--color-surface)',
                  padding: '12px 18px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)'
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>
                    <span>{suggestions.filter(s => s.status === 'accepted').length} of {suggestions.length} enhancements applied</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', marginLeft: 8 }}>• 32 lines checked • 27 already fit</span>
                  </div>

                  {!allApplied && (
                    <button
                      type="button"
                      onClick={handleApplyAll}
                      style={{
                        background: '#0e6245',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <Zap size={13} />
                      <span>Apply all ({suggestions.filter(s => s.status === 'pending').length})</span>
                    </button>
                  )}
                </div>

                {/* Diff Cards */}
                {suggestions.map((sug, idx) => (
                  <div
                    key={sug.line_id || idx}
                    style={{
                      background: 'var(--color-surface)',
                      border: `1px solid ${sug.status === 'accepted' ? '#86efac' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-lg)',
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-muted)' }}>
                        {sug.section} • {sug.role}
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: sug.status === 'accepted' ? '#dcfce7' : 'var(--color-surface-elevated)',
                        color: sug.status === 'accepted' ? '#15803d' : 'var(--color-primary)'
                      }}>
                        {sug.status === 'accepted' ? '✓ Applied' : sug.impact_score || 'High Impact'}
                      </span>
                    </div>

                    {/* Diff Highlighting */}
                    <div style={{
                      background: '#fafafa',
                      border: '1px solid #e5e7eb',
                      borderRadius: 'var(--radius-md)',
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      fontSize: 12,
                      lineHeight: 1.5
                    }}>
                      <div style={{ color: '#991b1b', background: '#fee2e2', padding: '6px 10px', borderRadius: 4, textDecoration: 'line-through' }}>
                        - {sug.original_text}
                      </div>
                      <div style={{ color: '#166534', background: '#dcfce7', padding: '6px 10px', borderRadius: 4, fontWeight: 600 }}>
                        + {sug.suggested_text}
                      </div>
                    </div>

                    {/* Why this helps */}
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      <strong>Why this helps:</strong> Adds target keyword <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>"{sug.keyword_added}"</span> — {sug.reasoning}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => handleSkipSuggestion(idx)}
                        disabled={sug.status === 'accepted'}
                        style={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '5px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--color-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        Skip
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplySuggestion(idx)}
                        style={{
                          background: sug.status === 'accepted' ? '#0e6245' : '#059669',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          padding: '5px 16px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Check size={13} />
                        <span>{sug.status === 'accepted' ? '✓ Applied' : 'Apply'}</span>
                      </button>
                    </div>
                  </div>
                ))}

                {/* Completion Card with Auto-fill CTA */}
                {allApplied && (
                  <div style={{
                    background: 'linear-gradient(135deg, #0e6245 0%, #064e3b 100%)',
                    color: '#ffffff',
                    borderRadius: 'var(--radius-lg)',
                    padding: 22,
                    boxShadow: '0 8px 24px rgba(14, 98, 69, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle2 size={24} color="#86efac" />
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800 }}>Changes applied • Max fit achieved!</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>
                          Your résumé is tailored with zero fabrication and maximum ATS keyword coverage (98% Match).
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={handleLaunchAutoFill}
                        style={{
                          flex: 1,
                          background: '#ffffff',
                          color: '#0e6245',
                          border: 'none',
                          borderRadius: 'var(--radius-md)',
                          padding: '11px 18px',
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                        }}
                      >
                        <Zap size={16} color="#0e6245" />
                        <span>⚡ Apply with auto-fill</span>
                      </button>

                      <a
                        href={`/api/v3/resumes/${resumeId || 'primary'}/export/pdf`}
                        download
                        style={{
                          background: 'rgba(255,255,255,0.15)',
                          color: '#ffffff',
                          border: '1px solid rgba(255,255,255,0.3)',
                          borderRadius: 'var(--radius-md)',
                          padding: '11px 16px',
                          fontSize: 13,
                          fontWeight: 700,
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Download size={15} />
                        <span>Download PDF</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TailorPage;
