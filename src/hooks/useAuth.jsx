import { createContext, useContext, useState, useEffect } from 'react'
import {
  getToken, getName, getEmail, getProfile,
  logout as authLogout,
  setSession, setProfile as storeProfile, setInstitution,
} from '../lib/auth'
import { userApi } from '../lib/api'

const AuthCtx = createContext(null)

// ── Clean name: remove leading numbers, quoted words, extra whitespace ─────────
// Handles: '721922104118 "Surya" COMPUTER SCIENCE' → 'Surya'
// Handles: '721922104118 Surya' → 'Surya'
// Handles: '"Surya"' → 'Surya'
export function cleanDisplayName(raw) {
  if (!raw) return 'User'
  let name = raw

  // 1. If profile has a quoted nickname like "Surya" — extract it (highest priority)
  const quoted = name.match(/"([^"]+)"/)
  if (quoted) return quoted[1].trim()

  // 2. Strip leading number (Google sub / phone number at start)
  name = name.replace(/^\d+\s*/, '').trim()

  // 3. If what remains looks like an ALL CAPS department name, it means
  //    the real name was the quoted part (already handled above) — return fallback
  if (/^[A-Z\s]+$/.test(name) && name.split(' ').length > 2) return 'User'

  return name || 'User'
}

export function AuthProvider({ children }) {
  const [ready,      setReady]      = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user,       setUser]       = useState(null)

  // ── Bootstrap from localStorage on mount ─────────────────────────────────
  useEffect(() => {
    const token = getToken()
    if (token) {
      const cached = getProfile()
      // Prefer display_name from onboarding, fallback to cleaned Google name
      const rawName = cached?.display_name || getName()
      const cleanName = cleanDisplayName(rawName)
      setUser(cached ? { ...cached, name: cleanName } : { name: cleanName, email: getEmail() })
      setIsLoggedIn(true)

      // Best-effort background refresh
      userApi.sessions()
        .then(d => {
          if (d?.profile) {
            const rawN = d.profile.display_name || getName()
            const merged = {
              name: cleanDisplayName(rawN),
              email: getEmail(),
              ...d.profile,
            }
            storeProfile(merged)
            setUser(merged)
          }
        })
        .catch(() => {})
    }
    setReady(true)
  }, [])

  // ── Called after /auth/login or /auth/google callback ────────────────────
  const login = (data) => {
    const tok = data.token || data.access_token
    const rawName = data.profile?.display_name || data.name || ''
    const cleanName = cleanDisplayName(rawName)

    setSession({ token: tok, email: data.email, name: cleanName })
    if (data.institution_id) setInstitution(data.institution_id, data.institution_name || '')

    const userObj = {
      name: cleanName,
      email: data.email,
      ...(data.profile || {}),
    }
    storeProfile(userObj)
    setUser(userObj)
    setIsLoggedIn(true)
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = () => {
    authLogout()
    setUser(null)
    setIsLoggedIn(false)
  }

  // ── Pull fresh profile from backend ──────────────────────────────────────
  const refreshUser = async () => {
    try {
      const d = await userApi.sessions()
      if (d?.profile) {
        const rawN = d.profile.display_name || getName()
        const merged = {
          name: cleanDisplayName(rawN),
          email: getEmail(),
          ...d.profile,
        }
        storeProfile(merged)
        setUser(merged)
        return merged
      }
    } catch { /* silently ignore */ }
    return null
  }

  return (
    <AuthCtx.Provider value={{ ready, isLoggedIn, user, login, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
