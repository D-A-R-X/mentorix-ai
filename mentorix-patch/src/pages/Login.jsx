import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AmbientBg, LogoMark, Icon, Btn, Spinner, Modal, useToast } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth'
import { authApi, institutionsApi } from '../lib/api'
import { setInstitution } from '../lib/auth'

const FEATS = [
  { icon: 'mic',        title: 'Voice Mentoring',   desc: 'Speak naturally with AI trained on your curriculum' },
  { icon: 'shield',     title: 'Honor System',       desc: 'Transparent integrity tracking visible to institutions' },
  { icon: 'bar-chart-2',title: 'Smart Analytics',    desc: 'Real-time progress dashboards and risk assessments' },
]

export default function Login() {
  const nav   = useNavigate()
  const loc   = useLocation()
  const { login, isLoggedIn } = useAuth()
  const toast = useToast()

  const [tab,          setTab]          = useState('in')   // 'in' | 'up'
  const [form,         setForm]         = useState({ email: '', password: '', name: '' })
  const [loading,      setLoading]      = useState(false)
  const [showPw,       setShowPw]       = useState(false)
  const [error,        setError]        = useState('')
  const [instModal,    setInstModal]    = useState(false)
  const [institutions, setInstitutions] = useState([])
  const [instLoading,  setInstLoading]  = useState(false)
  const [selectedInst, setSelectedInst] = useState(null)

  // ── Handle Google OAuth redirect: /login?token=...&email=...&name=... ────
  useEffect(() => {
    const p     = new URLSearchParams(window.location.search)
    const token = p.get('token')
    const email = p.get('email')
    const name  = p.get('name')
    const err   = p.get('error')

    if (err) {
      setError(err === 'google_cancelled' ? 'Google sign-in was cancelled.' : 'Google sign-in failed.')
      window.history.replaceState({}, '', '/login')
      return
    }
    if (token && email) {
      // normalise: login() accepts { token, name, email }
      login({ token, email, name: name ? decodeURIComponent(name) : email.split('@')[0] })
      nav(loc.state?.from?.pathname || '/dashboard', { replace: true })
    }
  }, [])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }

  // ── Load institutions for the modal (public endpoint — no auth) ───────────
  const openInstModal = async () => {
    setInstModal(true)
    if (institutions.length) return
    setInstLoading(true)
    try {
      const res  = await institutionsApi.list()
      // Returns { institutions: [...] }
      setInstitutions(Array.isArray(res) ? res : res.institutions || [])
    } catch { setInstitutions([]) }
    finally { setInstLoading(false) }
  }

  // ── Email/password submit ─────────────────────────────────────────────────
  const submit = async () => {
    if (!form.email || !form.password) { setError('Email and password required'); return }
    if (tab === 'up' && form.name.trim().length < 2) { setError('Full name required (min 2 chars)'); return }
    if (tab === 'up' && form.password.length < 8)    { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      // Both /auth/login and /auth/register return { token, name, email }
      const data = tab === 'in'
        ? await authApi.login(form.email.trim().toLowerCase(), form.password)
        : await authApi.register(form.email.trim().toLowerCase(), form.password, form.name.trim())

      if (selectedInst) setInstitution(selectedInst.id, selectedInst.name)
      login(data)
      nav(loc.state?.from?.pathname || '/dashboard', { replace: true })
    } catch (e) {
      setError(e.message || 'Authentication failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#06050e', display: 'flex', fontFamily: 'DM Sans, sans-serif' }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        input { transition: border-color 0.15s; }
        input:focus { border-color: rgba(124,77,255,0.5) !important; outline: none; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .auth-form { animation: fadeUp 0.35s ease; }
        .inst-opt:hover { border-color: rgba(124,77,255,0.3) !important; }
        .tab-btn:hover { color: #f4f0ff; }
      `}</style>

      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, minHeight: '100vh', padding: 'clamp(32px,5vw,52px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={32} />
          <span style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, fontSize: 17, color: '#f4f0ff' }}>
            Mentorix<span style={{ color: '#7c4dff' }}>.</span>AI
          </span>
        </div>

        {/* Hero copy */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24,
            padding: '5px 14px', borderRadius: 100,
            background: 'rgba(124,77,255,0.08)', border: '1px solid rgba(124,77,255,0.2)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e5b4', boxShadow: '0 0 8px #00e5b4' }} />
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#a87fff', letterSpacing: '0.06em' }}>AI-POWERED MENTORING</span>
          </div>

          <h1 style={{
            fontFamily: 'Bricolage Grotesque, sans-serif',
            fontSize: 'clamp(28px,3.5vw,48px)', fontWeight: 800, color: '#f4f0ff',
            margin: '0 0 8px', lineHeight: 1.1, letterSpacing: '-0.02em',
          }}>
            Your academic<br />
            <em style={{ fontFamily: 'Instrument Serif, serif', color: 'rgba(192,187,216,0.45)', fontStyle: 'italic', fontWeight: 400 }}>
              future starts here
            </em>
          </h1>
          <p style={{ color: 'rgba(192,187,216,0.42)', fontSize: 15, maxWidth: 340, lineHeight: 1.75, margin: '0 0 40px', fontWeight: 300 }}>
            Voice mentoring, honor scoring, and AI-powered guidance designed for engineering students.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {FEATS.map(f => (
              <div key={f.icon} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={f.icon} size={18} color="#6e6888" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(244,240,255,0.8)', marginBottom: 2 }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.4px' }}>
          Mentorix AI — Powered by Cronix &copy; 2025
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 'clamp(380px,45vw,520px)', minHeight: '100vh', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px clamp(32px,6vw,52px)',
        background: '#0e0c1a', borderLeft: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div className="auth-form" style={{ width: '100%', maxWidth: 396 }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 26, fontWeight: 800, color: '#f4f0ff', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
              {tab === 'in' ? 'Welcome back' : 'Create account'}
            </h2>
            <p style={{ fontSize: 14, color: '#6e6888', lineHeight: 1.65, margin: 0 }}>
              {tab === 'in' ? 'Sign in to continue your mentoring journey' : 'Start your AI-powered academic journey today'}
            </p>
          </div>

          {/* Sign in / Sign up tabs */}
          <div style={{ display: 'flex', background: '#161328', borderRadius: 10, padding: 3, marginBottom: 24, gap: 2 }}>
            {[{ id: 'in', label: 'Sign In' }, { id: 'up', label: 'Create Account' }].map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setError('') }} style={{
                flex: 1, padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: tab === t.id ? '#0e0c1a' : 'transparent',
                color: tab === t.id ? '#f4f0ff' : '#6e6888',
                fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600,
                boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.3),0 0 0 1px rgba(255,255,255,0.06)' : 'none',
                transition: 'all 0.18s',
              }}>{t.label}</button>
            ))}
          </div>

          {/* Google */}
          <a href={authApi.googleUrl()} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '12px 18px', borderRadius: 10, marginBottom: 16,
            border: '1px solid rgba(255,255,255,0.08)', background: '#161328',
            fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500, color: '#c0bbd8',
            textDecoration: 'none', transition: 'border-color 0.15s',
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </a>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#2e2a42', letterSpacing: '0.4px' }}>OR</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tab === 'up' && (
              <div>
                <label style={labelStyle}>Full Name</label>
                <input value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="Your full name" style={inputStyle} />
              </div>
            )}
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="you@college.edu" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={form.password}
                  onChange={e => set('password', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="••••••••" style={{ ...inputStyle, paddingRight: 44 }} />
                <button onClick={() => setShowPw(v => !v)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', opacity: 0.45,
                  display: 'flex', alignItems: 'center',
                }}>
                  <Icon name={showPw ? 'eye-off' : 'eye'} size={16} color="#6e6888" />
                </button>
              </div>
            </div>

            {/* Institution picker */}
            <button onClick={openInstModal} style={{
              width: '100%', padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${selectedInst ? 'rgba(124,77,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
              background: selectedInst ? 'rgba(124,77,255,0.06)' : '#161328',
              display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
            }}>
              <Icon name="building" size={16} color={selectedInst ? '#7c4dff' : '#6e6888'} />
              <span style={{ flex: 1, fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: selectedInst ? '#f4f0ff' : '#6e6888', textAlign: 'left' }}>
                {selectedInst ? selectedInst.name : 'Select your institution (optional)'}
              </span>
              <Icon name="chevron-down" size={14} color="#6e6888" />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.2)', fontSize: 13, color: '#ff4d6d' }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button onClick={submit} disabled={loading} style={{
            width: '100%', marginTop: 16, padding: '13px', borderRadius: 10, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,#7c4dff,#5530cc)', color: '#fff',
            fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 700,
            boxShadow: '0 4px 20px rgba(124,77,255,0.3)', transition: 'opacity 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? <><Spinner size={16} /> Please wait...</> : (tab === 'in' ? 'Sign In' : 'Create Account')}
          </button>

          {/* Trust signals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {['Data encrypted end-to-end', 'No ads, no tracking', 'Sessions stored securely'].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6e6888' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00e5b4', flexShrink: 0 }} />
                {t}
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => nav('/setup')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e2a42', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
              Admin setup
            </button>
          </div>
        </div>
      </div>

      {/* ── Institution modal ────────────────────────────────────────────────── */}
      <Modal open={instModal} onClose={() => setInstModal(false)} title="Select Your Institution">
        {instLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spinner size={24} /></div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: '#6e6888', margin: '0 0 16px' }}>
              Choose your institution to link your profile.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
              {institutions.map(inst => {
                const sel = selectedInst?.id === inst.id
                return (
                  <div key={inst.id} className="inst-opt" onClick={() => setSelectedInst(sel ? null : inst)} style={{
                    padding: '13px 15px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${sel ? 'rgba(124,77,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    background: sel ? 'rgba(124,77,255,0.08)' : '#161328',
                    display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
                  }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(124,77,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="building" size={16} color="#7c4dff" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f0ff' }}>{inst.name}</div>
                      {inst.contact_email && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#6e6888' }}>{inst.contact_email}</div>}
                    </div>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      border: `1.5px solid ${sel ? '#7c4dff' : 'rgba(255,255,255,0.12)'}`,
                      background: sel ? '#7c4dff' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {sel && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                  </div>
                )
              })}
              {!institutions.length && (
                <div style={{ textAlign: 'center', padding: 24, color: '#6e6888', fontSize: 13 }}>
                  No institutions registered yet.
                </div>
              )}
            </div>
            <Btn onClick={() => setInstModal(false)} fullWidth>
              {selectedInst ? `Continue with ${selectedInst.name}` : 'Skip'}
            </Btn>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelStyle = {
  display: 'block',
  fontFamily: 'DM Mono, monospace', fontSize: 10,
  color: '#6e6888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6,
}
const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)', background: '#161328',
  color: '#f4f0ff', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
}
