import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoMark, Btn, Icon, Badge, useToast } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth'
import { voiceApi } from '../lib/api'

const MAX_W = 3
const MAX_Q = 8
const INACTIVITY_MS = 45000
const API = import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'

const QUESTIONS_BY_DEPT = {
  CSE: [
    "Explain a data structure you've used in a project and why you chose it.",
    "What's the difference between process and thread? Give a real example.",
    "Walk me through how you'd design a URL shortener.",
    "What is time complexity? Analyse a sorting algorithm you know.",
    "Describe a bug you fixed that took the longest — what was the root cause?",
    "What is REST? How does it differ from GraphQL?",
    "Explain OOP with a real-world analogy.",
    "Where do you see AI fitting into software development in 5 years?",
  ],
  default: [
    "Tell me about your current academic focus and what you find most challenging.",
    "What projects have you worked on recently? Walk me through your approach.",
    "How do you manage your time between studies and other activities?",
    "Describe a technical problem you solved recently.",
    "What are your career goals after graduation?",
    "How do you stay updated with new developments in your field?",
    "What skills do you feel you need to improve most?",
    "Where do you see yourself in 5 years?",
  ]
}

// ── Typewriter ────────────────────────────────────────────────────────────────
function TypewriterText({ text, speed = 22 }) {
  const [shown, setShown] = useState('')
  useEffect(() => {
    setShown('')
    if (!text) return
    let i = 0
    const timer = setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, speed)
    return () => clearInterval(timer)
  }, [text])
  return <span>{shown}</span>
}

// ── Spectrogram ───────────────────────────────────────────────────────────────
function Spectrogram({ active, speaking }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)
  const barsRef   = useRef(Array(32).fill(0.05))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height, N = 32

    function draw() {
      ctx.clearRect(0, 0, W, H)
      barsRef.current = barsRef.current.map(p => {
        const target = (active || speaking) ? Math.random() * 0.8 + 0.1 : 0.04
        return p + (target - p) * 0.25
      })
      for (let i = 0; i < N; i++) {
        const h   = barsRef.current[i] * H
        const x   = (W / N) * i + 2
        const bw  = W / N - 4
        const c1  = speaking ? 'rgba(124,77,255,0.9)' : 'rgba(37,99,235,0.9)'
        const c2  = speaking ? 'rgba(124,77,255,0.2)' : 'rgba(5,150,105,0.4)'
        const g   = ctx.createLinearGradient(0, H - h, 0, H)
        g.addColorStop(0, c1); g.addColorStop(1, c2)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.roundRect(x, H - h, bw, h, 3)
        ctx.fill()
      }
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [active, speaking])

  return (
    <canvas ref={canvasRef} width={300} height={72}
      style={{ borderRadius: 8, background: '#F8F9FC', border: '1px solid #F1F4F9' }} />
  )
}

// ── Browser TTS — best female voice ──────────────────────────────────────────
function browserSpeak(text, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return }
  window.speechSynthesis.cancel()

  function doSpeak() {
    const u      = new SpeechSynthesisUtterance(text)
    const voices = window.speechSynthesis.getVoices()

    // Priority list of female voices
    const femaleNames = [
      'Google UK English Female',
      'Microsoft Zira - English (United States)',
      'Microsoft Hazel - English (Great Britain)',
      'Samantha',
      'Karen',
      'Moira',
      'Tessa',
      'Victoria',
      'Allison',
      'Ava',
    ]

    let chosen = null
    for (const name of femaleNames) {
      chosen = voices.find(v => v.name === name)
      if (chosen) break
    }
    // Fallback: any English female
    if (!chosen) {
      chosen = voices.find(v =>
        v.lang.startsWith('en') &&
        /female|woman|girl/i.test(v.name)
      )
    }
    // Fallback: any en-GB (usually female by default)
    if (!chosen) chosen = voices.find(v => v.lang === 'en-GB')
    // Fallback: any English
    if (!chosen) chosen = voices.find(v => v.lang.startsWith('en'))

    if (chosen) u.voice = chosen
    u.rate   = 0.87
    u.pitch  = 1.2
    u.volume = 1
    u.onend   = onEnd
    u.onerror = onEnd
    window.speechSynthesis.speak(u)
  }

  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true })
  } else {
    doSpeak()
  }
}

