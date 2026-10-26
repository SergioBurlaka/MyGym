import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext.js';
import Navbar from './components/Navbar.js';
import DemoBanner from './components/DemoBanner.js';
import LoginPage from './pages/LoginPage.js';
import RegisterPage from './pages/RegisterPage.js';
import DashboardPage from './pages/DashboardPage.js';
import WorkoutFormPage from './pages/WorkoutFormPage.js';
import ExercisesPage from './pages/ExercisesPage.js';
import ProgressPage from './pages/ProgressPage.js';
import ImportPage from './pages/ImportPage.js';
import ProgramsPage from './pages/ProgramsPage.js';
import PrivacyPage from './pages/PrivacyPage.js';
import IntegrationsPage from './pages/IntegrationsPage.js';
import SchedulePage from './pages/SchedulePage.js';
import OAuthConsentPage from './pages/OAuthConsentPage.js';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-[env(safe-area-inset-top)] text-slate-400">
        {t('common.loading')}
      </div>
    );
  }
  if (!user) {
    // Come back here after logging in (e.g. the OAuth consent page).
    const here = location.pathname + location.search;
    return <Navigate to={here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <DemoBanner />
      {/* Safe-area insets (viewport-fit=cover): home indicator / gesture bar
          at the bottom, camera cutout on the sides in landscape. The top one
          is on the Navbar, or on the page itself when there's no Navbar. */}
      <main className="mx-auto max-w-5xl pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          {/* Handles login itself: its error variant is shown logged out too. */}
          <Route path="/oauth/consent" element={<OAuthConsentPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workouts/:id"
            element={
              <ProtectedRoute>
                <WorkoutFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exercises"
            element={
              <ProtectedRoute>
                <ExercisesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/progress"
            element={
              <ProtectedRoute>
                <ProgressPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/import"
            element={
              <ProtectedRoute>
                <ImportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedule"
            element={
              <ProtectedRoute>
                <SchedulePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/integrations"
            element={
              <ProtectedRoute>
                <IntegrationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/programs"
            element={
              <ProtectedRoute>
                <ProgramsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
