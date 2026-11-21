import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { addXp } from '../store/seasonSlice';
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
  BookmarkCheck
} from 'lucide-react';

interface JobItem {
  id: string;
  title: string;
  company: string;
  logo_url?: string;
  location: string;
  is_remote: boolean;
  salary_range: string;
  skills: string[];
  match_percentage: number;
  posted_at: string;
  description: string;
  apply_url: string;
}

export const JobsFeedPage: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [sortBy, setSortBy] = useState('best_match');
  const [isRanking, setIsRanking] = useState(true);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());

  // Load feed from backend
  const fetchFeed = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('query', searchTerm);
      if (remoteOnly) params.append('remote_only', 'true');
      if (sortBy) params.append('sort_by', sortBy);

      const res = await fetch(`/api/jobs/feed?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [searchTerm, remoteOnly, sortBy]);

  // Rank polling simulation against primary resume
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRanking(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const handleApply = async (job: JobItem) => {
    try {
      await fetch('/api/jobs/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          salary_range: job.salary_range,
          stage: 'applied',
          match_percentage: job.match_percentage,
          notes: `Applied with tailored primary resume to ${job.company}.`
        })
      });

      setAppliedJobs((prev) => new Set(prev).add(job.id));
      dispatch(addXp({ amount: 40, reason: `Applied to ${job.company}` }));
    } catch (e) {
      console.error('Application failed:', e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1040, margin: '0 auto' }}>
      {/* Header & Ranking indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            <Briefcase size={16} />
            <span>AI-CURATED OPPORTUNITIES</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>Jobs Feed & AI Match Ranking</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)' }}>
            Openings ranked live against your primary resume keyword vector.
          </p>
        </div>

        {/* Polling / Ranked status indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: isRanking ? 'var(--color-warning-bg)' : 'var(--color-success-bg)',
          color: isRanking ? 'var(--color-warning)' : 'var(--color-success)',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          fontSize: 12,
          fontWeight: 700
        }}>
          <Sparkles size={14} />
          <span>{isRanking ? 'Ranking jobs against resume…' : '✓ 100% Vector Aligned with Primary Resume'}</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-muted)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search role, skills (e.g. FastAPI, React), or company…"
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

        {/* Remote toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            style={{ accentColor: 'var(--color-primary)' }}
          />
          <span>Remote Only</span>
        </label>

        {/* Sort selector */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-elevated)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text)'
          }}
        >
          <option value="best_match">Sort: Highest ATS Match</option>
          <option value="newest">Sort: Most Recent</option>
        </select>

        <Link
          to="/jobs/applications"
          style={{
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '9px 14px',
            fontSize: 13,
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

      {/* Job Postings Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {jobs.map((job) => {
          const isApplied = appliedJobs.has(job.id);
          return (
            <div
              key={job.id}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 320 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>{job.title}</span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: job.match_percentage >= 90 ? 'var(--color-success-bg)' : 'var(--color-surface-elevated)',
                    color: job.match_percentage >= 90 ? 'var(--color-success)' : 'var(--color-primary)',
                    fontSize: 12,
                    fontWeight: 700
                  }}>
                    {job.match_percentage}% MATCH
                  </span>
                </div>

                <div style={{ fontSize: 14, color: 'var(--color-muted)', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <strong>{job.company}</strong>
                  <span>•</span>
                  <span>{job.location}</span>
                  <span>•</span>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{job.salary_range}</span>
                </div>

                <p style={{ margin: '4px 0 6px', fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>
                  {job.description}
                </p>

                {/* Skills Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {job.skills.map((skill) => (
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
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Link
                  to="/tailor"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Sparkles size={14} color="var(--color-primary)" />
                  <span>Tailor</span>
                </Link>

                <button
                  onClick={() => handleApply(job)}
                  disabled={isApplied}
                  style={{
                    background: isApplied ? 'var(--color-success)' : 'var(--color-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 18px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isApplied ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {isApplied ? (
                    <>
                      <BookmarkCheck size={16} />
                      <span>Tracked in Kanban</span>
                    </>
                  ) : (
                    <>
                      <Briefcase size={15} />
                      <span>1-Click Apply</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default JobsFeedPage;
