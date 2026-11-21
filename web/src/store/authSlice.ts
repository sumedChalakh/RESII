import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface UserSession {
  id: string;
  email: string;
  name?: string;
  role: string;
  avatar_url?: string;
  created_at: string;
  entitlements: string[];
}

interface AuthState {
  user: UserSession | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'failed';
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
  error: null,
};

export const fetchSession = createAsyncThunk(
  'auth/fetchSession',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/auth/get-session', {
        credentials: 'include',
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data as UserSession | null;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to fetch session');
    }
  }
);

export const loginDemo = createAsyncThunk(
  'auth/loginDemo',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/auth/demo-login', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Demo login failed');
      }
      const data = await response.json();
      return data.user as UserSession;
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    return null;
  }
);

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<UserSession | null>) {
      state.user = action.payload;
      state.status = action.payload ? 'authenticated' : 'unauthenticated';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSession.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = action.payload ? 'authenticated' : 'unauthenticated';
      })
      .addCase(fetchSession.rejected, (state, action) => {
        state.status = 'unauthenticated';
        state.error = action.payload as string;
      })
      .addCase(loginDemo.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'authenticated';
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.status = 'unauthenticated';
      });
  },
});

export const { setUser } = authSlice.actions;
export default authSlice.reducer;
