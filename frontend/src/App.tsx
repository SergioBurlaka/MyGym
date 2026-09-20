import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext.js';
import Navbar from './components/Navbar.js';
import LoginPage from './pages/LoginPage.js';
import RegisterPage from './pages/RegisterPage.js';
import DashboardPage from './pages/DashboardPage.js';
import WorkoutFormPage from './pages/WorkoutFormPage.js';
import ExercisesPage from './pages/ExercisesPage.js';
import ProgressPage from './pages/ProgressPage.js';
import ImportPage from './pages/ImportPage.js';
import ProgramsPage from './pages/ProgramsPage.js';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        {t('common.loading')}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
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
