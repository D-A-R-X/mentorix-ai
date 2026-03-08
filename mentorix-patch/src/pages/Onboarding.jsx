import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AmbientBg, LogoMark, Btn, Icon, Select, Input, useToast } from '../components/ui/index.jsx'
import { userApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { getEmail, getInstitutionId } from '../lib/auth'

const DEPARTMENTS = ['CSE','IT','AIDS','AIML','ECE','EEE','MECH','CIVIL','Food Technology','Biotechnology']
const YEARS       = ['1','2','3','4']
const SEMS        = ['1','2','3','4','5','6','7','8']

const STEPS = [
  { id: 'role',    title: 'Welcome aboard',      subtitle: "Let's personalise your experience" },
  { id: 'dept',    title: 'Your Department',      subtitle: 'We tailor mentoring to your field' },
  { id: 'year',    title: 'Academic Year',        subtitle: 'Helps calibrate session difficulty' },
  { id: 'details', title: 'Academic Standing',    subtitle: 'Used for performance benchmarking' },
  { id: 'goals',   title: 'Your Goals',           subtitle: 'What do you want to achieve?' },
]

const GOALS = [
  { id: 'placement',  label: 'Job Placement',              icon: 'briefcase' },
  { id: 'cgpa',       label: 'Improve CGPA',               icon: 'trending-up' },
  { id: 'skills',     label: 'Skill Building',             icon: 'code' },
  { id: 'research',   label: 'Research',                   icon: 'book-open' },
  { id: 'startup',    label: 'Startup / Entrepreneurship', icon: 'rocket' },
  { id: 'abroad',     label: 'Higher Education Abroad',    icon: 'globe' },
]

function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.92; u.pitch = 1.05
  window.speechSynthesis.speak(u)
}

