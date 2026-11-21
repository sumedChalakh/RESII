import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { addXp } from '../store/seasonSlice';
import { 
  Check, 
  ArrowRight, 
  Download, 
  FileText, 
  ShieldCheck, 
  Maximize2, 
  Sparkles 
} from 'lucide-react';

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  accent_color: string;
  font_family: string;
  page_budget_margin_mm: number;
  is_ats_grade_a: boolean;
}

export const TemplateGalleryPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('classic_spruce');
  const [switching, setSwitching] = useState(false);
  const [previewModal, setPreviewModal] = useState<TemplateItem | null>(null);

  useEffect(() => {
    fetch('/api/v3/templates/')
      .then((res) => res.json())
      .then((data) => {
        if (data.templates) {
          setTemplates(data.templates);
        }
      })
      .catch((err) => console.error('Failed to load templates:', err));
  }, []);

  const handleApplyTemplate = async (templateId: string) => {
    setSwitching(true);
    try {
      const res = await fetch('/api/v3/templates/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id: 'primary',
          template_id: templateId
        })
      });

      if (res.ok) {
        dispatch(addXp({ amount: 25, reason: 'Switched Resume Template' }));
        navigate('/edit/primary');
      }
    } catch (err) {
      console.error('Failed to switch template:', err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 1040, margin: '0 auto' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
          <Sparkles size={16} />
          <span>ATS-OPTIMIZED DESIGN CATALOG</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>Resume Template Gallery</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)' }}>
          Every layout is calibrated to pass 100% of machine-reading parsers (Workday, Greenhouse, Lever, Taleo) without losing any line content or formatting.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 24
      }}>
        {templates.map((tmpl) => {
          const isSelected = selectedTemplate === tmpl.id;
          return (
            <div
              key={tmpl.id}
              onClick={() => setSelectedTemplate(tmpl.id)}
              style={{
                background: 'var(--color-surface)',
                border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: 20,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: isSelected ? 'var(--shadow-sheet)' : 'var(--shadow-sm)',
                transition: 'all 150ms ease'
              }}
            >
              <div>
                {/* Visual Easel Preview */}
                <div style={{
                  height: 220,
                  background: '#ffffff',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 16,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Top Header bar with accent color */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 5,
                    background: tmpl.accent_color
                  }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ height: 12, width: '45%', background: tmpl.accent_color, opacity: 0.9, borderRadius: 2 }} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewModal(tmpl);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-muted)',
                        padding: 4
                      }}
                      title="Fullscreen preview"
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>

                  <div style={{ height: 7, width: '30%', background: '#94a3b8', borderRadius: 2 }} />
                  <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }} />

                  {/* Body mockup lines */}
                  <div style={{ height: 8, width: '35%', background: tmpl.accent_color, opacity: 0.7, borderRadius: 2 }} />
                  <div style={{ height: 6, width: '90%', background: '#cbd5e1', borderRadius: 2 }} />
                  <div style={{ height: 6, width: '85%', background: '#e2e8f0', borderRadius: 2 }} />
                  <div style={{ height: 6, width: '95%', background: '#e2e8f0', borderRadius: 2 }} />

                  <div style={{ height: 8, width: '30%', background: tmpl.accent_color, opacity: 0.7, borderRadius: 2, marginTop: 4 }} />
                  <div style={{ height: 6, width: '88%', background: '#cbd5e1', borderRadius: 2 }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{tmpl.name}</span>
                  {isSelected && (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      color: 'var(--color-primary)',
                      fontSize: 12,
                      fontWeight: 700
                    }}>
                      <Check size={16} /> Selected
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4, minHeight: 36 }}>
                  {tmpl.description}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--color-success)'
                }}>
                  <ShieldCheck size={14} />
                  <span>100% ATS Verified Parser Grade</span>
                </div>
              </div>

              <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                <a
                  href={`/api/v3/templates/pdf/read/primary`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-elevated)',
                    color: 'var(--color-text)',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none'
                  }}
                  title="PDF Preview"
                >
                  <FileText size={15} />
                </a>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApplyTemplate(tmpl.id);
                  }}
                  disabled={switching}
                  style={{
                    flex: 1,
                    background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-elevated)',
                    color: isSelected ? '#fff' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: switching ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <span>{switching && isSelected ? 'Switching…' : 'Use Template'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fullscreen Preview Modal */}
      {previewModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 24
        }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: 720,
            padding: 24,
            boxShadow: 'var(--shadow-sheet)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                {previewModal.name} — Preview
              </h2>
              <button
                onClick={() => setPreviewModal(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 18,
                  cursor: 'pointer',
                  color: 'var(--color-muted)'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{
              height: 440,
              background: '#fff',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 28,
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              fontFamily: previewModal.font_family,
              overflowY: 'auto'
            }}>
              <div style={{ borderBottom: `2px solid ${previewModal.accent_color}`, paddingBottom: 12, marginBottom: 16 }}>
                <h1 style={{ margin: '0 0 4px', fontSize: 22, color: previewModal.accent_color }}>Alex Rivera</h1>
                <div style={{ fontSize: 13, color: '#64748b' }}>San Francisco, CA • alex@resii.dev • (555) 234-5678</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: previewModal.accent_color, margin: '0 0 6px' }}>
                  Professional Experience
                </h3>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  Senior Full-Stack Engineer — CloudScale Systems (2022 – Present)
                </div>
                <ul style={{ margin: '6px 0 0 16px', fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                  <li>Engineered high-throughput FastAPI services, reducing P99 latency by 34% across 2M daily queries.</li>
                  <li>Orchestrated bi-weekly Agile sprints for a 6-engineer pod, increasing story velocity by 22%.</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setPreviewModal(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  setPreviewModal(null);
                  handleApplyTemplate(previewModal.id);
                }}
                style={{
                  padding: '9px 20px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Apply to My Resume
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default TemplateGalleryPage;
