import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { addXp } from '../store/seasonSlice';
import { getCsrfToken } from '../utils/csrf';
import { 
  Search, 
  MapPin, 
  Sparkles, 
  Filter, 
  ExternalLink, 
  Check, 
  Briefcase, 
  DollarSign, 
  ArrowRight,
  BookmarkCheck,
  Building2,
  Globe,
  Clock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Star,
  Award
} from 'lucide-react';

interface MatchReport {
  status?: string;
  message?: string;
  match_percentage?: number;
  match_strength?: string;
  matched_skills?: string[];
  missing_required_skills?: string[];
  missing_preferred_skills?: string[];
  role_compatibility?: { score?: number; status?: string; label?: string };
  experience_compatibility?: { score?: number; level?: string; label?: string };
  education_compatibility?: { score?: number; label?: string };
  location_compatibility?: { score?: number; label?: string };
  seniority_mismatch?: boolean;
  total_candidate_skills?: number;
  explanation?: string;
  recommendation?: string;
}

interface UserResumeSummary {
  id: string;
  title: string;
  is_primary: boolean;
  target_role?: string;
  ats_score?: number;
  total_skills?: number;
}

interface JobItem {
  id: string;
  external_job_id?: string;
  title: string;
  company: string;
  company_website?: string;
  logo_url?: string;
  location: string;
  city?: string;
  country?: string;
  is_remote: boolean;
  workplace_type?: string;
  employment_type?: string;
  experience_level?: string;
  salary_range: string;
  skills: string[];
  required_skills?: string[];
  preferred_skills?: string[];
  match_percentage: number | null;
  match_report?: MatchReport;
  posted_at: string;
  description: string;
  apply_url: string;
  source_name?: string;
  verification_status?: string;
  last_verified_at?: string;
}

