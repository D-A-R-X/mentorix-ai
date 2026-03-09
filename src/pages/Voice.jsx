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
    const t = setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(t)
    }, speed)
    return () => clearInterval(t)
  }, [text])
  return <span>{shown}</span>
}

// ── ElevenLabs TTS (with browser fallback) ────────────────────────────────────
let currentAudio = null

async function ariaSpeak(text, token, onStart, onEnd) {
  // Stop any current audio
  if (currentAudio) { currentAudio.pause(); currentAudio = null }
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
    if (!res.ok) throw new Error('TTS unavailable')
    const blob  = await res.blob()
    const url   = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; onEnd?.() }
    audio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; onEnd?.() }
    await audio.play()
  } catch {
    // Browser TTS fallback
    if (!('speechSynthesis' in window)) { onEnd?.(); return }
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.88; u.pitch = 1.15; u.volume = 1
    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices()
      const names  = ['Google UK English Female', 'Microsoft Zira', 'Samantha', 'Karen', 'Moira', 'Tessa']
      let v = names.map(n => voices.find(x => x.name === n)).find(Boolean)
      if (!v) v = voices.find(x => x.lang.startsWith('en') && x.name.toLowerCase().includes('female'))
      if (!v) v = voices.find(x => x.lang.startsWith('en'))
      if (v) u.voice = v
      u.onend = onEnd; u.onerror = onEnd
      window.speechSynthesis.speak(u)
    }
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = trySpeak
    } else { trySpeak() }
  }
}

