import { createContext, useContext, useState, useEffect } from 'react'
import {
  getToken, getName, getEmail, getProfile,
  logout as authLogout,
  setSession, setProfile as storeProfile, setInstitution,
} from '../lib/auth'
import { userApi } from '../lib/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [ready,     setReady]     = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user,      setUser]      = useState(null)

  // ── Bootstrap from localStorage on mount ─────────────────────────────────
  useEffect(() => {
    const token = getToken()
    if (token) {
      const cached = getProfile()
      setUser(cached || { name: getName(), email: getEmail() })
      setIsLoggedIn(true)
      // Best-effort background refresh — /user/sessions gives name+dept
      userApi.sessions()
        .then(d => {
          if (d?.profile) {
            const merged = { name: getName(), email: getEmail(), ...d.profile }
            storeProfile(merged)
            setUser(merged)
          }
        })
        .catch(() => {})
    }
    setReady(true)
  }, [])

  // ── Called after /auth/login or /auth/register ───────────────────────────
  // Backend returns: { token, name, email }
  // Google OAuth returns via URL params: ?token=...&email=...&name=...
  const login = (data) => {
    // Normalise: backend uses `token`, not `access_token`
    const tok = data.token || data.access_token
    setSession({ token: tok, email: data.email, name: data.name })
    if (data.institution_id) setInstitution(data.institution_id, data.institution_name || '')
    const userObj = {
      name:  data.name,
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
        const merged = { name: getName(), email: getEmail(), ...d.profile }
        storeProfile(merged)
        setUser(merged)
        return merged
      }
    } catch { /* silently ignore — user still logged in */ }
    return null
  }

  return (
    <AuthCtx.Provider value={{ ready, isLoggedIn, user, login, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
