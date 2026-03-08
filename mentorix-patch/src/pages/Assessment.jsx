import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AmbientBg, LogoMark, Btn, Icon, Badge, Card, ScoreRing, Spinner } from '../components/ui/index.jsx'
import { assessmentApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth'

export default function Assessment() {
  const nav = useNavigate()
  const { user } = useAuth()

  const [phase,      setPhase]      = useState('loading') // loading|intro|quiz|submitting|result|error
  const [questions,  setQuestions]  = useState([])
  const [current,    setCurrent]    = useState(0)
  // answers: { "tech_001": 2, "core_001": 0, ... }  ← 0-based option index
  const [answers,    setAnswers]    = useState({})
  const [result,     setResult]     = useState(null)
  const [timeLeft,   setTimeLeft]   = useState(0)
  const [totalTime,  setTotalTime]  = useState(0)
  const startTimesRef = useRef({})   // tracks when each q was first shown (for latency)

  const dept = user?.department || user?.dept || ''

  // ── Load questions filtered by user's department ──────────────────────────
  useEffect(() => {
    assessmentApi.questions(dept)
      .then(res => {
        // Backend returns { total: N, questions: [{id, question, options, ...}] }
        const arr = Array.isArray(res) ? res : (res.questions || [])
        if (!arr.length) { setPhase('error'); return }
        setQuestions(arr)
        const t = arr.length * 90
        setTimeLeft(t); setTotalTime(t)
        setPhase('intro')
      })
      .catch(() => setPhase('error'))
  }, [])

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz') return
    if (timeLeft <= 0) { handleSubmit(); return }
    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, timeLeft])

  // ── Track time per question for latency_data ──────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz') return
    const q = questions[current]
    if (q && !startTimesRef.current[q.id]) {
      startTimesRef.current[q.id] = Date.now()
    }
  }, [current, phase, questions])

  const selectAnswer = (qId, optionIndex) => {
    setAnswers(a => ({ ...a, [qId]: optionIndex }))
  }

  // ── Build latency_data: { "q_id": ms_taken } ─────────────────────────────
  const buildLatency = () => {
    const now = Date.now()
    const out = {}
    questions.forEach(q => {
      const start = startTimesRef.current[q.id]
      if (start) out[q.id] = Math.round((now - start) / 1000) // seconds
    })
    return out
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setPhase('submitting')
    // Cached onboarding for cgpa/backlogs
    const cached = JSON.parse(localStorage.getItem('mentorix_onboarding') || '{}')
    try {
      // Backend AssessmentSubmission expects:
      //   answers: { "tech_001": 2 }   ← 0-based option index per question id
      //   cgpa, backlogs, latency_data
      const res = await assessmentApi.submit({
        answers:      answers,
        latency_data: buildLatency(),
        cgpa:         parseFloat(cached.cgpa) || 0,
        backlogs:     parseInt(cached.backlogs) || 0,
      })
      setResult(res)
      setPhase('result')
    } catch (e) {
      console.error('Assessment submit error:', e)
      setPhase('error')
    }
  }

  const fmt      = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const answered = Object.keys(answers).length
  const q        = questions[current]
  const progress = questions.length ? ((current + 1) / questions.length) * 100 : 0

  const riskColor = r => r === 'Low' ? '#00e5b4' : r === 'Medium' ? '#7c4dff' : '#ff4d6d'
  const riskBadge = r => r === 'Low' ? 'teal'   : r === 'Medium' ? 'violet'  : 'rose'

  return (
    <div style={{ minHeight: '100vh', background: '#06050e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .opt:hover { border-color: rgba(124,77,255,0.3) !important; cursor: pointer; }
        .dot-btn:hover { opacity: 0.8; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.3s ease; }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 580 }}>

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <button onClick={() => nav('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6e6888', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
            <Icon name="arrow-left" size={16} color="#6e6888" /> Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogoMark size={24} />
            <span style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, fontSize: 15, color: '#f4f0ff' }}>Assessment</span>
          </div>
          {phase === 'quiz' && (
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, color: timeLeft < 60 ? '#ff4d6d' : '#6e6888', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="clock" size={14} color={timeLeft < 60 ? '#ff4d6d' : '#6e6888'} />
              {fmt(timeLeft)}
            </div>
          )}
          {phase !== 'quiz' && <div style={{ width: 80 }} />}
        </div>

        {/* ── LOADING ──────────────────────────────────────────────────────── */}
        {phase === 'loading' && (
          <Card style={{ textAlign: 'center', padding: 56 }}>
            <Spinner size={36} />
            <p style={{ color: '#6e6888', marginTop: 18, fontSize: 14 }}>Loading questions{dept ? ` for ${dept}` : ''}…</p>
          </Card>
        )}

        {/* ── ERROR ────────────────────────────────────────────────────────── */}
        {phase === 'error' && (
          <Card style={{ textAlign: 'center', padding: 56 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.2)', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="alert-circle" size={30} color="#ff4d6d" />
            </div>
            <h3 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 20, color: '#f4f0ff', marginBottom: 8 }}>Assessment Unavailable</h3>
            <p style={{ color: '#6e6888', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>Could not load questions. The backend may be starting up, or no questions are available for your department.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Btn variant="secondary" onClick={() => { setPhase('loading'); assessmentApi.questions(dept).then(r => { const a = Array.isArray(r) ? r : r.questions || []; setQuestions(a); setTimeLeft(a.length * 90); setTotalTime(a.length * 90); setPhase(a.length ? 'intro' : 'error') }).catch(() => setPhase('error')) }}>
                <Icon name="refresh-cw" size={14} color="#c0bbd8" /> Retry
              </Btn>
              <Btn onClick={() => nav('/dashboard')}><Icon name="layout-dashboard" size={14} color="#fff" /> Dashboard</Btn>
            </div>
          </Card>
        )}

        {/* ── INTRO ────────────────────────────────────────────────────────── */}
        {phase === 'intro' && (
          <Card className="fade-up">
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(124,77,255,0.1)', border: '1px solid rgba(124,77,255,0.22)', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="clipboard-check" size={36} color="#7c4dff" />
              </div>
              <h2 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 26, fontWeight: 700, color: '#f4f0ff', margin: '0 0 10px' }}>Academic Assessment</h2>
              <p style={{ color: '#6e6888', fontSize: 14, margin: '0 0 32px', lineHeight: 1.75, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
                {questions.length} questions across 5 domains. Results reveal your career stability score and risk level, used by your institution.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 32 }}>
                {[
                  { label: 'Questions',    val: questions.length,   icon: 'help-circle' },
                  { label: 'Time',         val: fmt(totalTime),     icon: 'clock' },
                  { label: 'AI Scored',    val: 'Instant',          icon: 'zap' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '16px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                    <Icon name={s.icon} size={18} color="#6e6888" />
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 16, fontWeight: 600, color: '#f4f0ff', marginTop: 8 }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: '#6e6888', marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.15)', marginBottom: 28, textAlign: 'left' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="alert-triangle" size={14} color="#ff4d6d" />
                  <p style={{ margin: 0, fontSize: 12, color: '#ff4d6d', lineHeight: 1.6 }}>
                    Do not switch tabs during the assessment. Tab switching is logged and reduces your honor score.
                  </p>
                </div>
              </div>

              <Btn onClick={() => { setCurrent(0); setPhase('quiz') }} size="lg" fullWidth>
                <Icon name="play" size={16} color="#fff" /> Begin Assessment
              </Btn>
            </div>
          </Card>
        )}

        {/* ── QUIZ ─────────────────────────────────────────────────────────── */}
        {phase === 'quiz' && q && (
          <div className="fade-up" key={current}>
            {/* Progress header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#6e6888' }}>
                Q{current + 1} of {questions.length}
              </span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#6e6888' }}>
                {answered}/{questions.length} answered
              </span>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,#7c4dff,#00e5b4)', borderRadius: 2, width: `${progress}%`, transition: 'width 0.35s ease' }} />
            </div>

            <Card>
              {/* Domain badge */}
              {q.domain_label && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: '4px 12px', borderRadius: 100, background: 'rgba(124,77,255,0.08)', border: '1px solid rgba(124,77,255,0.2)' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#a87fff', letterSpacing: '0.06em' }}>{q.domain_label.toUpperCase()}</span>
                </div>
              )}

              <p style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 17, fontWeight: 600, color: '#f4f0ff', lineHeight: 1.55, margin: '0 0 22px' }}>
                {q.question || q.text || `Question ${current + 1}`}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                {(q.options || []).map((opt, idx) => {
                  const selected = answers[q.id] === idx
                  return (
                    <button key={idx} className="opt" onClick={() => selectAnswer(q.id, idx)} style={{
                      padding: '13px 18px', borderRadius: 12, textAlign: 'left',
                      background: selected ? 'rgba(124,77,255,0.1)' : '#161328',
                      border: `1px solid ${selected ? 'rgba(124,77,255,0.45)' : 'rgba(255,255,255,0.07)'}`,
                      color: selected ? '#f4f0ff' : '#c0bbd8',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 14, transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 14,
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${selected ? '#7c4dff' : 'rgba(255,255,255,0.15)'}`,
                        background: selected ? '#7c4dff' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {selected && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      {opt}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="ghost" size="sm" disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>
                    <Icon name="arrow-left" size={14} color="#6e6888" /> Prev
                  </Btn>
                  {current < questions.length - 1 && (
                    <Btn variant="secondary" size="sm" onClick={() => setCurrent(c => c + 1)}>
                      Next <Icon name="arrow-right" size={14} color="#c0bbd8" />
                    </Btn>
                  )}
                </div>
                {current === questions.length - 1 && (
                  <Btn onClick={handleSubmit} disabled={answered < questions.length}>
                    <Icon name="check" size={14} color="#fff" />
                    Submit {answered < questions.length ? `(${questions.length - answered} left)` : ''}
                  </Btn>
                )}
              </div>
            </Card>

            {/* Question dot navigator */}
            <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              {questions.map((qq, i) => (
                <button key={i} className="dot-btn" onClick={() => setCurrent(i)} style={{
                  width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 10,
                  fontFamily: 'DM Mono, monospace', color: '#f4f0ff',
                  background: answers[qq.id] !== undefined
                    ? '#7c4dff'
                    : i === current
                      ? 'rgba(124,77,255,0.3)'
                      : 'rgba(255,255,255,0.06)',
                  boxShadow: i === current ? '0 0 0 2px rgba(124,77,255,0.4)' : 'none',
                  transition: 'all 0.15s',
                }}>{i + 1}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── SUBMITTING ───────────────────────────────────────────────────── */}
        {phase === 'submitting' && (
          <Card style={{ textAlign: 'center', padding: 56 }}>
            <Spinner size={36} />
            <p style={{ color: '#6e6888', marginTop: 18, fontSize: 14 }}>Analysing your responses with AI…</p>
          </Card>
        )}

        {/* ── RESULT ───────────────────────────────────────────────────────── */}
        {phase === 'result' && result && (
          <div className="fade-up">
            {/* Main result card */}
            <Card style={{ marginBottom: 16, textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 24, fontWeight: 700, color: '#f4f0ff', margin: '0 0 6px' }}>Assessment Complete</h2>
              <p style={{ color: '#6e6888', fontSize: 13, margin: '0 0 28px' }}>Your academic risk evaluation</p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, alignItems: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
                <ScoreRing
                  score={Math.round((result.stability_index ?? result.stability_score ?? 0.5) * 100)}
                  size={120} label="Stability"
                />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#6e6888', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Risk Level</div>
                    <Badge color={riskBadge(result.risk_level)}>{result.risk_level || 'Unknown'}</Badge>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#6e6888', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Trend</div>
                    <span style={{ fontSize: 14, color: '#f4f0ff', fontFamily: 'DM Mono, monospace' }}>{result.trend || '—'}</span>
                  </div>
                  {result.recommendation?.track && (
                    <div>
                      <div style={{ fontSize: 11, color: '#6e6888', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recommended Track</div>
                      <span style={{ fontSize: 14, color: '#7c4dff', fontWeight: 600, fontFamily: 'DM Mono, monospace' }}>{result.recommendation.track}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Explanation */}
              {result.ai_explanation && (
                <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(124,77,255,0.06)', border: '1px solid rgba(124,77,255,0.15)', marginBottom: 24, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Icon name="zap" size={14} color="#7c4dff" />
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#7c4dff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Insight</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#c0bbd8', lineHeight: 1.7 }}>{result.ai_explanation.slice(0, 400)}{result.ai_explanation.length > 400 ? '…' : ''}</p>
                </div>
              )}

              {/* Course recommendations */}
              {result.recommendation?.courses?.length > 0 && (
                <div style={{ marginBottom: 24, textAlign: 'left' }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#6e6888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Recommended Courses</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.recommendation.courses.slice(0, 3).map((c, i) => (
                      <div key={i} style={{ padding: '11px 14px', borderRadius: 10, background: '#161328', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icon name="book-open" size={14} color="#7c4dff" />
                        <span style={{ flex: 1, fontSize: 13, color: '#f4f0ff' }}>{c.title || c}</span>
                        {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#7c4dff', fontFamily: 'DM Mono, monospace', textDecoration: 'none' }}>Open →</a>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <Btn fullWidth variant="secondary" onClick={() => nav('/dashboard')}>
                  <Icon name="layout-dashboard" size={14} color="#c0bbd8" /> Dashboard
                </Btn>
                <Btn fullWidth onClick={() => { setPhase('intro'); setCurrent(0); setAnswers({}); setResult(null); setTimeLeft(totalTime); startTimesRef.current = {} }}>
                  <Icon name="refresh-cw" size={14} color="#fff" /> Retake
                </Btn>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
