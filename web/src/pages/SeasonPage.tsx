import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { addXp } from '../store/seasonSlice';
import { Trophy, Award, Flame, CheckCircle2, Sparkles, Star, Target, Users } from 'lucide-react';

export const SeasonPage: React.FC = () => {
  const dispatch = useDispatch();
  const { level, xp, tier, badges } = useSelector((state: RootState) => state.season);

  const [seasonData, setSeasonData] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/season/goal')
      .then((res) => res.json())
      .then((data) => setSeasonData(data))
      .catch(console.error);

    fetch('/api/season/elsewhere')
      .then((res) => res.json())
      .then((data) => setLeaderboard(data.leaderboard || []))
      .catch(console.error);
  }, []);

  const displayLevel = seasonData?.current_level ?? level;
  const displayXp = seasonData?.current_xp ?? xp;
  const displayTier = seasonData?.tier ?? tier;
  const displayBadges = seasonData?.badges ?? badges;

  const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0f4c3a 0%, #153b2f 100%)',
        color: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        padding: '36px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 24,
        boxShadow: 'var(--shadow-sheet)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a7f3d0', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <Trophy size={16} />
            <span>RESII SEASON 03 • THE OFFER HUNT</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '8px 0 10px', color: '#fff' }}>
            Level {displayLevel} — {displayTier} Tier
          </h1>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.9, maxWidth: 520, lineHeight: 1.5 }}>
            Every tailored resume, ATS scan, and application earns XP toward your weekly goal, season milestones, and tier advancement.
          </p>
        </div>

        {/* Level Stats Ring */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.12)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 32px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>{displayXp} XP</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4, letterSpacing: '0.05em' }}>VERIFIED CAREER XP</div>
        </div>
      </div>

      {/* Weekly Goal Progress */}
      {seasonData?.weekly_goal && (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14, fontWeight: 700 }}>
              <span>Weekly Job Applications</span>
              <span style={{ color: 'var(--color-primary)' }}>
                {seasonData.weekly_goal.completed_applications} / {seasonData.weekly_goal.target_applications}
              </span>
            </div>
            <div style={{ height: 10, background: 'var(--color-surface-elevated)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(seasonData.weekly_goal.completed_applications / seasonData.weekly_goal.target_applications) * 100}%`,
                background: 'var(--color-primary)',
                borderRadius: 5
              }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14, fontWeight: 700 }}>
              <span>Tailored Resume Versions</span>
              <span style={{ color: 'var(--color-accent)' }}>
                {seasonData.weekly_goal.completed_tailored_resumes} / {seasonData.weekly_goal.target_tailored_resumes}
              </span>
            </div>
            <div style={{ height: 10, background: 'var(--color-surface-elevated)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(seasonData.weekly_goal.completed_tailored_resumes / seasonData.weekly_goal.target_tailored_resumes) * 100}%`,
                background: 'var(--color-accent)',
                borderRadius: 5
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Tier Road Progression */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 24,
        boxShadow: 'var(--shadow-sm)'
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 18px' }}>The Five Seasonal Tiers</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {tiers.map((t, idx) => {
            const isCurrent = t === tier;
            return (
              <div
                key={t}
                style={{
                  background: isCurrent ? 'var(--color-success-bg)' : 'var(--color-surface-elevated)',
                  border: `2px solid ${isCurrent ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: 16,
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 6 }}>
                  {idx === 0 ? '🥉' : idx === 1 ? '🥈' : idx === 2 ? '🥇' : idx === 3 ? '💎' : '👑'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{t}</div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>
                  {idx * 300} XP
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leaderboard & Badges Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 24 }}>
        {/* Leaderboard */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Users size={18} color="var(--color-primary)" />
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Season 03 Leaderboard</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {leaderboard.map((u) => {
              const isUser = u.name.includes('(You)');
              return (
                <div
                  key={u.rank}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${isUser ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: isUser ? 'var(--color-success-bg)' : 'var(--color-surface-elevated)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, width: 24, color: u.rank <= 3 ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                      #{u.rank}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Level {u.level} • {u.applications} Applications</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-primary)' }}>
                    {u.xp} XP
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Badges Collection */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Award size={18} color="var(--color-primary)" />
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Career Milestones & Badges</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayBadges.map((b: any) => (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: b.unlocked ? 'var(--color-surface-elevated)' : 'rgba(0,0,0,0.02)',
                  opacity: b.unlocked ? 1 : 0.5
                }}
              >
                <div style={{ fontSize: 18, color: b.unlocked ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                  <Award size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    {b.unlocked ? '✓ Unlocked Milestone' : b.description || 'Locked Milestone'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
export default SeasonPage;
