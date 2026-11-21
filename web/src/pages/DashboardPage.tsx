import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { addXp } from '../store/seasonSlice';
import { 
  FileText, 
  Sparkles, 
  Plus, 
  ArrowUpRight, 
  Download, 
  CheckCircle2, 
  ExternalLink, 
  Briefcase, 
  Zap, 
  Copy, 
  Archive 
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  const { level, xp } = useSelector((state: RootState) => state.season);

  const [tailoredCopies, setTailoredCopies] = useState([
    { id: 'rez_stripe_01', title: 'Senior Backend Engineer', company: 'Stripe', match: 94, updated: '2 hours ago' },
    { id: 'rez_google_02', title: 'Staff Systems Architect', company: 'Google', match: 89, updated: 'Yesterday' },
    { id: 'rez_vercel_03', title: 'Full Stack Engineer', company: 'Vercel', match: 92, updated: '3 days ago' },
  ]);

  const handleQuickTailor = () => {
    dispatch(addXp({ amount: 50, reason: 'Generated tailored resume' }));
    navigate('/tailor');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Top Welcome Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px', color: 'var(--color-ink)' }}>
            Welcome back, {user?.name || 'Alex'}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)' }}>
            Your primary resume is ATS-ready. 3 tailored copies generated this week.
          </p>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleQuickTailor}
            style={{
              background: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <Sparkles size={16} color="var(--color-lavender)" />
            <span>Tailor to a Job</span>
          </button>
          
          <Link
            to="/templates/new"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Plus size={16} />
            <span>New Resume</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Primary Resume Card + Job Matches */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1.2fr)',
        gap: 24
      }}>
        {/* Primary Resume Sheet Preview */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sheet)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary-dark)',
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)'
              }}>
                PRIMARY
              </span>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Senior Software Engineer</h2>
            </div>
            {/* Live ATS Score Ring */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--color-success-bg)',
              color: 'var(--color-success)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              fontSize: 13,
              fontWeight: 700
            }}>
              <span>92</span>
              <span style={{ fontSize: 11, opacity: 0.8 }}>ATS SCORE</span>
            </div>
          </div>

          {/* Paper Sheet Preview Mock */}
          <div style={{
            height: 200,
            background: 'var(--color-surface-elevated)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-muted)'
          }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--color-ink)', fontSize: 14 }}>Alex Rivera</div>
              <div>San Francisco, CA • alex@resii.dev • github.com/arivera</div>
              <div style={{ height: 1, background: 'var(--color-border)', margin: '8px 0' }} />
              <div style={{ color: 'var(--color-ink)', fontWeight: 600 }}>EXPERIENCE</div>
              <div>Senior Full-Stack Engineer — CloudScale Systems (2022 – Present)</div>
              <div>• Scaled distributed microservices reducing P99 latency by 42%</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-faint)' }}>
              <span>Page 1 of 1 • Tightened: Yes</span>
              <span>v4 • Last saved 2m ago</span>
            </div>
          </div>

          {/* Card Actions */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              to="/edit/primary"
              style={{
                flex: 1,
                background: 'var(--color-primary)',
                color: '#fff',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                textAlign: 'center',
                fontWeight: 600,
                fontSize: 14,
                minWidth: 160
              }}
            >
              Open in Tree Editor
            </Link>
            <a
              href="/api/v3/resumes/primary/export/pdf"
              download
              style={{
                background: 'var(--color-surface-card)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                fontWeight: 600,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none'
              }}
            >
              <Download size={14} />
              <span>PDF</span>
            </a>
            <Link
              to="/v3/resumes/primary/google-docs"
              style={{
                background: 'var(--color-surface-card)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                fontWeight: 600,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <ExternalLink size={14} />
              <span>Google Docs</span>
            </Link>
          </div>
        </div>

        {/* Tailored Copies List */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Tailored Job Copies</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-muted)' }}>
                Targeted variants aligned with specific company ATS systems
              </p>
            </div>
            <Link to="/tailor" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>
              + Create new
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tailoredCopies.map((copy) => (
              <div
                key={copy.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-ink)' }}>
                    {copy.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                    {copy.company} • Updated {copy.updated}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-primary-light)',
                    color: 'var(--color-primary-dark)',
                    fontSize: 12,
                    fontWeight: 700
                  }}>
                    {copy.match}% MATCH
                  </div>
                  <Link
                    to={`/edit/${copy.id}`}
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span>Edit</span>
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Quick link to Auto-Apply & Job Feed */}
          <div style={{
            marginTop: 'auto',
            paddingTop: 16,
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              Ready to submit? Check high-match openings.
            </span>
            <Link
              to="/jobs"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>Explore Jobs</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
export default DashboardPage;
