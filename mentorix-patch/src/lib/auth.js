// ── Token keys ────────────────────────────────────────────────────────────────
const KEYS = {
  token:          'mentorix_token',
  email:          'mentorix_email',
  name:           'mentorix_name',
  profile:        'mentorix_profile',
  institution_id: 'mentorix_institution_id',
  institution:    'mentorix_institution_name',
}

// ── Getters ───────────────────────────────────────────────────────────────────
export const getToken         = () => localStorage.getItem(KEYS.token)
export const getEmail         = () => localStorage.getItem(KEYS.email)
export const getName          = () => localStorage.getItem(KEYS.name) || 'User'
export const getProfile       = () => { try { return JSON.parse(localStorage.getItem(KEYS.profile) || 'null') } catch { return null } }
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