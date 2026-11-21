import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { addXp } from '../store/seasonSlice';
import { 
  Plus, 
  ArrowLeft, 
  Trash2, 
  ChevronRight, 
  Calendar, 
  CheckCircle, 
  Sparkles,
  Briefcase
} from 'lucide-react';

interface Application {
  id: string;
  job_id: string;
  title: string;
  company: string;
  location: string;
  salary_range: string;
  stage: 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';
  match_percentage: number;
  applied_date?: string;
  notes?: string;
  next_step?: string;
  next_step_date?: string;
}

export const JobTrackerPage: React.FC = () => {
  const dispatch = useDispatch();
  const [apps, setApps] = useState<Application[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // New application form state
  const [newTitle, setNewTitle] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newLocation, setNewLocation] = useState('Remote');
  const [newSalary, setNewSalary] = useState('$180k - $220k');
  const [newStage, setNewStage] = useState<'saved' | 'applied' | 'interview' | 'offer' | 'rejected'>('applied');
  const [newNotes, setNewNotes] = useState('');

  const loadApplications = async () => {
    try {
      const res = await fetch('/api/jobs/applications');
      if (res.ok) {
        const data = await res.json();
        setApps(data.applications || []);
      }
    } catch (err) {
      console.error('Error fetching applications:', err);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const handleMoveStage = async (id: string, newStage: Application['stage']) => {
    try {
      const res = await fetch(`/api/jobs/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage })
      });

      if (res.ok) {
        setApps((prev) => prev.map((a) => (a.id === id ? { ...a, stage: newStage } : a)));
        if (newStage === 'interview') {
          dispatch(addXp({ amount: 150, reason: 'Advanced Application to Interview!' }));
        } else if (newStage === 'offer') {
          dispatch(addXp({ amount: 500, reason: 'Unlocked Job Offer Stage! 🏆' }));
        }
      }
    } catch (err) {
      console.error('Failed to move stage:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/applications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setApps((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete application:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newCompany) return;

    try {
      const res = await fetch('/api/jobs/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          company: newCompany,
          location: newLocation,
          salary_range: newSalary,
          stage: newStage,
          notes: newNotes,
          match_percentage: 92
        })
      });

      if (res.ok) {
        const created = await res.json();
        setApps((prev) => [...prev, created]);
        setShowAddModal(false);
        setNewTitle('');
        setNewCompany('');
        setNewNotes('');
        dispatch(addXp({ amount: 30, reason: 'Logged New Job Application' }));
      }
    } catch (err) {
      console.error('Failed to create application:', err);
    }
  };

  const columns: Array<{ key: Application['stage']; label: string; color: string }> = [
    { key: 'saved', label: 'Saved', color: 'var(--color-muted)' },
    { key: 'applied', label: 'Applied', color: 'var(--color-primary)' },
    { key: 'interview', label: 'Interview', color: '#6366f1' },
    { key: 'offer', label: 'Offer Received', color: 'var(--color-success)' },
    { key: 'rejected', label: 'Archived', color: '#94a3b8' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/jobs" style={{ color: 'var(--color-muted)', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Application Kanban Tracker</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-muted)' }}>
              Track interview rounds, follow-up timelines, and offers across your pipeline.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          style={{
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '9px 18px',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer'
          }}
        >
          <Plus size={16} />
          <span>Add Custom Application</span>
        </button>
      </div>

      {/* Kanban Board Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(230px, 1fr))',
        gap: 16,
        overflowX: 'auto',
        paddingBottom: 20
      }}>
        {columns.map((col) => {
          const colApps = apps.filter((a) => a.stage === col.key);
          return (
            <div
              key={col.key}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                minHeight: 520,
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 10,
                borderBottom: '2px solid var(--color-border)'
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {col.label}
                </span>
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'var(--color-surface-elevated)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  color: 'var(--color-muted)'
                }}>
                  {colApps.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {colApps.map((app) => (
                  <div
                    key={app.id}
                    style={{
                      background: 'var(--color-surface-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 14,
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
                        {app.title}
                      </div>
                      <button
                        onClick={() => handleDelete(app.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-muted)',
                          cursor: 'pointer',
                          padding: 2
                        }}
                        title="Archive application"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                      <strong>{app.company}</strong> • {app.location}
                    </div>

                    {app.notes && (
                      <div style={{
                        fontSize: 11,
                        color: 'var(--color-muted)',
                        background: 'var(--color-surface)',
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border)'
                      }}>
                        {app.notes}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4 }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: 3,
                        background: 'var(--color-success-bg)',
                        color: 'var(--color-success)',
                        fontWeight: 700
                      }}>
                        {app.match_percentage}% MATCH
                      </span>

                      {/* Stage transition buttons */}
                      <select
                        value={app.stage}
                        onChange={(e) => handleMoveStage(app.id, e.target.value as Application['stage'])}
                        style={{
                          fontSize: 11,
                          padding: '3px 6px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          color: 'var(--color-text)',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="saved">Move: Saved</option>
                        <option value="applied">Move: Applied</option>
                        <option value="interview">Move: Interview</option>
                        <option value="offer">Move: Offer</option>
                        <option value="rejected">Move: Archived</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Application Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <form
            onSubmit={handleCreate}
            style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: 520,
              padding: 24,
              boxShadow: 'var(--shadow-sheet)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Add Tracked Application</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Role / Job Title</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Company Name</label>
              <input
                type="text"
                required
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="e.g. OpenAI, Stripe, Linear"
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Location</label>
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Initial Stage</label>
                <select
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="saved">Saved</option>
                  <option value="applied">Applied</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Interview Notes & Follow-ups</label>
              <textarea
                rows={3}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Take-home due date, interviewer names, architecture topics..."
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  fontSize: 13
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '8px 20px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Add Application
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
export default JobTrackerPage;