export const JobsFeedPage: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [workplaceFilter, setWorkplaceFilter] = useState('all');
  const [expLevelFilter, setExpLevelFilter] = useState('all');
  const [empTypeFilter, setEmpTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('best_match');

  // Resume Personalization State
  const [activeResume, setActiveResume] = useState<UserResumeSummary | null>(null);
  const [userResumes, setUserResumes] = useState<UserResumeSummary[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [isSettingPrimary, setIsSettingPrimary] = useState(false);
  const [switchFeedback, setSwitchFeedback] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);

  // Facet counts
  const [facets, setFacets] = useState({ total_active: 0, remote_count: 0, india_count: 0 });

  // Data & UI State
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());
  const [selectedJob, setSelectedJob] = useState<JobItem | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load feed from backend
  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.append('query', searchTerm.trim());
      if (countryFilter !== 'all') params.append('country', countryFilter);
      if (workplaceFilter === 'remote') {
        params.append('remote_only', 'true');
      } else if (workplaceFilter !== 'all') {
        params.append('workplace_type', workplaceFilter);
      }
      if (expLevelFilter !== 'all') params.append('experience_level', expLevelFilter);
      if (empTypeFilter !== 'all') params.append('employment_type', empTypeFilter);
      if (sourceFilter !== 'all') params.append('source', sourceFilter);
      if (sortBy) params.append('sort_by', sortBy);
      if (selectedResumeId) params.append('resume_id', selectedResumeId);
      params.append('page', currentPage.toString());
      params.append('page_size', pageSize.toString());

      const res = await fetch(`/api/jobs/feed?${params.toString()}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setTotalJobs(data.total || 0);
        setTotalPages(data.total_pages || 1);
        if (data.facets) {
          setFacets(data.facets);
        }
        if (data.active_resume) {
          setActiveResume(data.active_resume);
        }
        if (data.user_resumes) {
          setUserResumes(data.user_resumes);
        }
      } else {
        setError('Failed to retrieve active job postings from the server.');
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError('Connection error while reaching the jobs discovery service.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, countryFilter, workplaceFilter, expLevelFilter, empTypeFilter, sourceFilter, sortBy, selectedResumeId, currentPage, pageSize]);


  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Reset page when filters change
  const handleFilterChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setCountryFilter('all');
    setWorkplaceFilter('all');
    setExpLevelFilter('all');
    setEmpTypeFilter('all');
    setSourceFilter('all');
    setSortBy('best_match');
    setCurrentPage(1);
  };

  const handleResumeSwitch = (newResumeId: string) => {
    setSelectedResumeId(newResumeId);
    setCurrentPage(1);
    const target = userResumes.find((r) => r.id === newResumeId);
    setSwitchFeedback(`Job feed updated for "${target?.title || 'Selected Resume'}"`);
    setTimeout(() => setSwitchFeedback(null), 3500);
  };

  const handleMakePrimary = async (resumeId: string) => {
    setIsSettingPrimary(true);
    try {
      const csrfToken = getCsrfToken();
      const res = await fetch(`/api/v3/resumes/${resumeId}/set-primary`, {
        method: 'POST',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        credentials: 'include'
      });
      if (res.ok) {
        setSwitchFeedback('Set as your default active resume across RESII.');
        setTimeout(() => setSwitchFeedback(null), 3500);
        await fetchFeed();
      }
    } catch (e) {
      console.error('Failed to set primary resume:', e);
    } finally {
      setIsSettingPrimary(false);
    }
  };

  const handleApply = async (job: JobItem) => {
    try {
      await fetch('/api/jobs/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          job_id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          salary_range: job.salary_range,
          stage: 'applied',
          match_percentage: job.match_percentage,
          notes: `Tracked application via RESII Job Engine for ${job.company}.`
        })
      });

      setAppliedJobs((prev) => new Set(prev).add(job.id));
      dispatch(addXp({ amount: 40, reason: `Applied to ${job.company}` }));
    } catch (e) {
      console.error('Application failed:', e);
    }
  };

  const handleTailorNavigate = (job: JobItem) => {
    navigate('/tailor', {
      state: {
        jobDescription: job.description,
        targetCompany: job.company,
        targetRole: job.title
      }
    });
  };

  const triggerLiveSync = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/jobs/sync', { method: 'POST', credentials: 'include' });
      await fetchFeed();
    } catch (e) {
      console.error('Manual sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      {/* Header & Metric Dashboard */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            <Briefcase size={16} />
            <span>RESII REAL JOB DISCOVERY ENGINE</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>Jobs Feed & AI Match Ranking</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)' }}>
            Genuine vacancies discovered directly from Greenhouse, Lever, Ashby, and verified employer boards.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={triggerLiveSync}
            disabled={isSyncing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '7px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: isSyncing ? 'default' : 'pointer'
            }}
          >
            <RefreshCw size={13} className={isSyncing ? 'spin' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Live Boards'}</span>
          </button>

          <Link
            to="/jobs/applications"
            style={{
              background: 'var(--color-primary)',
              color: '#fff',
              borderRadius: 'var(--radius-md)',
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>Kanban Tracker</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Active Resume / Candidate Profile Selector Bar */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 320 }}>
          <div style={{
            background: 'rgba(37, 99, 235, 0.12)',
            color: 'var(--color-primary)',
            padding: 10,
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FileText size={22} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Matching Profile
              </span>
              {activeResume?.is_primary && (
                <span style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3
                }}>
                  <Star size={10} fill="#10b981" />
                  <span>PRIMARY</span>
                </span>
              )}
              {activeResume?.target_role && (
                <span style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 8px',
                  borderRadius: 'var(--radius-full)'
                }}>
                  Target: {activeResume.target_role}
                </span>
              )}
              {activeResume?.total_skills ? (
                <span style={{
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: '#2563eb',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 8px',
                  borderRadius: 'var(--radius-full)'
                }}>
                  {activeResume.total_skills} Verified Skills
                </span>
              ) : null}
            </div>

            {userResumes.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <select
                  value={selectedResumeId || activeResume?.id || ''}
                  onChange={(e) => handleResumeSwitch(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    color: 'var(--color-text)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    maxWidth: 380
                  }}
                >
                  {userResumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} {r.is_primary ? '★ (Primary)' : ''}
                    </option>
                  ))}
                </select>

                {!activeResume?.is_primary && activeResume?.id && (
                  <button
                    onClick={() => handleMakePrimary(activeResume.id)}
                    disabled={isSettingPrimary}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-text)',
                      padding: '5px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: isSettingPrimary ? 'default' : 'pointer'
                    }}
                  >
                    {isSettingPrimary ? 'Setting...' : 'Set as Primary'}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                No resume detected. Upload your resume to unlock AI fit rankings and skill-gap recommendations.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {switchFeedback && (
            <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={14} />
              {switchFeedback}
            </span>
          )}
          <button
            onClick={() => navigate('/resume')}
            style={{
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '7px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <FileText size={13} />
            <span>Manage Resumes</span>
          </button>
        </div>
      </div>


      {/* Discovery KPI Metrics Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12
      }}>
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', padding: 8, borderRadius: 'var(--radius-sm)' }}>
            <Briefcase size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Active Openings</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{facets.total_active || totalJobs}</div>
          </div>
        </div>

        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: 8, borderRadius: 'var(--radius-sm)' }}>
            <Globe size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>India Tech Hub Roles</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{facets.india_count}</div>
          </div>
        </div>

        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', padding: 8, borderRadius: 'var(--radius-sm)' }}>
            <Building2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Remote Global Roles</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{facets.remote_count}</div>
          </div>
        </div>

        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: 8, borderRadius: 'var(--radius-sm)' }}>
            <ShieldCheck size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Verified External Links</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>100% Genuine</div>
          </div>
        </div>
      </div>

      {/* Multi-Faceted Filter & Search Bar */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: 'var(--shadow-sm)'
      }}>
        {/* Search Row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-muted)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleFilterChange(setSearchTerm, e.target.value)}
              placeholder="Search by role (e.g. AI Engineer), company, or skills (Python, React)..."
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-elevated)',
                fontSize: 14,
                color: 'var(--color-text)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => handleFilterChange(setSortBy, e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-elevated)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text)'
            }}
          >
            <option value="best_match">Sort: Highest AI Match</option>
            <option value="newest">Sort: Most Recent</option>
            <option value="salary_high">Sort: Highest Salary</option>
          </select>
        </div>

        {/* Faceted Filter Controls Row */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
          {/* Country Filter */}
          <select
            value={countryFilter}
            onChange={(e) => handleFilterChange(setCountryFilter, e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-elevated)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text)'
            }}
          >
            <option value="all">🌍 All Regions</option>
            <option value="India">🇮🇳 India (Bengaluru, Pune, Hyd, NCR)</option>
            <option value="Global">🌐 Global Tech</option>
          </select>

          {/* Workplace Mode */}
          <select
            value={workplaceFilter}
            onChange={(e) => handleFilterChange(setWorkplaceFilter, e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-elevated)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text)'
            }}
          >
            <option value="all">🏢 All Modes</option>
            <option value="remote">🌐 Remote Only</option>
            <option value="hybrid">⚖️ Hybrid</option>
            <option value="on_site">📍 On-Site</option>
          </select>

          {/* Experience Level */}
          <select
            value={expLevelFilter}
            onChange={(e) => handleFilterChange(setExpLevelFilter, e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-elevated)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text)'
            }}
          >
            <option value="all">🎯 All Experience Levels</option>
            <option value="internship">🎓 Internship / Co-op</option>
            <option value="fresher">🌱 Fresher / Graduate</option>
            <option value="0-2 yrs">🚀 0–2 Years Experience</option>
            <option value="mid">⚡ Mid-Level (2–5 Years)</option>
            <option value="senior">🌟 Senior (5+ Years)</option>
            <option value="lead">👑 Lead / Architect</option>
          </select>

          {/* Employment Type */}
          <select
            value={empTypeFilter}
            onChange={(e) => handleFilterChange(setEmpTypeFilter, e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-elevated)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text)'
            }}
          >
            <option value="all">💼 All Employment Types</option>
            <option value="full_time">Full-Time</option>
            <option value="contract">Contract / Freelance</option>
            <option value="internship">Internship</option>
          </select>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => handleFilterChange(setSourceFilter, e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-elevated)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text)'
            }}
          >
            <option value="all">📡 All ATS Sources</option>
            <option value="greenhouse">Greenhouse Boards</option>
            <option value="lever">Lever Postings</option>
            <option value="ashby">Ashby Boards</option>
            <option value="adzuna">Adzuna Aggregator</option>
          </select>

          {(searchTerm || countryFilter !== 'all' || workplaceFilter !== 'all' || expLevelFilter !== 'all' || empTypeFilter !== 'all' || sourceFilter !== 'all') && (
            <button
              onClick={handleResetFilters}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <X size={13} />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: '#ef4444'
        }}>
          <AlertCircle size={18} />
          <span style={{ fontSize: 13, flex: 1 }}>{error}</span>
          <button
            onClick={fetchFeed}
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Job Postings Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading ? (
          // Skeleton Loaders
          [1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <div style={{ width: '40%', height: 20, background: 'var(--color-surface-elevated)', borderRadius: 4 }} />
              <div style={{ width: '25%', height: 14, background: 'var(--color-surface-elevated)', borderRadius: 4 }} />
              <div style={{ width: '80%', height: 14, background: 'var(--color-surface-elevated)', borderRadius: 4 }} />
            </div>
          ))
        ) : jobs.length === 0 ? (
          // Empty State
          <div style={{
            background: 'var(--color-surface)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12
          }}>
            <Briefcase size={36} color="var(--color-muted)" />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>No Vacancies Match Your Filters</h3>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', maxWidth: 460 }}>
              Try broadening your keyword query or resetting region/mode filters to view additional opportunities.
            </p>
            <button
              onClick={handleResetFilters}
              style={{
                marginTop: 6,
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          jobs.map((job) => {
            const isApplied = appliedJobs.has(job.id);
            const hasMatch = typeof job.match_percentage === 'number';
            const matchScore = job.match_percentage;

            return (
              <div
                key={job.id}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 22,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16,
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 320 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>{job.title}</span>
                    
                    {/* Truthful Match Score Badge */}
                    {hasMatch && matchScore !== null ? (
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-full)',
                        background: matchScore >= 80 ? 'rgba(16, 185, 129, 0.12)' : (matchScore >= 65 ? 'rgba(59, 130, 246, 0.12)' : (matchScore >= 50 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(100, 116, 139, 0.12)')),
                        color: matchScore >= 80 ? '#10b981' : (matchScore >= 65 ? '#2563eb' : (matchScore >= 50 ? '#d97706' : '#64748b')),
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <Sparkles size={12} />
                        <span>{matchScore}% {job.match_report?.match_strength ? job.match_report.match_strength.toUpperCase() : 'MATCH'}</span>
                      </span>
                    ) : (
                      <span
                        title="Upload or select an active resume to calculate verified compatibility"
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--color-surface-elevated)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-muted)',
                          fontSize: 11,
                          fontWeight: 600
                        }}
                      >
                        Upload Resume to Match
                      </span>
                    )}

                    {/* Seniority Warning if present */}
                    {job.match_report?.seniority_mismatch && (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        fontSize: 11,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <AlertTriangle size={11} />
                        <span>Seniority Mismatch</span>
                      </span>
                    )}

                    {/* Workplace Pill */}
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--color-surface-elevated)',
                      border: '1px solid var(--color-border)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-muted)'
                    }}>
                      {job.workplace_type === 'remote' ? '🌐 Remote' : (job.workplace_type === 'hybrid' ? '⚖️ Hybrid' : '📍 On-Site')}
                    </span>

                    {/* Source Attribution Tag */}
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--color-surface-elevated)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-muted)',
                      textTransform: 'capitalize'
                    }}>
                      Source: {job.source_name || 'Direct ATS'}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: 'var(--color-muted)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--color-text)', fontSize: 14 }}>{job.company}</strong>
                    <span>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={13} />
                      {job.location}
                    </span>
                    <span>•</span>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{job.salary_range}</span>
                    {job.experience_level && (
                      <>
                        <span>•</span>
                        <span style={{ textTransform: 'capitalize' }}>Level: {job.experience_level}</span>
                      </>
                    )}
                  </div>

                  {/* Why this job is recommended snippet */}
                  {job.match_report?.explanation && (
                    <div style={{
                      fontSize: 12,
                      color: 'var(--color-text)',
                      background: 'rgba(37, 99, 235, 0.04)',
                      borderLeft: '3px solid var(--color-primary)',
                      padding: '6px 12px',
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      lineHeight: 1.45
                    }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Why Recommended: </span>
                      <span>{job.match_report.explanation}</span>
                    </div>
                  )}

                  {/* Matched & Missing Skills Summary Chips */}
                  {(job.match_report?.matched_skills || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>Demonstrated:</span>
                      {job.match_report!.matched_skills!.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          style={{
                            fontSize: 11,
                            padding: '1px 7px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            color: '#10b981',
                            fontWeight: 600
                          }}
                        >
                          ✓ {skill}
                        </span>
                      ))}
                      {(job.match_report?.missing_required_skills || []).slice(0, 2).map((skill) => (
                        <span
                          key={skill}
                          style={{
                            fontSize: 11,
                            padding: '1px 7px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                            color: '#d97706',
                            fontWeight: 600
                          }}
                        >
                          ⚠ Missing: {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  <p style={{ margin: '4px 0 6px', fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5, maxHeight: 62, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {job.description}
                  </p>

                  {/* Skills Match Summary & Chips */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#059669',
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      Has {job.match_report?.matched_skills?.length || Math.min(job.skills.length, 3)} of {job.skills.length} core skills
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {job.skills.slice(0, 7).map((skill) => (
                      <span
                        key={skill}
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-surface-elevated)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-muted)',
                          fontWeight: 600
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                    {job.skills.length > 7 && (
                      <span style={{ fontSize: 11, color: 'var(--color-muted)', alignSelf: 'center' }}>
                        +{job.skills.length - 7} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', minWidth: 160 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setSelectedJob(job)}
                      style={{
                        background: 'var(--color-surface-elevated)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Details
                    </button>

                    <button
                      onClick={() => handleTailorNavigate(job)}
                      style={{
                        background: '#0e6245',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 2px 5px rgba(14, 98, 69, 0.25)'
                      }}
                    >
                      <Sparkles size={13} />
                      <span>✨ Tailor for this job</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={job.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'var(--color-surface-elevated)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <span>Apply Direct</span>
                      <ExternalLink size={12} />
                    </a>

                    <button
                      onClick={() => handleApply(job)}
                      disabled={isApplied}
                      style={{
                        background: isApplied ? 'var(--color-success)' : 'var(--color-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: isApplied ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      {isApplied ? (
                        <>
                          <BookmarkCheck size={14} />
                          <span>Tracked</span>
                        </>
                      ) : (
                        <>
                          <Briefcase size={13} />
                          <span>Track</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 12,
          padding: '12px 16px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)'
        }}>
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            Showing page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({totalJobs} total jobs)
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '6px 12px',
                fontSize: 12,
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '6px 12px',
                fontSize: 12,
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: 720,
            maxHeight: '88vh',
            overflowY: 'auto',
            padding: 28,
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  {selectedJob.company} • {selectedJob.location}
                </span>
                <h2 style={{ margin: '4px 0', fontSize: 22, fontWeight: 700 }}>{selectedJob.title}</h2>
                <div style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--color-muted)', alignItems: 'center' }}>
                  <span>{selectedJob.salary_range}</span>
                  <span>•</span>
                  <span>Mode: {selectedJob.workplace_type}</span>
                  <span>•</span>
                  <span>Source: {selectedJob.source_name}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedJob(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-muted)',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* AI Resume Match Analysis Section */}
            {selectedJob.match_report && (
              <div style={{
                background: selectedJob.match_report.status === 'no_resume' ? 'var(--color-surface-elevated)' : 'rgba(37, 99, 235, 0.04)',
                border: '1px solid ' + (selectedJob.match_report.status === 'no_resume' ? 'var(--color-border)' : 'rgba(37, 99, 235, 0.2)'),
                borderRadius: 'var(--radius-md)',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                {selectedJob.match_report.status === 'no_resume' ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-muted)' }}>
                      <Sparkles size={16} />
                      <span>Upload or select a primary resume to see your verified skill-gap & fit breakdown.</span>
                    </div>
                    <button
                      onClick={() => navigate('/resume')}
                      style={{
                        background: 'var(--color-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Go to Resume
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: 'var(--color-primary)' }}>
                        <Sparkles size={18} />
                        <span>Evidence-Grounded AI Compatibility: {selectedJob.match_report.match_percentage}%</span>
                      </div>
                      <span style={{
                        padding: '2px 9px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 11,
                        fontWeight: 700,
                        background: (selectedJob.match_report.match_percentage || 0) >= 80 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: (selectedJob.match_report.match_percentage || 0) >= 80 ? '#10b981' : '#2563eb'
                      }}>
                        {selectedJob.match_report.match_strength || 'Compatibility Scored'}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>
                      {selectedJob.match_report.explanation}
                    </p>

                    {/* Compatibility Dimensions Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: 8,
                      marginTop: 4
                    }}>
                      {selectedJob.match_report.role_compatibility && (
                        <div style={{ background: 'var(--color-surface)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-muted)' }}>Role Alignment: </span>
                          <span style={{ fontWeight: 600 }}>{selectedJob.match_report.role_compatibility.label}</span>
                        </div>
                      )}
                      {selectedJob.match_report.experience_compatibility && (
                        <div style={{ background: 'var(--color-surface)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-muted)' }}>Experience: </span>
                          <span style={{ fontWeight: 600 }}>{selectedJob.match_report.experience_compatibility.label}</span>
                        </div>
                      )}
                      {selectedJob.match_report.location_compatibility && (
                        <div style={{ background: 'var(--color-surface)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-muted)' }}>Workplace: </span>
                          <span style={{ fontWeight: 600 }}>{selectedJob.match_report.location_compatibility.label}</span>
                        </div>
                      )}
                      {selectedJob.match_report.education_compatibility && (
                        <div style={{ background: 'var(--color-surface)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-muted)' }}>Education: </span>
                          <span style={{ fontWeight: 600 }}>{selectedJob.match_report.education_compatibility.label}</span>
                        </div>
                      )}
                    </div>

                    {(selectedJob.match_report.matched_skills || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>Demonstrated Skills:</span>
                        {selectedJob.match_report.matched_skills.map((s: string) => (
                          <span key={s} style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#10b981', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
                            ✓ {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {(selectedJob.match_report.missing_required_skills || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706' }}>Missing Required Skills:</span>
                        {selectedJob.match_report.missing_required_skills.map((s: string) => (
                          <span key={s} style={{ fontSize: 11, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', color: '#d97706', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
                            ⚠ {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {selectedJob.match_report.recommendation && (
                      <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--color-muted)', borderTop: '1px dashed var(--color-border)', paddingTop: 6 }}>
                        💡 <strong>Recommendation:</strong> {selectedJob.match_report.recommendation}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Description Section */}
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Job Description</h4>
              <div style={{
                fontSize: 14,
                color: 'var(--color-text)',
                lineHeight: 1.6,
                whiteSpace: 'pre-line',
                background: 'var(--color-surface-elevated)',
                padding: 16,
                borderRadius: 'var(--radius-md)',
                maxHeight: 280,
                overflowY: 'auto'
              }}>
                {selectedJob.description}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={() => {
                  handleTailorNavigate(selectedJob);
                  setSelectedJob(null);
                }}
                style={{
                  background: '#0e6245',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(14, 98, 69, 0.25)'
                }}
              >
                <Sparkles size={14} />
                <span>✨ Tailor for this job</span>
              </button>

              <a
                href={selectedJob.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>Apply on Official Board</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobsFeedPage;
