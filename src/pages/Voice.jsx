import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoMark, Btn, Icon, Badge, useToast } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth'
import { voiceApi } from '../lib/api'

const MAX_W = 3
const MAX_Q = 8
const INACTIVITY_MS = 45000 // 45s no speech → auto-end

const QUESTIONS_BY_DEPT = {
  CSE:  ["Explain a data structure you've used in a project and why you chose it.",
         "What's the difference between process and thread? Give a real example.",
         "Walk me through how you'd design a URL shortener.",
         "What is time complexity? Analyse a sorting algorithm you know.",
         "Describe a bug you fixed that took the longest — what was the root cause?",
         "What is REST? How does it differ from GraphQL?",
         "Explain OOP with a real-world analogy.",
         "Where do you see AI fitting into software development in 5 years?"],
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

// ── Typewriter effect ──────────────────────────────────────────────────────────
function TypewriterText({ text, speed = 28, style: sx }) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    setDisplayed('')
    if (!text) return
    let i = 0
    const t = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(t)
    }, speed)
    return () => clearInterval(t)
  }, [text, speed])
  return <span style={sx}>{displayed}</span>
}

// ── Female voice TTS ──────────────────────────────────────────────────────────
function speak(text, onEnd, onStart) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return }
  window.speechSynthesis.cancel()

  const trySpeak = () => {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.88
    u.pitch = 1.15
    u.volume = 1

    // Pick best female voice
    const voices = window.speechSynthesis.getVoices()
    const preferred = [
      'Google UK English Female',
      'Microsoft Zira',
      'Microsoft Hazel',
      'Samantha',
      'Karen',
      'Moira',
      'Tessa',
    ]
    let chosen = null
    for (const name of preferred) {
      chosen = voices.find(v => v.name === name)
      if (chosen) break
    }
    if (!chosen) {
      chosen = voices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.toLowerCase().includes('female') ||
         v.name.toLowerCase().includes('woman') ||
         ['zira','hazel','samantha','karen','moira','tessa','victoria','allison'].some(n => v.name.toLowerCase().includes(n)))
      )
    }
    if (!chosen) chosen = voices.find(v => v.lang.startsWith('en'))
    if (chosen) u.voice = chosen

    u.onstart = onStart
    u.onend = onEnd
    u.onerror = onEnd
    window.speechSynthesis.speak(u)
  }

  // Voices may not be loaded yet
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = trySpeak
  } else {
    trySpeak()
  }
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
    const W = canvas.width, H = canvas.height
    const bars = 32

    function draw() {
      ctx.clearRect(0, 0, W, H)
      barsRef.current = barsRef.current.map(prev => {
        const target = (active || speaking) ? Math.random() * 0.75 + 0.1 : 0.05
        return prev + (target - prev) * 0.3
      })
      for (let i = 0; i < bars; i++) {
        const h   = barsRef.current[i] * H
        const x   = (W / bars) * i + 2
        const bw  = W / bars - 4
        const col = speaking ? ['rgba(124,77,255,0.9)', 'rgba(124,77,255,0.3)']
                             : ['rgba(37,99,235,0.9)',  'rgba(5,150,105,0.5)']
        const grad = ctx.createLinearGradient(0, H - h, 0, H)
        grad.addColorStop(0, col[0])
        grad.addColorStop(1, col[1])
        ctx.fillStyle = grad
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
    <canvas ref={canvasRef} width={320} height={80}
      style={{ borderRadius: 8, background: 'rgba(0,0,0,0.02)' }} />
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Voice() {
  const { user }  = useAuth()
  const nav       = useNavigate()
  const toast     = useToast()

  const [phase,        setPhase]        = useState('intro')
  const [qIndex,       setQIndex]       = useState(0)
  const [answers,      setAnswers]      = useState([])
  const [transcript,   setTranscript]   = useState('')
  const [inputMode,    setInputMode]    = useState('voice')
  const [typedAnswer,  setTypedAnswer]  = useState('')
  const [tabWarnings,  setTabWarnings]  = useState(0)
  const [saving,       setSaving]       = useState(false)
  const [aiReply,      setAiReply]      = useState('')   // AI feedback text
  const [isSpeaking,   setIsSpeaking]   = useState(false)
  const [isListening,  setIsListening]  = useState(false)

  const recogRef      = useRef(null)
  const inactivityRef = useRef(null)
  const answersRef    = useRef([])  // always current for endSession
  const tabWarnRef    = useRef(0)
  const phaseRef      = useRef('intro')

  const dept      = user?.department || user?.dept || 'default'
  const questions = QUESTIONS_BY_DEPT[dept] || QUESTIONS_BY_DEPT.default
  const progress  = ((qIndex + 1) / Math.min(MAX_Q, questions.length)) * 100

  // Keep refs in sync
  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { tabWarnRef.current = tabWarnings }, [tabWarnings])
  useEffect(() => { phaseRef.current = phase }, [phase])

  // ── Tab switch detection ──────────────────────────────────────────────────
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && (phaseRef.current === 'listening' || phaseRef.current === 'question')) {
        const w = tabWarnRef.current + 1
        setTabWarnings(w)
        tabWarnRef.current = w
        if (w >= MAX_W) {
          toast(`Session ended: ${MAX_W} tab violations`, 'error')
          endSession(true)
        } else {
          toast(`Warning ${w}/${MAX_W}: stay on this tab`, 'warn')
        }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ── Abandon detection (user closes/navigates away mid-session) ────────────
  useEffect(() => {
    const onUnload = () => {
      if (phaseRef.current === 'listening' || phaseRef.current === 'question') {
        // Save abandoned session silently
        const a = answersRef.current
        if (a.length > 0) {
          voiceApi.save({
            answers: a, tab_switches: tabWarnRef.current,
            forced_end: true, department: user?.department,
            questions_answered: a.length,
            summary: 'Session abandoned by user.',
            transcript: a.map(x => x.answer).join('\n'),
            scores: {}, overall: 0, exchange_count: a.length,
          }).catch(() => {})
        }
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // ── Inactivity timer ──────────────────────────────────────────────────────
  const resetInactivity = useCallback(() => {
    clearTimeout(inactivityRef.current)
    inactivityRef.current = setTimeout(() => {
      if (phaseRef.current === 'listening') {
        toast('No response detected — ending session', 'warn')
        speak(
          "I notice you haven't responded. That's okay — I'll save your session now. Keep practicing and come back when you're ready!",
          () => endSession(false),
          null
        )
      }
    }, INACTIVITY_MS)
  }, [])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    recogRef.current?.stop()
    window.speechSynthesis?.cancel()
    clearTimeout(inactivityRef.current)
  }, [])

  // ── Ask AI for a follow-up response (via backend /chat) ───────────────────
  const getAiFeedback = async (question, answer) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mentorix_token')}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: answer || '(no response given)' }],
          system: `You are a warm, encouraging female AI mentor named Aria. A student just answered this question: "${question}". Give a brief 1-2 sentence warm acknowledgement and a gentle tip. Be empathetic, positive, and conversational. Never be harsh.`,
          max_tokens: 120,
        }),
      })
      const data = await res.json()
      return data.reply || data.content || data.text || ''
    } catch { return '' }
  }

  // ── Start session ─────────────────────────────────────────────────────────
  const startSession = () => {
    setPhase('question')
    askQuestion(0)
  }

  // ── Ask question with TTS ─────────────────────────────────────────────────
  const askQuestion = (idx) => {
    if (idx >= MAX_Q || idx >= questions.length) { endSession(false); return }
    setQIndex(idx)
    setTranscript('')
    setTypedAnswer('')
    setAiReply('')
    setPhase('question')
    setIsSpeaking(true)

    speak(
      questions[idx],
      () => { setIsSpeaking(false); setPhase('listening'); resetInactivity(); startListening() },
      () => setIsSpeaking(true)
    )
  }

  // ── Start speech recognition ──────────────────────────────────────────────
  const startListening = () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setInputMode('type'); return
    }
    recogRef.current?.stop()
    const SR   = window.SpeechRecognition || window.webkitSpeechRecognition
    const recog = new SR()
    recog.continuous    = true
    recog.interimResults = true
    recog.lang          = 'en-IN'
    recog.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(' ')
      setTranscript(t)
      resetInactivity()
    }
    recog.onend = () => setIsListening(false)
    recog.start()
    recogRef.current = recog
    setIsListening(true)
  }

  // ── Next question ─────────────────────────────────────────────────────────
  const stopAndNext = async () => {
    recogRef.current?.stop()
    clearTimeout(inactivityRef.current)
    const ans = inputMode === 'voice' ? transcript : typedAnswer
    const newAnswer = { question: questions[qIndex], answer: ans, timestamp: new Date().toISOString() }
    const newAnswers = [...answersRef.current, newAnswer]
    setAnswers(newAnswers)
    answersRef.current = newAnswers

    // Get AI feedback and speak it
    const feedback = await getAiFeedback(questions[qIndex], ans)
    if (feedback) {
      setAiReply(feedback)
      setIsSpeaking(true)
      speak(feedback, () => {
        setIsSpeaking(false)
        if (qIndex + 1 >= MAX_Q || qIndex + 1 >= questions.length) {
          endSession(false, newAnswers)
        } else {
          setTimeout(() => askQuestion(qIndex + 1), 400)
        }
      })
    } else {
      if (qIndex + 1 >= MAX_Q || qIndex + 1 >= questions.length) {
        endSession(false, newAnswers)
      } else {
        setTimeout(() => askQuestion(qIndex + 1), 400)
      }
    }
  }

  // ── End session ───────────────────────────────────────────────────────────
  const endSession = async (forced = false, finalAnswers) => {
    recogRef.current?.stop()
    window.speechSynthesis?.cancel()
    clearTimeout(inactivityRef.current)
    setPhase('done')
    setSaving(true)

    const allAnswers = finalAnswers || answersRef.current
    const farewell = allAnswers.length === 0
      ? "You didn't respond this time — that's okay. Come back when you're ready. I believe in you!"
      : forced
      ? "Session ended early. Keep practicing — every attempt makes you stronger!"
      : `Wonderful session! You answered ${allAnswers.length} questions brilliantly. Keep up the great work!`

    setAiReply(farewell)
    speak(farewell)

    try {
      await voiceApi.save({
        answers: allAnswers,
        tab_switches: tabWarnRef.current,
        forced_end: forced,
        department: user?.department,
        questions_answered: allAnswers.length,
        summary: forced ? 'Session ended early.' : `Completed ${allAnswers.length} questions.`,
        transcript: allAnswers.map(x => `Q: ${x.question}\nA: ${x.answer}`).join('\n\n'),
        scores: {},
        overall: allAnswers.length === 0 ? 0 : Math.max(0, 50 + allAnswers.length * 6 - tabWarnRef.current * 3),
        exchange_count: allAnswers.length,
        mode: 'voice',
      })
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        textarea:focus { outline: none; border-color: #93C5FD !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.08) !important; }
        .mic-btn { transition: all 0.2s; }
        .mic-btn:hover { transform: scale(1.04); box-shadow: 0 4px 20px rgba(37,99,235,0.2) !important; }
        .mic-btn:active { transform: scale(0.97); }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 580 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
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

        {/* Card */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 'clamp(24px,5vw,40px)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', animation: 'fadeIn 0.3s ease' }}>

          {/* INTRO */}
          {phase === 'intro' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#EFF6FF', border: '1px solid #BFDBFE', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="mic" size={36} color="#2563EB" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Ready to begin?</h2>
              <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, marginBottom: 6 }}>
                Your AI mentor <strong style={{ color: '#2563EB' }}>Aria</strong> will ask you{' '}
                <strong style={{ color: '#0F172A' }}>{Math.min(MAX_Q, questions.length)} questions</strong>.
                She'll speak each question and listen to your answer.
              </p>
              <p style={{ color: '#CBD5E1', fontSize: 12, marginBottom: 28 }}>
                Max {MAX_W} tab switches allowed before session ends.
              </p>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
                {[{ id: 'voice', icon: 'mic', label: 'Voice Mode' }, { id: 'type', icon: 'keyboard', label: 'Type Mode' }].map(m => (
                  <button key={m.id} onClick={() => setInputMode(m.id)} style={{
                    padding: '9px 18px', borderRadius: 8, cursor: 'pointer', border: 'none',
                    background: inputMode === m.id ? '#EFF6FF' : '#F8F9FC',
                    outline: `1.5px solid ${inputMode === m.id ? '#BFDBFE' : '#E2E8F0'}`,
                    color: inputMode === m.id ? '#1D4ED8' : '#94A3B8',
                    fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}>
                    <Icon name={m.icon} size={13} color={inputMode === m.id ? '#2563EB' : '#94A3B8'} />
                    {m.label}
                  </button>
                ))}
              </div>

              <Btn onClick={startSession} size="lg" fullWidth>
                <Icon name="play" size={15} color="#fff" /> Start Session with Aria
              </Btn>
            </div>
          )}

          {/* QUESTION + LISTENING */}
          {(phase === 'question' || phase === 'listening') && (
            <div>
              {/* Progress */}
              <div style={{ height: 3, background: '#F1F4F9', borderRadius: 2, marginBottom: 24, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg,#2563EB,#059669)', width: `${progress}%`, transition: 'width 0.5s ease' }} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <Badge color="blue">Q{qIndex + 1}</Badge>
                <Badge color="muted">{inputMode === 'voice' ? 'Voice' : 'Type'} mode</Badge>
                {isSpeaking && <Badge color="teal">Aria speaking…</Badge>}
              </div>

              {/* Question text with typewriter */}
              <p style={{ fontSize: 18, fontWeight: 600, color: '#0F172A', lineHeight: 1.5, marginBottom: 20 }}>
                <TypewriterText text={questions[qIndex]} speed={22} />
              </p>

              {/* AI speaking indicator */}
              {isSpeaking && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                    <Spectrogram active={false} speaking={true} />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', animation: 'pulse 1.5s infinite' }}>
                    Aria is speaking…
                  </div>
                </div>
              )}

              {/* AI feedback reply */}
              {aiReply && !isSpeaking && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#EFF6FF', borderRadius: 10, border: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2563EB', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aria</div>
                  <p style={{ margin: 0, fontSize: 13, color: '#1D4ED8', lineHeight: 1.6 }}>
                    <TypewriterText text={aiReply} speed={18} />
                  </p>
                </div>
              )}

              {/* Listening UI */}
              {phase === 'listening' && !isSpeaking && (
                <div>
                  {inputMode === 'voice' ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
                        <Spectrogram active={isListening} speaking={false} />
                      </div>

                      {/* Transcript box */}
                      <div style={{ background: '#F8F9FC', borderRadius: 10, padding: '14px 16px', marginBottom: 16, minHeight: 70, textAlign: 'left', border: '1px solid #F1F4F9' }}>
                        <p style={{ margin: 0, color: transcript ? '#0F172A' : '#CBD5E1', fontSize: 14, lineHeight: 1.6, fontStyle: transcript ? 'normal' : 'italic' }}>
                          {transcript || 'Listening… speak your answer'}
                        </p>
                      </div>

                      {/* Mic button */}
                      <div style={{ marginBottom: 16 }}>
                        <button className="mic-btn" onClick={startListening} style={{
                          width: 64, height: 64, borderRadius: '50%', border: 'none', cursor: 'pointer',
                          background: isListening ? '#DC2626' : '#2563EB',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          margin: '0 auto', boxShadow: `0 4px 16px ${isListening ? 'rgba(220,38,38,0.3)' : 'rgba(37,99,235,0.25)'}`,
                        }}>
                          <Icon name={isListening ? 'mic' : 'mic-off'} size={26} color="#fff" />
                        </button>
                        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 8, animation: isListening ? 'pulse 1.5s infinite' : 'none' }}>
                          {isListening ? 'Recording… tap to restart' : 'Tap to start recording'}
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
                          border: '1px solid #E2E8F0', borderRadius: 10,
                          color: '#0F172A', fontSize: 14, lineHeight: 1.6,
                          fontFamily: 'Inter, sans-serif', resize: 'vertical', marginBottom: 14,
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
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ECFDF5', border: '1px solid #A7F3D0', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check-circle" size={32} color="#059669" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                {answers.length === 0 ? "Session Recorded" : "Session Complete!"}
              </h2>

              {aiReply && (
                <div style={{ margin: '0 auto 20px', padding: '14px 18px', background: '#EFF6FF', borderRadius: 12, border: '1px solid #BFDBFE', maxWidth: 420, textAlign: 'left' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2563EB', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aria</div>
                  <p style={{ margin: 0, fontSize: 14, color: '#1D4ED8', lineHeight: 1.6 }}>
                    <TypewriterText text={aiReply} speed={20} />
                  </p>
                </div>
              )}

              <p style={{ color: '#64748B', fontSize: 14, marginBottom: 4 }}>
                {answers.length > 0
                  ? <>You answered <strong style={{ color: '#0F172A' }}>{answers.length} questions</strong></>
                  : "No responses recorded this time."}
              </p>
              <p style={{ color: '#CBD5E1', fontSize: 12, marginBottom: 28 }}>
                {saving ? 'Saving session…' : 'Session saved to your profile'}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <Btn onClick={() => { setPhase('intro'); setQIndex(0); setAnswers([]); setAiReply('') }} variant="secondary">
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