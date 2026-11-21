import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from './store';
import { fetchSession } from './store/authSlice';
import { AppLayout } from './components/AppLayout';

// Route-level code splitting: one lazy chunk per page
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PublicCheckPage = lazy(() => import('./pages/PublicCheckPage'));
const KeepCheckPage = lazy(() => import('./pages/KeepCheckPage'));
const EditTreePage = lazy(() => import('./pages/EditTreePage'));
const TailorPage = lazy(() => import('./pages/TailorPage'));
const TemplateGalleryPage = lazy(() => import('./pages/TemplateGalleryPage'));
const JobsFeedPage = lazy(() => import('./pages/JobsFeedPage'));
const JobTrackerPage = lazy(() => import('./pages/JobTrackerPage'));
const AutoApplyPage = lazy(() => import('./pages/AutoApplyPage'));
const SeasonPage = lazy(() => import('./pages/SeasonPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const GoogleDocsPage = lazy(() => import('./pages/GoogleDocsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Public routes allowed without an authenticated session
const PUBLIC_PREFIXES = ['/login', '/check', '/public'];

export const App: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const { status, user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    // Fire session check on boot
    dispatch(fetchSession())
      .unwrap()
      .finally(() => {
        // Fade out inline SVG splash smoothly once session check settles
        const splash = document.getElementById('splash');
        if (splash) {
          splash.setAttribute('data-leaving', 'true');
          setTimeout(() => {
            splash.style.display = 'none';
          }, 300);
        }
      });
  }, [dispatch]);

  // Check if current route is public
  const isPublicRoute = PUBLIC_PREFIXES.some(prefix => location.pathname.startsWith(prefix));

  // If session check has completed and user is null on a protected route:
  // Redirect to marketing site (or /login in development fallback)
  if (status === 'unauthenticated' && !isPublicRoute) {
    // In production, redirects to https://resii.com/
    // For local dev, redirect to /login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Loading view…</div>}>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/check/:checkId" element={<PublicCheckPage />} />
        <Route path="/check/:checkId/keep" element={<KeepCheckPage />} />
        
        {/* Authenticated Routes wrapped in AppLayout */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/edit/:resumeId" element={<EditTreePage />} />
          <Route path="/tailor" element={<TailorPage />} />
          <Route path="/tailor/:resumeId" element={<TailorPage />} />
          <Route path="/templates/new/*" element={<TemplateGalleryPage />} />
          <Route path="/jobs/*" element={<JobsFeedPage />} />
          <Route path="/jobs/applications" element={<JobTrackerPage />} />
          <Route path="/auto-apply" element={<AutoApplyPage />} />
          <Route path="/auto-apply/preferences" element={<AutoApplyPage />} />
          <Route path="/season" element={<SeasonPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/preferences" element={<AccountPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/subscribe" element={<BillingPage />} />
          <Route path="/v3/resumes/:id/google-docs" element={<GoogleDocsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
};
export default App;
