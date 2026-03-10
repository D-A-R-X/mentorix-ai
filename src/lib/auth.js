// src/lib/auth.js
// ── Token keys ────────────────────────────────────────────────────────────────
const KEYS = {
  token:          'mentorix_token',
  email:          'mentorix_email',
  name:           'mentorix_name',
  profile:        'mentorix_profile',
  institution_id: 'mentorix_institution_id',
  institution:    'mentorix_institution_name',
}

// ── Clean name helper (mirrors useAuth cleanDisplayName) ─────────────────────
function cleanName(raw) {
  if (!raw) return 'User'
  // Extract quoted nickname e.g. 721922104118 "Surya" → Surya
  const quoted = raw.match(/"([^"]+)"/)
  if (quoted) return quoted[1].trim()
  // Strip leading number
  const stripped = raw.replace(/^\d+\s*/, '').trim()
  // If leftover is ALL CAPS multi-word (dept name), return User
  if (/^[A-Z\s]+$/.test(stripped) && stripped.split(' ').length > 2) return 'User'
  return stripped || 'User'
}

// ── Getters ───────────────────────────────────────────────────────────────────
export const getToken         = () => localStorage.getItem(KEYS.token)
export const getEmail         = () => localStorage.getItem(KEYS.email)
export const getName          = () => {
  // Prefer display_name from profile
  try {
    const profile = JSON.parse(localStorage.getItem(KEYS.profile) || 'null')
    if (profile?.display_name) return profile.display_name
  } catch {}
  return cleanName(localStorage.getItem(KEYS.name) || 'User')
}
export const getProfile       = () => {
  try { return JSON.parse(localStorage.getItem(KEYS.profile) || 'null') } catch { return null }
}
export const getInstitutionId = () => localStorage.getItem(KEYS.institution_id)
export const isLoggedIn       = () => !!getToken()

// ── Setters ───────────────────────────────────────────────────────────────────
export function setSession({ token, email, name }) {
  if (token) localStorage.setItem(KEYS.token, token)
  if (email) localStorage.setItem(KEYS.email, email)
  if (name)  localStorage.setItem(KEYS.name, name)
}

export function setProfile(data) {
  localStorage.setItem(KEYS.profile, JSON.stringify(data))
}

export function setInstitution(id, name) {
  localStorage.setItem(KEYS.institution_id, id)
  localStorage.setItem(KEYS.institution, name)
}

// ── Logout ────────────────────────────────────────────────────────────────────
export function logout() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
}

// ── Auth headers ──────────────────────────────────────────────────────────────
export function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  }
}
