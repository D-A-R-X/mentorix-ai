import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoMark, Spinner } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { userApi, institutionsApi } from '../lib/api'
import { setInstitution, getProfile, setProfile as storeProfile } from '../lib/auth'

// ── localStorage autofill key (shared with Login) ─────────────────────────────
const AUTOFILL_KEY = 'mentorix_autofill'
const saveAutofill = (data) => {
  try {
    const prev = JSON.parse(localStorage.getItem(AUTOFILL_KEY) || '{}')
    localStorage.setItem(AUTOFILL_KEY, JSON.stringify({ ...prev, ...data, ts: Date.now() }))
  } catch {}
}
const loadAutofill = () => {
  try { return JSON.parse(localStorage.getItem(AUTOFILL_KEY) || '{}') } catch { return {} }
}

const YEARS  = ['1st Year', '2nd Year', '3rd Year', '4th Year']
const SEMS   = ['1', '2', '3', '4', '5', '6', '7', '8']
const DEPTS  = ['Computer Science', 'Information Science', 'Electronics & Communication', 'Electrical Engineering', 'Mechanical Engineering', 'Civil Engineering', 'Chemical Engineering', 'Biotechnology', 'Other']

const C = {
  bg: '#F8F9FC', surface: '#FFFFFF', border: '#E2E8F0',
  blue: '#2563EB', navy: '#0F172A', text: '#334155', muted: '#94A3B8',
  blueBg: '#EFF6FF', blueBorder: '#BFDBFE',
  green: '#059669', greenBg: '#ECFDF5', greenBorder: '#A7F3D0',
}

