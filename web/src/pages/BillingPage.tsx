import React, { useState, useEffect } from 'react';
import { Check, Shield, Zap, Sparkles, CreditCard, Tag, ArrowRight } from 'lucide-react';

interface InvoiceItem {
  id: string;
  date: string;
  amount: string;
  status: string;
  description: string;
}

export const BillingPage: React.FC = () => {
  const [coupon, setCoupon] = useState('');
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponValid, setCouponValid] = useState<boolean | null>(null);
  const [activeTier, setActiveTier] = useState('pro');
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/entitlements')
      .then((res) => res.json())
      .then((data) => {
        if (data.tier) setActiveTier(data.tier);
      })
      .catch(console.error);

    fetch('/api/billing/payments')
      .then((res) => res.json())
      .then((data) => {
        if (data.invoices) setInvoices(data.invoices);
      })
      .catch(console.error);
  }, []);

  const handleApplyPromo = async () => {
    if (!coupon.trim()) return;
    try {
      const res = await fetch('/api/billing/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: coupon.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setCouponValid(true);
        setCouponMessage(data.message);
      } else {
        setCouponValid(false);
        setCouponMessage(data.detail || 'Invalid discount code.');
      }
    } catch (e) {
      setCouponValid(false);
      setCouponMessage('Failed to validate code.');
    }
  };

  const handleSelectPlan = async (tier: string) => {
    setLoadingCheckout(tier);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, billing_period: 'monthly' })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.url) {
          window.location.href = data.url;
        } else {
          setActiveTier(tier);
        }
      } else {
        alert(data.detail || 'Billing checkout is currently unconfigured. Please contact support or configure payment credentials.');
      }
    } catch (e: any) {
      alert('Unable to initiate checkout. Please try again later.');
    } finally {
      setLoadingCheckout(null);
    }
  };

  const plans = [
    {
      id: 'free',
      name: 'Starter',
      price: '$0',
      period: 'forever',
      features: ['1 Primary Resume', 'Unlimited ATS Score Checks', 'Basic Template Access'],
      isCurrent: activeTier === 'free'
    },
    {
      id: 'pro',
      name: 'Pro Career',
      price: '$18',
      period: 'per month',
      features: ['Unlimited Tailored Copies', 'AI Line Rewrites & Bullet Generator', 'Full Template Gallery', '50 Auto-Applies / month', 'Google Docs 2-Way Sync'],
      isCurrent: activeTier === 'pro',
      popular: true
    },
    {
      id: 'unlimited',
      name: 'Executive Unlimited',
      price: '$34',
      period: 'per month',
      features: ['Everything in Pro', 'Unlimited Auto-Applies', 'Background Job Match Radar', 'Direct Priority AI Queue', 'Human ATS Review Guarantee'],
      isCurrent: activeTier === 'unlimited'
    }
  ];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>Simple, High-Yield Plans</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)' }}>
          Transparent pricing engineered to land 3x more interviews. Cancel anytime with 1 click.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 24
      }}>
        {plans.map((p) => (
          <div
            key={p.id}
            style={{
              background: 'var(--color-surface)',
              border: `2px solid ${p.popular ? 'var(--color-primary)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: p.popular ? 'var(--shadow-sheet)' : 'var(--shadow-sm)',
              position: 'relative'
            }}
          >
            {p.popular && (
              <div style={{
                position: 'absolute',
                top: -12,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 12px',
                borderRadius: 'var(--radius-full)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              }}>
                MOST POPULAR
              </div>
            )}

            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>{p.name}</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '14px 0 20px' }}>
                <span style={{ fontSize: 36, fontWeight: 800 }}>{p.price}</span>
                <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>/{p.period}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                {p.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text)' }}>
                    <Check size={16} color="var(--color-primary)" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleSelectPlan(p.id)}
              disabled={p.isCurrent || loadingCheckout === p.id}
              style={{
                marginTop: 24,
                width: '100%',
                background: p.isCurrent ? 'var(--color-surface-elevated)' : 'var(--color-primary)',
                color: p.isCurrent ? 'var(--color-text)' : '#fff',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '11px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: p.isCurrent ? 'default' : 'pointer'
              }}
            >
              {loadingCheckout === p.id ? 'Redirecting to Stripe…' : (p.isCurrent ? '✓ Current Plan' : `Upgrade to ${p.name}`)}
            </button>
          </div>
        ))}
      </div>

      {/* Promo Code & Invoices Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
        {/* Promo Code */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Tag size={18} color="var(--color-primary)" />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Redeem Promo or Partner Code</h3>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: '0 0 14px' }}>
            Try code <strong>LAUNCH50</strong> for 50% off your first 3 months.
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              placeholder="e.g. LAUNCH50"
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-elevated)',
                color: 'var(--color-text)',
                boxSizing: 'border-box'
              }}
            />
            <button
              onClick={handleApplyPromo}
              style={{
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
              Apply
            </button>
          </div>

          {couponMessage && (
            <div style={{
              marginTop: 10,
              fontSize: 12,
              fontWeight: 600,
              color: couponValid ? 'var(--color-success)' : 'var(--color-danger)'
            }}>
              {couponMessage}
            </div>
          )}
        </div>

        {/* Invoices */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <CreditCard size={18} color="var(--color-primary)" />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Payment & Invoice History</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invoices.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)'
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{inv.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{inv.date}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{inv.amount}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--color-success)',
                    background: 'var(--color-success-bg)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)'
                  }}>
                    PAID
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
export default BillingPage;
