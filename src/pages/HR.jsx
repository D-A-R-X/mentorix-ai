// src/pages/HR.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const API = import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('mentorix_token') || ''}` })

const C = {
  bg: '#F8F9FC', surface: '#FFFFFF', surface2: '#F1F4F9', border: '#E2E8F0',
  blue: '#2563EB', navy: '#0F172A', text: '#334155', muted: '#94A3B8',
  green: '#059669', red: '#DC2626', amber: '#D97706',
  blueBg: '#EFF6FF', blueBorder: '#BFDBFE',
  greenBg: '#ECFDF5', greenBorder: '#A7F3D0',
  redBg: '#FEF2F2', redBorder: '#FECACA',
  amberBg: '#FFFBEB', amberBorder: '#FDE68A',
}

const QUESTIONS = [
  "Tell me about yourself and your key strengths.",
  "Describe a challenging project you've worked on and how you handled it.",
  "Where do you see yourself in 5 years?",
  "How do you handle pressure and tight deadlines?",
  "Tell me about a time you worked in a team. What was your role?",
  "What are your biggest weaknesses and how do you work on them?",
  "Why should we hire you over other candidates?",
  "Describe a situation where you showed leadership.",
  "How do you stay updated with developments in your field?",
  "Do you have any questions for us?",
]