export default function Onboarding() {
  const nav          = useNavigate()
  const { user, login } = useAuth()

  const [step,         setStep]         = useState(1) // 1 = personal, 2 = academic, 3 = intro
  const [loading,      setLoading]      = useState(false)
  const [prefilling,   setPrefilling]   = useState(true)
  const [error,        setError]        = useState('')
  const [institutions, setInstitutions] = useState([])
  const [instLoading,  setInstLoading]  = useState(false)

  const [form, setForm] = useState({
    name:           '',
    dept:           '',
    year:           '',
    sem:            '',
    institution_id: null,
    inst_name:      '',
    cgpa:           '',
    backlogs:       '0',
  })

  // ── Prefill from stored profile or backend ────────────────────────────────
  useEffect(() => {
    const prefill = async () => {
      setPrefilling(true)
      const autofill = loadAutofill()
      const cached   = getProfile()

      // Start with whatever we have locally
      const base = {
        name:  user?.name || cached?.name || autofill?.name || '',
        dept:  cached?.dept || autofill?.dept || '',
        year:  cached?.year || autofill?.year || '',
        sem:   cached?.sem  || autofill?.sem  || '',
        institution_id: cached?.institution_id || autofill?.institution_id || null,
        inst_name:      cached?.inst_name      || autofill?.inst_name      || '',
      }

      // Try fetching from backend for latest data
      try {
        const d = await userApi.sessions()
        if (d?.profile) {
          base.name = d.profile.name || base.name
          base.dept = d.profile.dept || base.dept
          base.year = d.profile.year || base.year
          base.sem  = d.profile.sem  || base.sem
        }
      } catch {}

      setForm(base)
      setPrefilling(false)
    }
    prefill()
  }, [])

  // ── Load institutions ─────────────────────────────────────────────────────
  useEffect(() => {
    setInstLoading(true)
    institutionsApi.list()
      .then(res => setInstitutions(Array.isArray(res) ? res : res.institutions || []))
      .catch(() => setInstitutions([]))
      .finally(() => setInstLoading(false))
  }, [])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }

  const selectInst = (inst) => {
    setForm(f => ({ ...f, institution_id: inst.id, inst_name: inst.name }))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!form.dept)      { setError('Please select your department'); return }
    if (!form.year)      { setError('Please select your year'); return }
    if (!form.sem)       { setError('Please select your semester'); return }
    setLoading(true); setError('')
    try {
      await userApi.sessions() // ensure token valid
      // Save to backend
      const payload = {
        dept:           form.dept,
        year:           form.year,
        sem:            form.sem,
        institution_id: form.institution_id || null,
        cgpa:           form.cgpa || null,
        backlogs:       parseInt(form.backlogs) || 0,
      }
      // Use the correct endpoint — /user/profile
      const token = localStorage.getItem('mentorix_token')
      await fetch(`${import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'}/user/profile`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      })

      // Save institution to localStorage
      if (form.institution_id) setInstitution(form.institution_id, form.inst_name)

      // Update local profile cache + autofill store
      const merged = { ...getProfile(), ...payload, name: form.name, inst_name: form.inst_name }
      storeProfile(merged)
      saveAutofill({ name: form.name, dept: form.dept, year: form.year, sem: form.sem, institution_id: form.institution_id, inst_name: form.inst_name, cgpa: form.cgpa, backlogs: form.backlogs })

      setStep(3)
    } catch (e) {
      setError(e.message || 'Failed to save profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const iStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${C.border}`, background: C.bg,
    color: C.navy, fontSize: 14, fontFamily: 'Inter, sans-serif',
    outline: 'none', cursor: 'pointer', appearance: 'none',
  }
  const lStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 6 }

  if (prefilling) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={28} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', padding: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box}
        input:focus,select:focus{border-color:#93C5FD!important;box-shadow:0 0 0 3px rgba(37,99,235,0.08)!important;outline:none!important}
        .inst-card:hover{border-color:#93C5FD!important;background:#F8FAFF!important}
      `}</style>

      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36, justifyContent: 'center' }}>
          <LogoMark size={28} />
          <span style={{ fontWeight: 700, fontSize: 15, color: C.navy, letterSpacing: '-0.02em' }}>
            Mentorix<span style={{ color: C.blue }}>.</span>AI
          </span>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              height: 4, borderRadius: 2,
              width: step >= s ? 32 : 16,
              background: step >= s ? C.blue : C.border,
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 36, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

          {/* ── STEP 1: Personal ── */}
          {step === 1 && (
            <>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Hey, {form.name?.split(' ')[0] || 'there'} 👋</div>
                <div style={{ fontSize: 14, color: C.muted }}>Let's confirm your name before we set up your profile.</div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={lStyle}>Your Full Name</label>
                <input
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Suryanarayanan K"
                  style={{ ...iStyle, cursor: 'text', fontSize: 15, padding: '11px 14px' }}
                  autoFocus
                />
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>This is how Aria will address you during sessions.</div>
              </div>

              {/* Institution pick on step 1 */}
              <div style={{ marginBottom: 28 }}>
                <label style={lStyle}>Your Institution</label>
                {instLoading
                  ? <div style={{ textAlign: 'center', padding: 16 }}><Spinner size={18} /></div>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                      {institutions.map(inst => {
                        const sel = form.institution_id === inst.id
                        return (
                          <div key={inst.id} className="inst-card" onClick={() => selectInst(inst)} style={{
                            padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                            border: `1px solid ${sel ? C.blueBorder : C.border}`,
                            background: sel ? C.blueBg : C.surface,
                            display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
                          }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: sel ? C.blue : C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                              🏛
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: sel ? C.blue : C.navy }}>{inst.name}</div>
                              {inst.contact_email && <div style={{ fontSize: 11, color: C.muted }}>{inst.contact_email}</div>}
                            </div>
                            {sel && <div style={{ width: 18, height: 18, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>}
                          </div>
                        )
                      })}
                      {institutions.length === 0 && (
                        <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: '16px 0' }}>No institutions available yet.</div>
                      )}
                    </div>
                }
              </div>

              <button onClick={() => setStep(2)} disabled={!form.name?.trim()} style={{
                width: '100%', padding: '11px', borderRadius: 8, border: 'none',
                background: form.name?.trim() ? C.blue : C.border,
                color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
                cursor: form.name?.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
              }}>
                Continue →
              </button>
            </>
          )}

          {/* ── STEP 2: Academic ── */}
          {step === 2 && (
            <>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Academic Details</div>
                <div style={{ fontSize: 14, color: C.muted }}>Aria uses this to personalise your sessions and assessments.</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
                {/* Department */}
                <div>
                  <label style={lStyle}>Department / Branch</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {DEPTS.map(d => (
                      <div key={d} onClick={() => set('dept', d)} style={{
                        padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                        border: `1px solid ${form.dept === d ? C.blueBorder : C.border}`,
                        background: form.dept === d ? C.blueBg : C.bg,
                        color: form.dept === d ? C.blue : C.text,
                        transition: 'all 0.15s',
                      }}>{d}</div>
                    ))}
                  </div>
                </div>

                {/* Year + Semester */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={lStyle}>Year</label>
                    <select value={form.year} onChange={e => set('year', e.target.value)} style={iStyle}>
                      <option value="">Select year</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lStyle}>Semester</label>
                    <select value={form.sem} onChange={e => set('sem', e.target.value)} style={iStyle}>
                      <option value="">Select sem</option>
                      {SEMS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

                {/* CGPA + Backlogs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={lStyle}>CGPA <span style={{ color:C.muted, fontWeight:400 }}>(optional)</span></label>
                    <input
                      value={form.cgpa}
                      onChange={e => {
                        const v = e.target.value
                        if (v === '' || (/^\d*\.?\d{0,2}$/.test(v) && parseFloat(v||0) <= 10)) set('cgpa', v)
                      }}
                      placeholder="e.g. 8.5"
                      inputMode="decimal"
                      style={{ ...iStyle, cursor:'text' }}
                    />
                    <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Out of 10</div>
                  </div>
                  <div>
                    <label style={lStyle}>Active Backlogs</label>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                      {['0','1','2','3','4','5','6','7+'].map(b => (
                        <div key={b} onClick={() => set('backlogs', b)} style={{
                          padding:'8px 4px', borderRadius:7, cursor:'pointer', fontSize:13,
                          fontWeight:600, textAlign:'center',
                          border:`1px solid ${form.backlogs===b ? C.blueBorder : C.border}`,
                          background: form.backlogs===b ? C.blueBg : C.bg,
                          color: form.backlogs===b ? C.blue : C.text,
                          transition:'all 0.15s',
                        }}>{b}</div>
                      ))}
                    </div>
                  </div>
                </div>

              {error && (
                <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 13, color: '#DC2626' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: 'Inter, sans-serif', fontSize: 14, cursor: 'pointer' }}>
                  ← Back
                </button>
                <button onClick={submit} disabled={loading} style={{
                  flex: 2, padding: '11px', borderRadius: 8, border: 'none',
                  background: C.blue, color: '#fff',
                  fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  {loading ? <><Spinner size={15} /> Saving…</> : 'Complete Setup →'}
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3: Introduction / Done ── */}
          {step === 3 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.greenBg, border: `2px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>
                ✓
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 8 }}>
                You're all set, {form.name?.split(' ')[0]}!
              </div>
              <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 32, maxWidth: 340, margin: '0 auto 32px' }}>
                Aria is ready to be your AI mentor. Start with a voice session or explore the dashboard.
              </div>

              <div style={{ background: C.bg, borderRadius: 12, padding: '16px 20px', marginBottom: 28, textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Your Profile</div>
                {[
                  { label: 'Name',        val: form.name       },
                  { label: 'Department',  val: form.dept       },
                  { label: 'Year',        val: form.year       },
                  { label: 'Semester',    val: `Sem ${form.sem}` },
                  { label: 'Institution', val: form.inst_name || 'Independent' },
                ].map(({ label, val }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>{label}</span>
                    <span style={{ color: C.navy, fontWeight: 500 }}>{val}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => nav('/dashboard', { replace: true })} style={{
                width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                background: C.blue, color: '#fff',
                fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
              }}>
                Go to Dashboard →
              </button>
            </div>
          )}

        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: C.muted }}>
          Mentorix AI — Cronix &copy; 2025
        </div>
      </div>
    </div>
  )
}
