import React, { useState, useEffect, useRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Undo2,
  Redo2,
  Link2,
  AlignLeft,
  Minus,
  RotateCcw
} from 'lucide-react';

interface ResumeLine {
  id: string;
  text: string;
  rewrite?: string;
  highlightWords?: string[];
  explanation?: string;
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

export const EditTreePage: React.FC = () => {
  const { resumeId } = useParams<{ resumeId: string }>();
  const dispatch = useDispatch();

  const [version, setVersion] = useState(1);
  const [atsScore, setAtsScore] = useState(78);
  const [realJobsCount, setRealJobsCount] = useState<number>(7642);

  const [saving, setSaving] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [tightened, setTightened] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewMode, setPreviewMode] = useState<'original' | 'tree'>('original');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<number>(Date.now());
  const [refreshingPreview, setRefreshingPreview] = useState(false);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // Carousel navigation for suggestions
  const [currentSuggestionIdx, setCurrentSuggestionIdx] = useState<number>(0);

  // Suggestion tracking: applied or skipped
  const [suggestionState, setSuggestionState] = useState<Record<string, { status: 'applied' | 'skipped'; prevText: string; prevRewrite: string }>>({});

  // Concurrency conflict modal
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

  // Resume sections
  const [sections, setSections] = useState<ResumeSection[]>([]);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // Load document and live jobs count on mount
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
        if (data.real_jobs_count !== undefined) {
          setRealJobsCount(data.real_jobs_count);
        }
        if (data.page_count || data.layout?.page_count) {
          setPageCount(data.page_count || data.layout?.page_count || 1);
        }
      })
      .catch((err) => {
        console.warn('Document load notice:', err);
      });

    fetch('/api/jobs/count')
      .then((res) => res.json())
      .then((data) => {
        if (data.count !== undefined) setRealJobsCount(data.count);
      })
      .catch(() => {});
  }, [resumeId]);

  // Collect all suggestion line IDs
  const allSuggestionItems: { lineId: string; secIdx: number; blkIdx: number; lineIdx: number }[] = [];
  sections.forEach((sec, sIdx) => {
    sec.blocks.forEach((blk, bIdx) => {
      blk.lines.forEach((l, lIdx) => {
        if (l.rewrite) {
          allSuggestionItems.push({ lineId: l.id, secIdx: sIdx, blkIdx: bIdx, lineIdx: lIdx });
        }
      });
    });
  });

  const totalSuggestions = allSuggestionItems.length;
  const pendingSuggestionsCount = allSuggestionItems.filter(item => !suggestionState[item.lineId]).length;

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

    setAtsScore((prev) => Math.min(99, prev + 2));
    dispatch(addXp({ amount: 20, reason: 'Applied ATS Bullet Rewrite' }));

    setRefreshingPreview(true);
    await saveDocumentToServer({ header, sections: updated });
    setPreviewKey(Date.now());
    setTimeout(() => setRefreshingPreview(false), 500);
  };

  const handleSkipRewrite = (lineId: string, secIdx: number, blkIdx: number, lineIdx: number) => {
    const line = sections[secIdx].blocks[blkIdx].lines[lineIdx];
    setSuggestionState((prev) => ({
      ...prev,
      [lineId]: { status: 'skipped', prevText: line.text, prevRewrite: line.rewrite || '' }
    }));
  };

  const handleUndo = async (lineId: string, secIdx: number, blkIdx: number, lineIdx: number) => {
    const st = suggestionState[lineId];
    if (!st) return;

    if (st.status === 'applied') {
      const updated = JSON.parse(JSON.stringify(sections));
      updated[secIdx].blocks[blkIdx].lines[lineIdx].text = st.prevText;
      setSections(updated);
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
    setAtsScore((prev) => Math.min(98, prev + countApplied * 2));
    dispatch(addXp({ amount: countApplied * 20, reason: `Applied ${countApplied} ATS Rewrites` }));

    setRefreshingPreview(true);
    await saveDocumentToServer({ header, sections: updated });
    setPreviewKey(Date.now());
    setTimeout(() => setRefreshingPreview(false), 600);
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

  // Scroll to suggestion in left pane
  const scrollToSuggestion = (idx: number) => {
    if (idx < 0 || idx >= allSuggestionItems.length) return;
    setCurrentSuggestionIdx(idx);
    const item = allSuggestionItems[idx];
    const el = document.getElementById(`sugg_box_${item.lineId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Render suggested rewrite with mint green word-level highlight
  const renderHighlightedSuggestion = (original: string, rewrite: string) => {
    const origWords = original.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const rewTokens = rewrite.split(/(\s+)/);

    // Identify words in rewrite that represent improved phrasing
    return (
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#1f2937' }}>
        {rewTokens.map((token, i) => {
          if (!token.trim()) return token;
          const cleanToken = token.toLowerCase().replace(/[^a-z0-9]/g, '');
          const isAddedWord = cleanToken && !origWords.includes(cleanToken) && cleanToken.length > 1;

          if (isAddedWord) {
            return (
              <span
                key={i}
                style={{
                  background: '#a7f3d0',
                  color: '#065f46',
                  fontWeight: 600,
                  padding: '2px 5px',
                  borderRadius: 4,
                  margin: '0 1px'
                }}
              >
                {token}
              </span>
            );
          }
          return <span key={i}>{token}</span>;
        })}
      </div>
    );
  };

  // Explanation meta
  const getExplanation = (original: string, rewrite: string) => {
    const origLower = original.toLowerCase();
    const rewLower = rewrite.toLowerCase();
    if (/\d+[%$]|\b\d{2,}\b|\b\d+\s*(?:k|m|ms)\b/.test(rewLower) && !/\d+[%$]|\b\d{2,}\b/.test(origLower)) {
      return 'Added measurable outcome, quantified impact';
    }
    if (original.split(/\s+/).length > rewrite.split(/\s+/).length + 2) {
      return 'Removed filler, tightened language';
    }
    return 'Removed filler';
  };

  const formatJobsCount = (cnt: number) => (cnt >= 1000 ? (cnt / 1000).toFixed(1) + 'k' : cnt.toString());

  // Filter out empty contact duplicates
  const filteredSections = sections.filter((s) => {
    const title = (s.title || '').toLowerCase();
    const isContactOnly = s.blocks.every((b) =>
      b.lines.every((l) => l.text.includes('@') || /^\+?\d[\d\s-]{8,}/.test(l.text.trim()))
    );
    if (isContactOnly && title.includes('summary')) return false;
    return true;
  });

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: '#ffffff'
    }}>
      {/* ========================================================================= */}
      {/* 1. FIXED TOP HEADER BAR                                                   */}
      {/* ========================================================================= */}
      <header style={{
        height: 60,
        flexShrink: 0,
        borderBottom: '1px solid #e5e7eb',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#ffffff',
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            to="/"
            title="Back to Dashboard"
            style={{
              color: '#4b5563',
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
              padding: 6,
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: '#ffffff'
            }}
          >
            <ArrowLeft size={16} />
          </Link>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#111827',
                margin: 0,
                maxWidth: 380,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {header.name ? `${header.name.toUpperCase()} - ${header.title || 'Resume'}` : 'RESUME'}
              </h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: '#059669',
                fontWeight: 600
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }} />
                <span>Saved</span>
              </span>
            </div>
          </div>
        </div>

        {/* ATS Score & Navigation Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Dynamic ATS Score Ring */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 9999,
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#059669',
            fontWeight: 700,
            fontSize: 13
          }}>
            <span>ATS score of 100</span>
            <Check size={14} />
            <span style={{
              background: '#059669',
              color: '#ffffff',
              borderRadius: '50%',
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11
            }}>
              {atsScore}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setPreviewMode(previewMode === 'original' ? 'tree' : 'original')}
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 9999,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            Preview
          </button>

          {/* Real Jobs Pill */}
          <Link
            to="/jobs"
            title={`View ${realJobsCount.toLocaleString()} real jobs`}
            style={{
              background: '#0e6245',
              border: 'none',
              borderRadius: 9999,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              color: '#ffffff',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <Briefcase size={12} />
            <span>Jobs ({formatJobsCount(realJobsCount)})</span>
          </Link>

          {/* Download Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setDownloadOpen(!downloadOpen)}
              style={{
                background: '#ffffff',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '7px 14px',
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
                border: '1px solid #e5e7eb',
                borderRadius: 8,
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
                    color: '#111827',
                    textDecoration: 'none',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>PDF (Print replica document)</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>.pdf</span>
                </a>
                <a
                  href={`/api/v3/resumes/${resumeId || 'primary'}/export/docx`}
                  download
                  onClick={() => setDownloadOpen(false)}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#111827',
                    textDecoration: 'none',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>DOCX (Word format for ATS)</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>.docx</span>
                </a>
                <Link
                  to="/v3/resumes/primary/google-docs"
                  onClick={() => setDownloadOpen(false)}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#111827',
                    textDecoration: 'none',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>Google Docs</span>
                  <ExternalLink size={12} color="#6b7280" />
                </Link>
              </div>
            )}
          </div>

          <button
            onClick={() => saveDocumentToServer({ header, sections })}
            disabled={saving}
            style={{
              background: saveSuccess ? '#059669' : '#0e6245',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {saveSuccess ? <Check size={15} /> : <Save size={15} />}
            <span>{saving ? 'Saving…' : saveSuccess ? `Saved v${version}` : 'Save Resume'}</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN 2-COLUMN WORKSPACE (DUAL INDEPENDENT SCROLLBARS)                  */}
      {/* ========================================================================= */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        overflow: 'hidden'
      }}>
        {/* ======================================================================= */}
        {/* LEFT COLUMN: Resume Editor & Suggestions Stream (INDEPENDENT SCROLL)   */}
        {/* ======================================================================= */}
        <div
          ref={leftScrollRef}
          style={{
            flex: '1 1 52%',
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '24px 36px 80px 36px',
            borderRight: '1px solid #e5e7eb',
            boxSizing: 'border-box'
          }}
        >
          {/* A. Rich Text Formatting Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 12,
            borderBottom: '1px solid #e5e7eb',
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button title="Undo" style={toolbarIconBtnStyle}><Undo2 size={15} /></button>
              <button title="Redo" style={toolbarIconBtnStyle}><Redo2 size={15} /></button>
              <div style={{ width: 1, height: 18, background: '#e5e7eb', margin: '0 6px' }} />
              <button title="Bold" style={toolbarIconBtnStyle}><strong>B</strong></button>
              <button title="Italic" style={toolbarIconBtnStyle}><em>I</em></button>
              <button title="Underline" style={toolbarIconBtnStyle}><u>U</u></button>
              <button title="Strikethrough" style={toolbarIconBtnStyle}><s>S</s></button>
              <button title="Insert Link" style={toolbarIconBtnStyle}><Link2 size={15} /></button>
            </div>
            <button title="Align Text" style={toolbarIconBtnStyle}><AlignLeft size={15} /></button>
          </div>

          {/* B. Purple Suggestions Summary Banner (Exact Rezifi Style) */}
          <div style={{
            background: '#faf5ff',
            border: '1px solid #e9d5ff',
            borderRadius: 8,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: '2px solid #7c3aed',
                color: '#7c3aed',
                fontSize: 11,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#ffffff'
              }}>
                {atsScore}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                ATS score • {atsScore >= 90 ? 'A' : atsScore >= 80 ? 'B' : 'C'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                <button
                  type="button"
                  onClick={() => scrollToSuggestion(Math.max(0, currentSuggestionIdx - 1))}
                  disabled={totalSuggestions === 0 || currentSuggestionIdx <= 0}
                  style={pagerArrowBtnStyle}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontWeight: 600 }}>
                  {totalSuggestions > 0 ? `${currentSuggestionIdx + 1} of ${totalSuggestions}` : '0 of 0'}
                </span>
                <button
                  type="button"
                  onClick={() => scrollToSuggestion(Math.min(totalSuggestions - 1, currentSuggestionIdx + 1))}
                  disabled={totalSuggestions === 0 || currentSuggestionIdx >= totalSuggestions - 1}
                  style={pagerArrowBtnStyle}
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              <button
                type="button"
                onClick={handleApplyAll}
                disabled={pendingSuggestionsCount === 0}
                style={{
                  background: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: pendingSuggestionsCount > 0 ? 'pointer' : 'default',
                  opacity: pendingSuggestionsCount > 0 ? 1 : 0.6,
                  transition: 'all 150ms ease'
                }}
              >
                Apply all {pendingSuggestionsCount}
              </button>
            </div>
          </div>

          {/* C. Candidate Header Meta (Clean & Editable) */}
          <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f3f4f6' }}>
            <input
              type="text"
              value={header.name}
              onChange={(e) => setHeader({ ...header, name: e.target.value })}
              placeholder="Candidate Name"
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: '#111827',
                border: 'none',
                outline: 'none',
                width: '100%',
                background: 'transparent',
                marginBottom: 4
              }}
            />
            <input
              type="text"
              value={header.title}
              onChange={(e) => setHeader({ ...header, title: e.target.value })}
              placeholder="Candidate Headline"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#4b5563',
                border: 'none',
                outline: 'none',
                width: '100%',
                background: 'transparent',
                marginBottom: 6
              }}
            />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
              <span>{header.phone}</span>
              <span>•</span>
              <span>{header.email}</span>
              <span>•</span>
              <span>{header.location}</span>
            </div>
          </div>

          {/* D. Resume Sections & Suggestion Cards Stream */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {filteredSections.map((sec, secIdx) => (
              <div key={sec.id}>
                {/* Section Title */}
                <div style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#111827',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  borderBottom: '1.5px solid #111827',
                  paddingBottom: 3,
                  marginBottom: 12
                }}>
                  {sec.title}
                </div>

                {/* Blocks */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {sec.blocks.map((blk, blkIdx) => (
                    <div key={blk.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(blk.role || blk.company) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5, color: '#111827' }}>
                            {blk.role}{blk.company ? ` — ${blk.company}` : ''}
                          </span>
                          {blk.period && (
                            <span style={{ fontSize: 12, color: '#6b7280' }}>{blk.period}</span>
                          )}
                        </div>
                      )}

                      {/* Bullets List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {blk.lines.map((line, lineIdx) => {
                          const state = suggestionState[line.id];
                          let suggestionOrder = 0;
                          for (let i = 0; i < allSuggestionItems.length; i++) {
                            if (allSuggestionItems[i].lineId === line.id) {
                              suggestionOrder = i + 1;
                              break;
                            }
                          }

                          return (
                            <div key={line.id} style={{ display: 'flex', flexDirection: 'column' }}>
                              {/* Main Bullet Row */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                padding: '4px 6px',
                                borderRadius: 4,
                                transition: 'background 150ms ease'
                              }}>
                                <span style={{ color: '#111827', fontWeight: 700, marginTop: 4 }}>•</span>
                                <textarea
                                  value={line.text}
                                  onChange={(e) => handleUpdateLine(secIdx, blkIdx, lineIdx, e.target.value)}
                                  rows={Math.max(1, Math.ceil(line.text.length / 85))}
                                  style={{
                                    flex: 1,
                                    border: 'none',
                                    outline: 'none',
                                    background: 'transparent',
                                    fontSize: 13,
                                    color: '#1f2937',
                                    lineHeight: 1.5,
                                    resize: 'none',
                                    fontFamily: 'inherit',
                                    padding: 0
                                  }}
                                  placeholder="Bullet statement..."
                                />
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLine(secIdx, blkIdx, lineIdx)}
                                  title="Delete line"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#9ca3af',
                                    cursor: 'pointer',
                                    padding: 2
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              {/* ===================================================== */}
                              {/* ATTACHED SUGGESTION CARD (Identical to Rezifi Image 2)*/}
                              {/* ===================================================== */}
                              {line.rewrite && (
                                <div id={`sugg_box_${line.id}`} style={{ margin: '8px 0 12px 14px' }}>
                                  {state?.status === 'applied' ? (
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      background: '#ecfdf5',
                                      border: '1px solid #a7f3d0',
                                      borderRadius: 6,
                                      padding: '8px 14px',
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
                                          gap: 4
                                        }}
                                      >
                                        <RotateCcw size={12} />
                                        <span>Undo</span>
                                      </button>
                                    </div>
                                  ) : state?.status === 'skipped' ? (
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      background: '#f9fafb',
                                      border: '1px solid #e5e7eb',
                                      borderRadius: 6,
                                      padding: '8px 14px',
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
                                          gap: 4
                                        }}
                                      >
                                        <RotateCcw size={12} />
                                        <span>Undo</span>
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      onMouseEnter={() => setHoveredLineId(line.id)}
                                      onMouseLeave={() => setHoveredLineId(null)}
                                      style={{
                                        background: '#fbf9fe',
                                        border: '1px solid #e9d5ff',
                                        borderRadius: 8,
                                        padding: '14px 18px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                        transition: 'all 150ms ease'
                                      }}
                                    >
                                      {/* Top Row: (1) Suggested pill & Wording category pill */}
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 10
                                      }}>
                                        <div style={{
                                          background: '#f3e8ff',
                                          color: '#6b21a8',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          padding: '2px 10px',
                                          borderRadius: 9999,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4
                                        }}>
                                          <span>{suggestionOrder || 1}</span>
                                          <span>Suggested</span>
                                        </div>

                                        <span style={{
                                          background: '#ffffff',
                                          border: '1px solid #e9d5ff',
                                          color: '#7e22ce',
                                          fontSize: 11,
                                          fontWeight: 600,
                                          padding: '2px 10px',
                                          borderRadius: 9999
                                        }}>
                                          Wording
                                        </span>
                                      </div>

                                      {/* Middle: Highlighted Rewrite Statement */}
                                      <div style={{ marginBottom: 14 }}>
                                        {renderHighlightedSuggestion(line.text, line.rewrite)}
                                      </div>

                                      {/* Bottom Row: Explanation & Action Buttons */}
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: 8
                                      }}>
                                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                                          {getExplanation(line.text, line.rewrite)}
                                        </span>

                                        <div style={{ display: 'flex', gap: 8 }}>
                                          <button
                                            type="button"
                                            onClick={() => handleSkipRewrite(line.id, secIdx, blkIdx, lineIdx)}
                                            style={{
                                              background: '#ffffff',
                                              border: '1px solid #d1d5db',
                                              borderRadius: 6,
                                              padding: '6px 16px',
                                              fontSize: 12,
                                              fontWeight: 600,
                                              color: '#374151',
                                              cursor: 'pointer'
                                            }}
                                          >
                                            Skip
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleApplyRewrite(secIdx, blkIdx, lineIdx)}
                                            style={{
                                              background: '#ffffff',
                                              border: '1px solid #d1d5db',
                                              borderRadius: 6,
                                              padding: '6px 16px',
                                              fontSize: 12,
                                              fontWeight: 600,
                                              color: '#111827',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 4
                                            }}
                                          >
                                            <Check size={13} />
                                            <span>Apply</span>
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
                            border: '1px dashed #d1d5db',
                            color: '#6b7280',
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            marginTop: 4
                          }}
                        >
                          <Plus size={12} />
                          <span>Add bullet point</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ======================================================================= */}
        {/* RIGHT COLUMN: Authentic Resume Preview Sheet (INDEPENDENT SCROLL)      */}
        {/* ======================================================================= */}
        <div
          ref={rightScrollRef}
          style={{
            flex: '1 1 48%',
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            background: '#f8fafc',
            padding: '16px 20px 80px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}
        >
          {/* Top Controls: Zoom / Fit & Action Pills */}
          <div style={{
            width: '100%',
            maxWidth: 680,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
            flexWrap: 'wrap',
            gap: 8
          }}>
            {/* Zoom Controls: — Fit + */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: '2px 4px'
              }}>
                <button
                  type="button"
                  title="Zoom Out"
                  onClick={() => setZoomScale(Math.max(0.6, zoomScale - 0.1))}
                  style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex' }}
                >
                  <Minus size={13} color="#4b5563" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(1.0)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Fit
                </button>
                <button
                  type="button"
                  title="Zoom In"
                  onClick={() => setZoomScale(Math.min(1.4, zoomScale + 0.1))}
                  style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex' }}
                >
                  <Plus size={13} color="#4b5563" />
                </button>
              </div>

              {/* Mode Toggle */}
              <button
                type="button"
                onClick={() => setPreviewMode(previewMode === 'original' ? 'tree' : 'original')}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                {previewMode === 'original' ? `Original Template (${pageCount}P)` : `Live Edited Resume (${pageCount}P)`}
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
                  borderRadius: 6,
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
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  padding: '5px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                  color: '#374151'
                }}
              >
                <ExternalLink size={11} />
                <span>Docs</span>
              </Link>
            </div>
          </div>

          {/* Paper Document Preview Container */}
          <div style={{
            width: '100%',
            maxWidth: 680,
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            minHeight: '820px',
            position: 'relative',
            transform: `scale(${zoomScale})`,
            transformOrigin: 'top center',
            transition: 'transform 150ms ease'
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
                  height: '820px',
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
                                background: isHovered ? '#ede9fe' : undefined,
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
            background: '#ffffff',
            borderRadius: 12,
            border: '1px solid #e5e7eb',
            maxWidth: 460,
            width: '100%',
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, color: '#d97706' }}>
              <AlertCircle size={22} />
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
                This line changed in another tab too
              </h3>
            </div>
            <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.5, margin: '0 0 20px' }}>
              Another open session updated <code>X-Resume-Version</code> from v{version} to v{conflictDetail?.server_version || version + 1}. Do you want to overwrite it with your current edits, or keep the remote state?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConflictModal(false)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  padding: '8px 14px',
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
                  borderRadius: 6,
                  padding: '8px 16px',
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

const toolbarIconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '5px 7px',
  borderRadius: 4,
  cursor: 'pointer',
  color: '#4b5563',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 150ms ease'
};

const pagerArrowBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #e9d5ff',
  borderRadius: 4,
  padding: '2px 4px',
  cursor: 'pointer',
  color: '#7c3aed',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

export default EditTreePage;