export default function Onboarding() {
  const nav   = useNavigate()
  const toast = useToast()
  const { refreshUser } = useAuth()

  const [step,   setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [form,   setForm]   = useState({
    role: 'student', department: '', year: '', semester: '',
    cgpa: '', backlogs: '0', goals: [],
  })

  useEffect(() => {
    speak(STEPS[step].title + '. ' + STEPS[step].subtitle)
  }, [step])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleGoal = id => setForm(f => ({
    ...f,
    goals: f.goals.includes(id) ? f.goals.filter(g => g !== id) : [...f.goals, id],
  }))

  const canNext = () => {
    if (step === 1) return !!form.department
    if (step === 2) return !!form.year && !!form.semester
    if (step === 3) return !!form.cgpa
    if (step === 4) return form.goals.length > 0
    return true
  }

  const submit = async () => {
    setSaving(true)
    try {
      // Backend: POST /user/profile
      // Expects: { dept, year, sem, institution_id }
      // We also store cgpa/backlogs/goals in localStorage for display
      await userApi.onboarding({
        dept:           form.department,
        year:           form.year,
        sem:            form.semester,
        institution_id: getInstitutionId() || undefined,
      })
      // Cache extra details locally (backend doesn't have these columns yet)
      const extras = { cgpa: parseFloat(form.cgpa) || 0, backlogs: parseInt(form.backlogs) || 0, goals: form.goals, department: form.department, year: form.year }
      localStorage.setItem('mentorix_onboarding', JSON.stringify(extras))
      await refreshUser()
      speak('Setup complete. Welcome to Mentorix.')
      nav('/dashboard')
    } catch (e) {
      toast(e.message || 'Could not save profile', 'error')
      setSaving(false)
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div style={{ minHeight: '100vh', background: '#06050e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .goal-chip:hover { border-color: rgba(124,77,255,0.4) !important; }
        @keyframes stepIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        .step-content { animation: stepIn 0.3s ease; }
        select option { background: #161328; }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 520 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogoMark size={26} />
            <span style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, fontSize: 15, color: '#f4f0ff' }}>
              Mentorix<span style={{ color: '#7c4dff' }}>.</span>AI
            </span>
          </div>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#6e6888' }}>
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 36, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg,#7c4dff,#00e5b4)', width: `${progress}%`, transition: 'width 0.4s ease' }} />
        </div>

        {/* Card */}
        <div className="step-content" key={step} style={{ background: '#0e0c1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: 'clamp(28px,6vw,40px)' }}>
          <h2 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 26, fontWeight: 700, color: '#f4f0ff', margin: '0 0 6px' }}>{STEPS[step].title}</h2>
          <p style={{ color: '#6e6888', fontSize: 14, margin: '0 0 28px' }}>{STEPS[step].subtitle}</p>

          {/* Step 0: Role */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['student', 'faculty'].map(r => (
                <button key={r} onClick={() => set('role', r)} style={{
                  padding: '16px 20px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  background: form.role === r ? 'rgba(124,77,255,0.1)' : '#161328',
                  border: `1px solid ${form.role === r ? 'rgba(124,77,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  color: form.role === r ? '#f4f0ff' : '#6e6888',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 500, transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <Icon name={r === 'student' ? 'graduation-cap' : 'user-check'} size={18} color={form.role === r ? '#7c4dff' : '#6e6888'} />
                  <span style={{ textTransform: 'capitalize' }}>{r}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 1: Department */}
          {step === 1 && (
            <Select label="Department" value={form.department} onChange={e => set('department', e.target.value)}
              options={[{ value: '', label: 'Choose department...' }, ...DEPARTMENTS.map(d => ({ value: d, label: d }))]} />
          )}

          {/* Step 2: Year + Sem */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Select label="Year" value={form.year} onChange={e => set('year', e.target.value)}
                options={[{ value: '', label: 'Select year' }, ...YEARS.map(y => ({ value: y, label: `Year ${y}` }))]} />
              <Select label="Semester" value={form.semester} onChange={e => set('semester', e.target.value)}
                options={[{ value: '', label: 'Select semester' }, ...SEMS.map(s => ({ value: s, label: `Semester ${s}` }))]} />
            </div>
          )}

          {/* Step 3: CGPA + Backlogs */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input label="Current CGPA" type="number" min="0" max="10" step="0.01"
                placeholder="e.g. 7.8" value={form.cgpa} onChange={e => set('cgpa', e.target.value)} icon="award" />
              <Input label="Active Backlogs" type="number" min="0"
                placeholder="0" value={form.backlogs} onChange={e => set('backlogs', e.target.value)} icon="alert-triangle" />
            </div>
          )}

          {/* Step 4: Goals */}
          {step === 4 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {GOALS.map(g => {
                const selected = form.goals.includes(g.id)
                return (
                  <button key={g.id} className="goal-chip" onClick={() => toggleGoal(g.id)} style={{
                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: selected ? 'rgba(124,77,255,0.1)' : '#161328',
                    border: `1px solid ${selected ? 'rgba(124,77,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'all 0.15s',
                  }}>
                    <Icon name={g.icon} size={16} color={selected ? '#7c4dff' : '#6e6888'} />
                    <div style={{ marginTop: 8, fontSize: 13, color: selected ? '#f4f0ff' : '#6e6888', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                      {g.label}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: step > 0 ? 'space-between' : 'flex-end' }}>
            {step > 0 && (
              <Btn onClick={() => setStep(s => s - 1)} variant="ghost">
                <Icon name="arrow-left" size={15} color="#6e6888" /> Back
              </Btn>
            )}
            {step < STEPS.length - 1 ? (
              <Btn onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                Continue <Icon name="arrow-right" size={15} color="#fff" />
              </Btn>
            ) : (
              <Btn onClick={submit} loading={saving} disabled={!canNext()}>
                <Icon name="check" size={15} color="#fff" /> Complete Setup
              </Btn>
            )}
          </div>
        </div>

        {/* Dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i <= step ? '#7c4dff' : 'rgba(255,255,255,0.06)', transition: 'all 0.3s' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
