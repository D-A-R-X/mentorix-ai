import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoMark, Icon, Btn, Select, Input, useToast } from '../components/ui/index.jsx'
import { userApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth.jsx'
import { getEmail, getInstitutionId } from '../lib/auth'

const DEPARTMENTS = ['CSE','IT','AIDS','AIML','ECE','EEE','MECH','CIVIL','Food Technology','Biotechnology']
const YEARS       = ['1','2','3','4']
const SEMS        = ['1','2','3','4','5','6','7','8']
const STEPS = [
  { id: 'role',    title: 'Your Role',           subtitle: 'Help us personalise your experience' },
  { id: 'dept',    title: 'Department',           subtitle: 'We tailor sessions to your curriculum' },
  { id: 'year',    title: 'Academic Year',        subtitle: 'Calibrates question difficulty' },
  { id: 'details', title: 'Academic Standing',    subtitle: 'Used for performance benchmarking' },
  { id: 'goals',   title: 'Your Goals',           subtitle: 'What do you want to achieve?' },
]
const GOALS = [
  { id: 'placement', label: 'Job Placement',     icon: 'briefcase' },
  { id: 'cgpa',      label: 'Improve CGPA',      icon: 'trending-up' },
  { id: 'skills',    label: 'Skill Building',    icon: 'code' },
  { id: 'research',  label: 'Research',          icon: 'book-open' },
  { id: 'startup',   label: 'Entrepreneurship',  icon: 'rocket' },
  { id: 'abroad',    label: 'Higher Education',  icon: 'globe' },
]

export default function Onboarding() {
  const nav   = useNavigate()
  const toast = useToast()
  const { refreshUser } = useAuth()

  const [step,   setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [form,   setForm]   = useState({ role: 'student', department: '', year: '', semester: '', cgpa: '', backlogs: '0', goals: [] })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleGoal = id => setForm(f => ({ ...f, goals: f.goals.includes(id) ? f.goals.filter(g => g !== id) : [...f.goals, id] }))

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
      await userApi.onboarding({ dept: form.department, year: form.year, sem: form.semester, institution_id: getInstitutionId() || undefined })
      localStorage.setItem('mentorix_onboarding', JSON.stringify({ cgpa: parseFloat(form.cgpa) || 0, backlogs: parseInt(form.backlogs) || 0, goals: form.goals, department: form.department, year: form.year }))
      await refreshUser()
      nav('/dashboard')
    } catch (e) {
      toast(e.message || 'Could not save profile', 'error')
      setSaving(false)
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .goal-chip:hover { border-color: #BFDBFE !important; background: #EFF6FF !important; }
        @keyframes stepIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
        .step-content { animation: stepIn 0.25s ease; }
        input:focus, select:focus { border-color: #93C5FD !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.08) !important; outline: none !important; }
        select option { background: #fff; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogoMark size={26} />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Mentorix<span style={{ color: '#2563EB' }}>.</span>AI
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>Step {step + 1} of {STEPS.length}</span>
        </div>

        {/* Progress */}
        <div style={{ height: 3, background: '#E2E8F0', borderRadius: 2, marginBottom: 32, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#2563EB', borderRadius: 2, width: `${progress}%`, transition: 'width 0.4s ease' }} />
        </div>

        {/* Card */}
        <div className="step-content" key={step} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 'clamp(24px,5vw,36px)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: 4 }}>{STEPS[step].title}</h2>
          <p style={{ color: '#64748B', fontSize: 14, marginBottom: 28 }}>{STEPS[step].subtitle}</p>

          {/* Step 0: Role */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['student', 'faculty'].map(r => (
                <button key={r} onClick={() => set('role', r)} style={{
                  padding: '14px 18px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  background: form.role === r ? '#EFF6FF' : '#F8F9FC',
                  border: `1px solid ${form.role === r ? '#BFDBFE' : '#E2E8F0'}`,
                  display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
                }}>
                  <Icon name={r === 'student' ? 'graduation-cap' : 'user-check'} size={18} color={form.role === r ? '#2563EB' : '#94A3B8'} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: form.role === r ? '#1D4ED8' : '#334155', textTransform: 'capitalize' }}>{r}</span>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Select label="Year" value={form.year} onChange={e => set('year', e.target.value)}
                options={[{ value: '', label: 'Select year' }, ...YEARS.map(y => ({ value: y, label: `Year ${y}` }))]} />
              <Select label="Semester" value={form.semester} onChange={e => set('semester', e.target.value)}
                options={[{ value: '', label: 'Select semester' }, ...SEMS.map(s => ({ value: s, label: `Semester ${s}` }))]} />
            </div>
          )}

          {/* Step 3: CGPA + Backlogs */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Current CGPA" type="number" min="0" max="10" step="0.01" placeholder="e.g. 7.8" value={form.cgpa} onChange={e => set('cgpa', e.target.value)} icon="award" />
              <Input label="Active Backlogs" type="number" min="0" placeholder="0" value={form.backlogs} onChange={e => set('backlogs', e.target.value)} icon="alert-triangle" />
            </div>
          )}

          {/* Step 4: Goals */}
          {step === 4 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {GOALS.map(g => {
                const selected = form.goals.includes(g.id)
                return (
                  <button key={g.id} className="goal-chip" onClick={() => toggleGoal(g.id)} style={{
                    padding: '14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', border: 'none',
                    background: selected ? '#EFF6FF' : '#F8F9FC',
                    outline: selected ? '1.5px solid #BFDBFE' : '1.5px solid #E2E8F0',
                    transition: 'all 0.15s',
                  }}>
                    <Icon name={g.icon} size={16} color={selected ? '#2563EB' : '#94A3B8'} />
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500, color: selected ? '#1D4ED8' : '#334155' }}>{g.label}</div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10, marginTop: 28, justifyContent: step > 0 ? 'space-between' : 'flex-end' }}>
            {step > 0 && <Btn onClick={() => setStep(s => s - 1)} variant="ghost"><Icon name="arrow-left" size={14} color="#64748B" /> Back</Btn>}
            {step < STEPS.length - 1
              ? <Btn onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Continue <Icon name="arrow-right" size={14} color="#fff" /></Btn>
              : <Btn onClick={submit} loading={saving} disabled={!canNext()}><Icon name="check" size={14} color="#fff" /> Complete Setup</Btn>
            }
          </div>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i <= step ? '#2563EB' : '#E2E8F0', transition: 'all 0.3s' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