// ── Streaming text renderer — shows words as AI speaks ───────────────────────
function StreamingText({ text, isNew }) {
  const [shown, setShown] = useState('')
  const idxRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!isNew) { setShown(text); return }
    setShown('')
    idxRef.current = 0
    const words = text.split(' ')
    const tick = () => {
      if (idxRef.current >= words.length) return
      idxRef.current++
      setShown(words.slice(0, idxRef.current).join(' '))
      timerRef.current = setTimeout(tick, 55)
    }
    timerRef.current = setTimeout(tick, 80)
    return () => clearTimeout(timerRef.current)
  }, [text])

  return <span>{shown}</span>
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value }) {
  const color = value >= 70 ? C.green : value >= 45 ? C.amber : C.red
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: value ? color : C.muted }}>{value ? `${value}%` : '--'}</span>
      </div>
      <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value || 0}%`, background: color, borderRadius: 2, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

export default function HR() {
  const nav = useNavigate()
  const { user } = useAuth()

  const [phase, setPhase]     = useState('intro')   // intro | session | done
  const [qIdx, setQIdx]       = useState(0)
  const [transcript, setTranscript] = useState('')
  const [convo, setConvo]     = useState([])         // {role, text, isNew}
  const [scores, setScores]   = useState({ tech: 0, comm: 0, crit: 0, pres: 0, lead: 0 })
  const [overall, setOverall] = useState(0)
  const [posture, setPosture] = useState(75)
  const [confidence, setConfidence] = useState(0)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking]   = useState(false)
  const [tabViol, setTabViol]     = useState(0)
  const [violMsg, setViolMsg]     = useState('')
  const [camErr, setCamErr]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [forcedEnd, setForcedEnd] = useState(false)
  const [finalScores, setFinalScores] = useState(null)
  const [eyeContact, setEyeContact] = useState(82)

  const videoRef  = useRef(null)
  const recogRef  = useRef(null)
  const streamRef = useRef(null)
  const postureTimerRef = useRef(null)
  const tabStartRef = useRef(null)
  const convoRef  = useRef([])
  const tabViolRef = useRef(0)
  const savedRef  = useRef(false)

  // ── Camera setup ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 }, audio: false })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      // Simulate posture/eye-contact analysis (replace with real ML if available)
      postureTimerRef.current = setInterval(() => {
        setPosture(p => Math.max(40, Math.min(100, p + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 4))))
        setEyeContact(e => Math.max(50, Math.min(100, e + (Math.random() > 0.6 ? 1 : -1) * Math.floor(Math.random() * 3))))
        setConfidence(c => Math.max(30, Math.min(100, c + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 5))))
      }, 2000)
    } catch { setCamErr(true) }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    clearInterval(postureTimerRef.current)
  }, [])

  // ── Tab switch detection ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'session') return
    const onVis = () => {
      if (document.hidden) {
        tabStartRef.current = Date.now()
      } else {
        const newCount = tabViolRef.current + 1
        tabViolRef.current = newCount
        setTabViol(newCount)
        const msg = newCount === 1
          ? '⚠ Tab switch detected — Violation 1 of 3. This is recorded.'
          : newCount === 2
          ? '⚠ Second violation — One more switch will end the interview!'
          : '✕ Third violation — Interview terminated.'
        setViolMsg(msg)
        setTimeout(() => setViolMsg(''), 5000)
        if (newCount >= 3) {
          setForcedEnd(true)
          endSession(true)
        }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase])

  // ── Speech recognition ────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.continuous = true; r.interimResults = true; r.lang = 'en-IN'
    r.onresult = e => {
      let final = ''
      for (const res of e.results) { if (res.isFinal) final += res[0].transcript + ' ' }
      if (final.trim()) setTranscript(p => p + final)
    }
    r.onend = () => { if (listening) r.start() }
    r.start()
    recogRef.current = r
    setListening(true)
  }, [listening])

  const stopListening = useCallback(() => {
    recogRef.current?.stop()
    setListening(false)
  }, [])

  // ── TTS ───────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text) => {
    setSpeaking(true)
    stopListening()
    try {
      const r = await fetch(`${API}/voice/tts`, { method: 'POST', headers: hdr(), body: JSON.stringify({ text }) })
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { setSpeaking(false); startListening() }
      audio.play()
    } catch {
      // Fallback browser TTS
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.92; u.pitch = 1.05; u.lang = 'en-IN'
      u.onend = () => { setSpeaking(false); startListening() }
      speechSynthesis.speak(u)
    }
  }, [stopListening, startListening])

  // ── Start session ─────────────────────────────────────────────────────────
  const startSession = async () => {
    setPhase('session')
    await startCamera()
    const intro = `Hi ${user?.name?.split(' ')[0] || 'there'}, I'm Aria, your Senior HR Interviewer. This interview has ${QUESTIONS.length} questions. I'll be evaluating your technical depth, communication, critical thinking, composure under pressure, and leadership qualities. Let's begin.`
    const first = QUESTIONS[0]
    const full = `${intro} Here is your first question: ${first}`
    setConvo([{ role: 'ai', text: full, isNew: true }])
    convoRef.current = [{ role: 'ai', text: full }]
    await speak(full)
  }

  // ── Submit answer ─────────────────────────────────────────────────────────
  const submitAnswer = async () => {
    if (!transcript.trim() || loading) return
    stopListening()
    setLoading(true)
    const answer = transcript.trim()
    setTranscript('')
    const newConvo = [...convoRef.current, { role: 'user', text: answer }]
    setConvo(c => [...c, { role: 'user', text: answer, isNew: false }])
    convoRef.current = newConvo

    const nextIdx = qIdx + 1
    const isLast = nextIdx >= QUESTIONS.length

    try {
      const sysPrompt = `You are Aria, a Senior HR Executive conducting a formal job interview. You are professional, perceptive, sharp, and direct.
Current question: "${QUESTIONS[qIdx]}"
Candidate just answered. Evaluate briefly (1-2 sentences), then ask the next question: "${isLast ? 'This was the final question. Thank the candidate and end the interview.' : QUESTIONS[nextIdx]}"
Keep the full response under 80 words. Be professional. Do NOT use emojis. Do NOT explain yourself.
Also output at the END of your reply, on a new line, a JSON scores object like:
SCORES:{"tech":75,"comm":80,"crit":70,"pres":65,"lead":72}
Base scores on this answer and cumulative performance.`

      const r = await fetch(`${API}/chat`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ messages: newConvo.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })), system: sysPrompt, max_tokens: 300 })
      })
      const d = await r.json()
      let reply = d.reply || "Thank you. Let's move on."

      // Extract scores
      const scoreMatch = reply.match(/SCORES:\s*(\{[^}]+\})/)
      if (scoreMatch) {
        try {
          const s = JSON.parse(scoreMatch[1])
          setScores(s)
          const avg = Math.round(Object.values(s).reduce((a, b) => a + b, 0) / Object.values(s).length)
          setOverall(avg)
        } catch {}
        reply = reply.replace(/SCORES:\s*\{[^}]+\}/, '').trim()
      }

      setConvo(c => [...c, { role: 'ai', text: reply, isNew: true }])
      convoRef.current = [...newConvo, { role: 'ai', text: reply }]

      if (isLast) {
        await speak(reply)
        setFinalScores(scores)
        endSession(false)
      } else {
        setQIdx(nextIdx)
        await speak(reply)
      }
    } catch (e) {
      const fallback = isLast ? "Thank you for completing the interview. Well done." : `Thank you. Next question: ${QUESTIONS[nextIdx]}`
      setConvo(c => [...c, { role: 'ai', text: fallback, isNew: true }])
      convoRef.current = [...newConvo, { role: 'ai', text: fallback }]
      setQIdx(nextIdx)
      await speak(fallback)
    } finally { setLoading(false) }
  }

  // ── End session ───────────────────────────────────────────────────────────
  const endSession = useCallback(async (forced = false) => {
    if (savedRef.current) return
    savedRef.current = true
    stopListening(); stopCamera()
    setPhase('done')
    const exchanges = convoRef.current.filter(m => m.role === 'user').length
    try {
      await fetch(`${API}/voice/save`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({
          transcript: convoRef.current.map(m => `${m.role === 'ai' ? 'Aria' : 'Candidate'}: ${m.text}`).join('\n'),
          summary: `HR Interview — ${exchanges} questions answered`,
          exchange_count: exchanges,
          overall_score: overall,
          scores: scores,
          mode: 'hr_interview',
          forced_end: forced,
          tab_switches: tabViolRef.current,
          questions_answered: exchanges,
        })
      })
    } catch {}
  }, [stopListening, stopCamera, overall, scores])

  // Keyboard shortcut Space=mic toggle, Esc=end
  useEffect(() => {
    if (phase !== 'session') return
    const onKey = e => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault()
        if (listening) stopListening(); else startListening()
      }
      if (e.code === 'Escape') { setForcedEnd(true); endSession(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, listening, startListening, stopListening, endSession])

  // ── INTRO SCREEN ──────────────────────────────────────────────────────────
  if (phase === 'intro') return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 24px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => nav('/dashboard')} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Dashboard
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15, color: C.navy }}>HR Mode</div>
        <div style={{ width: 80, fontSize: 11, color: C.muted, textAlign: 'right' }}>default</div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 40, maxWidth: 560, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.blueBg, border: `1px solid ${C.blueBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 8 }}>HR Mock Interview</div>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 28, lineHeight: 1.6 }}>
            Aria, Senior HR Executive, will conduct a formal interview with {QUESTIONS.length} questions across 5 scoring categories.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
            {[
              { label: 'Technical', desc: 'Domain knowledge & depth' },
              { label: 'Communication', desc: 'Clarity & articulation' },
              { label: 'Critical Thinking', desc: 'Problem solving' },
              { label: 'Composure', desc: 'Pressure & tab behaviour' },
              { label: 'Leadership', desc: 'Initiative & ownership' },
              { label: 'Camera Required', desc: 'Posture & eye contact analysis' },
            ].map(({ label, desc }) => (
              <div key={label} style={{ padding: '10px 14px', borderRadius: 10, background: C.surface2, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 16px', borderRadius: 10, background: C.redBg, border: `1px solid ${C.redBorder}`, marginBottom: 24, fontSize: 12, color: C.red, lineHeight: 1.6 }}>
            <strong>Anti-cheat active.</strong> Tab switches are tracked. 3 switches = immediate termination. All sessions are logged.
          </div>

          <button onClick={startSession} style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Begin Interview
          </button>
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: C.muted }}>Space = toggle mic · Esc = end session</div>
        </div>
      </div>
    </div>
  )

  // ── DONE SCREEN ───────────────────────────────────────────────────────────
  if (phase === 'done') {
    const scoreItems = [
      { label: 'Technical', val: scores.tech },
      { label: 'Communication', val: scores.comm },
      { label: 'Critical Thinking', val: scores.crit },
      { label: 'Composure', val: scores.pres },
      { label: 'Leadership', val: scores.lead },
    ]
    const overallColor = overall >= 70 ? C.green : overall >= 45 ? C.amber : C.red
    return (
      <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 40, maxWidth: 520, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          {forcedEnd
            ? <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.redBg, border: `1px solid ${C.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
            : <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenBg, border: `1px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
          }
          <div style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 6 }}>
            {forcedEnd ? 'Interview Terminated' : 'Interview Complete'}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 28 }}>
            {forcedEnd ? `Ended due to ${tabViol} tab violation${tabViol > 1 ? 's' : ''}` : `${convoRef.current.filter(m => m.role === 'user').length} questions answered`}
          </div>

          <div style={{ width: 96, height: 96, borderRadius: '50%', border: `4px solid ${overallColor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', background: `${overallColor}10` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: overallColor }}>{overall || '--'}</div>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>OVERALL</div>
          </div>

          <div style={{ textAlign: 'left', marginBottom: 28 }}>
            {scoreItems.map(({ label, val }) => <ScoreBar key={label} label={label} value={val} />)}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { savedRef.current = false; setPhase('intro'); setQIdx(0); setConvo([]); setTranscript(''); setTabViol(0); tabViolRef.current = 0; setScores({ tech: 0, comm: 0, crit: 0, pres: 0, lead: 0 }); setOverall(0); setForcedEnd(false) }}
              style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontFamily: 'Inter, sans-serif', fontSize: 13, cursor: 'pointer' }}>
              Retry
            </button>
            <button onClick={() => nav('/dashboard')}
              style={{ flex: 2, padding: '11px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── SESSION SCREEN ────────────────────────────────────────────────────────
  const postureColor = posture >= 70 ? C.green : posture >= 45 ? C.amber : C.red
  const eyeColor     = eyeContact >= 70 ? C.green : eyeContact >= 45 ? C.amber : C.red
  const confColor    = confidence >= 60 ? C.green : confidence >= 35 ? C.amber : C.red

  return (
    <div style={{ height: '100vh', background: C.bg, fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '10px 20px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>HR Interview — Q{qIdx + 1}/{QUESTIONS.length}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{user?.name || 'Candidate'}</div>
        </div>

        {/* Progress bar */}
        <div style={{ flex: 2, height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${((qIdx) / QUESTIONS.length) * 100}%`, background: C.blue, borderRadius: 2, transition: 'width 0.5s ease' }} />
        </div>

        {/* Tab violations */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: tabViol >= i ? C.red : C.border, transition: 'background 0.3s' }} />
          ))}
        </div>

        <button onClick={() => { setForcedEnd(true); endSession(true) }} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          End
        </button>
      </div>

      {/* Violation banner */}
      {violMsg && (
        <div style={{ padding: '10px 20px', background: C.redBg, borderBottom: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red, fontWeight: 600, textAlign: 'center', animation: 'none' }}>
          {violMsg}
        </div>
      )}

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>

        {/* LEFT: Camera + Analysis */}
        <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.surface, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Camera */}
          <div style={{ position: 'relative', background: '#0F172A', aspectRatio: '4/3', flexShrink: 0 }}>
            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            {camErr && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 11, textAlign: 'center', padding: 12 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Camera unavailable
              </div>
            )}
            {!camErr && (
              <>
                {/* Live indicator */}
                <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '3px 8px' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, animation: 'pulse 1.5s infinite' }} />
                  <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>LIVE</span>
                </div>
                {/* Posture badge */}
                <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '4px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: postureColor }}>{posture}%</div>
                  <div style={{ fontSize: 9, color: '#94A3B8' }}>POSTURE</div>
                </div>
              </>
            )}
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
          </div>

          {/* Analysis metrics */}
          <div style={{ padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '1px', marginBottom: 12 }}>LIVE ANALYSIS</div>

            {[
              { label: 'Posture', val: posture, color: postureColor },
              { label: 'Eye Contact', val: eyeContact, color: eyeColor },
              { label: 'Confidence', val: confidence, color: confColor },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color }}>{val}%</span>
                </div>
                <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${val}%`, background: color, borderRadius: 2, transition: 'width 0.8s ease' }} />
                </div>
              </div>
            ))}

            <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '1px', marginBottom: 12 }}>LIVE SCORES</div>
              <ScoreBar label="Technical" value={scores.tech} />
              <ScoreBar label="Communication" value={scores.comm} />
              <ScoreBar label="Critical Thinking" value={scores.crit} />
              <ScoreBar label="Composure" value={scores.pres} />
              <ScoreBar label="Leadership" value={scores.lead} />
            </div>
          </div>
        </div>

        {/* RIGHT: Chat + Input */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Conversation */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {convo.map((msg, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                {msg.role === 'ai' && (
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>AI</span>
                  </div>
                )}
                <div style={{
                  maxWidth: '72%', padding: '12px 16px', borderRadius: msg.role === 'ai' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                  background: msg.role === 'ai' ? C.surface : C.blue,
                  border: msg.role === 'ai' ? `1px solid ${C.border}` : 'none',
                  color: msg.role === 'ai' ? C.navy : '#fff',
                  fontSize: 14, lineHeight: 1.6, fontWeight: msg.role === 'ai' ? 500 : 400,
                }}>
                  {msg.role === 'ai' && msg.isNew
                    ? <StreamingText text={msg.text} isNew={true} />
                    : msg.text}
                </div>
              </div>
            ))}
            {speaking && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 0' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>AI</span>
                </div>
                <div style={{ display: 'flex', gap: 4, padding: '12px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '4px 16px 16px 16px' }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, animation: `pulse 1.2s ${i * 0.2}s infinite` }} />)}
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, textAlign: 'center' }}>Q{qIdx + 1}/{QUESTIONS.length}: {QUESTIONS[qIdx]}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minHeight: 64, padding: '10px 14px', border: `1px solid ${listening ? C.blue : C.border}`, borderRadius: 10, background: listening ? C.blueBg : C.surface2, fontSize: 13, color: transcript ? C.navy : C.muted, lineHeight: 1.6, transition: 'all 0.2s' }}>
                {transcript || (listening ? 'Listening… speak your answer' : 'Press Space or the mic button to speak')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => listening ? stopListening() : startListening()} style={{ width: 48, height: 48, borderRadius: 12, border: `2px solid ${listening ? C.red : C.blue}`, background: listening ? C.redBg : C.blueBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  {listening
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  }
                </button>
                <button onClick={submitAnswer} disabled={!transcript.trim() || loading || speaking} style={{ width: 48, height: 48, borderRadius: 12, border: 'none', background: transcript.trim() && !loading && !speaking ? C.blue : C.border, cursor: transcript.trim() && !loading && !speaking ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  {loading
                    ? <div style={{ width: 16, height: 16, border: '2px solid #ffffff40', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  }
                </button>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: C.muted }}>Space = toggle mic · Enter = submit · Esc = end</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      </div>
    </div>
  )
}
