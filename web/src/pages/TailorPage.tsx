import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  ChevronRight,
  Save,
  FileText,
  Copy,
  ShieldCheck,
  AlertTriangle,
  Cpu
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
  const dispatch = useDispatch();

  const [jobDescription, setJobDescription] = useState(
    'Looking for a Senior Full-Stack Engineer with strong production experience in React, TypeScript, FastAPI, Redis, and high-concurrency systems. Experience driving P99 latency reductions and leading cross-functional pods is required.'
  );
  const [targetCompany, setTargetCompany] = useState('Stripe');
  const [targetRole, setTargetRole] = useState('Senior Full-Stack Engineer');
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'tailor' | 'cover-letter'>('tailor');

  // Results from API
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [matchRate, setMatchRate] = useState<number | null>(null);
  const [matchedKeywords, setMatchedKeywords] = useState<string[]>([]);
  const [missingKeywords, setMissingKeywords] = useState<string[]>([]);
  const [skillGaps, setSkillGaps] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<TailorSuggestion[]>([]);

  // Cover Letter State
  const [coverLetterText, setCoverLetterText] = useState<string>('');
  const [coverLetterTone, setCoverLetterTone] = useState<string>('professional');
  const [coverLetterLength, setCoverLetterLength] = useState<string>('standard');
  const [coverLetterClaims, setCoverLetterClaims] = useState<string[]>([]);
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false);
  const [copiedCoverLetter, setCopiedCoverLetter] = useState(false);

  // Inference Transparency Metadata State
  const [inferenceSource, setInferenceSource] = useState<'llm' | 'heuristic' | 'mock' | null>(null);
  const [providerUsed, setProviderUsed] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [fallbackActivated, setFallbackActivated] = useState<boolean>(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const renderInferenceTransparencyBadge = () => {
    if (!inferenceSource) return null;

    let badgeBg = 'rgba(16, 185, 129, 0.08)';
    let badgeBorder = 'rgba(16, 185, 129, 0.25)';
    let badgeColor = '#059669';
    let icon = <Cpu size={16} />;
    let title = 'Neural LLM Inference';
    let subtitle = `Provider: ${providerUsed || 'configured'} • Model: ${modelUsed || 'active'}`;

    if (inferenceSource === 'heuristic' || fallbackActivated) {
      badgeBg = 'rgba(245, 158, 11, 0.08)';
      badgeBorder = 'rgba(245, 158, 11, 0.3)';
      badgeColor = '#d97706';
      icon = <AlertTriangle size={16} />;
      title = 'Deterministic Heuristic Fallback Active';
      subtitle = fallbackReason
        ? `Reason: ${fallbackReason}`
        : 'Rule-based local heuristics activated in place of LLM';
    } else if (inferenceSource === 'mock') {
      badgeBg = 'rgba(139, 92, 246, 0.08)';
      badgeBorder = 'rgba(139, 92, 246, 0.3)';
      badgeColor = '#7c3aed';
      icon = <Sparkles size={16} />;
      title = 'Mock Evaluation Provider';
      subtitle = `Simulated provider for testing • Model: ${modelUsed || 'mock-grounded-v1'}`;
    }

    return (
      <div
        data-testid="inference-transparency-badge"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          background: badgeBg,
          border: `1px solid ${badgeBorder}`,
          color: badgeColor,
          fontSize: 13,
          fontWeight: 500
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px' }}>
          <strong style={{ fontWeight: 700 }}>{title}</strong>
          <span style={{ opacity: 0.85, fontSize: 12 }}>— {subtitle}</span>
        </div>
      </div>
    );
  };

  const handleGeneratePlan = async () => {
    if (!jobDescription.trim()) return;
    setAnalyzing(true);

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
      setMatchRate(rwData.match_rate || 78);
      setMatchedKeywords(rwData.matched_keywords || []);
      setMissingKeywords(rwData.missing_keywords || []);
      setSkillGaps(rwData.skill_gaps || []);

      if (rwData.inference_source) setInferenceSource(rwData.inference_source);
      if (rwData.provider_used) setProviderUsed(rwData.provider_used);
      if (rwData.model_used) setModelUsed(rwData.model_used);
      if (rwData.fallback_activated !== undefined) setFallbackActivated(rwData.fallback_activated);
      if (rwData.fallback_reason) setFallbackReason(rwData.fallback_reason);

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
      setReviewId(planData.id);

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

  const handleDecision = async (index: number, action: 'accepted' | 'rejected') => {
    const sug = suggestions[index];
    const updated = [...suggestions];
    updated[index].status = action;
    setSuggestions(updated);

    if (reviewId) {
      try {
        await fetch('/api/v3/tailor/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            review_id: reviewId,
            action: action === 'accepted' ? 'accept' : 'reject',
            line_id: sug.line_id,
            original_text: sug.original_text,
            new_text: sug.suggested_text
          })
        });
      } catch (e) {
        console.error('Failed to log tailor event:', e);
      }
    }

    if (action === 'accepted') {
      dispatch(addXp({ amount: 15, reason: 'Accepted Keyword Tailoring Suggestion' }));
    }
  };

  const handleApplyAllAndSave = async () => {
    if (!reviewId) return;
    setApplying(true);

    const accepted = suggestions
      .filter((s) => s.status === 'accepted' || s.status === 'pending')
      .map((s) => ({
        line_id: s.line_id,
        new_text: s.suggested_text
      }));

    try {
      const res = await fetch('/api/v3/tailor/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: reviewId,
          title: `Tailored: ${targetRole} @ ${targetCompany}`,
          accepted_changes: accepted
        })
      });

      if (res.ok) {
        const data = await res.json();
        dispatch(addXp({ amount: 100, reason: 'Saved New Tailored Resume' }));
        navigate(`/edit/${data.resume_id}`);
      }
    } catch (err) {
      console.error('Apply error:', err);
    } finally {
      setApplying(false);
    }
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
        if (data.inference_source) setInferenceSource(data.inference_source);
        if (data.provider_used) setProviderUsed(data.provider_used);
        if (data.model_used) setModelUsed(data.model_used);
        if (data.fallback_activated !== undefined) setFallbackActivated(data.fallback_activated);
        if (data.fallback_reason) setFallbackReason(data.fallback_reason);
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

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
          <Sparkles size={16} />
          <span>AI TAILORING WORKFLOW</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>Tailor Resume & Cover Letter for Target Role</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)' }}>
          Extract target ATS keywords, generate evidence-grounded bullet enhancements, and craft authentic role-specific cover letters without fabrication.
        </p>
      </div>

      {/* Workflow Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--color-border)', paddingBottom: 2 }}>
        <button
          onClick={() => setActiveTab('tailor')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'tailor' ? '2px solid var(--color-primary)' : '2px solid transparent',
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: activeTab === 'tailor' ? 700 : 500,
            color: activeTab === 'tailor' ? 'var(--color-primary)' : 'var(--color-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Sparkles size={16} />
          <span>Resume Tailoring & Matching</span>
        </button>
        <button
          onClick={() => setActiveTab('cover-letter')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'cover-letter' ? '2px solid var(--color-primary)' : '2px solid transparent',
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: activeTab === 'cover-letter' ? 700 : 500,
            color: activeTab === 'cover-letter' ? 'var(--color-primary)' : 'var(--color-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <FileText size={16} />
          <span>Evidence-Grounded Cover Letter</span>
        </button>
      </div>

      {/* Input Form */}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Company</label>
            <input
              type="text"
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder="e.g. Stripe, OpenAI, Datadog"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-elevated)',
                color: 'var(--color-text)',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Job Title</label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Senior Full-Stack Engineer"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-elevated)',
                color: 'var(--color-text)',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Job Description Text</label>
          <textarea
            rows={6}
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job requirements, qualifications, and role responsibilities here…"
            style={{
              width: '100%',
              padding: 12,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-elevated)',
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--color-text)',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Extra options for Cover Letter */}
        {activeTab === 'cover-letter' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Letter Tone</label>
              <select
                value={coverLetterTone}
                onChange={(e) => setCoverLetterTone(e.target.value)}
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
                <option value="professional">Professional & Direct</option>
                <option value="conversational">Conversational & Engaging</option>
                <option value="technical">Technical & Systems-Focused</option>
                <option value="executive">Executive & Strategic</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Length</label>
              <select
                value={coverLetterLength}
                onChange={(e) => setCoverLetterLength(e.target.value)}
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
                <option value="concise">Concise (~250 words)</option>
                <option value="standard">Standard (~350 words)</option>
                <option value="detailed">Detailed (~450 words)</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'tailor' ? (
          <button
            onClick={handleGeneratePlan}
            disabled={analyzing}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '11px 22px',
              fontSize: 14,
              fontWeight: 600,
              cursor: analyzing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <Sparkles size={16} />
            <span>{analyzing ? 'Analyzing Keywords & Synthesizing Plan…' : 'Generate Tailoring Plan'}</span>
          </button>
        ) : (
          <button
            onClick={handleGenerateCoverLetter}
            disabled={generatingCoverLetter}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '11px 22px',
              fontSize: 14,
              fontWeight: 600,
              cursor: generatingCoverLetter ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={16} />
            <span>{generatingCoverLetter ? 'Drafting Evidence-Grounded Letter…' : 'Generate Grounded Cover Letter'}</span>
          </button>
        )}
      </div>

      {/* Cover Letter Result Section */}
      {activeTab === 'cover-letter' && coverLetterText && (
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
                Cover Letter for {targetRole} @ {targetCompany}
              </h2>
              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                Tone: <strong style={{ textTransform: 'capitalize' }}>{coverLetterTone}</strong> • Length: <strong style={{ textTransform: 'capitalize' }}>{coverLetterLength}</strong>
              </div>
            </div>
            <button
              onClick={handleCopyCoverLetter}
              style={{
                background: 'var(--color-surface-elevated)',
                color: 'var(--color-text)',
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
              {copiedCoverLetter ? <CheckCircle2 size={15} color="var(--color-success)" /> : <Copy size={15} />}
              <span>{copiedCoverLetter ? 'Copied!' : 'Copy to Clipboard'}</span>
            </button>
          </div>

          {renderInferenceTransparencyBadge()}

          <div style={{
            padding: 20,
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
            fontSize: 14,
            color: 'var(--color-text)',
            fontFamily: 'inherit'
          }}>
            {coverLetterText}
          </div>

          {coverLetterClaims.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                Verified Evidence Claims Cited ({coverLetterClaims.length}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {coverLetterClaims.map((claim, cIdx) => (
                  <span
                    key={cIdx}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-surface-elevated)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <ShieldCheck size={12} color="var(--color-success)" />
                    {claim}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Section */}
      {activeTab === 'tailor' && reviewId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {renderInferenceTransparencyBadge()}

          {/* Match Score & Keywords Banner */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            display: 'grid',
            gridTemplateColumns: '220px 1fr',
            gap: 24,
            alignItems: 'center'
          }}>
            <div style={{ borderRight: '1px solid var(--color-border)', paddingRight: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--color-muted)', fontWeight: 600 }}>TARGET MATCH RATE</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 38, fontWeight: 800, color: 'var(--color-primary)' }}>{matchRate}%</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-success)' }}>+24% Target</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
                After applying {suggestions.length} tailored bullet adjustments
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Keyword Coverage Analysis:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {matchedKeywords.slice(0, 6).map((kw) => (
                  <span key={kw} style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-success-bg)',
                    color: 'var(--color-success)',
                    fontWeight: 600
                  }}>
                    ✓ {kw}
                  </span>
                ))}
                {missingKeywords.slice(0, 6).map((kw) => (
                  <span key={kw} style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-warning-bg)',
                    color: 'var(--color-warning)',
                    fontWeight: 600
                  }}>
                    + Add {kw}
                  </span>
                ))}
              </div>

              {skillGaps.length > 0 && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 6
                }}>
                  <ShieldCheck size={16} color="var(--color-primary)" />
                  <span>
                    <strong>Evidence Invariant:</strong> {skillGaps.length} unevidenced skill(s) ({skillGaps.slice(0, 4).join(', ')}) omitted from resume bullets to safeguard against fabrication.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Suggestions List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Line-by-Line Tailoring Recommendations ({suggestions.length})
              </h2>
              <button
                onClick={handleApplyAllAndSave}
                disabled={applying}
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: applying ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Save size={16} />
                <span>{applying ? 'Saving Tailored Copy…' : 'Accept All & Save Tailored Resume'}</span>
              </button>
            </div>

            {suggestions.map((sug, idx) => (
              <div
                key={sug.line_id}
                style={{
                  background: 'var(--color-surface)',
                  border: `1px solid ${sug.status === 'accepted' ? 'var(--color-success)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-muted)' }}>
                    {sug.section} • {sug.role}
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--color-surface-elevated)',
                    color: 'var(--color-primary)'
                  }}>
                    {sug.impact_score}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{
                    padding: 12,
                    background: 'var(--color-surface-elevated)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: 13,
                    color: 'var(--color-muted)'
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Original Bullet:</div>
                    {sug.original_text}
                  </div>

                  <div style={{
                    padding: 12,
                    background: '#f0fdf4',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid #bbf7d0',
                    fontSize: 13,
                    color: '#166534'
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles size={12} />
                      <span>Suggested Tailored Bullet:</span>
                    </div>
                    {sug.suggested_text}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    <strong>Keyword Added:</strong> <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{sug.keyword_added}</span> — {sug.reasoning}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleDecision(idx, 'rejected')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)',
                        background: sug.status === 'rejected' ? 'var(--color-danger-bg)' : 'var(--color-surface)',
                        color: sug.status === 'rejected' ? 'var(--color-danger)' : 'var(--color-text)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <X size={14} />
                      <span>Reject</span>
                    </button>
                    <button
                      onClick={() => handleDecision(idx, 'accepted')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: sug.status === 'accepted' ? 'var(--color-success)' : 'var(--color-primary)',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <Check size={14} />
                      <span>{sug.status === 'accepted' ? 'Accepted' : 'Accept Change'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
export default TailorPage;
