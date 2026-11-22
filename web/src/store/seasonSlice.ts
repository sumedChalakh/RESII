import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SeasonState {
  level: number;
  xp: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
  goalDayProgress: number; // 0 to 100
  badges: Array<{ id: string; name: string; icon: string; unlocked: boolean }>;
  recentToast: string | null;
}

const initialState: SeasonState = {
  level: 1,
  xp: 0,
  tier: 'Bronze',
  goalDayProgress: 0,
  badges: [
    { id: 'b1', name: 'First Tailor', icon: '✨', unlocked: false },
    { id: 'b2', name: 'ATS 90+ Club', icon: '🎯', unlocked: false },
    { id: 'b3', name: 'Auto-Apply Pioneer', icon: '⚡', unlocked: false },
    { id: 'b4', name: '10 Applications', icon: '🚀', unlocked: false },
  ],
  recentToast: null,
};

export const seasonSlice = createSlice({
  name: 'season',
  initialState,
  reducers: {
    addXp(state, action: PayloadAction<{ amount: number; reason: string }>) {
      state.xp += action.payload.amount;
      state.recentToast = `+${action.payload.amount} XP: ${action.payload.reason}`;
      // Level progression check
      const newLevel = Math.floor(state.xp / 200) + 1;
      if (newLevel > state.level) {
        state.level = newLevel;
        state.recentToast = `Level Up! You reached Level ${newLevel}`;
      }
    },
    clearToast(state) {
      state.recentToast = null;
    },
  },
});

export const { addXp, clearToast } = seasonSlice.actions;
export default seasonSlice.reducer;
