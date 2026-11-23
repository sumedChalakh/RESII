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
  ExternalLink,
  RefreshCw,
  Briefcase,
  ChevronDown,
  ChevronUp,
  User,
  Eye,
  Bot,
  Sliders,
  RotateCcw
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
  type?: string;
  title: string;
  blocks: ResumeBlock[];
}

interface AtsFacts {
  roles_count: number;
  schools_count: number;
  projects_count: number;
  skills_count: number;
  seniority_level: string;
  field: string;
  years_of_experience: string;
  summary_text: string;
}

export const EditTreePage: React.FC = () => {
  const { resumeId } = useParams<{ resumeId: string }>();
  const dispatch = useDispatch();

  const [version, setVersion] = useState(1);
  const [atsScore, setAtsScore] = useState(78);
  const [writingScore, setWritingScore] = useState(61);
  const [formatScore, setFormatScore] = useState(98);
  const [recruiterSummary, setRecruiterSummary] = useState(
    'Clear foundational background in Data Science & AI, but bullets lack action verbs and measurable metrics. Applying the ATS rewrites below will strengthen recruiter skim-read impact.'
  );
  const [atsFacts, setAtsFacts] = useState<AtsFacts>({
    roles_count: 6,
    schools_count: 2,
    projects_count: 6,
    skills_count: 48,
    seniority_level: 'Senior',
    field: 'Data Science & AI',
    years_of_experience: '4–6 yr',
    summary_text: 'Read 6 roles • 2 schools • 6 projects • 48 skills. Reads as Senior • Data Science & AI • 4–6 yr. Every fact found.'
  });
  const [showAtsDetails, setShowAtsDetails] = useState(false);
  const [realJobsCount, setRealJobsCount] = useState<number>(7643);

  const [saving, setSaving] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [tightened, setTightened] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewMode, setPreviewMode] = useState<'original' | 'tree'>('original');
  const [aiLoadingLineId, setAiLoadingLineId] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<number>(Date.now());
  const [refreshingPreview, setRefreshingPreview] = useState(false);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);

  // Tracks interactive state for suggestions: 'applied' | 'skipped' with undo support
  const [suggestionState, setSuggestionState] = useState<Record<string, { status: 'applied' | 'skipped'; prevText: string; prevRewrite: string }>>({});

  // Concurrency conflict state
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictDetail, setConflictDetail] = useState<any>(null);

  // Resume header
  const [header, setHeader] = useState<{
    name: string;
    title: string;
    email: string;
    phone: string;
    location: string;
    links: string[];
  }>({
    name: 'Sumed Chalakh',
    title: 'Data Scientist | AI/ML Engineer',
    email: 'sumedchalakh528@gmail.com',
    phone: '+91 8329935523',
    location: 'Nagpur, Maharashtra',
    links: ['linkedin.com/in/sumed-chalakh', 'github.com/sumedchalakh']
  });

  // Resume structure
  const [sections, setSections] = useState<ResumeSection[]>([]);

  // Load document and real job counts from API on mount
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
        if (data.ats_score !== undefined) {
          setAtsScore(data.ats_score);
        }
        if (data.writing_score !== undefined) {
          setWritingScore(data.writing_score);
        }
        if (data.format_score !== undefined) {
          setFormatScore(data.format_score);
        }
        if (data.recruiter_summary) {
          setRecruiterSummary(data.recruiter_summary);
        }
        if (data.ats_facts) {
          setAtsFacts(data.ats_facts);
        }
        if (data.real_jobs_count !== undefined) {
          setRealJobsCount(data.real_jobs_count);
        }
        if (data.page_count || data.layout?.page_count) {
          setPageCount(data.page_count || data.layout?.page_count || 1);
        }
      })
      .catch((err) => {
        console.warn('API document load notice:', err);
      });

    // Also fetch live jobs count from /api/jobs/count
    fetch('/api/jobs/count')
      .then((res) => res.json())
      .then((data) => {
        if (data.count !== undefined) {
          setRealJobsCount(data.count);
        }
      })
      .catch(() => {});
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
        if (data.ats_score !== undefined) setAtsScore(data.ats_score);
        if (data.writing_score !== undefined) setWritingScore(data.writing_score);
        if (data.format_score !== undefined) setFormatScore(data.format_score);
        if (data.recruiter_summary) setRecruiterSummary(data.recruiter_summary);
        if (data.ats_facts) setAtsFacts(data.ats_facts);
        if (data.real_jobs_count !== undefined) setRealJobsCount(data.real_jobs_count);
        if (data.layout) {
          setPageCount(data.layout.page_count);
          setTightened(data.layout.tightened);
        }
        setSaveSuccess(true);
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

  // Calculate total pending suggestions count
  let pendingSuggestionsCount = 0;
  sections.forEach((sec) => {
    sec.blocks.forEach((blk) => {
      blk.lines.forEach((l) => {
        if (l.rewrite && !suggestionState[l.id]) {
          pendingSuggestionsCount++;
        }
      });
    });
  });

  // Apply single rewrite
  const handleApplyRewrite = async (secIdx: number, blkIdx: number, lineIdx: number) => {
    const line = sections[secIdx].blocks[blkIdx].lines[lineIdx];
    if (!line.rewrite) return;

    const prevText = line.text;
    const prevRewrite = line.rewrite;

    const updated = JSON.parse(JSON.stringify(sections));
    updated[secIdx].blocks[blkIdx].lines[lineIdx].text = prevRewrite;
    setSections(updated);

    setSuggestionState((prev) => ({
      ...prev,
      [line.id]: { status: 'applied', prevText, prevRewrite }
    }));

    setWritingScore((prev) => Math.min(98, prev + 3));
    setAtsScore((prev) => Math.min(99, prev + 2));
    dispatch(addXp({ amount: 20, reason: 'Applied ATS Bullet Rewrite' }));

    // Trigger visual updating indicator on preview sheet
    setRefreshingPreview(true);
    await saveDocumentToServer({ header, sections: updated });
    setPreviewKey(Date.now());
    setTimeout(() => setRefreshingPreview(false), 500);
  };

  // Skip single rewrite
  const handleSkipRewrite = (lineId: string, secIdx: number, blkIdx: number, lineIdx: number) => {
    const line = sections[secIdx].blocks[blkIdx].lines[lineIdx];
    setSuggestionState((prev) => ({
      ...prev,
      [lineId]: { status: 'skipped', prevText: line.text, prevRewrite: line.rewrite || '' }
    }));
  };

  // Undo applied or skipped rewrite
  const handleUndo = async (lineId: string, secIdx: number, blkIdx: number, lineIdx: number) => {
    const st = suggestionState[lineId];
    if (!st) return;

    if (st.status === 'applied') {
      const updated = JSON.parse(JSON.stringify(sections));
      updated[secIdx].blocks[blkIdx].lines[lineIdx].text = st.prevText;
      setSections(updated);
      setWritingScore((prev) => Math.max(50, prev - 3));
      setAtsScore((prev) => Math.max(50, prev - 2));

      setRefreshingPreview(true);
      await saveDocumentToServer({ header, sections: updated });
      setPreviewKey(Date.now());
      setTimeout(() => setRefreshingPreview(false), 400);
    }

    setSuggestionState((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  };

  // Apply all pending rewrites in batch
  const handleApplyAll = async () => {
    const updated = JSON.parse(JSON.stringify(sections));
    const newStates = { ...suggestionState };
    let countApplied = 0;

    updated.forEach((sec: ResumeSection) => {
      sec.blocks.forEach((blk: ResumeBlock) => {
        blk.lines.forEach((l: ResumeLine) => {
          if (l.rewrite && !newStates[l.id]) {
            newStates[l.id] = { status: 'applied', prevText: l.text, prevRewrite: l.rewrite };
            l.text = l.rewrite;
            countApplied++;
          }
        });
      });
    });

    if (countApplied === 0) return;

    setSections(updated);
    setSuggestionState(newStates);
    setWritingScore((prev) => Math.min(96, prev + countApplied * 3));
    setAtsScore((prev) => Math.min(98, prev + countApplied * 2));
    dispatch(addXp({ amount: countApplied * 20, reason: `Applied ${countApplied} ATS Rewrites` }));

    setRefreshingPreview(true);
    await saveDocumentToServer({ header, sections: updated });
    setPreviewKey(Date.now());
    setTimeout(() => setRefreshingPreview(false), 600);
  };

  // Request on-demand AI rewrite from OpenRouter
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
          target_role: header.title || 'Data Scientist | AI/ML Engineer',
          company: sections[secIdx]?.blocks[blkIdx]?.company || ''
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rewrite) {
          const updated = JSON.parse(JSON.stringify(sections));
          updated[secIdx].blocks[blkIdx].lines[lineIdx].rewrite = data.rewrite;
          setSections(updated);
          // Reset any prior suggestion state for this line
          setSuggestionState((prev) => {
            const next = { ...prev };
            delete next[line.id];
            return next;
          });
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

  const handleRefreshPreview = async () => {
    setRefreshingPreview(true);
    await saveDocumentToServer({ header, sections });
    setPreviewKey(Date.now());
    setTimeout(() => setRefreshingPreview(false), 400);
  };

  // Visual diff renderer: highlights deleted words in red strikethrough, added words in bold green
  const renderDiff = (original: string, rewrite: string) => {
    const origWords = original.split(/\s+/);
    const rewWords = rewrite.split(/\s+/);

    let prefixLen = 0;
    while (prefixLen < origWords.length && prefixLen < rewWords.length && origWords[prefixLen].toLowerCase() === rewWords[prefixLen].toLowerCase()) {
      prefixLen++;
    }

    let suffixLen = 0;
    while (
      suffixLen < (origWords.length - prefixLen) &&
      suffixLen < (rewWords.length - prefixLen) &&
      origWords[origWords.length - 1 - suffixLen].toLowerCase() === rewWords[rewWords.length - 1 - suffixLen].toLowerCase()
    ) {
      suffixLen++;
    }

    const prefix = origWords.slice(0, prefixLen).join(' ');
    const origMiddle = origWords.slice(prefixLen, origWords.length - suffixLen).join(' ');
    const rewMiddle = rewWords.slice(prefixLen, rewWords.length - suffixLen).join(' ');
    const suffix = origWords.slice(origWords.length - suffixLen).join(' ');

    return (
      <div style={{ fontSize: 13, lineHeight: 1.5, color: '#1f2937' }}>
        {prefix ? `${prefix} ` : ''}
        {origMiddle && (
          <span style={{
            textDecoration: 'line-through',
            color: '#dc2626',
            background: '#fee2e2',
            padding: '1px 4px',
            borderRadius: 3,
            marginRight: 4
          }}>
            {origMiddle}
          </span>
        )}
        {rewMiddle && (
          <span style={{
            fontWeight: 700,
            color: '#047857',
            background: '#d1fae5',
            padding: '1px 4px',
            borderRadius: 3,
            marginRight: 4
          }}>
            {rewMiddle}
          </span>
        )}
        {suffix}
      </div>
    );
  };

  // Determine category and explanation for rewrite
  const getRewriteMeta = (original: string, rewrite: string) => {
    const origLower = original.toLowerCase();
    const rewLower = rewrite.toLowerCase();
    const hasMetricAdded = /\d+[%$]|\b\d{2,}\b|\b\d+\s*(?:k|m|ms)\b/.test(rewLower) && !/\d+[%$]|\b\d{2,}\b|\b\d+\s*(?:k|m|ms)\b/.test(origLower);
    
    if (hasMetricAdded) {
      return { category: 'Impact', tag: 'Added outcome & metrics' };
    }
    if (rewWordsLength(original) > rewWordsLength(rewrite) + 3) {
      return { category: 'Wording', tag: 'Condensed summary & removed filler' };
    }
    return { category: 'Wording', tag: 'Strengthened action verb' };
  };

  const rewWordsLength = (t: string) => (t ? t.split(/\s+/).length : 0);

  // Format real jobs count e.g. 7643 -> 7.6k
  const formatJobsCount = (cnt: number) => {
    if (cnt >= 1000) {
      return (cnt / 1000).toFixed(1) + 'k';
    }
    return cnt.toString();
  };

  // Filter out any accidentally duplicated or empty contact-only sections
  const filteredSections = sections.filter((s) => {
    const title = (s.title || '').toLowerCase();
    const isContactOnly = s.blocks.every((b) =>
      b.lines.every((l) => l.text.includes('@') || /^\+?\d[\d\s-]{8,}/.test(l.text.trim()))
    );
    if (isContactOnly && title.includes('summary')) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ========================================================================= */}
      {/* TOP HEADER ACTION BAR (Clean, modern, strictly matching video)            */}
      {/* ========================================================================= */}
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
          <Link
            to="/"
            title="Back to Dashboard"
            style={{
              color: 'var(--color-muted)',
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
              padding: 6,
              borderRadius: 6,
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)'
            }}
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#111827' }}>
                {header.title || 'Data Scientist | AI/ML Engineer'}
              </h1>
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
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: '#059669',
                fontWeight: 600
              }}>
                <Check size={14} color="#059669" />
                <span>Saved</span>
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
              Candidate: <strong>{header.name}</strong> • Page budget: {pageCount} page • Tightened: {tightened ? 'Yes' : 'No'}
            </div>
          </div>
        </div>

        {/* Live ATS Score Ring, Dynamic Jobs Pill, and Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Dynamic ATS Score Ring */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#059669',
            fontWeight: 700,
            fontSize: 13
          }}>
            <Sparkles size={14} />
            <span>{atsScore} ATS SCORE</span>
          </div>

          {/* Navigation Pills */}
          <button
            type="button"
            onClick={() => setPreviewMode(previewMode === 'original' ? 'tree' : 'original')}
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-full)',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-ink)',
              cursor: 'pointer'
            }}
          >
            Preview
          </button>

          <span style={{
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-full)',
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-ink)'
          }}>
            Fit ({pendingSuggestionsCount > 0 ? pendingSuggestionsCount : 1})
          </span>

          {/* Real Dynamic Jobs Pill */}
          <Link
            to="/jobs"
            title={`View ${realJobsCount.toLocaleString()} real active jobs`}
            style={{
              background: 'rgba(14, 165, 233, 0.1)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: 'var(--radius-full)',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 700,
              color: '#0284c7',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <Briefcase size={13} />
            <span>Jobs ({formatJobsCount(realJobsCount)})</span>
          </Link>

          {/* Download Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setDownloadOpen(!downloadOpen)}
              style={{
                background: 'var(--color-surface-card)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '7px 12px',
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

          {/* Primary Save Button */}
          <button
            onClick={() => saveDocumentToServer({ header, sections })}
            disabled={saving}
            style={{
              background: saveSuccess ? 'var(--color-success)' : '#0e6245',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background 150ms ease'
            }}
          >
            {saveSuccess ? <Check size={15} /> : <Save size={15} />}
            <span>{saving ? 'Saving…' : saveSuccess ? `Saved v${version}` : 'Save Resume'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN TWO-COLUMN WORKSPACE: Review Cards & Tree Editor | Sheet Preview      */}
      {/* ========================================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(420px, 1.35fr) minmax(360px, 1fr)',
        gap: 24,
        alignItems: 'start'
      }}>
        {/* LEFT COLUMN: Review Cards, Profile, and Resume Tree Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ===================================================================== */}
          {/* 1. SCORE PARTS CARD (Writing & Format + "Apply all X" button)        */}
          {/* ===================================================================== */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sliders size={16} color="#059669" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                  Score parts
                </span>
              </div>
              <button
                type="button"
                onClick={handleApplyAll}
                disabled={pendingSuggestionsCount === 0}
                style={{
                  background: pendingSuggestionsCount > 0 ? '#0e6245' : '#e5e7eb',
                  color: pendingSuggestionsCount > 0 ? '#ffffff' : '#9ca3af',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: pendingSuggestionsCount > 0 ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 150ms ease'
                }}
              >
                <Sparkles size={13} />
                <span>Apply all ({pendingSuggestionsCount})</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Writing Score Progress */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  <span style={{ color: '#4b5563' }}>Writing</span>
                  <span style={{ color: '#111827', fontWeight: 700 }}>{writingScore} / 100</span>
                </div>
                <div style={{ width: '100%', height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${writingScore}%`,
                    height: '100%',
                    background: writingScore >= 75 ? '#059669' : '#f59e0b',
                    borderRadius: 3,
                    transition: 'width 300ms ease'
                  }} />
                </div>
              </div>

              {/* Format Score Progress */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  <span style={{ color: '#4b5563' }}>Format</span>
                  <span style={{ color: '#111827', fontWeight: 700 }}>{formatScore} / 100</span>
                </div>
                <div style={{ width: '100%', height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${formatScore}%`,
                    height: '100%',
                    background: formatScore >= 80 ? '#059669' : '#3b82f6',
                    borderRadius: 3,
                    transition: 'width 300ms ease'
                  }} />
                </div>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* 2. "A RECRUITER" ASSESSMENT CARD (Dynamic from real facts)           */}
          {/* ===================================================================== */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '14px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Eye size={13} color="#d97706" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                A recruiter
              </span>
            </div>
            <p style={{
              margin: 0,
              fontSize: 13,
              color: '#4b5563',
              lineHeight: 1.45
            }}>
              {recruiterSummary}
            </p>
          </div>

          {/* ===================================================================== */}
          {/* 3. "AN ATS" BREAKDOWN CARD (Dynamic fact counts + expandable)        */}
          {/* ===================================================================== */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '14px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#e0f2fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Bot size={13} color="#0284c7" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                  An ATS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAtsDetails(!showAtsDetails)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#0284c7',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3
                }}
              >
                <span>{showAtsDetails ? 'Hide the read' : 'Show the read'}</span>
                {showAtsDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
            <p style={{
              margin: 0,
              fontSize: 13,
              color: '#4b5563',
              lineHeight: 1.45
            }}>
              {atsFacts.summary_text}
            </p>

            {/* Expandable Read Breakdown Drawer */}
            {showAtsDetails && (
              <div style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px dashed var(--color-border)',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                fontSize: 11
              }}>
                <div style={{ background: 'var(--color-surface-elevated)', padding: '6px 8px', borderRadius: 4 }}>
                  <div style={{ color: 'var(--color-muted)' }}>Roles</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{atsFacts.roles_count}</div>
                </div>
                <div style={{ background: 'var(--color-surface-elevated)', padding: '6px 8px', borderRadius: 4 }}>
                  <div style={{ color: 'var(--color-muted)' }}>Schools</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{atsFacts.schools_count}</div>
                </div>
                <div style={{ background: 'var(--color-surface-elevated)', padding: '6px 8px', borderRadius: 4 }}>
                  <div style={{ color: 'var(--color-muted)' }}>Projects</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{atsFacts.projects_count}</div>
                </div>
                <div style={{ background: 'var(--color-surface-elevated)', padding: '6px 8px', borderRadius: 4 }}>
                  <div style={{ color: 'var(--color-muted)' }}>Skills</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{atsFacts.skills_count}</div>
                </div>
              </div>
            )}
          </div>

          {/* ===================================================================== */}
          {/* 4. CONTACT & PROFILE CARD                                             */}
          {/* ===================================================================== */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 18,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
              paddingBottom: 8,
              borderBottom: '1px solid var(--color-border-subtle)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={15} color="#0e6245" />
                <span style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Contact & Profile Details
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>
                Header Info
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
                  Full Candidate Name
                </label>
                <input
                  type="text"
                  value={header.name}
                  onChange={(e) => setHeader({ ...header, name: e.target.value })}
                  placeholder="Sumed Chalakh"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
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
                  placeholder="Data Scientist | AI/ML Engineer"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
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
                    padding: '7px 10px',
                    borderRadius: 6,
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
                    padding: '7px 10px',
                    borderRadius: 6,
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
                  placeholder="Nagpur, Maharashtra"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* 5. RESUME SECTIONS & INLINE SUGGESTION CARDS                           */}
          {/* ===================================================================== */}
          {filteredSections.map((sec, secIdx) => (
            <div
              key={sec.id}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 18,
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
                paddingBottom: 8,
                borderBottom: '1px solid var(--color-border-subtle)'
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#111827' }}>
                  {sec.title}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>
                  Structured Section
                </span>
              </div>

              {sec.blocks.map((blk, blkIdx) => (
                <div key={blk.id} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  {(blk.role || blk.company) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{blk.role}</span>
                        {blk.company && (
                          <>
                            <span style={{ margin: '0 6px', color: 'var(--color-muted)' }}>•</span>
                            <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>{blk.company}</span>
                          </>
                        )}
                      </div>
                      {blk.period && (
                        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{blk.period}</span>
                      )}
                    </div>
                  )}

                  {/* Lines List with Suggested Rewrites & Line Budget */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {blk.lines.map((line, lineIdx) => {
                      const charCount = (line.text || '').length;
                      const lineCount = Math.max(1, Math.ceil(charCount / 85));
                      const isOverflowEdge = (charCount > 85 && charCount <= 110) || (charCount > 170 && charCount <= 200);
                      const state = suggestionState[line.id];
                      const rewriteMeta = line.rewrite ? getRewriteMeta(line.text, line.rewrite) : null;

                      return (
                        <div
                          key={line.id}
                          style={{
                            background: 'var(--color-surface-elevated)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            padding: 10
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ color: '#0e6245', fontWeight: 700, marginTop: 6 }}>•</span>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <textarea
                                value={line.text}
                                onChange={(e) => handleUpdateLine(secIdx, blkIdx, lineIdx, e.target.value)}
                                rows={Math.max(2, Math.ceil(charCount / 70))}
                                style={{
                                  width: '100%',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: 4,
                                  background: '#ffffff',
                                  fontSize: 13,
                                  color: '#111827',
                                  padding: '7px 9px',
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
                                  padding: '3px 6px',
                                  borderRadius: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5
                                }}>
                                  <AlertCircle size={11} />
                                  <span>Wraps to {lineCount} lines in PDF — shorten a few words to save 1 line</span>
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
                              <span
                                title={`Approximately ${lineCount} line${lineCount > 1 ? 's' : ''} on standard PDF format`}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '1px 5px',
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
                                  borderRadius: 4,
                                  padding: '3px 6px',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <Sparkles size={11} />
                                <span>{aiLoadingLineId === line.id ? 'Writing…' : 'AI Rewrite'}</span>
                              </button>
                              <button
                                onClick={() => handleDeleteLine(secIdx, blkIdx, lineIdx)}
                                title="Delete bullet"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--color-muted)',
                                  cursor: 'pointer',
                                  padding: 2
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* ========================================================= */}
                          {/* INLINE AI SUGGESTION CARD (Diff, Actions, Hover Sync)     */}
                          {/* ========================================================= */}
                          {line.rewrite && (
                            <div style={{ marginTop: 8 }}>
                              {state?.status === 'applied' ? (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: '#ecfdf5',
                                  border: '1px solid #a7f3d0',
                                  borderRadius: 6,
                                  padding: '6px 10px',
                                  fontSize: 12,
                                  color: '#065f46'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Check size={14} color="#059669" />
                                    <span style={{ fontWeight: 600 }}>Rewrite applied</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleUndo(line.id, secIdx, blkIdx, lineIdx)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#047857',
                                      cursor: 'pointer',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3
                                    }}
                                  >
                                    <RotateCcw size={11} />
                                    <span>Undo</span>
                                  </button>
                                </div>
                              ) : state?.status === 'skipped' ? (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: '#f3f4f6',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 6,
                                  padding: '6px 10px',
                                  fontSize: 12,
                                  color: '#6b7280'
                                }}>
                                  <span>Rewrite skipped</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUndo(line.id, secIdx, blkIdx, lineIdx)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#4b5563',
                                      cursor: 'pointer',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3
                                    }}
                                  >
                                    <RotateCcw size={11} />
                                    <span>Undo</span>
                                  </button>
                                </div>
                              ) : (
                                <div
                                  onMouseEnter={() => setHoveredLineId(line.id)}
                                  onMouseLeave={() => setHoveredLineId(null)}
                                  style={{
                                    border: '1px solid #c7d2fe',
                                    borderRadius: 8,
                                    background: '#f8fafc',
                                    padding: 12,
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                                    transition: 'border 150ms ease'
                                  }}
                                >
                                  {/* Suggestion Header Pill */}
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: 8
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{
                                        background: '#e0e7ff',
                                        color: '#4338ca',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '2px 7px',
                                        borderRadius: 4
                                      }}>
                                        1 Suggested
                                      </span>
                                      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                                        {rewriteMeta?.category || 'Wording'}
                                      </span>
                                    </div>
                                    <span style={{
                                      background: '#ecfdf5',
                                      color: '#059669',
                                      border: '1px solid #a7f3d0',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: '1px 6px',
                                      borderRadius: 4
                                    }}>
                                      +2 fit
                                    </span>
                                  </div>

                                  {/* Diff Comparison Box */}
                                  <div style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 6,
                                    padding: '8px 10px',
                                    marginBottom: 8
                                  }}>
                                    {renderDiff(line.text, line.rewrite)}
                                  </div>

                                  {/* Explanation Tag & Actions */}
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: 8
                                  }}>
                                    <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                                      {rewriteMeta?.tag || 'Strengthened ATS keyword density'}
                                    </span>

                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <button
                                        type="button"
                                        onClick={() => handleSkipRewrite(line.id, secIdx, blkIdx, lineIdx)}
                                        style={{
                                          background: '#ffffff',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: 4,
                                          padding: '4px 10px',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          color: '#475569',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Skip
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleApplyRewrite(secIdx, blkIdx, lineIdx)}
                                        style={{
                                          background: '#0e6245',
                                          border: 'none',
                                          borderRadius: 4,
                                          padding: '4px 12px',
                                          fontSize: 12,
                                          fontWeight: 700,
                                          color: '#ffffff',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Apply
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
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
                        padding: '5px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        marginTop: 4
                      }}
                    >
                      <Plus size={13} />
                      <span>Add bullet point</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Realistic Paper Sheet Preview (Never alters user template)   */}
        {/* ========================================================================= */}
        <div style={{
          position: 'sticky',
          top: 80,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sheet)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>
          {/* Header Action Row */}
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

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
                  padding: '5px 9px',
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
                  gap: 4,
                  textDecoration: 'none',
                  color: 'inherit'
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

          {/* Paper Document Preview Container */}
          <div style={{
            background: '#ffffff',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            minHeight: '720px',
            position: 'relative'
          }}>
            {/* Floating Updating Indicator */}
            {refreshingPreview && (
              <div style={{
                position: 'absolute',
                top: 14,
                right: 14,
                zIndex: 30,
                background: 'rgba(14, 98, 69, 0.92)',
                color: '#ffffff',
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}>
                <RefreshCw size={13} className="spin" />
                <span>Updating preview…</span>
              </div>
            )}

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

                {filteredSections.map((s) => (
                  <div key={s.id} style={{ marginBottom: 12 }}>
                    <div style={{ borderBottom: '1px solid #1a1d1e', fontWeight: 800, fontSize: 10, letterSpacing: '0.06em', marginBottom: 4 }}>
                      {s.title.toUpperCase()}
                    </div>
                    {s.blocks.map((b) => (
                      <div key={b.id} style={{ marginBottom: 6 }}>
                        {(b.role || b.company) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 10 }}>
                            <span>{b.role}{b.company ? ` — ${b.company}` : ''}</span>
                            <span>{b.period}</span>
                          </div>
                        )}
                        {b.lines.map((l) => {
                          const isHovered = hoveredLineId === l.id;
                          return (
                            <div
                              key={l.id}
                              style={{
                                fontSize: 10,
                                color: '#333',
                                marginLeft: 6,
                                padding: isHovered ? '2px 4px' : undefined,
                                background: isHovered ? '#e0e7ff' : undefined,
                                borderRadius: isHovered ? 3 : undefined,
                                transition: 'all 150ms ease'
                              }}
                            >
                              • {l.text}
                            </div>
                          );
                        })}
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
                  saveDocumentToServer({ header, sections }, serverVer);
                }}
                style={{
                  background: '#0e6245',
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
