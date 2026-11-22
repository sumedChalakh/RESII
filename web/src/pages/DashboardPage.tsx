import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { addXp } from '../store/seasonSlice';
import { getCsrfToken } from '../utils/csrf';
import { 
  FileText, 
  Sparkles, 
  Download, 
  ExternalLink, 
  UploadCloud, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  FileCheck2, 
  CheckCircle2, 
  AlertCircle,
  Layers
} from 'lucide-react';

interface PreviewSection {
  title: string;
  lines: string[];
}

interface PrimaryResumeData {
  id: string;
  title: string;
  candidate_name?: string;
  candidate_headline?: string;
  contact_line?: string;
  format: string;
  format_label: string;
  tier: string;
  tier_label: string;
  ats_score: number;
  page_count: number;
  is_primary: boolean;
  updated_at: string;
  preview_sections?: PreviewSection[];
  raw_url?: string;
}

interface TailoredCopyItem {
  id: string;
  company_name: string;
  job_title: string;
  status: string;
  time_ago: string;
  tailored_format: string;
  page_count: number;
  ats_score: number;
  filename: string;
}

interface ActivityDay {
  day: string;
  count: number;
  is_today: boolean;
  is_active: boolean;
}

interface TopMatchJob {
  id: string;
  title: string;
  company: string;
  location: string;
  match_label: string;
  application_url: string;
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [primaryResume, setPrimaryResume] = useState<PrimaryResumeData | null>(null);
  const [tailoredCopies, setTailoredCopies] = useState<TailoredCopyItem[]>([]);
  const [tailoredTotalCount, setTailoredTotalCount] = useState<number>(0);
  const [tailoredAppliedCount, setTailoredAppliedCount] = useState<number>(0);
  const [accordionOpen, setAccordionOpen] = useState(true);
  const [showAllCopies, setShowAllCopies] = useState(false);

  const [thisWeek, setThisWeek] = useState<{
    applied_count: number;
    activity_days: ActivityDay[];
    streak_message: string;
    level: number;
    points_to_next: number;
    interview_card: { id?: string; company: string; role: string; applied_text: string } | null;
  }>({
    applied_count: 0,
    activity_days: [
      { day: 'Mon', count: 0, is_today: false, is_active: false },
      { day: 'Tue', count: 0, is_today: false, is_active: false },
      { day: 'Wed', count: 0, is_today: false, is_active: false },
      { day: 'Thu', count: 0, is_today: false, is_active: false },
      { day: 'Fri', count: 0, is_today: false, is_active: false },
      { day: 'Sat', count: 0, is_today: false, is_active: false },
      { day: 'Sun', count: 0, is_today: true, is_active: false },
    ],
    streak_message: '0 applications tracked this week. Apply to jobs with RESII to build your momentum.',
    level: 1,
    points_to_next: 400,
    interview_card: null
  });

