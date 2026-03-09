import { createContext, useContext, useState, useEffect } from 'react'
import {
  getToken, getName, getEmail, getProfile,
  logout as authLogout,
  setSession, setProfile as storeProfile, setInstitution,
} from '../lib/auth'
import { userApi } from '../lib/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [ready,      setReady]      = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user,       setUser]       = useState(null)

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken()
    if (token) {
      const cached = getProfile()
      const email  = getEmail()
      const isAdminEmail = (
        email?.toLowerCase() === 'admin@mentorix.ai' ||
        email?.toLowerCase().startsWith('admin@')
      )
      setUser({ name: getName(), email, ...cached, is_admin: cached?.is_admin || isAdminEmail })
      setIsLoggedIn(true)
      userApi.sessions()
        .then(d => {
          if (d?.profile) {
            const merged = {
              name: getName(), email: getEmail(),
              ...d.profile,
              is_admin: cached?.is_admin || isAdminEmail,
            }
            storeProfile(merged)
            setUser(merged)
          }
        })
        .catch(() => {})
    }
    setReady(true)
  }, [])

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = (data) => {
    const tok = data.token || data.access_token
    setSession({ token: tok, email: data.email, name: data.name })
    if (data.institution_id) setInstitution(data.institution_id, data.institution_name || '')
    const userObj = {
      name:     data.name,
      email:    data.email,
      is_admin: data.is_admin || false,
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

  // ── Refresh ───────────────────────────────────────────────────────────────
  const refreshUser = async () => {
    try {
      const d = await userApi.sessions()
      if (d?.profile) {
        const email = getEmail()
        const isAdminEmail = email?.toLowerCase() === 'admin@mentorix.ai' || email?.toLowerCase().startsWith('admin@')
        const merged = {
          name: getName(), email,
          ...d.profile,
          is_admin: user?.is_admin || isAdminEmail,
        }
        storeProfile(merged)
        setUser(merged)
        return merged
      }
    } catch {}
    return null
  }

  return (
    <AuthCtx.Provider value={{ ready, isLoggedIn, user, login, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)