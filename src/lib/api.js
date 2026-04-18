import { authHeaders, getToken } from './auth'

export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// ── Base fetch ────────────────────────────────────────────────────────────────
async function req(method, path, body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...extraHeaders },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${API}${path}`, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.detail || `Error ${res.status}`), { status: res.status, data })
  return data
}

const get   = (path)        => req('GET',    path)
const post  = (path, body)  => req('POST',   path, body)
const del   = (path)        => req('DELETE', path)
const patch = (path, body)  => req('PATCH',  path, body)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login:      (email, password) => post('/auth/login', { email, password }),
  register:   (email, password, name) => post('/auth/register', { email, password, name }),
  sendOtp:    (email, name, password) => post('/auth/send-otp',    { email, name, password }),
  verifyOtp:  (email, otp)            => post('/auth/verify-otp',  { email, otp }),
  updateName: (name) => post('/auth/update-name', { name }),
  googleUrl:  () => `${API}/auth/google/login`,
}

// ── User / Profile ────────────────────────────────────────────────────────────
export const userApi = {
  sessions:   () => get('/user/sessions'),   // used by useAuth bootstrap
  history:    () => get('/user/history'),
  profile:    () => get('/profile'),
  onboarding: (data) => post('/onboarding', data),
  honor:      () => get('/user/honor'),
}

// ── Institutions (public — no auth required) ──────────────────────────────────
// Returns ALL institutions regardless of env — both DEV and PROD are shown to students
export const institutionsApi = {
  list: () => get('/institutions'),
}

// ── Courses ───────────────────────────────────────────────────────────────────
export const coursesApi = {
  progress:    () => get('/courses/progress'),
  track:       (data) => post('/courses/track', data),
  aiRecommend: (payload) => post('/courses/ai-recommend', payload),
}

// ── Voice ─────────────────────────────────────────────────────────────────────
export const voiceApi = {
  save: (data) => post('/voice/save', data),
}

// ── Assessment ────────────────────────────────────────────────────────────────
export const assessmentApi = {
  questions: () => get('/assessment/questions'),
  submit:    (data) => post('/assessment/submit', data),
  history:   () => get('/assessments'),
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  overview:            () => get('/admin/overview'),
  users:               () => get('/admin/users'),
  deleteUser:          (id) => del(`/admin/users/${id}`),
  deleteUserByEmail:   (email) => del(`/admin/users/by-email/${encodeURIComponent(email)}`),
  suspendUser:         (id, suspended) => patch(`/admin/users/${id}/suspend`, { suspended }),
  sessions:            () => get('/admin/sessions'),
  deleteSession:       (id) => del(`/admin/sessions/${id}`),
  institutions:        () => get('/admin/institutions'),
  addInstitution:      (data) => post('/admin/institutions', data),
  updateInstitution:   (id, data) => patch(`/admin/institutions/${id}`, data),
  toggleInstitutionEnv:(id) => patch(`/admin/institutions/${id}/toggle-env`, {}),
  deleteInstitution:   (id) => del(`/admin/institutions/${id}`),
  honor:               () => get('/admin/honor'),
  analytics:           () => get('/admin/analytics'),
  logs:                () => get('/admin/logs'),
  aiCommand:           (command, confirm = false) => post('/admin/ai-command', { command, confirm }),
}

// ── Setup ─────────────────────────────────────────────────────────────────────
export const setupApi = {
  create: (secret, email, password, name) =>
    post('/admin/setup', { secret, email, password, name }),
}

// ── Chat (backend proxy — Groq/Gemini via Render) ────────────────────────────
export const chatApi = {
  send: (messages, system) => post('/chat', { messages, system }),
}
