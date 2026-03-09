import { createContext, useContext, useState, useEffect } from 'react'
import {
  getToken, getName, getEmail, getProfile,
  logout as authLogout,
  setSession, setProfile as storeProfile, setInstitution,
} from '../lib/auth'
import { userApi } from '../lib/api'

const AuthCtx = createContext(null)

// Derive admin status from email (fallback if backend didn't return is_admin)
const deriveAdmin = (email = '') =>
  email.toLowerCase() === 'admin@mentorix.ai' ||
  email.toLowerCase().startsWith('admin@')

export function AuthProvider({ children }) {
  const [ready,      setReady]      = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user,       setUser]       = useState(null)

  // ── Bootstrap from localStorage on mount ─────────────────────────────────
  useEffect(() => {
    const token = getToken()
    if (token) {
      const cached = getProfile()
      const email  = getEmail()
      const base   = cached || { name: getName(), email }
      // Restore is_admin from cached profile or derive from email
      const is_admin = base.is_admin ?? deriveAdmin(email)
      setUser({ ...base, is_admin })
      setIsLoggedIn(true)
      // Background refresh
      userApi.sessions()
        .then(d => {
          if (d?.profile) {
            const merged = {
              name: getName(), email: getEmail(),
              ...d.profile,
              is_admin: d.profile.is_admin ?? is_admin,
            }
            storeProfile(merged)
            setUser(merged)
          }
        })
        .catch(() => {})
    }
    setReady(true)
  }, [])

  // ── Called after /auth/login or /auth/register ────────────────────────────
  // Backend returns: { token, name, email, is_admin }
  const login = (data) => {
    const tok      = data.token || data.access_token
    const is_admin = data.is_admin ?? deriveAdmin(data.email)
    setSession({ token: tok, email: data.email, name: data.name })
    if (data.institution_id) setInstitution(data.institution_id, data.institution_name || '')
    const userObj = {
      name:     data.name,
      email:    data.email,
      is_admin,
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
        const merged = {
          name: getName(), email: getEmail(),
          ...d.profile,
          is_admin: d.profile.is_admin ?? deriveAdmin(getEmail()),
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