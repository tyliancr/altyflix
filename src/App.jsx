import { useLocation, BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useProfile } from './contexts/ProfileContext';
import { lazy, Suspense, Component, useEffect } from 'react';
import useTVNavigation from './hooks/useTVNavigation';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { PlayerProvider } from './contexts/PlayerContext';
import PageTransition from './components/common/PageTransition';
import MainLayout from './layouts/MainLayout';
import { sanitizeReturnUrl } from './utils/helpers';
import './index.css';

// Error boundary — isole les crashs de page pour ne pas planter toute la navigation
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ALTYFLIX] Erreur page :', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#08080C] flex flex-col items-center justify-center gap-6 text-white p-8">
          <h2 className="text-2xl font-bold">Une erreur est survenue</h2>
          <p className="text-white/50 text-sm text-center max-w-sm">
            Cette page a rencontré un problème. Vous pouvez recharger ou revenir à l&apos;accueil.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-6 py-3 bg-white text-black font-bold rounded hover:bg-white/85 transition-colors"
            >
              Recharger
            </button>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
              className="px-6 py-3 bg-white/15 text-white font-bold rounded hover:bg-white/25 transition-colors"
            >
              Retour à l&apos;accueil
            </button>
          </div>
          {this.state.error && (
            <details className="mt-4 text-xs text-white/50 max-w-lg w-full bg-black/60 p-4 rounded-xl border border-white/10 text-left font-mono break-all cursor-pointer">
              <summary className="font-semibold text-white/70 mb-2 select-none">Détails de l&apos;erreur</summary>
              <p className="text-red-400 font-bold mb-1">{String(this.state.error?.message || this.state.error)}</p>
              {this.state.error?.stack && (
                <pre className="text-[11px] whitespace-pre-wrap text-white/40 mt-1 max-h-40 overflow-y-auto">{String(this.state.error.stack)}</pre>
              )}
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

import Home from './pages/Home';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const ProfileSelector = lazy(() => import('./pages/ProfileSelector'));
const DetailPage = lazy(() => import('./pages/DetailPage'));
const FilmsPage = lazy(() => import('./pages/FilmsPage'));
const SeriesPage = lazy(() => import('./pages/SeriesPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const DocumentariesPage = lazy(() => import('./pages/DocumentariesPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const PersonPage = lazy(() => import('./pages/PersonPage'));
const UpcomingPage = lazy(() => import('./pages/UpcomingPage'));
const MyList = lazy(() => import('./pages/MyList'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));
const WatchPage = lazy(() => import('./pages/WatchPage'));

// Développement uniquement : ouvre /watch sans connexion quand l'API tourne avec AUTH_DEV_UID (voir docs/VIDEO.md).
const WATCH_WITHOUT_LOGIN = import.meta.env.DEV && import.meta.env.VITE_VIDEO_DEV_NOAUTH === '1';

// Preload high-frequency navigation targets during idle time
const preloadSettings = () => import('./pages/Settings');
const preloadProfileSelector = () => import('./pages/ProfileSelector');

if (typeof window !== 'undefined') {
  const idlePreload = () => {
    preloadSettings();
    preloadProfileSelector();
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(idlePreload, { timeout: 2500 });
  } else {
    setTimeout(idlePreload, 1500);
  }
}

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen bg-[#08080C]" />;
  }

  if (!currentUser) {
    if (location.pathname !== '/login' && location.pathname !== '/') {
      const safePath = sanitizeReturnUrl(location.pathname + location.search, '');
      if (safePath) localStorage.setItem('returnUrl', safePath);
    }
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Profile Required Route Component
const ProfileRequiredRoute = ({ children }) => {
  const { currentProfile, loading, profiles } = useProfile();
  const { loading: authLoading } = useAuth();
  const location = useLocation();

  if (loading || authLoading) {
    return <div className="min-h-screen bg-[#08080C]" />;
  }

  if (!currentProfile && profiles.length > 0) {
    if (location.pathname !== '/profiles') {
      const safePath = sanitizeReturnUrl(location.pathname + location.search, '');
      if (safePath) localStorage.setItem('returnUrl', safePath);
    }
    return <Navigate to="/profiles" replace />;
  }

  if (!currentProfile) {
    return <Navigate to="/profiles" replace />;
  }

  return children;
};

// Route restricted for Kids
const KidRestrictedRoute = ({ children }) => {
  const { currentProfile } = useProfile();

  if (currentProfile?.isKid) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// App Routes Component — Stable layout without flickering
const AppRoutes = () => {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="min-h-screen bg-[#08080C]" />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={
            <PageTransition>
              <LoginPage />
            </PageTransition>
          } />

          {/* Protected Routes Without Layout */}
          <Route
            path="/profiles"
            element={
              <ProtectedRoute>
                <PageTransition>
                  <ProfileSelector />
                </PageTransition>
              </ProtectedRoute>
            }
          />

          {/* Lecteur vidéo HLS (titres hébergés par ALTYFLIX) */}
          <Route
            path="/watch/:id"
            element={
              WATCH_WITHOUT_LOGIN ? <WatchPage /> : (
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <WatchPage />
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              )
            }
          />

          <Route
            path="/profile-settings"
            element={
              <Navigate to="/settings" replace />
            }
          />

          {/* Protected Routes With Persistent Main Layout */}
          <Route element={<MainLayout />}>
            {/* Profile Required Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <Home />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />

            {/* Detail Pages */}
            <Route
              path="/movie/:id"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <DetailPage />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />

            <Route
              path="/tv/:id"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <DetailPage />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />

            {/* Films and Series Pages */}
            <Route
              path="/films"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <FilmsPage />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/series"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <SeriesPage />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/documentaires"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <DocumentariesPage />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/documentaries"
              element={
                <Navigate to="/documentaires" replace />
              }
            />
            <Route
              path="/category/:id"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <CategoryPage />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/search"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <SearchPage />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />

            {/* Additional Pages */}
            <Route
              path="/upcoming"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <UpcomingPage />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/person/:id"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <PersonPage />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-list"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <PageTransition>
                      <MyList />
                    </PageTransition>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <ProfileRequiredRoute>
                    <KidRestrictedRoute>
                      <PageTransition>
                        <Settings />
                      </PageTransition>
                    </KidRestrictedRoute>
                  </ProfileRequiredRoute>
                </ProtectedRoute>
              }
            />

            {/* 404 Page */}
            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <PageTransition>
                    <NotFound />
                  </PageTransition>
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};

// Chaque page est téléchargée à la demande. Pour que les changements de page (et le
// lancement d'une vidéo) soient instantanés, on les précharge dès que le navigateur
// est au repos : les pages d'abord, le lecteur (plus lourd) ensuite.
const PAGE_CHUNKS = [
  () => import('./pages/DetailPage'),
  () => import('./pages/FilmsPage'),
  () => import('./pages/SeriesPage'),
  () => import('./pages/SearchPage'),
  () => import('./pages/MyList'),
  () => import('./pages/DocumentariesPage'),
  () => import('./pages/UpcomingPage'),
  () => import('./pages/CategoryPage'),
  () => import('./pages/PersonPage'),
  () => import('./pages/ProfileSelector'),
  () => import('./pages/Settings'),
];
const PLAYER_CHUNKS = [
  () => import('./pages/WatchPage'),
  () => import('./components/player/VideoPlayer'),
];

function usePrefetchChunks() {
  useEffect(() => {
    // Connexion lente ou mode économie de données : on ne précharge rien
    const conn = navigator.connection;
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '')) return undefined;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const ids = [];
    let i = 0;
    const queue = [...PAGE_CHUNKS, ...PLAYER_CHUNKS];
    const next = () => {
      const load = queue[i++];
      if (!load) return;
      load().catch(() => {}).finally(() => ids.push(idle(next, { timeout: 4000 })));
    };
    ids.push(idle(next, { timeout: 4000 }));
    return () => ids.forEach(id => cancel(id));
  }, []);
}

function App() {
  useTVNavigation(); // Enable global spatial navigation logic for TV/Keyboard
  usePrefetchChunks();

  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <ProfileProvider>
            <PlayerProvider>
              <AppRoutes />
            </PlayerProvider>
          </ProfileProvider>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
