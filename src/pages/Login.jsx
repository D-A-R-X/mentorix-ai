import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogoMark, Icon, Btn, Spinner, Modal, useToast } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { authApi, institutionsApi } from '../lib/api'
import { setInstitution } from '../lib/auth'

const deriveAdmin = (email = '') =>
  email.toLowerCase() === 'admin@mentorix.ai' ||
  email.toLowerCase().startsWith('admin@')

// ── Autofill store (persists email across sessions) ───────────────────────────
const AUTOFILL_KEY = 'mentorix_autofill'
const saveAutofill  = (email) => { try { localStorage.setItem(AUTOFILL_KEY, JSON.stringify({ email, ts: Date.now() })) } catch {} }
const loadAutofill  = () => { try { const v = localStorage.getItem(AUTOFILL_KEY); return v ? JSON.parse(v) : null } catch { return null } }

// ── ResendTimer: countdown + resend button ────────────────────────────────────
function ResendTimer({ email, name, password, onResent }) {
  const [secs, setSecs] = React.useState(60)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (secs <= 0) return
    const t = setTimeout(() => setSecs(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [secs])
  const resend = async () => {
    setBusy(true)
    try { await authApi.sendOtp(email, name, password); setSecs(60); onResent?.() } catch {}
    setBusy(false)
  }
  if (secs > 0) return <span style={{ color: '#94A3B8', fontSize: 13 }}>Resend in {secs}s</span>
  return (
    <button onClick={resend} disabled={busy} style={{
      background: 'none', border: 'none', color: '#2563EB',
      cursor: busy ? 'default' : 'pointer', padding: 0,
      fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif',
    }}>
      {busy ? 'Sending…' : 'Resend code'}
    </button>
  )
}

export default function Login() {
  const nav       = useNavigate()
  const loc       = useLocation()
  const { login } = useAuth()
  useToast()

  const [tab,          setTab]          = useState('in')
  const [otpSent,      setOtpSent]      = useState(false)
  const [otp,          setOtp]          = useState('')
  const [otpEmail,     setOtpEmail]     = useState('')
  const [resendTimer,  setResendTimer]  = useState(0)
  const [form,         setForm]         = useState({ email: '', password: '', name: '' })
  const [loading,      setLoading]      = useState(false)
  const [showPw,       setShowPw]       = useState(false)
  const [error,        setError]        = useState('')
  const [instModal,    setInstModal]    = useState(false)
  const [institutions, setInstitutions] = useState([])
  const [instLoading,  setInstLoading]  = useState(false)
  const [selectedInst, setSelectedInst] = useState(null)

  // ── Autofill email on mount ───────────────────────────────────────────────
  useEffect(() => {
    const saved = loadAutofill()
    if (saved?.email) setForm(f => ({ ...f, email: saved.email }))
  }, [])

  // ── Handle Google OAuth redirect ──────────────────────────────────────────
  // Store pending Google auth so user can pick institution first
  const [pendingGoogle, setPendingGoogle] = useState(null)

  useEffect(() => {
    const p          = new URLSearchParams(window.location.search)
    const token      = p.get('token')
    const email      = p.get('email')
    const name       = p.get('name')
    const err        = p.get('error')
    const hasProfile = p.get('has_profile') === '1'

    if (err) {
      setError(err === 'google_cancelled' ? 'Google sign-in was cancelled.' : 'Google sign-in failed.')
      window.history.replaceState({}, '', '/login')
      return
    }

    if (token && email) {
      const decoded = name ? decodeURIComponent(name) : email.split('@')[0]
      window.history.replaceState({}, '', '/login')

      // Admin — skip institution picker
      if (deriveAdmin(email)) {
        login({ token, email, name: decoded })
        nav('/admin', { replace: true })
        return
      }

      // Store pending — load institutions then open modal
      setPendingGoogle({ token, email, name: decoded, hasProfile });
      (async () => {
        try {
          const res = await institutionsApi.list()
          setInstitutions(Array.isArray(res) ? res : (res.institutions || []))
        } catch {}
        setInstModal(true)
      })()
    }
  }, [])

  // Called when user confirms institution (or skips) after Google login
  const completeGoogleLogin = () => {
    if (!pendingGoogle) return
    const { token, email, name, hasProfile } = pendingGoogle
    if (selectedInst) setInstitution(selectedInst.id, selectedInst.name)
    login({ token, email, name })
    saveAutofill(email)
    setPendingGoogle(null)
    setInstModal(false)
    if (!hasProfile) nav('/onboarding', { replace: true })
    else nav(loc.state?.from?.pathname || '/dashboard', { replace: true })
  }

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }

  const openInstModal = async () => {
    setInstModal(true)
    if (institutions.length) return
    setInstLoading(true)
    try {
      const res = await institutionsApi.list()
      setInstitutions(Array.isArray(res) ? res : res.institutions || [])
    } catch {
      setInstitutions([])
    } finally {
      setInstLoading(false)
    }
  }

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return
    const t = setTimeout(() => setResendTimer(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendTimer])

  const submit = async () => {
    // ── OTP verification step ─────────────────────────────────────────────
    if (otpSent) {
      if (!otp.trim() || otp.trim().length !== 6) { setError('Enter the 6-digit code sent to your email'); return }
      setLoading(true); setError('')
      try {
        const data = await authApi.verifyOtp(otpEmail, otp.trim())
        if (selectedInst) setInstitution(selectedInst.id, selectedInst.name)
        login(data)
        if (data.is_admin) nav('/admin', { replace: true })
        else nav('/onboarding', { replace: true })
      } catch (e) {
        setError(e.message || 'Incorrect code. Please try again.')
      } finally { setLoading(false) }
      return
    }

    // ── Sign in ───────────────────────────────────────────────────────────
    if (tab === 'in') {
      if (!form.email || !form.password) { setError('Email and password are required'); return }
      setLoading(true); setError('')
      try {
        const data = await authApi.login(form.email.trim().toLowerCase(), form.password)
        if (selectedInst) setInstitution(selectedInst.id, selectedInst.name)
        
        // Store session
        localStorage.setItem('mentorix_token', data.token)
        localStorage.setItem('mentorix_email', data.email)
        localStorage.setItem('mentorix_name', data.name || data.email.split('@')[0])
        
        // Navigate
        if (data.is_admin) nav('/admin', { replace: true })
        else nav('/dashboard', { replace: true })
      } catch (e) {
        console.error('Login error:', e)
        setError(e.message || 'Login failed - check credentials')
      } finally { setLoading(false) }
      return
    }

    // ── Register: send OTP first ──────────────────────────────────────────
    if (!form.email || !form.password) { setError('Email and password are required'); return }
    if (form.name.trim().length < 2)   { setError('Full name is required'); return }
    if (form.password.length < 8)      { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      await authApi.sendOtp(form.email.trim().toLowerCase(), form.name.trim(), form.password)
      setOtpEmail(form.email.trim().toLowerCase())
      setOtpSent(true)
      setResendTimer(60)
    } catch (e) {
      setError(e.message || 'Could not send verification email.')
    } finally { setLoading(false) }
  }

  const resendOtp = async () => {
    if (resendTimer > 0) return
    setLoading(true); setError('')
    try {
      await authApi.sendOtp(otpEmail, form.name.trim(), form.password)
      setResendTimer(60)
    } catch (e) {
      setError(e.message || 'Could not resend code.')
    } finally { setLoading(false) }
  }

  const iStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid #E2E8F0', background: '#F8F9FC',
    color: '#0F172A', fontSize: 14, fontFamily: 'Inter, sans-serif',
    outline: 'none', boxSizing: 'border-box',
  }
  const lStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 5 }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', display: 'flex', fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus { border-color: #93C5FD !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.08) !important; outline: none !important; }
        .tab-btn:hover  { color: #0F172A !important; }
        .inst-row:hover { background: #F8FAFC !important; }
        .google-btn:hover { border-color: #93C5FD !important; background: #FAFBFF !important; }
      `}</style>

      {/* ── Left panel ── */}
      <div style={{
        flex: 1, minHeight: '100vh', padding: 'clamp(32px,5vw,60px)',
        background: '#0F172A', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={30} />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#fff', letterSpacing: '-0.02em' }}>
            Mentorix<span style={{ color: '#60A5FA' }}>.</span>AI
          </span>
        </div>

        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 28,
            padding: '5px 14px', borderRadius: 100,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px #34D399' }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: '#93C5FD', letterSpacing: '0.06em' }}>AI-POWERED MENTORING</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 700, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.025em', marginBottom: 16 }}>
            Mentor your way<br />to placement
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.75, maxWidth: 360, marginBottom: 40 }}>
            Voice sessions, honor scoring, and AI assessments — designed for engineering students.
          </p>
          {[
            { icon: 'mic',          label: 'AI voice mentoring tailored to your curriculum' },
            { icon: 'shield-check', label: 'Honor system with institutional transparency'   },
            { icon: 'bar-chart-2',  label: 'Real-time academic risk and stability analysis' },
          ].map(f => (
            <div key={f.icon} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={f.icon} size={16} color="#93C5FD" />
              </div>
              <span style={{ fontSize: 13, color: '#CBD5E1' }}>{f.label}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: '#475569' }}>Mentorix AI — Cronix &copy; 2025</div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        width: 'clamp(380px,45vw,500px)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px clamp(32px,6vw,52px)',
        background: '#fff', borderLeft: '1px solid #E2E8F0',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: 6 }}>
            {tab === 'in' ? 'Welcome back' : 'Create account'}
          </h2>
          <p style={{ fontSize: 14, color: '#64748B', marginBottom: 28 }}>
            {tab === 'in' ? 'Sign in to your Mentorix account' : 'Start your AI mentoring journey'}
          </p>

          {/* Tabs */}
          <div style={{ display: otpSent ? 'none' : 'flex', background: '#F1F4F9', borderRadius: 8, padding: 3, marginBottom: 24, gap: 2 }}>
            {[{ id: 'in', label: 'Sign In' }, { id: 'up', label: 'Create Account' }].map(t => (
              <button key={t.id} className="tab-btn" onClick={() => { setTab(t.id); setError('') }} style={{
                flex: 1, padding: '8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: tab === t.id ? '#fff' : 'transparent',
                color: tab === t.id ? '#0F172A' : '#94A3B8',
                fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500,
                boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}>{t.label}</button>
            ))}
          </div>

          {/* Google */}
          <a href={authApi.googleUrl()} className="google-btn" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 8, marginBottom: 16,
            border: '1px solid #E2E8F0', background: '#fff',
            color: '#334155', fontSize: 14, fontWeight: 500,
            textDecoration: 'none', transition: 'all 0.15s',
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
            <span style={{ fontSize: 12, color: '#CBD5E1' }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
          </div>

          {/* ── OTP STEP (after Send Verification Code) ── */}
          {otpSent ? (
            <div>
              <div style={{ marginBottom: 20, padding: '14px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8', marginBottom: 2 }}>Check your inbox</div>
                <div style={{ fontSize: 13, color: '#3B82F6' }}>A 6-digit code was sent to <strong>{otpEmail}</strong></div>
              </div>

              <label style={lStyle}>Verification Code</label>
              <input
                value={otp}
                onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="000000"
                maxLength={6}
                autoFocus
                style={{
                  ...iStyle,
                  fontSize: 28, fontWeight: 700, letterSpacing: 12,
                  textAlign: 'center', color: '#2563EB',
                }}
              />

              {error && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 13, color: '#DC2626' }}>
                  {error}
                </div>
              )}

              <button onClick={submit} disabled={loading || otp.length !== 6} style={{
                width: '100%', marginTop: 16, padding: '11px', borderRadius: 8, border: 'none',
                cursor: (loading || otp.length !== 6) ? 'not-allowed' : 'pointer',
                background: otp.length === 6 ? '#2563EB' : '#94A3B8', color: '#fff',
                fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: loading ? 0.7 : 1, transition: 'all 0.2s',
              }}>
                {loading ? <><Spinner size={15} /> Verifying…</> : 'Verify & Create Account'}
              </button>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <button onClick={() => { setOtpSent(false); setOtp(''); setError('') }} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0 }}>
                  ← Change email
                </button>
                <ResendTimer email={otpEmail} name={form.name} password={form.password} onResent={() => setError('')} />
              </div>
            </div>

          ) : (
            /* ── NORMAL FORM ── */
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {tab === 'up' && (
                  <div>
                    <label style={lStyle}>Full Name</label>
                    <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Your full name" style={iStyle} />
                  </div>
                )}
                <div>
                  <label style={lStyle}>Email Address</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@college.edu" style={iStyle} autoComplete="email" />
                </div>
                <div>
                  <label style={lStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => set('password', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submit()}
                      placeholder="••••••••"
                      style={{ ...iStyle, paddingRight: 42 }}
                      autoComplete={tab === 'in' ? 'current-password' : 'new-password'}
                    />
                    <button onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, padding: 0 }}>
                      <Icon name={showPw ? 'eye-off' : 'eye'} size={16} color="#94A3B8" />
                    </button>
                  </div>
                </div>

                {/* Institution picker */}
                {tab === 'up' && (
                  <button onClick={openInstModal} style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${selectedInst ? '#BFDBFE' : '#E2E8F0'}`,
                    background: selectedInst ? '#EFF6FF' : '#F8F9FC',
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
                  }}>
                    <Icon name="building" size={15} color={selectedInst ? '#2563EB' : '#94A3B8'} />
                    <span style={{ flex: 1, fontSize: 14, color: selectedInst ? '#1D4ED8' : '#94A3B8', textAlign: 'left' }}>
                      {selectedInst ? selectedInst.name : 'Select institution (optional)'}
                    </span>
                    <Icon name="chevron-down" size={14} color="#94A3B8" />
                  </button>
                )}
              </div>

              {error && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 13, color: '#DC2626' }}>
                  {error}
                </div>
              )}

              <button onClick={submit} disabled={loading} style={{
                width: '100%', marginTop: 16, padding: '11px', borderRadius: 8, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: '#2563EB', color: '#fff',
                fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
                boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
              }}>
                {loading
                  ? <><Spinner size={15} /> Please wait…</>
                  : tab === 'in' ? 'Sign In' : 'Send Verification Code'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Institution Modal */}
      <Modal open={instModal} onClose={() => { if (pendingGoogle) completeGoogleLogin(); else setInstModal(false) }} title="Select Institution">
        {instLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spinner size={24} /></div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>Link your profile to your institution.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
              {institutions.map(inst => {
                const sel = selectedInst?.id === inst.id
                return (
                  <div key={inst.id} className="inst-row" onClick={() => setSelectedInst(sel ? null : inst)} style={{
                    padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${sel ? '#BFDBFE' : '#E2E8F0'}`,
                    background: sel ? '#EFF6FF' : '#fff',
                    display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
                  }}>
                    <Icon name="building" size={16} color={sel ? '#2563EB' : '#94A3B8'} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0F172A' }}>{inst.name}</div>
                      {inst.contact_email && <div style={{ fontSize: 11, color: '#94A3B8' }}>{inst.contact_email}</div>}
                    </div>
                    {sel && <Icon name="check-circle" size={16} color="#2563EB" />}
                  </div>
                )
              })}
              {!institutions.length && <p style={{ textAlign: 'center', color: '#94A3B8', padding: '24px 0', fontSize: 13 }}>No institutions found.</p>}
            </div>
            <Btn onClick={() => pendingGoogle ? completeGoogleLogin() : setInstModal(false)} fullWidth>
              {pendingGoogle
                ? (selectedInst ? `Continue with ${selectedInst.name}` : 'Skip & Continue')
                : (selectedInst ? `Continue with ${selectedInst.name}` : 'Skip')}
            </Btn>
          </div>
        )}
      </Modal>
    </div>
  )
}
