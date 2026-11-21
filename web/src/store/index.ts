import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import seasonReducer from './seasonSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    season: seasonReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