  const [topMatches, setTopMatches] = useState<TopMatchJob[]>([]);
  const [interviewStatus, setInterviewStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/v3/resumes/dashboard-overview', {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.primary_resume) {
          setPrimaryResume(data.primary_resume);
        }
        if (data.tailored_summary) {
          setTailoredCopies(data.tailored_summary.items || []);
          setTailoredTotalCount(data.tailored_summary.total_count || 0);
          setTailoredAppliedCount(data.tailored_summary.applied_count || 0);
        }
        if (data.this_week) {
          setThisWeek(data.this_week);
        }
        if (data.top_matches) {
          setTopMatches(data.top_matches);
        }
      }
    } catch (err: any) {
      console.warn('Dashboard fetch notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const csrfToken = getCsrfToken();
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/v3/resumes/upload', {
        method: 'POST',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        credentials: 'include',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Upload failed.');
      }

      dispatch(addXp({ amount: 50, reason: 'Uploaded Candidate Resume' }));
      setActionSuccess(`Resume "${file.name}" uploaded and preserved immutably.`);
      setTimeout(() => setActionSuccess(null), 4000);
      fetchDashboardData();
    } catch (err: any) {
      setError(err.message || 'Error uploading file.');
    }
  };

  const handleOpenResume = () => {
    if (primaryResume) {
      navigate(`/edit/${primaryResume.id}`);
    }
  };

  const handleTailorResume = () => {
    navigate('/tailor');
  };

  const handleDownloadOriginal = () => {
    if (!primaryResume) return;
    const ext = primaryResume.format === 'docx' ? 'docx' : 'pdf';
    window.location.href = `/api/v3/resumes/${primaryResume.id}/export/${ext}`;
  };

  const handleGoogleDocs = async () => {
    if (!primaryResume) return;
    try {
      const res = await fetch(`/api/v3/resumes/${primaryResume.id}/google-docs`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.google_docs_url) {
        window.open(data.google_docs_url, '_blank');
      }
    } catch (err: any) {
      setError('Google Docs sync failed.');
    }
  };

  const handleRetailor = (copy: TailoredCopyItem) => {
    navigate(`/tailor?company=${encodeURIComponent(copy.company_name)}&role=${encodeURIComponent(copy.job_title)}`);
  };

  const displayedCopies = showAllCopies ? tailoredCopies : tailoredCopies.slice(0, 5);

  return (
    <div style={{
      maxWidth: 1240,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'row',
      gap: 28,
      alignItems: 'flex-start'
    }}>
      {/* Hidden File Input for Word / File Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".docx,.doc,.pdf"
        style={{ display: 'none' }}
      />

      {/* ========================================================================= */}
      {/* LEFT COLUMN: Main Resume, Actions, Tailored Copies (~67% width)           */}
      {/* ========================================================================= */}
      <div style={{ flex: '1 1 67%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Notifications */}
        {actionSuccess && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#ecfdf5',
            color: '#065f46',
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: 14,
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <CheckCircle2 size={16} />
            <span>{actionSuccess}</span>
          </div>
        )}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#fef2f2',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: 14,
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Add a Résumé Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #ebe6dd',
          borderRadius: 12,
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Outline Document Icon with green plus */}
            <div style={{
              position: 'relative',
              width: 38,
              height: 44,
              border: '2px solid #65615a',
              borderRadius: 4,
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{ width: 18, height: 2, background: '#65615a', marginBottom: 4 }} />
              <div style={{
                position: 'absolute',
                top: -5,
                right: -6,
                background: '#0f9f6e',
                color: '#ffffff',
                borderRadius: '50%',
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 800,
                lineHeight: 1
              }}>
                +
              </div>
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 2px', color: '#111827' }}>
                Add a résumé
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#65615a' }}>
                Or drop a file anywhere on this page
              </p>
            </div>
          </div>

          {/* Action Buttons: Word, Google Docs, Template */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: '#ffffff',
                border: '1px solid #d8d3c9',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#18191a',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7
              }}
            >
              <div style={{
                background: '#2563eb',
                color: '#ffffff',
                width: 17,
                height: 17,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 800
              }}>
                W
              </div>
              <span>Word</span>
            </button>

            <button
              onClick={handleGoogleDocs}
              style={{
                background: '#ffffff',
                border: '1px solid #d8d3c9',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#18191a',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7
              }}
            >
              <FileCheck2 size={16} color="#3b82f6" />
              <span>Google Docs</span>
            </button>

            <button
              onClick={() => navigate('/templates')}
              style={{
                background: '#ffffff',
                border: '1px solid #d8d3c9',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#18191a',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7
              }}
            >
              <FileText size={16} color="#65615a" />
              <span>Template</span>
            </button>
          </div>
        </div>

        {/* 2. Your Résumés Section Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
              Your résumés
            </span>
            <span style={{
              background: '#f2efe9',
              color: '#65615a',
              fontSize: 13,
              fontWeight: 600,
              padding: '1px 8px',
              borderRadius: 12
            }}>
              {primaryResume ? 1 : 0}
            </span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13,
            color: '#65615a'
          }}>
            <div>
              <span style={{ fontWeight: 700, color: '#111827', marginRight: 6 }}>Primary</span>
              <span>Your newest, so job matches use it</span>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                color: '#65615a',
                fontWeight: 500
              }}
            >
              <span>More</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* 3. Primary Resume Main Card */}
        {primaryResume ? (
          <div style={{
            background: '#ffffff',
            border: '1px solid #ebe6dd',
            borderRadius: 12,
            padding: 24,
            display: 'flex',
            gap: 26,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            {/* Left: Genuine High-Density Rendered Document Page Preview Sheet */}
            <div
              onClick={handleOpenResume}
              title="Click to view full resume"
              style={{
                width: 170,
                height: 236,
                flexShrink: 0,
                background: '#ffffff',
                border: '1px solid #dcd7ce',
                borderRadius: 4,
                boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              {primaryResume.raw_url && primaryResume.format === 'pdf' ? (
                <iframe
                  src={`${primaryResume.raw_url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                  style={{
                    width: '680px',
                    height: '944px',
                    transform: 'scale(0.25)',
                    transformOrigin: 'top left',
                    pointerEvents: 'none',
                    border: 'none',
                    background: '#ffffff'
                  }}
                  title="Original Resume Template Preview"
                />
              ) : (
                <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {/* Actual Candidate Header */}
                  <div style={{ textAlign: 'center', marginBottom: 2 }}>
                    <div style={{
                      fontSize: 7.5,
                      fontWeight: 800,
                      color: '#111827',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                      lineHeight: 1.1
                    }}>
                      {primaryResume.candidate_name || primaryResume.title}
                    </div>
                    {primaryResume.candidate_headline && (
                      <div style={{
                        fontSize: 5,
                        color: '#0f4c3a',
                        fontStyle: 'italic',
                        lineHeight: 1.2,
                        marginTop: 1,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis'
                      }}>
                        {primaryResume.candidate_headline}
                      </div>
                    )}
                    {primaryResume.contact_line && (
                      <div style={{
                        fontSize: 4.5,
                        color: '#65615a',
                        lineHeight: 1.2,
                        marginTop: 1,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis'
                      }}>
                        {primaryResume.contact_line}
                      </div>
                    )}
                    <div style={{ height: 0.5, background: '#0f4c3a', margin: '3px 0' }} />
                  </div>

                  {/* Actual Candidate Sections */}
                  {primaryResume.preview_sections && primaryResume.preview_sections.length > 0 ? (
                    primaryResume.preview_sections.map((sec, sIdx) => (
                      <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div style={{
                          fontSize: 5.5,
                          fontWeight: 700,
                          color: '#0f4c3a',
                          textTransform: 'uppercase',
                          borderBottom: '0.5px solid #e5e7eb',
                          paddingBottom: 0.5,
                          letterSpacing: '0.02em'
                        }}>
                          {sec.title}
                        </div>
                        {sec.lines.map((line, lIdx) => (
                          <div key={lIdx} style={{
                            fontSize: 4.5,
                            color: '#374151',
                            lineHeight: 1.2,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            paddingLeft: 2
                          }}>
                            • {line}
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ height: 4, width: '45%', background: '#0f4c3a' }} />
                      <div style={{ height: 3, width: '90%', background: '#d1d5db' }} />
                      <div style={{ height: 3, width: '85%', background: '#e5e7eb' }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Resume Meta & Actions */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                {/* Bold Title */}
                <h1 style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: '#111827',
                  margin: '0 0 6px',
                  letterSpacing: '-0.02em'
                }}>
                  {primaryResume.title}
                </h1>

                {/* Format subtitle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#65615a', marginBottom: 20 }}>
                  <div style={{
                    background: primaryResume.format === 'docx' ? '#2563eb' : '#dc2626',
                    color: '#ffffff',
                    width: 15,
                    height: 15,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 800
                  }}>
                    {primaryResume.format === 'docx' ? 'W' : 'P'}
                  </div>
                  <span>{primaryResume.format_label}</span>
                </div>

                {/* Diamond Tier Progress Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  {/* Purple hexagon/diamond icon */}
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: '2px solid #7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#7c3aed',
                    fontSize: 12,
                    fontWeight: 800
                  }}>
                    ◇
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                    Diamond
                  </span>
                  {/* Purple gradient progress line */}
                  <div style={{
                    width: 120,
                    height: 4,
                    borderRadius: 2,
                    background: 'linear-gradient(to right, #7c3aed, #a855f7)'
                  }} />
                  <span style={{ fontSize: 13, color: '#65615a' }}>
                    Top tier
                  </span>
                </div>
              </div>

              {/* Action Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={handleOpenResume}
                  style={{
                    background: '#0e6245',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '9px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}
                >
                  <ExternalLink size={15} />
                  <span>Open</span>
                </button>

                <button
                  onClick={handleTailorResume}
                  style={{
                    background: '#f2efe9',
                    color: '#18191a',
                    border: 'none',
                    borderRadius: 8,
                    padding: '9px 18px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}
                >
                  <Sparkles size={15} color="#4338ca" />
                  <span>Tailor</span>
                </button>

                <button
                  onClick={handleGoogleDocs}
                  title="Google Docs Sync"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #d8d3c9',
                    borderRadius: 8,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <FileCheck2 size={16} color="#3b82f6" />
                </button>

                <button
                  onClick={handleDownloadOriginal}
                  title="Download genuine file"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #d8d3c9',
                    borderRadius: 8,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Download size={16} color="#65615a" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            background: '#ffffff',
            border: '1px dashed #d8d3c9',
            borderRadius: 12,
            padding: '40px 24px',
            textAlign: 'center'
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>
              No resumes uploaded yet
            </h3>
            <p style={{ fontSize: 13, color: '#65615a', margin: '0 0 16px' }}>
              Upload your master Word or PDF resume to unlock personalized job matching and tailoring.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: '#0e6245',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 18px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Upload Resume
            </button>
          </div>
        )}

        {/* 4. Tailored Copies Accordion */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #ebe6dd',
          borderRadius: 12,
          overflow: 'hidden'
        }}>
          {/* Accordion Header */}
          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: accordionOpen ? '1px solid #f2efe9' : 'none',
            background: '#ffffff'
          }}>
            <button
              onClick={() => setAccordionOpen(prev => !prev)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 0
              }}
            >
              {accordionOpen ? <ChevronDown size={17} color="#65615a" /> : <ChevronUp size={17} color="#65615a" />}
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                Tailored copies
              </span>
              <span style={{
                background: '#f2efe9',
                color: '#65615a',
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12
              }}>
                {tailoredTotalCount}
              </span>
              <span style={{
                background: '#ecfdf5',
                color: '#059669',
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12
              }}>
                {tailoredAppliedCount} applied
              </span>
            </button>

            {tailoredTotalCount > 0 && (
              <button
                onClick={() => setShowAllCopies(prev => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#18191a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <span>{showAllCopies ? 'Show less' : `Show all ${tailoredTotalCount}`}</span>
                <ChevronDown size={14} />
              </button>
            )}
          </div>

          {/* Accordion Items List */}
          {accordionOpen && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {tailoredCopies.length > 0 ? (
                displayedCopies.map((copy, index) => {
                  const initialLetter = copy.company_name.trim()[0]?.toUpperCase() || 'J';
                  return (
                    <div
                      key={copy.id || index}
                      style={{
                        padding: '14px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: index < displayedCopies.length - 1 ? '1px solid #f7f5ef' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {/* Purple Company Initial Square */}
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          background: '#ede9fe',
                          color: '#6366f1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 700,
                          flexShrink: 0
                        }}>
                          {initialLetter}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                            {copy.company_name}, {copy.job_title}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        {/* Status Badge */}
                        <span style={{
                          background: copy.status.toLowerCase() === 'applied' ? '#ecfdf5' : '#fef3c7',
                          color: copy.status.toLowerCase() === 'applied' ? '#059669' : '#b45309',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 4
                        }}>
                          {copy.status || 'Draft'}
                        </span>

                        {/* Timestamp */}
                        <span style={{ fontSize: 12, color: '#65615a', minWidth: 65 }}>
                          {copy.time_ago || 'Recently'}
                        </span>

                        {/* Re-tailor button */}
                        <button
                          onClick={() => handleRetailor(copy)}
                          style={{
                            background: '#f2efe9',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#4338ca',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <Sparkles size={13} color="#4338ca" />
                          <span>Re-tailor</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{
                  padding: '24px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  color: '#65615a'
                }}>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    You have 0 tailored copies. When you tailor your resume for a job, your job-specific versions appear here.
                  </p>
                  <button
                    onClick={handleTailorResume}
                    style={{
                      background: '#f2efe9',
                      border: '1px solid #d8d3c9',
                      borderRadius: 8,
                      padding: '7px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#18191a',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Sparkles size={14} color="#4338ca" />
                    <span>Tailor to a Job</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT COLUMN: Weekly Tracker & Top Job Matches (~33% width)               */}
      {/* ========================================================================= */}
      <div style={{ flex: '1 1 33%', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 1. This Week Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #ebe6dd',
          borderRadius: 12,
          padding: 22,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
              This week
            </span>
            <Link to="/auto-apply" style={{ fontSize: 13, fontWeight: 500, color: '#65615a', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span>Tracker</span>
              <span>&gt;</span>
            </Link>
          </div>

          {/* Metric Row: actual applied count */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                {thisWeek.applied_count}
              </span>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#65615a' }}>
                applied
              </span>
            </div>

            {/* Stacked Green Bills Icon */}
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669'
            }}>
              <Layers size={22} color="#059669" />
            </div>
          </div>

          {/* 7-Day Activity Calendar Boxes */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 6,
            marginBottom: 12
          }}>
            {thisWeek.activity_days.map((item, idx) => {
              const isGreen = item.count > 0;
              const isTodayActive = item.is_today;
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#65615a' }}>
                    {item.day}
                  </span>
                  <div style={{
                    width: '100%',
                    height: 32,
                    borderRadius: 4,
                    background: isGreen ? '#10b981' : '#ffffff',
                    border: isTodayActive ? '2px solid #111827' : '1px solid #ebe6dd',
                    color: isGreen ? '#ffffff' : '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700
                  }}>
                    {item.count}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Streak Subtitle Note */}
          <p style={{ margin: '0 0 18px', fontSize: 13, color: '#65615a', lineHeight: 1.4 }}>
            {thisWeek.streak_message}
          </p>

          {/* Level Progress Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 0',
            borderTop: '1px solid #f2efe9',
            marginBottom: 14
          }}>
            <div style={{
              border: '1px solid #111827',
              borderRadius: 4,
              padding: '1px 6px',
              fontSize: 12,
              fontWeight: 800,
              color: '#111827'
            }}>
              {thisWeek.level}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
              Level {thisWeek.level}
            </span>
            <div style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              background: '#e5e7eb',
              overflow: 'hidden'
            }}>
              <div style={{
                width: '75%',
                height: '100%',
                background: '#10b981',
                borderRadius: 3
              }} />
            </div>
            <span style={{ fontSize: 12, color: '#65615a' }}>
              {thisWeek.points_to_next} points to Level {thisWeek.level + 1}
            </span>
          </div>

          {/* Interview Response Feedback Box (rendered only if candidate has actual applications) */}
          {thisWeek.interview_card && (
            <div style={{
              border: '1px solid #e8e3da',
              borderRadius: 8,
              padding: 14,
              background: '#faf8f5'
            }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
                Heard back from {thisWeek.interview_card.company}?
              </h4>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#65615a', lineHeight: 1.4 }}>
                {thisWeek.interview_card.role}. {thisWeek.interview_card.applied_text}
              </p>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setInterviewStatus('interview')}
                  style={{
                    background: interviewStatus === 'interview' ? '#0f4c3a' : '#ffffff',
                    color: interviewStatus === 'interview' ? '#ffffff' : '#111827',
                    border: '1px solid #111827',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Interview
                </button>

                <button
                  onClick={() => setInterviewStatus('not_yet')}
                  style={{
                    background: interviewStatus === 'not_yet' ? '#f2efe9' : '#ffffff',
                    color: '#111827',
                    border: '1px solid #d8d3c9',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Not yet
                </button>

                <button
                  onClick={() => setInterviewStatus('no')}
                  style={{
                    background: interviewStatus === 'no' ? '#f2efe9' : '#ffffff',
                    color: '#111827',
                    border: '1px solid #d8d3c9',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  No
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. Top Matches Card (Populated strictly from genuine database jobs) */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #ebe6dd',
          borderRadius: 12,
          padding: 22,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
              Top matches
            </span>
            <Link to="/jobs" style={{ fontSize: 13, fontWeight: 500, color: '#65615a', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span>All jobs</span>
              <span>&gt;</span>
            </Link>
          </div>

          {/* Genuine Jobs List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {topMatches.length > 0 ? (
              topMatches.map((job, idx) => {
                const initialLetter = job.company.trim()[0]?.toUpperCase() || 'J';
                const isEven = idx % 2 === 0;
                return (
                  <Link
                    key={job.id || idx}
                    to={`/jobs?search=${encodeURIComponent(job.title)}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      textDecoration: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Initial Box */}
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background: isEven ? '#fef3c7' : '#ede9fe',
                        color: isEven ? '#92400e' : '#5b21b6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        {initialLetter}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                          {job.title}
                        </span>
                        <span style={{ fontSize: 12, color: '#65615a' }}>
                          {job.company} • {job.location}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        background: '#ecfdf5',
                        color: '#059669',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 12
                      }}>
                        {job.match_label || 'Strong'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate('/tailor', {
                            state: {
                              jobDescription: `${job.title} at ${job.company} (${job.location}). Full requirements and responsibilities for ${job.title}.`,
                              targetCompany: job.company,
                              targetRole: job.title,
                              applyUrl: job.application_url
                            }
                          });
                        }}
                        style={{
                          background: '#0e6245',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Sparkles size={11} />
                        <span>Tailor</span>
                      </button>
                    </div>
                  </Link>
                );
              })
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#65615a' }}>
                No active jobs currently matched. Check the <Link to="/jobs" style={{ textDecoration: 'underline' }}>Jobs Feed</Link>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
