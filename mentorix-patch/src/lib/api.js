import { authHeaders, getToken } from './auth'

export const API = import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'

// ── Base fetch ────────────────────────────────────────────────────────────────
async function req(method, path, body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: { ...authHeaders(), ...extraHeaders },
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
  // Backend returns: { token, name, email }
  login:      (email, password) => post('/auth/login',    { email, password }),
  register:   (email, password, name) => post('/auth/register', { email, password, name }),
  updateName: (name)            => post('/auth/update-name', { name }),
  googleUrl:  ()                => `${API}/auth/google/login`,
}

// ── User / Profile ────────────────────────────────────────────────────────────
export const userApi = {
  // GET /user/history — returns { history: [...], count: N }
  history:    () => get('/user/history'),

  // GET /user/sessions — returns { sessions: [...], profile: {...} }
  sessions:   () => get('/user/sessions'),

  // POST /user/profile — saves dept/year/sem/institution
  // Payload: { dept, year, sem, cgpa, backlogs, goals, institution_id }
  onboarding: (data) => post('/user/profile', data),

  // GET /user/honor — returns { score: N, events: [...] }
  honor:      () => get('/user/honor'),

  // POST /user/honor/event
  honorEvent: (event_type, note = '') => post('/user/honor/event', { event_type, note }),

  // GET /user/latest-scan
  latestScan: () => get('/user/latest-scan'),
}

// ── Institutions (public — no auth needed) ────────────────────────────────────
export const institutionsApi = {
  // GET /institutions — returns { institutions: [{id, name, contact_email}] }
  list: () => get('/institutions'),
}

// ── Courses ───────────────────────────────────────────────────────────────────
export const coursesApi = {
  progress:    () => get('/courses/progress'),
  // Payload: { course_title, course_url, provider, track, status }
  track:       (data) => post('/courses/track', data),
  aiRecommend: (payload) => post('/courses/ai-recommend', payload),
}

// ── Voice ─────────────────────────────────────────────────────────────────────
export const voiceApi = {
  // Payload: { transcript, summary, tab_warnings, exchange_count, scores, overall, mode }
  save: (data) => post('/voice/save', data),
}

// ── Assessment ────────────────────────────────────────────────────────────────
export const assessmentApi = {
  // GET /assessment/questions?department=CSE
  // Returns: { total: N, questions: [{id, question, options, domain, ...}] }
  questions:  (department = '') => get(`/assessment/questions${department ? `?department=${encodeURIComponent(department)}` : ''}`),

  // POST /assessment/submit
  // Payload: { answers: { "tech_001": 2, ... }, cgpa, backlogs, latency_data, current_status }
  // Returns: { risk_level, stability_index, trend, recommendation, ai_explanation, ... }
  submit:     (data) => post('/assessment/submit', data),

  // Backend has NO GET /assessments endpoint.
  // Assessment history is embedded in /user/latest-scan and /user/sessions.
  // Use userApi.sessions() to get past sessions with assessment-like scores.
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  overview:     () => get('/admin/overview'),
  users:        () => get('/admin/users'),
  deleteUser:   (id) => del(`/admin/users/${id}`),
  deleteUserByEmail: (email) => del(`/admin/users/by-email/${encodeURIComponent(email)}`),
  suspendUser:  (id) => patch(`/admin/users/${id}/suspend`, { suspended: true }),
  unsuspendUser:(id) => patch(`/admin/users/${id}/suspend`, { suspended: false }),
  sessions:     () => get('/admin/sessions'),
  deleteSession:(id) => del(`/admin/sessions/${id}`),

  // Institution endpoints — returns { institutions: [...] }
  institutions:       () => get('/admin/institutions'),
  addInstitution:     (data) => post('/admin/institutions', data),
  // FIX: backend route is /toggle NOT /toggle-env
  toggleInstitution:  (id) => patch(`/admin/institutions/${id}/toggle`, {}),
  deleteInstitution:  (id) => del(`/admin/institutions/${id}`),

  honor:    () => get('/admin/honor'),
  analytics:() => get('/admin/analytics'),
  logs:     () => get('/admin/logs'),
}

// ── Setup ─────────────────────────────────────────────────────────────────────
export const setupApi = {
  create: (secret, email, password, name) =>
    post('/admin/setup', { secret, email, password, name }),
}

// ── AI Chat (via backend proxy — avoids exposing Groq key on frontend) ────────
export async function backendChat(message, history = []) {
  return post('/chat', { message, history })
}

// ── Groq direct (dashboard AI chat — requires user-supplied key) ─────────────
export const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions'
export async function groqChat(messages, apiKey) {
  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      temperature: 0.7,
      max_tokens: 800,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Groq error')
  return data.choices?.[0]?.message?.content || ''
}
