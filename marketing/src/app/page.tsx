import React from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, ShieldCheck, CheckCircle2, Zap, Layers, FileText } from 'lucide-react';

export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header style={{
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 24px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34,
              height: 34,
              background: 'var(--color-primary)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16
            }}>
              R
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>
              RESII
            </span>
          </Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 14, fontWeight: 500 }}>
            <a href="#features" style={{ color: 'var(--color-muted)' }}>Features</a>
            <a href="#how-it-works" style={{ color: 'var(--color-muted)' }}>How it Works</a>
            <a href="#pricing" style={{ color: 'var(--color-muted)' }}>Pricing</a>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a
              href={`${appUrl}/login`}
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-ink)',
                padding: '8px 14px'
              }}
            >
              Sign In
            </a>
            <a
              href={`${appUrl}/check/demo`}
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: 'var(--shadow-sheet)'
              }}
            >
              <Sparkles size={16} />
              <span>Free ATS Check</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        padding: '80px 24px 60px',
        maxWidth: 1000,
        margin: '0 auto',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--color-primary-light)',
          color: 'var(--color-primary-dark)',
          padding: '6px 14px',
          borderRadius: 9999,
          fontSize: 13,
          fontWeight: 700
        }}>
          <Sparkles size={14} />
          <span>RESII 2026 Engine • Beats 99.4% of Modern ATS Screeners</span>
        </div>

        <h1 style={{
          fontSize: 'clamp(36px, 5vw, 56px)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          margin: 0
        }}>
          The AI Career Engine Built to Win Interviews.
        </h1>

        <p style={{
          fontSize: 18,
          color: 'var(--color-muted)',
          maxWidth: 680,
          margin: 0,
          lineHeight: 1.5
        }}>
          Instant ATS scoring, drag-and-drop tree editing, job-tailored resumes in seconds, and autonomous job application submissions.
        </p>

        {/* Free Upload Scanner CTA */}
        <div style={{
          width: '100%',
          maxWidth: 620,
          marginTop: 16,
          background: 'var(--color-surface)',
          border: '2px dashed var(--color-border)',
          borderRadius: 16,
          padding: '36px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          boxShadow: 'var(--shadow-sheet)'
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FileText size={26} />
          </div>

          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Drop your resume here (PDF or DOCX)</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
              Get your instant score, parsed document tree, and 7 bullet rewrites free.
            </div>
          </div>

          <a
            href={`${appUrl}/check/demo`}
            style={{
              background: 'var(--color-primary)',
              color: '#fff',
              padding: '12px 28px',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span>Scan My Resume Now</span>
            <ArrowRight size={16} />
          </a>
        </div>
      </section>

      {/* 3 Pillars Section */}
      <section id="features" style={{
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        padding: '80px 24px'
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 54 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 10px' }}>
              Engineered From the Ground Up
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: 'var(--color-muted)' }}>
              Everything you need from your first ATS check to your final signed offer.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32 }}>
            <div style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}>
              <Layers size={28} color="var(--color-primary)" />
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Interactive Tree Editor</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                Micro-spaced typography, automatic page-budget calculation, drag-and-drop section reordering, and live ATS scoring feedback as you type.
              </p>
            </div>

            <div style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}>
              <Sparkles size={28} color="var(--color-accent)" />
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Job-Specific Tailor Engine</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                Paste any job posting. RESII extracts targeted keywords, generates per-bullet suggestions, and generates a tailored copy with higher ATS scores.
              </p>
            </div>

            <div style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}>
              <Zap size={28} color="var(--color-primary)" />
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Autonomous Auto-Apply</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                Configure your criteria and salary expectations. Our bot fills screening forms and submits applications with complete audit logging.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto',
        background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
        padding: '32px 24px',
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--color-muted)'
      }}>
        <div>© 2026 RESII Career Technologies. Built for modern job seekers.</div>
      </footer>
    </div>
  );
}
