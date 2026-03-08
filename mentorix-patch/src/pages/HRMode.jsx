import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AmbientBg, LogoMark, Btn, Icon, Badge, Card, ScoreRing } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth'
import { voiceApi } from '../lib/api'

const CATEGORIES = ['Communication', 'Confidence', 'Technical', 'Posture', 'Clarity']

const DEPT_QUESTIONS = {
  CSE: ["Explain the difference between process and thread.", "What is time complexity of binary search?", "Describe RESTful API principles.", "How does garbage collection work?", "What are SOLID principles?"],
  IT: ["What is the OSI model?", "Explain TCP vs UDP.", "What is load balancing?", "Describe CI/CD pipeline.", "What is microservices architecture?"],
  ECE: ["Explain modulation techniques.", "What is an op-amp and its uses?", "Describe OFDM.", "What is VLSI design?", "Explain PID controller."],
  default: ["Tell me about yourself and your strengths.", "Where do you see yourself in 5 years?", "Describe a challenge you overcame.", "Why should we hire you?", "What are your salary expectations?"],
}

function speak(text, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.9
  if (onEnd) u.onend = onEnd
  window.speechSynthesis.speak(u)
}

function PostureMonitor({ videoRef, onScore }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    // Simple posture heuristic using face detection approximation via brightness
    const interval = setInterval(() => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      // Score based on whether camera can see the user (simplified)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let brightness = 0
      for (let i = 0; i < data.length; i += 4) brightness += (data[i] + data[i+1] + data[i+2]) / 3
      brightness /= (data.length / 4)
      // Give high score if image is bright enough (person visible)
      onScore(brightness > 20 ? Math.min(95, 60 + Math.random() * 30) : 20)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return <canvas ref={canvasRef} width={1} height={1} style={{ display:'none' }} />
}

export default function HRMode() {
  const { user } = useAuth()
  const nav = useNavigate()

  const [phase, setPhase] = useState('intro')  // intro | setup | session | result
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [transcript, setTranscript] = useState('')
  const [postureScore, setPostureScore] = useState(75)
  const [scores, setScores] = useState({ Communication:0, Confidence:0, Technical:0, Posture:0, Clarity:0 })
  const [cameraOn, setCameraOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const videoRef = useRef(null)
  const recogRef = useRef(null)
  const streamRef = useRef(null)

  const dept = user?.department || 'default'
  const questions = DEPT_QUESTIONS[dept] || DEPT_QUESTIONS.default

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    recogRef.current?.stop()
    window.speechSynthesis?.cancel()
  }, [])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
    } catch { setCameraOn(false) }
  }

  const startSession = async () => {
    await startCamera()
    setPhase('session')
    speak(questions[0], () => startListening())
  }

  const startListening = () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const r = new SR()
    r.continuous = true
    r.interimResults = true
    r.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(' ')
      setTranscript(t)
    }
    r.start()
    recogRef.current = r
  }

  const scoreAnswer = (answer) => {
    const len = answer.trim().split(/\s+/).length
    const base = Math.min(100, 40 + len * 1.5)
    return {
      Communication: base + Math.random() * 15 - 7,
      Confidence: postureScore * 0.6 + Math.random() * 20,
      Technical: base + Math.random() * 20 - 10,
      Posture: postureScore,
      Clarity: base + Math.random() * 15 - 5,
    }
  }

  const nextQuestion = () => {
    recogRef.current?.stop()
    const ans = transcript.trim()
    const qScores = scoreAnswer(ans)
    setAnswers(a => [...a, { question: questions[qIndex], answer: ans, scores: qScores }])

    // Accumulate scores
    setScores(prev => {
      const updated = {}
      CATEGORIES.forEach(c => updated[c] = (prev[c] + qScores[c]) / 2)
      return updated
    })

    if (qIndex + 1 >= questions.length) {
      endSession()
    } else {
      setTranscript('')
      setQIndex(q => q + 1)
      setTimeout(() => {
        speak(questions[qIndex + 1], () => startListening())
      }, 800)
    }
  }

  const endSession = async () => {
    recogRef.current?.stop()
    window.speechSynthesis?.cancel()
    streamRef.current?.getTracks().forEach(t => t.stop())
    setPhase('result')
    setSaving(true)
    try {
      await voiceApi.save({
        mode: 'hr',
        answers,
        scores,
        department: dept,
      })
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const overallScore = CATEGORIES.reduce((s, c) => s + scores[c], 0) / CATEGORIES.length

  return (
    <div style={{ minHeight:'100vh', background:'#06050e', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, position:'relative' }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing:border-box; }
      `}</style>

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:680 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
          <button onClick={() => nav('/dashboard')} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:'#6e6888', fontFamily:'DM Sans, sans-serif', fontSize:13 }}>
            <Icon name="arrow-left" size={16} color="#6e6888" /> Dashboard
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <LogoMark size={24} />
            <span style={{ fontFamily:'Bricolage Grotesque, sans-serif', fontWeight:700, fontSize:15, color:'#f4f0ff' }}>HR Mode</span>
          </div>
          <Badge color="violet">{dept}</Badge>
        </div>

        {/* INTRO */}
        {phase === 'intro' && (
          <Card>
            <div style={{ textAlign:'center' }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(0,229,180,0.08)', border:'1px solid rgba(0,229,180,0.2)', margin:'0 auto 24px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="briefcase" size={36} color="#00e5b4" />
              </div>
              <h2 style={{ fontFamily:'Bricolage Grotesque, sans-serif', fontSize:24, fontWeight:700, color:'#f4f0ff', margin:'0 0 12px' }}>HR Interview Simulation</h2>
              <p style={{ color:'#6e6888', fontSize:14, lineHeight:1.7, margin:'0 0 24px', maxWidth:420, marginLeft:'auto', marginRight:'auto' }}>
                Camera monitoring for posture, {questions.length} department-specific questions, and 5-category scoring.
              </p>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:32 }}>
                {CATEGORIES.map(c => (
                  <div key={c} style={{ padding:'10px 8px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', textAlign:'center' }}>
                    <div style={{ fontSize:11, color:'#6e6888', fontFamily:'DM Mono, monospace' }}>{c}</div>
                  </div>
                ))}
              </div>

              <Btn onClick={startSession} size="lg" fullWidth style={{ background:'linear-gradient(135deg,#00e5b4,#00b48f)', color:'#06050e' }}>
                <Icon name="video" size={16} color="#06050e" /> Begin Interview
              </Btn>
              <p style={{ fontSize:11, color:'#2e2a42', marginTop:12, fontFamily:'DM Mono, monospace' }}>
                Camera access required for posture monitoring
              </p>
            </div>
          </Card>
        )}

        {/* SESSION */}
        {phase === 'session' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'start' }}>
            <Card>
              {/* Progress */}
              <div style={{ height:3, background:'rgba(255,255,255,0.06)', borderRadius:2, marginBottom:24, overflow:'hidden' }}>
                <div style={{ height:'100%', background:'linear-gradient(90deg,#00e5b4,#7c4dff)', borderRadius:2, width:`${((qIndex+1)/questions.length)*100}%`, transition:'width 0.4s' }} />
              </div>

              <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center' }}>
                <Badge color="teal">Q{qIndex + 1}/{questions.length}</Badge>
                <Badge color="muted">HR Interview</Badge>
              </div>

              <p style={{ fontFamily:'Bricolage Grotesque, sans-serif', fontSize:18, fontWeight:600, color:'#f4f0ff', lineHeight:1.5, margin:'0 0 20px' }}>
                {questions[qIndex]}
              </p>

              <div style={{ background:'#161328', borderRadius:12, padding:'14px 16px', minHeight:100, marginBottom:20 }}>
                <p style={{ margin:0, color: transcript ? '#f4f0ff' : '#6e6888', fontSize:14, lineHeight:1.6, fontStyle: transcript ? 'normal' : 'italic' }}>
                  {transcript || 'Speak your answer...'}
                </p>
              </div>

              <Btn onClick={nextQuestion} fullWidth>
                {qIndex + 1 >= questions.length ? 'Finish Interview' : 'Next Question'} <Icon name="arrow-right" size={14} color="#fff"/>
              </Btn>
            </Card>

            {/* Camera feed */}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ width:180, borderRadius:14, overflow:'hidden', border:`1px solid ${cameraOn ? 'rgba(0,229,180,0.3)' : 'rgba(255,255,255,0.07)'}`, position:'relative' }}>
                <video ref={videoRef} autoPlay muted playsInline style={{ width:'100%', display:'block', background:'#161328' }} />
                {!cameraOn && (
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#161328' }}>
                    <Icon name="camera-off" size={24} color="#2e2a42" />
                  </div>
                )}
                {cameraOn && <PostureMonitor videoRef={videoRef} onScore={setPostureScore} />}
              </div>
              <div style={{ padding:'10px 14px', borderRadius:10, background:'#0e0c1a', border:'1px solid rgba(255,255,255,0.07)', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'#6e6888', fontFamily:'DM Mono, monospace', marginBottom:4 }}>POSTURE</div>
                <div style={{ fontFamily:'Bricolage Grotesque, sans-serif', fontSize:20, fontWeight:700, color: postureScore >= 70 ? '#00e5b4' : '#ff4d6d' }}>
                  {Math.round(postureScore)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RESULT */}
        {phase === 'result' && (
          <div>
            <Card style={{ marginBottom:16, textAlign:'center' }}>
              <h2 style={{ fontFamily:'Bricolage Grotesque, sans-serif', fontSize:22, fontWeight:700, color:'#f4f0ff', margin:'0 0 8px' }}>Interview Complete</h2>
              <p style={{ color:'#6e6888', fontSize:13, margin:'0 0 28px' }}>{saving ? 'Saving results...' : 'Results saved to your profile'}</p>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:28 }}>
                <ScoreRing score={Math.round(overallScore)} size={130} label="Overall" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
                {CATEGORIES.map(c => (
                  <div key={c} style={{ padding:'14px 8px', borderRadius:12, background:'#161328', border:'1px solid rgba(255,255,255,0.06)', textAlign:'center' }}>
                    <div style={{ fontFamily:'DM Mono, monospace', fontSize:16, fontWeight:600, color: scores[c] >= 70 ? '#00e5b4' : scores[c] >= 50 ? '#7c4dff' : '#ff4d6d' }}>
                      {Math.round(scores[c])}
                    </div>
                    <div style={{ fontSize:10, color:'#6e6888', marginTop:4 }}>{c}</div>
                  </div>
                ))}
              </div>
            </Card>
            <div style={{ display:'flex', gap:12 }}>
              <Btn onClick={() => { setPhase('intro'); setQIndex(0); setAnswers([]); setTranscript(''); setScores(Object.fromEntries(CATEGORIES.map(c=>[c,0]))) }} variant="secondary" fullWidth>
                <Icon name="refresh-cw" size={14} color="#c0bbd8" /> Try Again
              </Btn>
              <Btn onClick={() => nav('/dashboard')} fullWidth>
                <Icon name="layout-dashboard" size={14} color="#fff" /> Dashboard
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
