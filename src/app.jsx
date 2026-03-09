import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { FullPageSpinner, ToastProvider } from './components/ui/index.jsx'
import { lazy, Suspense } from 'react'
import HR    from './pages/HR'

const Landing    = lazy(() => import('./pages/Landing'))
const Login      = lazy(() => import('./pages/Login'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Dashboard  = lazy(() => import('./pages/Dashboard'))
const Voice      = lazy(() => import('./pages/Voice'))
const HRMode     = lazy(() => import('./pages/HRMode'))
const Assessment = lazy(() => import('./pages/Assessment'))
const Admin      = lazy(() => import('./pages/Admin'))
const Setup      = lazy(() => import('./pages/Setup'))

// ── Auth guards ───────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const { isLoggedIn, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <FullPageSpinner />
  if (!isLoggedIn) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RequireGuest({ children }) {
  const { isLoggedIn, ready } = useAuth()
  if (!ready) return <FullPageSpinner />
  if (isLoggedIn) return <Navigate to="/dashboard" replace />
  return children
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              {/* Public */}
              <Route path="/"       element={<Landing />} />
              <Route path="/login"  element={<RequireGuest><Login /></RequireGuest>} />
              <Route path="/setup"  element={<Setup />} />

              {/* Auth required */}
              <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
              <Route path="/dashboard"  element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/voice"      element={<RequireAuth><Voice /></RequireAuth>} />
              <Route path="/hr"         element={<RequireAuth><HRMode /></RequireAuth>} />
              <Route path="/assessment" element={<RequireAuth><Assessment /></RequireAuth>} />
              <Route path="/admin"      element={<RequireAuth><Admin /></RequireAuth>} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
