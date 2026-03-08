import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AmbientBg, LogoMark, Btn, Icon, Badge, useToast } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth'
import { voiceApi } from '../lib/api'

const MAX_W = 3  // max tab switches
const MAX_Q = 8  // max questions

const QUESTIONS_BY_DEPT = {
  default: [
    "Tell me about your current academic focus and what subjects you find most challenging.",
    "What projects have you worked on recently? Walk me through your approach.",
    "How do you manage your time between studies and other activities?",
    "Describe a technical problem you solved recently.",
    "What are your career goals after graduation?",
    "How do you stay updated with new developments in your field?",
    "What skills do you feel you need to improve most?",
    "Where do you see yourself in 5 years?",
  ]
}

function speak(text, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.9; u.pitch = 1.05
  if (onEnd) u.onend = onEnd
  window.speechSynthesis.speak(u)
}

function Spectrogram({ active }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const bars = 32

    function draw() {
      ctx.clearRect(0, 0, W, H)
      for (let i = 0; i < bars; i++) {
        const h = active ? (Math.random() * 0.7 + 0.1) * H : H * 0.05
        const x = (W / bars) * i + 2
        const bw = W / bars - 4
        const grad = ctx.createLinearGradient(0, H - h, 0, H)
        grad.addColorStop(0, 'rgba(37,99,235,0.9)')
        grad.addColorStop(1, 'rgba(5,150,105,0.5)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(x, H - h, bw, h, 3)
        ctx.fill()
      }
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [active])

  return <canvas ref={canvasRef} width={320} height={80} style={{ borderRadius:8, background:'rgba(255,255,255,0.02)' }} />
}

export default function Voice() {
  const { user } = useAuth()
  const nav = useNavigate()
  const toast = useToast()

  const [phase, setPhase] = useState('intro')  // intro | question | listening | done | error
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [transcript, setTranscript] = useState('')
  const [inputMode, setInputMode] = useState('voice')  // voice | type
  const [typedAnswer, setTypedAnswer] = useState('')
  const [tabWarnings, setTabWarnings] = useState(0)
  const [saving, setSaving] = useState(false)
  const recogRef = useRef(null)

  const dept = user?.department || 'default'
  const questions = QUESTIONS_BY_DEPT[dept] || QUESTIONS_BY_DEPT.default

  // Anti-cheat: tab switch detection
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && phase === 'listening') {
        const w = tabWarnings + 1
        setTabWarnings(w)
        if (w >= MAX_W) {
          toast(`Session terminated: exceeded ${MAX_W} tab switches`, 'error')
          endSession(true)
        } else {
          toast(`Warning ${w}/${MAX_W}: Stay on this tab during the session`, 'warn')
        }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase, tabWarnings])

  // Clean up on unmount
  useEffect(() => () => {
    recogRef.current?.stop()
    window.speechSynthesis?.cancel()
  }, [])

  const startSession = () => {
    setPhase('question')
    askQuestion(0)
  }

  const askQuestion = (idx) => {
    if (idx >= MAX_Q || idx >= questions.length) { endSession(false); return }
    setQIndex(idx)
    setTranscript('')
    setTypedAnswer('')
    speak(questions[idx], () => setPhase('listening'))
    setPhase('question')
  }

  const startListening = () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      toast('Speech recognition not supported. Use type mode.', 'warn')
      setInputMode('type')
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recog = new SR()
    recog.continuous = true
    recog.interimResults = true
    recog.lang = 'en-IN'
    recog.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(' ')
      setTranscript(t)
    }
    recog.onend = () => setPhase('listening')
    recog.start()
    recogRef.current = recog
    setPhase('listening')
  }

  const stopAndNext = () => {
    recogRef.current?.stop()
    const ans = inputMode === 'voice' ? transcript : typedAnswer
    setAnswers(a => [...a, { question: questions[qIndex], answer: ans, timestamp: new Date().toISOString() }])
    if (qIndex + 1 >= MAX_Q || qIndex + 1 >= questions.length) {
      endSession(false)
    } else {
      setPhase('question')
      setTimeout(() => askQuestion(qIndex + 1), 500)
    }
  }

  const endSession = async (forced = false) => {
    recogRef.current?.stop()
    window.speechSynthesis?.cancel()
    setPhase('done')
    setSaving(true)
    const allAnswers = answers  // current answers collected
    try {
      await voiceApi.save({
        answers: allAnswers,
        tab_switches: tabWarnings,
        forced_end: forced,
        department: user?.department,
        questions_answered: allAnswers.length,
      })
      speak('Session saved. Great work!')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const progress = ((qIndex + 1) / Math.min(MAX_Q, questions.length)) * 100

  return (
    <div style={{ minHeight:'100vh', background:'#F8F9FC', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing:border-box; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        textarea:focus { outline:none; border-color:rgba(37,99,235,0.5)!important; }
      `}</style>

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:600 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:32 }}>
          <button onClick={() => nav('/dashboard')} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontFamily:'Inter, sans-serif', fontSize:13 }}>
            <Icon name="arrow-left" size={16} color="#6e6888" /> Dashboard
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <LogoMark size={24} />
            <span style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:15, color:'#0F172A' }}>Voice Session</span>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {tabWarnings > 0 && <Badge color="rose">{tabWarnings}/{MAX_W} warns</Badge>}
            <Badge color="muted">{qIndex + 1}/{Math.min(MAX_Q, questions.length)}</Badge>
          </div>
        </div>

        {/* Main card */}
        <div style={{ background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.07)', borderRadius:20, padding:'clamp(28px,5vw,40px)' }}>

          {/* INTRO */}
          {phase === 'intro' && (
            <div style={{ textAlign:'center' }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(37,99,235,0.1)', border:'1px solid rgba(37,99,235,0.22)', margin:'0 auto 24px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="mic" size={36} color="#7c4dff" />
              </div>
              <h2 style={{ fontFamily:'Inter, sans-serif', fontSize:24, fontWeight:700, color:'#0F172A', margin:'0 0 12px' }}>Ready to Begin?</h2>
              <p style={{ color:'#94A3B8', fontSize:14, lineHeight:1.7, margin:'0 0 12px' }}>
                You'll be asked up to <strong style={{ color:'#0F172A' }}>{Math.min(MAX_Q, questions.length)} questions</strong> by your AI mentor.
                Speak clearly or use type mode. Stay on this tab during the session.
              </p>
              <p style={{ color:'#94A3B8', fontSize:12, fontFamily:'Inter, monospace', margin:'0 0 32px' }}>
                Tab switches are monitored — max {MAX_W} warnings before termination.
              </p>

              <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:24 }}>
                <button onClick={() => setInputMode('voice')} style={{
                  padding:'10px 20px', borderRadius:10, cursor:'pointer',
                  background: inputMode==='voice' ? 'rgba(37,99,235,0.12)' : 'transparent',
                  border: `1px solid ${inputMode==='voice' ? 'rgba(37,99,235,0.4)' : 'rgba(0,0,0,0.07)'}`,
                  color: inputMode==='voice' ? '#0F172A' : '#94A3B8',
                  fontFamily:'Inter, sans-serif', fontSize:13, transition:'all 0.15s',
                }}>
                  <Icon name="mic" size={14} color={inputMode==='voice' ? '#2563EB' : '#94A3B8'} /> Voice Mode
                </button>
                <button onClick={() => setInputMode('type')} style={{
                  padding:'10px 20px', borderRadius:10, cursor:'pointer',
                  background: inputMode==='type' ? 'rgba(37,99,235,0.12)' : 'transparent',
                  border: `1px solid ${inputMode==='type' ? 'rgba(37,99,235,0.4)' : 'rgba(0,0,0,0.07)'}`,
                  color: inputMode==='type' ? '#0F172A' : '#94A3B8',
                  fontFamily:'Inter, sans-serif', fontSize:13, transition:'all 0.15s',
                }}>
                  <Icon name="keyboard" size={14} color={inputMode==='type' ? '#2563EB' : '#94A3B8'} /> Type Mode
                </button>
              </div>

              <Btn onClick={startSession} size="lg" fullWidth style={{ background:'linear-gradient(135deg,#7c4dff,#5530cc)', boxShadow:'0 4px 32px rgba(37,99,235,0.3)' }}>
                <Icon name="play" size={16} color="#fff" /> Start Session
              </Btn>
            </div>
          )}

          {/* QUESTION + LISTENING */}
          {(phase === 'question' || phase === 'listening') && (
            <div>
              {/* Progress bar */}
              <div style={{ height:3, background:'rgba(0,0,0,0.04)', borderRadius:2, marginBottom:28, overflow:'hidden' }}>
                <div style={{ height:'100%', background:'linear-gradient(90deg,#7c4dff,#00e5b4)', width:`${progress}%`, transition:'width 0.4s ease', borderRadius:2 }} />
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                <Badge color="violet">Q{qIndex + 1}</Badge>
                <Badge color="muted">{inputMode === 'voice' ? 'Voice' : 'Type'} mode</Badge>
              </div>

              <p style={{ fontFamily:'Inter, sans-serif', fontSize:18, fontWeight:600, color:'#0F172A', lineHeight:1.5, margin:'0 0 24px' }}>
                {questions[qIndex]}
              </p>

              {phase === 'question' && (
                <div style={{ textAlign:'center', paddingTop:8 }}>
                  <div style={{ animation:'pulse 2s infinite', display:'inline-flex', alignItems:'center', gap:6, color:'#94A3B8', fontSize:13, fontFamily:'Inter, monospace' }}>
                    <Icon name="volume-2" size={16} color="#7c4dff" /> Reading question aloud...
                  </div>
                </div>
              )}

              {phase === 'listening' && (
                <div>
                  {inputMode === 'voice' ? (
                    <div style={{ textAlign:'center' }}>
                      <div style={{ marginBottom:20, display:'flex', justifyContent:'center' }}>
                        <Spectrogram active={true} />
                      </div>
                      <div style={{ background:'#F8F9FC', borderRadius:12, padding:'14px 18px', marginBottom:20, minHeight:80, textAlign:'left' }}>
                        <p style={{ margin:0, color: transcript ? '#0F172A' : '#94A3B8', fontSize:14, lineHeight:1.6, fontFamily:'Inter, sans-serif', fontStyle: transcript ? 'normal' : 'italic' }}>
                          {transcript || 'Listening... speak your answer'}
                        </p>
                      </div>
                      <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                        <Btn onClick={startListening} variant="secondary" size="sm">
                          <Icon name="refresh-cw" size={14} color="#c0bbd8" /> Re-record
                        </Btn>
                        <Btn onClick={stopAndNext} disabled={!transcript.trim()}>
                          <Icon name="arrow-right" size={14} color="#fff" /> Next Question
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <textarea value={typedAnswer} onChange={e => setTypedAnswer(e.target.value)}
                        placeholder="Type your answer here..." rows={5} style={{
                          width:'100%', padding:'14px 16px', background:'#F8F9FC',
                          border:'1px solid rgba(0,0,0,0.07)', borderRadius:12,
                          color:'#0F172A', fontSize:14, lineHeight:1.6,
                          fontFamily:'Inter, sans-serif', resize:'vertical', marginBottom:16,
                        }} />
                      <Btn onClick={stopAndNext} disabled={!typedAnswer.trim()} fullWidth>
                        <Icon name="arrow-right" size={14} color="#fff" /> Next Question
                      </Btn>
                    </div>
                  )}
                </div>
              )}

              {phase === 'listening' && inputMode === 'voice' && !recogRef.current && (
                <div style={{ marginTop:16, textAlign:'center' }}>
                  <Btn onClick={startListening} variant="secondary">
                    <Icon name="mic" size={14} color="#c0bbd8" /> Start Recording
                  </Btn>
                </div>
              )}
            </div>
          )}

          {/* DONE */}
          {phase === 'done' && (
            <div style={{ textAlign:'center', padding:'8px 0' }}>
              <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(5,150,105,0.1)', border:'1px solid rgba(5,150,105,0.3)', margin:'0 auto 24px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="check-circle" size={32} color="#00e5b4" />
              </div>
              <h2 style={{ fontFamily:'Inter, sans-serif', fontSize:24, fontWeight:700, color:'#0F172A', margin:'0 0 12px' }}>Session Complete!</h2>
              <p style={{ color:'#94A3B8', fontSize:14, margin:'0 0 8px' }}>
                You answered <strong style={{ color:'#0F172A' }}>{answers.length} questions</strong>
              </p>
              <p style={{ color:'#94A3B8', fontSize:12, fontFamily:'Inter, monospace', margin:'0 0 32px' }}>
                {saving ? 'Saving session...' : 'Session saved to your profile'}
              </p>
              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                <Btn onClick={() => { setPhase('intro'); setQIndex(0); setAnswers([]) }} variant="secondary">
                  <Icon name="refresh-cw" size={14} color="#c0bbd8" /> New Session
                </Btn>
                <Btn onClick={() => nav('/dashboard')}>
                  <Icon name="layout-dashboard" size={14} color="#fff" /> Dashboard
                </Btn>
              </div>
            </div>
          )}
        </div>

        {/* Bottom hint */}
        {phase === 'listening' && (
          <div style={{ textAlign:'center', marginTop:16 }}>
            <button onClick={() => endSession(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', fontSize:12, fontFamily:'Inter, monospace' }}>
              End session early
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