// ── ElevenLabs TTS with browser fallback ─────────────────────────────────────
let _audioEl = null

async function ariaSpeak(text, token, onStart, onEnd) {
  // Stop previous audio
  if (_audioEl) { _audioEl.pause(); _audioEl.src = ''; _audioEl = null }
  window.speechSynthesis?.cancel()

  onStart?.()

  try {
    const res = await fetch(API + '/voice/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error('no tts')
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const audio = new Audio(url)
    _audioEl = audio
    audio.onended = () => { URL.revokeObjectURL(url); _audioEl = null; onEnd?.() }
    audio.onerror = () => { URL.revokeObjectURL(url); _audioEl = null; browserSpeak(text, onEnd) }
    audio.play().catch(() => { browserSpeak(text, onEnd) })
  } catch {
    browserSpeak(text, onEnd)
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Voice() {
  const { user }  = useAuth()
  const nav       = useNavigate()
  const toast     = useToast()
  const token     = localStorage.getItem('mentorix_token') || ''

  const [phase,       setPhase]       = useState('intro')   // intro | question | listening | feedback | done
  const [qIndex,      setQIndex]      = useState(0)
  const [answers,     setAnswers]     = useState([])
  const [transcript,  setTranscript]  = useState('')
  const [inputMode,   setInputMode]   = useState('voice')
  const [typedAnswer, setTypedAnswer] = useState('')
  const [tabWarnings, setTabWarnings] = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [aiReply,     setAiReply]     = useState('')
  const [isSpeaking,  setIsSpeaking]  = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [micError,    setMicError]    = useState('')

  // Refs — always current values without stale closure
  const recogRef      = useRef(null)
  const inactivityRef = useRef(null)
  const answersRef    = useRef([])
  const tabWarnRef    = useRef(0)
  const phaseRef      = useRef('intro')
  const transcriptRef = useRef('')

  const dept      = user?.department || user?.dept || 'default'
  const questions = QUESTIONS_BY_DEPT[dept] || QUESTIONS_BY_DEPT.default
  const totalQ    = Math.min(MAX_Q, questions.length)
  const progress  = ((qIndex + 1) / totalQ) * 100

  // Keep refs in sync
  useEffect(() => { answersRef.current   = answers },     [answers])
  useEffect(() => { tabWarnRef.current   = tabWarnings }, [tabWarnings])
  useEffect(() => { phaseRef.current     = phase },       [phase])
  useEffect(() => { transcriptRef.current = transcript }, [transcript])

  // ── Tab-switch anti-cheat ─────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => {
      if (!document.hidden) return
      const p = phaseRef.current
      if (p !== 'listening' && p !== 'question' && p !== 'feedback') return
      const w = tabWarnRef.current + 1
      setTabWarnings(w); tabWarnRef.current = w
      if (w >= MAX_W) {
        toast(`Session terminated: ${MAX_W} tab violations`, 'error')
        endSession(true)
      } else {
        toast(`⚠️ Warning ${w}/${MAX_W}: do not leave this tab`, 'warn')
      }
    }
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [])

  // ── Abandon detection on page close ──────────────────────────────────────
  useEffect(() => {
    const fn = () => {
      const p = phaseRef.current
      const a = answersRef.current
      if ((p === 'listening' || p === 'question' || p === 'feedback') && a.length < MAX_Q) {
        // Save with penalty flag
        voiceApi.save({
          answers: a,
          tab_switches: tabWarnRef.current,
          forced_end: true,
          incomplete: true,
          department: user?.department,
          questions_answered: a.length,
          summary: `Abandoned after ${a.length} questions.`,
          transcript: a.map(x => `Q: ${x.question}\nA: ${x.answer}`).join('\n\n'),
          scores: {},
          overall: Math.max(0, a.length * 5 - 10),  // penalty
          exchange_count: a.length,
          mode: 'voice',
        }).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', fn)
    return () => window.removeEventListener('beforeunload', fn)
  }, [])

  // ── Inactivity timer ──────────────────────────────────────────────────────
  const resetInactivity = useCallback(() => {
    clearTimeout(inactivityRef.current)
    inactivityRef.current = setTimeout(() => {
      if (phaseRef.current === 'listening') {
        toast('No response detected — ending session', 'warn')
        speak(
          "I notice you haven't responded. That's okay — let me save your progress. Come back when you're ready!",
          () => endSession(false)
        )
      }
    }, INACTIVITY_MS)
  }, [])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => {
    stopRecognition()
    if (_audioEl) { _audioEl.pause(); _audioEl = null }
    window.speechSynthesis?.cancel()
    clearTimeout(inactivityRef.current)
  }, [])

  // ── Speak wrapper ─────────────────────────────────────────────────────────
  const speak = (text, onEnd) => {
    setIsSpeaking(true)
    ariaSpeak(
      text, token,
      () => setIsSpeaking(true),
      () => { setIsSpeaking(false); onEnd?.() }
    )
  }

  // ── Speech recognition ────────────────────────────────────────────────────
  const stopRecognition = () => {
    try { recogRef.current?.stop() } catch {}
    recogRef.current = null
  }

  const startListening = async () => {
    setMicError('')

    // Check browser support
    const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SRClass) {
      setMicError('Speech recognition not supported in this browser. Use Type Mode.')
      setInputMode('type')
      return
    }

    // Request mic permission explicitly first
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setMicError('Microphone permission denied. Please allow mic access and try again.')
      return
    }

    // Stop any existing recognition
    stopRecognition()
    setTranscript('')
    transcriptRef.current = ''

    const recog = new SRClass()
    recog.continuous     = true
    recog.interimResults = true
    recog.lang           = 'en-IN'

    recog.onstart = () => {
      setIsListening(true)
      setMicError('')
    }

    recog.onresult = (e) => {
      let final = '', interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      const combined = (transcriptRef.current + ' ' + final).trim() + (interim ? ' ' + interim : '')
      setTranscript(combined.trim())
      transcriptRef.current = (transcriptRef.current + ' ' + final).trim()
      resetInactivity()
    }

    recog.onerror = (e) => {
      setIsListening(false)
      if (e.error === 'not-allowed') {
        setMicError('Microphone access denied. Please allow mic and refresh.')
      } else if (e.error === 'no-speech') {
        setMicError('No speech detected. Tap mic to try again.')
      } else {
        setMicError(`Mic error: ${e.error}. Tap to retry.`)
      }
    }

    recog.onend = () => {
      setIsListening(false)
      // Auto-restart if still in listening phase (continuous mode sometimes stops)
      if (phaseRef.current === 'listening' && recogRef.current === recog) {
        try { recog.start() } catch {}
      }
    }

    recog.start()
    recogRef.current = recog
    resetInactivity()
  }

  // ── Get AI feedback ───────────────────────────────────────────────────────
  const getAiFeedback = async (question, answer) => {
    try {
      const res = await fetch(API + '/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: answer || '(no response given)' }],
          system: `You are Aria, a warm caring female AI mentor. A student just answered: "${question}". Give a 1-2 sentence warm acknowledgement and one gentle, specific tip. Be emotionally supportive. Max 30 words total.`,
          max_tokens: 80,
        }),
      })
      const d = await res.json()
      return d.reply || ''
    } catch { return '' }
  }

  // ── Session flow ──────────────────────────────────────────────────────────
  const startSession = () => {
    setPhase('question')
    askQuestion(0)
  }

  const askQuestion = (idx) => {
    if (idx >= MAX_Q || idx >= questions.length) { endSession(false); return }
    setQIndex(idx)
    setTranscript(''); transcriptRef.current = ''
    setTypedAnswer('')
    setAiReply('')
    setMicError('')
    setPhase('question')

    speak(questions[idx], () => {
      setPhase('listening')
      resetInactivity()
      if (inputMode === 'voice') startListening()
    })
  }

  const submitAnswer = async () => {
    stopRecognition()
    clearTimeout(inactivityRef.current)

    const ans       = inputMode === 'voice' ? transcriptRef.current : typedAnswer
    const newAnswer = { question: questions[qIndex], answer: ans, timestamp: new Date().toISOString() }
    const newAll    = [...answersRef.current, newAnswer]
    setAnswers(newAll); answersRef.current = newAll

    setPhase('feedback')

    const feedback = await getAiFeedback(questions[qIndex], ans)
    if (feedback) {
      setAiReply(feedback)
      speak(feedback, () => goNext(newAll))
    } else {
      goNext(newAll)
    }
  }

  const goNext = (all) => {
    if (qIndex + 1 >= MAX_Q || qIndex + 1 >= questions.length) {
      endSession(false, all)
    } else {
      setTimeout(() => askQuestion(qIndex + 1), 300)
    }
  }

  const endSession = async (forced = false, finalAnswers) => {
    stopRecognition()
    if (_audioEl) { _audioEl.pause(); _audioEl = null }
    window.speechSynthesis?.cancel()
    clearTimeout(inactivityRef.current)
    setPhase('done')
    setSaving(true)

    const all        = finalAnswers ?? answersRef.current
    const incomplete = all.length < totalQ
    const penalty    = forced || (incomplete && all.length < 3)

    const farewell = all.length === 0
      ? "You didn't respond this time — and that's okay. Every session is a step forward. I believe in you!"
      : forced
      ? "We had to end early. Keep practicing — you're building resilience with every attempt!"
      : incomplete
      ? `You answered ${all.length} questions. Good effort — try to complete the full session next time!`
      : `Amazing work completing all ${all.length} questions! I'm genuinely proud of your dedication!`

    setAiReply(farewell)
    speak(farewell)

    // Honor: penalty if forced or incomplete (<3 answers)
    const overall = penalty
      ? Math.max(0, all.length * 5 - 10)           // deduct: low score triggers backend penalty
      : Math.min(100, 50 + all.length * 6)

    try {
      await voiceApi.save({
        answers:            all,
        tab_switches:       tabWarnRef.current,
        forced_end:         forced || incomplete,   // triggers backend early_session_exit if exchanges < 4
        department:         user?.department,
        questions_answered: all.length,
        summary:            forced ? `Forced end after ${all.length} questions.`
                          : incomplete ? `Incomplete: ${all.length}/${totalQ} answered.`
                          : `Completed all ${all.length} questions.`,
        transcript:         all.map(x => `Q: ${x.question}\nA: ${x.answer}`).join('\n\n'),
        scores:             {},
        overall,
        exchange_count:     all.length,
        mode:               'voice',
      })
    } catch (e) { console.error('save error', e) }
    finally { setSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.96)} }
        @keyframes ripple  { 0%{box-shadow:0 0 0 0 rgba(37,99,235,0.35)} 100%{box-shadow:0 0 0 18px rgba(37,99,235,0)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .mic-circle { transition: background 0.2s, box-shadow 0.2s; }
        .mic-circle:hover { filter: brightness(1.08); }
        .mic-circle:active { transform: scale(0.94); }
        textarea:focus { outline: none; border-color: #93C5FD !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.1) !important; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 560 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button onClick={() => nav('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 13 }}>
            <Icon name="arrow-left" size={15} color="#94A3B8" /> Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogoMark size={22} />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>Voice Session</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {tabWarnings > 0 && <Badge color="rose">{tabWarnings}/{MAX_W} warns</Badge>}
            {phase !== 'intro' && phase !== 'done' && (
              <Badge color="muted">{qIndex + 1}/{totalQ}</Badge>
            )}
          </div>
        </div>

        {/* ── Card ── */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 20, padding: 'clamp(24px,5vw,40px)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', animation: 'fadeUp 0.3s ease' }}>

          {/* ══ INTRO ══ */}
          {phase === 'intro' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'linear-gradient(135deg,#EFF6FF,#F0FDF4)', border: '2px solid #BFDBFE', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(37,99,235,0.12)' }}>
                <Icon name="mic" size={38} color="#2563EB" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Meet Aria</h2>
              <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, marginBottom: 6 }}>
                Your AI mentor will ask <strong style={{ color: '#0F172A' }}>{totalQ} questions</strong>, listen to your voice, and give warm personalised feedback after each one.
              </p>
              <p style={{ color: '#CBD5E1', fontSize: 12, marginBottom: 28 }}>
                Tab switches monitored — max {MAX_W} allowed. Incomplete sessions reduce your honor score.
              </p>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
                {[{ id: 'voice', icon: 'mic', label: 'Voice Mode' }, { id: 'type', icon: 'keyboard', label: 'Type Mode' }].map(m => (
                  <button key={m.id} onClick={() => setInputMode(m.id)} style={{
                    padding: '9px 20px', borderRadius: 8, cursor: 'pointer', border: 'none',
                    background: inputMode === m.id ? '#EFF6FF' : '#F8F9FC',
                    outline: `1.5px solid ${inputMode === m.id ? '#BFDBFE' : '#E2E8F0'}`,
                    color: inputMode === m.id ? '#1D4ED8' : '#94A3B8',
                    fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                  }}>
                    <Icon name={m.icon} size={13} color={inputMode === m.id ? '#2563EB' : '#94A3B8'} /> {m.label}
                  </button>
                ))}
              </div>

              <Btn onClick={startSession} size="lg" fullWidth>
                <Icon name="play" size={15} color="#fff" /> Start Session with Aria
              </Btn>
            </div>
          )}

          {/* ══ QUESTION / LISTENING / FEEDBACK ══ */}
          {(phase === 'question' || phase === 'listening' || phase === 'feedback') && (
            <div>
              {/* Progress */}
              <div style={{ height: 3, background: '#F1F4F9', borderRadius: 2, marginBottom: 22, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg,#2563EB,#059669)', width: `${progress}%`, transition: 'width 0.5s ease' }} />
              </div>

              {/* Status badges */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <Badge color="blue">Q{qIndex + 1} of {totalQ}</Badge>
                {phase === 'question' && isSpeaking  && <Badge color="teal">Aria speaking…</Badge>}
                {phase === 'listening' && !isListening && !isSpeaking && <Badge color="muted">Tap mic to start</Badge>}
                {phase === 'listening' && isListening  && <Badge color="blue">🔴 Listening…</Badge>}
                {phase === 'feedback'  && <Badge color="teal">Aria responding…</Badge>}
              </div>

              {/* Question text */}
              <p style={{ fontSize: 18, fontWeight: 600, color: '#0F172A', lineHeight: 1.5, marginBottom: 20 }}>
                <TypewriterText text={questions[qIndex]} speed={20} />
              </p>

              {/* Aria speaking waveform */}
              {isSpeaking && (
                <div style={{ marginBottom: 20, textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <Spectrogram active={false} speaking={true} />
                  </div>
                  <div style={{ fontSize: 12, color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C3AED', animation: 'pulse 1.2s infinite' }} />
                    Aria is speaking…
                  </div>
                </div>
              )}

              {/* Aria feedback bubble */}
              {aiReply && !isSpeaking && phase === 'feedback' && (
                <div style={{ marginBottom: 18, padding: '14px 16px', background: '#EFF6FF', borderRadius: 12, border: '1px solid #BFDBFE', animation: 'fadeUp 0.3s ease' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2563EB', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aria</div>
                  <p style={{ margin: 0, fontSize: 14, color: '#1D4ED8', lineHeight: 1.6 }}>
                    <TypewriterText text={aiReply} speed={16} />
                  </p>
                </div>
              )}

              {/* ── Listening UI ── */}
              {phase === 'listening' && !isSpeaking && (
                <div>
                  {inputMode === 'voice' ? (
                    <div style={{ textAlign: 'center' }}>
                      {/* Waveform */}
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                        <Spectrogram active={isListening} speaking={false} />
                      </div>

                      {/* Transcript box */}
                      <div style={{ background: '#F8F9FC', borderRadius: 10, padding: '12px 16px', marginBottom: 18, minHeight: 72, textAlign: 'left', border: `1px solid ${isListening ? '#BFDBFE' : '#F1F4F9'}`, transition: 'border-color 0.2s' }}>
                        <p style={{ margin: 0, color: transcript ? '#0F172A' : '#CBD5E1', fontSize: 14, lineHeight: 1.6, fontStyle: transcript ? 'normal' : 'italic' }}>
                          {transcript || (isListening ? 'Listening… speak now' : 'Tap the mic button below to start recording')}
                        </p>
                      </div>

                      {/* Error message */}
                      {micError && (
                        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>
                          {micError}
                        </div>
                      )}

                      {/* BIG MIC BUTTON — this is the main interaction */}
                      <div style={{ marginBottom: 20 }}>
                        <button
                          className="mic-circle"
                          onClick={startListening}
                          style={{
                            width: 76, height: 76, borderRadius: '50%', border: 'none', cursor: 'pointer',
                            background: isListening
                              ? 'linear-gradient(135deg,#DC2626,#B91C1C)'
                              : 'linear-gradient(135deg,#2563EB,#1D4ED8)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto',
                            boxShadow: isListening
                              ? '0 0 0 8px rgba(220,38,38,0.15), 0 4px 20px rgba(220,38,38,0.4)'
                              : '0 4px 20px rgba(37,99,235,0.35)',
                            animation: isListening ? 'ripple 1.5s infinite' : 'none',
                          }}
                        >
                          <Icon name="mic" size={30} color="#fff" />
                        </button>
                        <div style={{ fontSize: 12, color: isListening ? '#2563EB' : '#94A3B8', marginTop: 10, fontWeight: isListening ? 600 : 400 }}>
                          {isListening ? '● Recording — tap to restart' : 'Tap to start recording'}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                        <Btn onClick={startListening} variant="secondary" size="sm">
                          <Icon name="refresh-cw" size={13} color="#64748B" /> Re-record
                        </Btn>
                        <Btn
                          onClick={submitAnswer}
                          style={{ opacity: !transcript.trim() ? 0.5 : 1 }}
                        >
                          <Icon name="arrow-right" size={13} color="#fff" />
                          {transcript.trim() ? 'Submit & Next' : 'Skip Question'}
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    /* Type mode */
                    <div>
                      <textarea
                        value={typedAnswer}
                        onChange={e => setTypedAnswer(e.target.value)}
                        placeholder="Type your answer here…"
                        rows={5}
                        autoFocus
                        style={{
                          width: '100%', padding: '12px 14px', background: '#F8F9FC',
                          border: '1px solid #E2E8F0', borderRadius: 10, color: '#0F172A',
                          fontSize: 14, lineHeight: 1.6, fontFamily: 'Inter, sans-serif',
                          resize: 'vertical', marginBottom: 14, transition: 'all 0.2s',
                        }}
                      />
                      <Btn onClick={submitAnswer} fullWidth>
                        <Icon name="arrow-right" size={13} color="#fff" />
                        {typedAnswer.trim() ? 'Submit & Next' : 'Skip Question'}
                      </Btn>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══ DONE ══ */}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: answers.length >= totalQ ? '#ECFDF5' : '#FEF3C7', border: `2px solid ${answers.length >= totalQ ? '#A7F3D0' : '#FDE68A'}`, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={answers.length >= totalQ ? 'check-circle' : 'alert-circle'} size={36} color={answers.length >= totalQ ? '#059669' : '#D97706'} />
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                {answers.length >= totalQ ? 'Session Complete! 🎉' : answers.length === 0 ? 'Session Saved' : `${answers.length}/${totalQ} Answered`}
              </h2>

              {answers.length < totalQ && answers.length > 0 && (
                <div style={{ margin: '0 auto 16px', padding: '10px 14px', background: '#FEF3C7', borderRadius: 10, border: '1px solid #FDE68A', maxWidth: 380, fontSize: 13, color: '#92400E' }}>
                  ⚠️ Incomplete sessions reduce your Honor Score. Try to complete all {totalQ} questions next time.
                </div>
              )}

              {aiReply && (
                <div style={{ margin: '0 auto 18px', padding: '14px 18px', background: '#EFF6FF', borderRadius: 12, border: '1px solid #BFDBFE', maxWidth: 420, textAlign: 'left' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2563EB', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aria</div>
                  <p style={{ margin: 0, fontSize: 14, color: '#1D4ED8', lineHeight: 1.6 }}>
                    <TypewriterText text={aiReply} speed={18} />
                  </p>
                </div>
              )}

              <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 4 }}>
                {answers.length > 0 ? <>Answered <strong style={{ color: '#0F172A' }}>{answers.length}</strong> of {totalQ} questions</> : 'No responses recorded.'}
              </p>
              <p style={{ color: '#CBD5E1', fontSize: 12, marginBottom: 26 }}>
                {saving ? 'Saving to your profile…' : '✓ Saved to your profile'}
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <Btn variant="secondary" onClick={() => { setPhase('intro'); setQIndex(0); setAnswers([]); answersRef.current = []; setAiReply('') }}>
                  <Icon name="refresh-cw" size={13} color="#64748B" /> New Session
                </Btn>
                <Btn onClick={() => nav('/dashboard')}>
                  <Icon name="layout-dashboard" size={13} color="#fff" /> Dashboard
                </Btn>
              </div>
            </div>
          )}
        </div>

        {/* End early link */}
        {(phase === 'listening' || phase === 'question') && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button onClick={() => endSession(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: 12 }}>
              End session early
            </button>
          </div>
        )}
      </div>
    </div>
  )
}