// ── Spectrogram ───────────────────────────────────────────────────────────────
function Spectrogram({ active, speaking }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)
  const barsRef   = useRef(Array(32).fill(0.05))

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, bars = 32
    function draw() {
      ctx.clearRect(0, 0, W, H)
      barsRef.current = barsRef.current.map(p => {
        const target = (active || speaking) ? Math.random() * 0.75 + 0.1 : 0.05
        return p + (target - p) * 0.3
      })
      for (let i = 0; i < bars; i++) {
        const h = barsRef.current[i] * H, x = (W / bars) * i + 2, bw = W / bars - 4
        const col = speaking
          ? ['rgba(124,77,255,0.9)', 'rgba(124,77,255,0.3)']
          : ['rgba(37,99,235,0.9)',  'rgba(5,150,105,0.5)']
        const grad = ctx.createLinearGradient(0, H - h, 0, H)
        grad.addColorStop(0, col[0]); grad.addColorStop(1, col[1])
        ctx.fillStyle = grad; ctx.beginPath()
        ctx.roundRect(x, H - h, bw, h, 3); ctx.fill()
      }
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [active, speaking])

  return <canvas ref={canvasRef} width={320} height={80}
    style={{ borderRadius: 8, background: 'rgba(0,0,0,0.02)' }} />
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Voice() {
  const { user }  = useAuth()
  const nav       = useNavigate()
  const toast     = useToast()
  const token     = localStorage.getItem('mentorix_token') || ''

  const [phase,       setPhase]       = useState('intro')
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

  const recogRef      = useRef(null)
  const inactivityRef = useRef(null)
  const answersRef    = useRef([])
  const tabWarnRef    = useRef(0)
  const phaseRef      = useRef('intro')

  const dept      = user?.department || user?.dept || 'default'
  const questions = QUESTIONS_BY_DEPT[dept] || QUESTIONS_BY_DEPT.default
  const progress  = ((qIndex + 1) / Math.min(MAX_Q, questions.length)) * 100

  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { tabWarnRef.current = tabWarnings }, [tabWarnings])
  useEffect(() => { phaseRef.current = phase }, [phase])

  // Tab switch detection
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && (phaseRef.current === 'listening' || phaseRef.current === 'question')) {
        const w = tabWarnRef.current + 1
        setTabWarnings(w); tabWarnRef.current = w
        if (w >= MAX_W) { toast(`Session ended: ${MAX_W} tab violations`, 'error'); endSession(true) }
        else toast(`Warning ${w}/${MAX_W}: stay on this tab`, 'warn')
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Abandon detection
  useEffect(() => {
    const onUnload = () => {
      const a = answersRef.current
      if ((phaseRef.current === 'listening' || phaseRef.current === 'question') && a.length > 0) {
        voiceApi.save({
          answers: a, tab_switches: tabWarnRef.current, forced_end: true,
          department: user?.department, questions_answered: a.length,
          summary: 'Session abandoned.', transcript: a.map(x => x.answer).join('\n'),
          scores: {}, overall: 0, exchange_count: a.length, mode: 'voice',
        }).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // Inactivity timer
  const resetInactivity = useCallback(() => {
    clearTimeout(inactivityRef.current)
    inactivityRef.current = setTimeout(() => {
      if (phaseRef.current === 'listening') {
        toast("No response detected — wrapping up session", 'warn')
        speak("I notice you haven't responded, and that's perfectly okay. Let me save your progress for now. Come back whenever you're ready — I'll be here!", () => endSession(false))
      }
    }, INACTIVITY_MS)
  }, [])

  useEffect(() => () => {
    recogRef.current?.stop()
    window.speechSynthesis?.cancel()
    if (currentAudio) { currentAudio.pause(); currentAudio = null }
    clearTimeout(inactivityRef.current)
  }, [])

  // Wrapper to set speaking state
  const speak = (text, onEnd) => {
    setIsSpeaking(true)
    ariaSpeak(text, token,
      () => setIsSpeaking(true),
      () => { setIsSpeaking(false); onEnd?.() }
    )
  }

  // Get AI feedback from backend
  const getAiFeedback = async (question, answer) => {
    try {
      const res = await fetch(API + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          messages: [{ role: 'user', content: answer || '(no response given)' }],
          system: `You are Aria, a warm, caring female AI mentor. A student just answered this interview question: "${question}". Write a 1-2 sentence warm acknowledgement with one gentle tip. Be empathetic, encouraging, emotionally supportive. Max 35 words.`,
          max_tokens: 80,
        }),
      })
      const d = await res.json()
      return d.reply || ''
    } catch { return '' }
  }

  const startSession = () => { setPhase('question'); askQuestion(0) }

  const askQuestion = (idx) => {
    if (idx >= MAX_Q || idx >= questions.length) { endSession(false); return }
    setQIndex(idx); setTranscript(''); setTypedAnswer(''); setAiReply('')
    setPhase('question')
    speak(questions[idx], () => {
      setPhase('listening')
      resetInactivity()
      if (inputMode === 'voice') startListening()
    })
  }

  const startListening = () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setInputMode('type'); return
    }
    recogRef.current?.stop()
    const SR    = window.SpeechRecognition || window.webkitSpeechRecognition
    const recog = new SR()
    recog.continuous = true; recog.interimResults = true; recog.lang = 'en-IN'
    recog.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(' ')
      setTranscript(t); resetInactivity()
    }
    recog.onend = () => setIsListening(false)
    recog.start(); recogRef.current = recog; setIsListening(true)
  }

  const stopAndNext = async () => {
    recogRef.current?.stop(); clearTimeout(inactivityRef.current)
    const ans        = inputMode === 'voice' ? transcript : typedAnswer
    const newAnswer  = { question: questions[qIndex], answer: ans, timestamp: new Date().toISOString() }
    const newAnswers = [...answersRef.current, newAnswer]
    setAnswers(newAnswers); answersRef.current = newAnswers

    const feedback = await getAiFeedback(questions[qIndex], ans)
    if (feedback) {
      setAiReply(feedback)
      speak(feedback, () => {
        if (qIndex + 1 >= MAX_Q || qIndex + 1 >= questions.length) endSession(false, newAnswers)
        else setTimeout(() => askQuestion(qIndex + 1), 300)
      })
    } else {
      if (qIndex + 1 >= MAX_Q || qIndex + 1 >= questions.length) endSession(false, newAnswers)
      else setTimeout(() => askQuestion(qIndex + 1), 300)
    }
  }

  const endSession = async (forced = false, finalAnswers) => {
    recogRef.current?.stop()
    if (currentAudio) { currentAudio.pause(); currentAudio = null }
    window.speechSynthesis?.cancel()
    clearTimeout(inactivityRef.current)
    setPhase('done'); setSaving(true)

    const allAnswers = finalAnswers || answersRef.current
    const farewell = allAnswers.length === 0
      ? "You didn't respond this time, and that's completely okay. Every attempt is growth. I'm rooting for you — come back when you're ready!"
      : forced
      ? "We had to end early, but every session counts. Keep practicing — you're building something real!"
      : `Amazing effort! You answered ${allAnswers.length} questions today. I'm genuinely proud of your dedication!`

    setAiReply(farewell)
    speak(farewell)

    try {
      await voiceApi.save({
        answers: allAnswers, tab_switches: tabWarnRef.current, forced_end: forced,
        department: user?.department, questions_answered: allAnswers.length,
        summary: forced ? 'Session ended early.' : `Completed ${allAnswers.length} questions.`,
        transcript: allAnswers.map(x => `Q: ${x.question}\nA: ${x.answer}`).join('\n\n'),
        scores: {}, overall: allAnswers.length === 0 ? 0 : Math.max(0, 50 + allAnswers.length * 6 - tabWarnRef.current * 3),
        exchange_count: allAnswers.length, mode: 'voice',
      })
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .mic-btn:hover { transform: scale(1.07) !important; }
        .mic-btn:active { transform: scale(0.94) !important; }
        textarea:focus { outline: none; border-color: #93C5FD !important; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 580 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button onClick={() => nav('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 13 }}>
            <Icon name="arrow-left" size={15} color="#94A3B8" /> Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogoMark size={22} />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>Voice Session</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {tabWarnings > 0 && <Badge color="rose">{tabWarnings}/{MAX_W}</Badge>}
            <Badge color="muted">{qIndex + 1}/{Math.min(MAX_Q, questions.length)}</Badge>
          </div>
        </div>

        {/* Main card */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 'clamp(24px,5vw,40px)', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', animation: 'fadeUp 0.3s ease' }}>

          {/* INTRO */}
          {phase === 'intro' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'linear-gradient(135deg,#EFF6FF,#ECFDF5)', border: '1.5px solid #BFDBFE', margin: '0 auto 22px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(37,99,235,0.1)' }}>
                <Icon name="mic" size={36} color="#2563EB" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Meet Aria</h2>
              <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, marginBottom: 6 }}>
                Your AI mentor will ask <strong style={{ color: '#0F172A' }}>{Math.min(MAX_Q, questions.length)} questions</strong>, listen carefully, and give you warm personalised feedback after each answer.
              </p>
              <p style={{ color: '#CBD5E1', fontSize: 12, marginBottom: 28 }}>Tab switches monitored — max {MAX_W} allowed.</p>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
                {[{ id: 'voice', icon: 'mic', label: 'Voice Mode' }, { id: 'type', icon: 'keyboard', label: 'Type Mode' }].map(m => (
                  <button key={m.id} onClick={() => setInputMode(m.id)} style={{
                    padding: '9px 18px', borderRadius: 8, cursor: 'pointer', border: 'none',
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

          {/* QUESTION / LISTENING */}
          {(phase === 'question' || phase === 'listening') && (
            <div>
              {/* Progress bar */}
              <div style={{ height: 3, background: '#F1F4F9', borderRadius: 2, marginBottom: 22, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg,#2563EB,#059669)', width: `${progress}%`, transition: 'width 0.5s ease' }} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <Badge color="blue">Q{qIndex + 1}</Badge>
                <Badge color="muted">{inputMode === 'voice' ? 'Voice' : 'Type'} mode</Badge>
                {isSpeaking  && <Badge color="teal">Aria speaking…</Badge>}
                {isListening && !isSpeaking && <Badge color="blue">Listening…</Badge>}
              </div>

              <p style={{ fontSize: 18, fontWeight: 600, color: '#0F172A', lineHeight: 1.5, marginBottom: 18 }}>
                <TypewriterText text={questions[qIndex]} speed={20} />
              </p>

              {/* Aria speaking waveform */}
              {isSpeaking && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <Spectrogram active={false} speaking={true} />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C3AED', animation: 'pulse 1.2s infinite' }} />
                    Aria is speaking…
                  </div>
                </div>
              )}

              {/* Aria feedback bubble */}
              {aiReply && !isSpeaking && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#EFF6FF', borderRadius: 10, border: '1px solid #BFDBFE', animation: 'fadeUp 0.3s ease' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2563EB', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aria</div>
                  <p style={{ margin: 0, fontSize: 13, color: '#1D4ED8', lineHeight: 1.6 }}>
                    <TypewriterText text={aiReply} speed={16} />
                  </p>
                </div>
              )}

              {/* Listening UI */}
              {phase === 'listening' && !isSpeaking && (
                <div>
                  {inputMode === 'voice' ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
                        <Spectrogram active={isListening} speaking={false} />
                      </div>

                      {/* Transcript */}
                      <div style={{ background: '#F8F9FC', borderRadius: 10, padding: '12px 16px', marginBottom: 16, minHeight: 64, textAlign: 'left', border: '1px solid #F1F4F9' }}>
                        <p style={{ margin: 0, color: transcript ? '#0F172A' : '#CBD5E1', fontSize: 14, lineHeight: 1.6, fontStyle: transcript ? 'normal' : 'italic' }}>
                          {transcript || 'Listening… speak your answer'}
                        </p>
                      </div>

                      {/* Big mic button */}
                      <div style={{ marginBottom: 16 }}>
                        <button className="mic-btn" onClick={startListening} style={{
                          width: 70, height: 70, borderRadius: '50%', border: 'none', cursor: 'pointer',
                          background: isListening ? '#DC2626' : '#2563EB',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                          boxShadow: `0 4px 22px ${isListening ? 'rgba(220,38,38,0.35)' : 'rgba(37,99,235,0.3)'}`,
                          transition: 'all 0.2s',
                        }}>
                          <Icon name="mic" size={28} color="#fff" />
                        </button>
                        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 8, animation: isListening ? 'pulse 1.5s infinite' : 'none' }}>
                          {isListening ? 'Recording — tap to restart' : 'Tap to start recording'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                        <Btn onClick={startListening} variant="secondary" size="sm">
                          <Icon name="refresh-cw" size={13} color="#64748B" /> Re-record
                        </Btn>
                        <Btn onClick={stopAndNext}>
                          <Icon name="arrow-right" size={13} color="#fff" /> Next
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <textarea value={typedAnswer} onChange={e => setTypedAnswer(e.target.value)}
                        placeholder="Type your answer here…" rows={5} style={{
                          width: '100%', padding: '12px 14px', background: '#F8F9FC',
                          border: '1px solid #E2E8F0', borderRadius: 10, color: '#0F172A',
                          fontSize: 14, lineHeight: 1.6, fontFamily: 'Inter, sans-serif',
                          resize: 'vertical', marginBottom: 14,
                        }} />
                      <Btn onClick={stopAndNext} disabled={!typedAnswer.trim()} fullWidth>
                        <Icon name="arrow-right" size={13} color="#fff" /> Next Question
                      </Btn>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* DONE */}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#ECFDF5', border: '1px solid #A7F3D0', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check-circle" size={34} color="#059669" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                {answers.length === 0 ? 'Session Saved' : 'Session Complete!'}
              </h2>
              {aiReply && (
                <div style={{ margin: '0 auto 18px', padding: '14px 18px', background: '#EFF6FF', borderRadius: 12, border: '1px solid #BFDBFE', maxWidth: 420, textAlign: 'left', animation: 'fadeUp 0.3s ease' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2563EB', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aria</div>
                  <p style={{ margin: 0, fontSize: 14, color: '#1D4ED8', lineHeight: 1.6 }}>
                    <TypewriterText text={aiReply} speed={18} />
                  </p>
                </div>
              )}
              <p style={{ color: '#64748B', fontSize: 14, marginBottom: 4 }}>
                {answers.length > 0
                  ? <>You answered <strong style={{ color: '#0F172A' }}>{answers.length} questions</strong></>
                  : 'No responses recorded this time.'}
              </p>
              <p style={{ color: '#CBD5E1', fontSize: 12, marginBottom: 26 }}>
                {saving ? 'Saving to your profile…' : '✓ Saved to your profile'}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <Btn variant="secondary" onClick={() => { setPhase('intro'); setQIndex(0); setAnswers([]); setAiReply('') }}>
                  <Icon name="refresh-cw" size={13} color="#64748B" /> New Session
                </Btn>
                <Btn onClick={() => nav('/dashboard')}>
                  <Icon name="layout-dashboard" size={13} color="#fff" /> Dashboard
                </Btn>
              </div>
            </div>
          )}
        </div>

        {/* End early */}
        {(phase === 'listening' || phase === 'question') && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={() => endSession(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: 12 }}>
              End session early
            </button>
          </div>
        )}
      </div>
    </div>
  )
}