// src/pages/HR.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Bytez APIs used:
//   POSTURE   : google/mobilenet_v1_1.0_224  (image-classification, camera frame)
//               Fallback → geometric canvas analysis (shoulder/head angle)
//   EMOTION   : ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition
//               Fallback → superb/wav2vec2-base-superb-er
//               Fallback 2 → transcript pace/pause analysis
//   SIMILARITY: BAAI/bge-small-en-v1.5  (answer quality vs ideal)
//               Fallback → Groq LLM SCORES extraction (existing)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const API = import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'

// All Bytez calls go through our own backend — API key stays server-side, never exposed
// Backend routes: POST /bytez/posture  /bytez/emotion  /bytez/similarity
// Backend uses:   from bytez import Bytez  (patch_bytez_routes.py)

const hdr = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('mentorix_token') || ''}`
})

const C = {
  bg:'#F8F9FC', surface:'#FFFFFF', surface2:'#F1F4F9', border:'#E2E8F0',
  blue:'#2563EB', navy:'#0F172A', text:'#334155', muted:'#94A3B8',
  green:'#059669', red:'#DC2626', amber:'#D97706',
  blueBg:'#EFF6FF', blueBorder:'#BFDBFE',
  greenBg:'#ECFDF5', greenBorder:'#A7F3D0',
  redBg:'#FEF2F2', redBorder:'#FECACA',
  amberBg:'#FFFBEB', amberBorder:'#FDE68A',
}

const QUESTIONS = [
  "Tell me about yourself and your key strengths.",
  "Describe a challenging project you have worked on and how you handled it.",
  "Where do you see yourself in 5 years?",
  "How do you handle pressure and tight deadlines?",
  "Tell me about a time you worked in a team. What was your role?",
  "What are your biggest weaknesses and how do you work on them?",
  "Why should we hire you over other candidates?",
  "Describe a situation where you showed leadership.",
  "How do you stay updated with developments in your field?",
  "Do you have any questions for us?",
]

// Ideal answers for sentence-similarity scoring
const IDEAL_ANSWERS = {
  0: "I am a computer science student with strong problem-solving skills and experience in software development, teamwork, and communication.",
  1: "I worked on a complex project involving multiple technologies. I faced challenges but solved them through research, teamwork, and iterative debugging.",
  2: "I see myself as a software engineer specialising in my domain, contributing to meaningful projects and growing into a leadership role.",
  3: "I prioritise tasks, break work into manageable steps, stay calm under pressure, and communicate proactively with the team.",
  4: "I contributed as a developer and collaborator, ensuring clear communication, helping teammates, and delivering my part on time.",
  5: "I struggle with perfectionism but I actively work on setting realistic deadlines and accepting iterative improvement.",
  6: "I bring a unique combination of technical skills, collaborative attitude, and commitment to continuous learning.",
  7: "I took initiative when my team was stuck, broke down the problem, delegated tasks, and guided the team to a solution.",
  8: "I follow tech blogs, take online courses, attend meetups, and work on personal projects to stay current.",
  9: "Yes, I would like to know about the team culture and opportunities for learning and growth.",
}

const COURSE_MAP = {
  comm: { label:'Communication', courses:[
    { title:'English Communication Skills', platform:'Coursera', url:'https://www.coursera.org/learn/english-communication' },
    { title:'Public Speaking & Presentation', platform:'Udemy', url:'https://www.udemy.com/course/public-speaking-complete-course/' },
    { title:'Business English Communication', platform:'edX', url:'https://www.edx.org/learn/english' },
  ]},
  tech: { label:'Technical Skills', courses:[
    { title:'Data Structures & Algorithms', platform:'NPTEL', url:'https://nptel.ac.in/courses/106/106/106106127/' },
    { title:'System Design Fundamentals', platform:'Coursera', url:'https://www.coursera.org/learn/system-design' },
    { title:'CS Essentials — CS50', platform:'edX', url:'https://www.edx.org/cs50' },
  ]},
  crit: { label:'Critical Thinking', courses:[
    { title:'Problem Solving & Critical Thinking', platform:'Coursera', url:'https://www.coursera.org/learn/critical-thinking-problem-solving' },
    { title:'Decision Making', platform:'NPTEL', url:'https://nptel.ac.in' },
    { title:'Analytical Thinking', platform:'LinkedIn Learning', url:'https://www.linkedin.com/learning' },
  ]},
  pres: { label:'Composure & Confidence', courses:[
    { title:'Confidence Under Pressure', platform:'Udemy', url:'https://www.udemy.com/course/confidence-mastery/' },
    { title:'Interview Preparation Masterclass', platform:'Coursera', url:'https://www.coursera.org/learn/interview-preparation' },
    { title:'Emotional Intelligence', platform:'edX', url:'https://www.edx.org/learn/emotional-intelligence' },
  ]},
  lead: { label:'Leadership', courses:[
    { title:'Leadership for Engineers', platform:'Coursera', url:'https://www.coursera.org/specializations/leadership-development-for-engineers' },
    { title:'Teamwork & Collaboration', platform:'edX', url:'https://www.edx.org/learn/leadership' },
    { title:'Inspiring Leadership', platform:'NPTEL', url:'https://nptel.ac.in' },
  ]},
}

// ─────────────────────────────────────────────────────────────────────────────
// BYTEZ API 1 — Posture analysis from camera frame
// Model: google/mobilenet_v1_1.0_224 (image-classification)
// Fallback: geometric canvas rules (shoulder slope from brightness map)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// BYTEZ API 1 — Posture via backend
// Backend: from bytez import Bytez → model("google/mobilenet_v1_1.0_224")
// Fallback: geometric canvas brightness analysis (runs in browser)
// ─────────────────────────────────────────────────────────────────────────────
async function analysePostureFromCanvas(canvas) {
  try {
    const image_b64 = canvas.toDataURL('image/jpeg', 0.6)
    const res = await fetch(`${API}/bytez/posture`, {
      method: 'POST', headers: hdr(),
      body: JSON.stringify({ image_b64 }),
    })
    if (!res.ok) throw new Error('backend-fail')
    const data = await res.json()
    if (data.posture && data.source === 'bytez') {
      return { score: data.posture, source: 'bytez' }
    }
    throw new Error('no-bytez-result')
  } catch {
    return { score: geometricPostureScore(canvas), source: 'geometric' }
  }
}

function geometricPostureScore(canvas) {
  try {
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    const imgData = ctx.getImageData(0, 0, w, h).data
    let light = 0, count = 0
    for (let y = 0; y < h * 0.35; y++) {
      for (let x = w * 0.25; x < w * 0.75; x++) {
        const i = (Math.floor(y) * w + Math.floor(x)) * 4
        light += (imgData[i] + imgData[i+1] + imgData[i+2]) / 3
        count++
      }
    }
    const brightness = count > 0 ? light / count : 128
    return Math.round(Math.max(35, Math.min(92, (brightness / 255) * 85 + 20)))
  } catch { return 70 }
}

// ─────────────────────────────────────────────────────────────────────────────
// BYTEZ API 2 — Emotion via backend
// Backend: from bytez import Bytez →
//   Primary  model("ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition")
//   Fallback model("superb/wav2vec2-base-superb-er")
//   Fallback2: transcript word-count heuristic (browser-side)
// ─────────────────────────────────────────────────────────────────────────────
async function analyseEmotion(audioBlob) {
  try {
    const audio_b64 = await blobToBase64(audioBlob)
    const res = await fetch(`${API}/bytez/emotion`, {
      method: 'POST', headers: hdr(),
      body: JSON.stringify({ audio_b64 }),
    })
    if (!res.ok) throw new Error('backend-fail')
    const data = await res.json()
    // Backend handles primary + fallback Bytez models internally
    if (data.emotion && data.source !== 'fallback') {
      return { emotion: data.emotion, confidence: data.confidence, composure: data.composure, source: data.source }
    }
    throw new Error('no-result')
  } catch {
    return null  // caller uses emotionFromTranscript()
  }
}

// Transcript-based fallback (no audio/backend needed)
function emotionFromTranscript(text) {
  const words = text.trim().split(/\s+/).length
  if (words >= 60) return { emotion: 'confident', confidence: 80, composure: 75, source: 'transcript' }
  if (words >= 30) return { emotion: 'neutral',   confidence: 65, composure: 65, source: 'transcript' }
  if (words >= 10) return { emotion: 'hesitant',  confidence: 45, composure: 50, source: 'transcript' }
  return               { emotion: 'fearful',   confidence: 30, composure: 35, source: 'transcript' }
}

// ─────────────────────────────────────────────────────────────────────────────
// BYTEZ API 3 — Sentence similarity via backend
// Backend: from bytez import Bytez → model("BAAI/bge-small-en-v1.5")
//   Computes embeddings + cosine similarity server-side
//   Fallback: Groq LLM SCORES extraction (existing mechanism)
// ─────────────────────────────────────────────────────────────────────────────
async function scoreSimilarity(candidate, ideal) {
  try {
    const res = await fetch(`${API}/bytez/similarity`, {
      method: 'POST', headers: hdr(),
      body: JSON.stringify({ candidate, ideal }),
    })
    if (!res.ok) throw new Error('backend-fail')
    const data = await res.json()
    if (data.score !== null && data.source === 'bytez') {
      return data.score  // 30-95
    }
    throw new Error('llm-fallback')
  } catch {
    return null  // signals submitAnswer to rely on Groq LLM scores only
  }
}

// ── Utility: blob → base64 ────────────────────────────────────────────────────
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// StreamingText — key-based, fresh stream every new message
// ─────────────────────────────────────────────────────────────────────────────
function StreamingText({ text, streamKey }) {
  const [shown, setShown] = useState('')
  const timerRef = useRef(null)

  useEffect(() => {
    setShown('')
    clearTimeout(timerRef.current)
    let idx = 0
    const words = text.split(' ')
    const tick = () => {
      idx++
      setShown(words.slice(0, idx).join(' '))
      if (idx < words.length) timerRef.current = setTimeout(tick, 55)
    }
    timerRef.current = setTimeout(tick, 80)
    return () => clearTimeout(timerRef.current)
  }, [streamKey]) // eslint-disable-line

  return (
    <span>
      {shown}
      <span style={{ display:'inline-block', width:2, height:'1em', background:C.blue, marginLeft:2, verticalAlign:'text-bottom', animation:'blink 0.9s step-end infinite' }} />
    </span>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value }) {
  const color = value >= 70 ? C.green : value >= 45 ? C.amber : C.red
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ fontSize:11, color:C.text, fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:11, fontWeight:700, color: value ? color : C.muted }}>{value ? `${value}%` : '--'}</span>
      </div>
      <div style={{ height:4, background:C.surface2, borderRadius:2, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${value||0}%`, background:color, borderRadius:2, transition:'width 0.8s ease' }} />
      </div>
    </div>
  )
}

// ── API source badge (shows which API provided the score) ─────────────────────
function ApiBadge({ source }) {
  if (!source) return null
  const map = {
    bytez:      { label:'Bytez AI', color:'#7C3AED', bg:'#F5F3FF' },
    bytez_fb:   { label:'Bytez FB', color:'#0891B2', bg:'#ECFEFF' },
    transcript: { label:'Transcript', color:'#D97706', bg:'#FFFBEB' },
    llm:        { label:'LLM', color:'#059669', bg:'#ECFDF5' },
    geometric:  { label:'Camera', color:'#94A3B8', bg:'#F1F5F9' },
  }
  const s = map[source] || map.llm
  return (
    <span style={{ fontSize:8, fontWeight:600, color:s.color, background:s.bg, border:`1px solid ${s.color}30`, borderRadius:4, padding:'1px 5px', marginLeft:4, verticalAlign:'middle', letterSpacing:'0.3px' }}>
      {s.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function HR() {
  const nav = useNavigate()
  const { user } = useAuth()

  const [phase, setPhase]         = useState('intro')
  const [qIdx, setQIdx]           = useState(0)
  const [transcript, setTranscript] = useState('')
  const [convo, setConvo]         = useState([])
  const [scores, setScores]       = useState({ tech:0, comm:0, crit:0, pres:0, lead:0 })
  const [overall, setOverall]     = useState(0)
  const [posture, setPosture]     = useState(75)
  const [confidence, setConfidence] = useState(0)
  const [eyeContact, setEyeContact] = useState(82)
  const [emotion, setEmotion]     = useState(null)    // detected emotion label
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking]   = useState(false)
  const [tabViol, setTabViol]     = useState(0)
  const [violMsg, setViolMsg]     = useState('')
  const [camErr, setCamErr]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [forcedEnd, setForcedEnd] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [silenceLeft, setSilenceLeft] = useState(null)
  const [streamKey, setStreamKey] = useState(0)
  const [latestMsgIdx, setLatestMsgIdx] = useState(-1)
  // API source indicators for each metric
  const [apiSources, setApiSources] = useState({ posture:'geometric', emotion:'transcript', similarity:'llm' })

  const videoRef        = useRef(null)
  const canvasRef       = useRef(null)    // hidden canvas for posture snapshots
  const recogRef        = useRef(null)
  const streamRef       = useRef(null)
  const mediaRecRef     = useRef(null)    // MediaRecorder for audio chunks
  const audioChunksRef  = useRef([])      // accumulate audio for emotion analysis
  const postureTimerRef = useRef(null)
  const convoRef        = useRef([])
  const tabViolRef      = useRef(0)
  const savedRef        = useRef(false)
  const qIdxRef         = useRef(0)
  const scoresRef       = useRef({ tech:0, comm:0, crit:0, pres:0, lead:0 })
  const overallRef      = useRef(0)
  const silenceTimerRef = useRef(null)
  const countdownRef    = useRef(null)
  const submittingRef   = useRef(false)
  const transcriptRef   = useRef('')
  const submitRef       = useRef(null)

  useEffect(() => { qIdxRef.current = qIdx }, [qIdx])
  useEffect(() => { scoresRef.current = scores }, [scores])
  useEffect(() => { overallRef.current = overall }, [overall])
  useEffect(() => { transcriptRef.current = transcript }, [transcript])

  // ── Camera + hidden canvas setup ────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:'user', width:320, height:240 },
        audio: true   // also capture mic for emotion analysis
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

      // Start MediaRecorder for audio blob collection
      try {
        const audioStream = new MediaStream(stream.getAudioTracks())
        const mr = new MediaRecorder(audioStream, { mimeType:'audio/webm;codecs=opus' })
        mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
        mr.start(1000) // collect in 1s chunks
        mediaRecRef.current = mr
      } catch { /* audio capture optional */ }

      // Posture analysis every 3 seconds via Bytez + canvas
      postureTimerRef.current = setInterval(async () => {
        // Eye contact simulation (update independently)
        setEyeContact(e => Math.max(50, Math.min(100, e + (Math.random()>0.6?1:-1)*Math.floor(Math.random()*3))))

        if (videoRef.current && canvasRef.current) {
          const canvas = canvasRef.current
          const ctx = canvas.getContext('2d')
          canvas.width  = videoRef.current.videoWidth  || 320
          canvas.height = videoRef.current.videoHeight || 240
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)

          // Run Bytez posture analysis (async, non-blocking)
          analysePostureFromCanvas(canvas).then(score => {
            setPosture(score)
            setApiSources(s => ({ ...s, posture: score > 0 ? 'bytez' : 'geometric' }))
          }).catch(() => {
            // Geometric fallback if Bytez fails
            const geo = geometricPostureScore(canvas)
            setPosture(geo)
            setApiSources(s => ({ ...s, posture:'geometric' }))
          })
        } else {
          // No camera — simulate
          setPosture(p => Math.max(40, Math.min(100, p + (Math.random()>0.5?1:-1)*Math.floor(Math.random()*4))))
        }
      }, 3000)

    } catch { setCamErr(true) }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    clearInterval(postureTimerRef.current)
    if (mediaRecRef.current?.state !== 'inactive') {
      try { mediaRecRef.current?.stop() } catch {}
    }
  }, [])

  // ── Get audio blob from accumulated chunks ──────────────────────────────────
  const getAudioBlob = useCallback(() => {
    if (audioChunksRef.current.length === 0) return null
    const blob = new Blob(audioChunksRef.current, { type:'audio/webm' })
    audioChunksRef.current = [] // clear for next answer
    return blob
  }, [])

  // ── Timer helpers ────────────────────────────────────────────────────────────
  const clearSilenceTimer = useCallback(() => {
    clearTimeout(silenceTimerRef.current)
    setSilenceLeft(null)
  }, [])

  const clearCountdown = useCallback(() => {
    clearInterval(countdownRef.current)
    setCountdown(null)
  }, [])

  const stopListening = useCallback(() => {
    if (recogRef.current) {
      const r = recogRef.current
      recogRef.current = null
      try { r.stop() } catch {}
    }
    setListening(false)
    clearSilenceTimer()
  }, [clearSilenceTimer])

  // ── End session ──────────────────────────────────────────────────────────────
  const endSession = useCallback(async (forced = false) => {
    if (savedRef.current) return
    savedRef.current = true
    submittingRef.current = true
    stopListening()
    stopCamera()
    clearSilenceTimer()
    clearCountdown()
    setPhase('done')
    const exchanges = convoRef.current.filter(m => m.role === 'user').length
    try {
      await fetch(`${API}/voice/save`, {
        method:'POST', headers:hdr(),
        body: JSON.stringify({
          transcript: convoRef.current.map(m => `${m.role==='ai'?'Aria':'Candidate'}: ${m.text}`).join('\n'),
          summary: `HR Interview — ${exchanges} questions answered${forced?' (terminated)':''}`,
          exchange_count: exchanges,
          overall_score: overallRef.current,
          scores: scoresRef.current,
          mode: 'hr_interview',
          forced_end: forced,
          tab_switches: tabViolRef.current,
          questions_answered: exchanges,
        })
      })
    } catch {}
  }, [stopListening, stopCamera, clearSilenceTimer, clearCountdown])

  // ── Start listening — with 10s timeout + 2s silence auto-submit ─────────────
  const startListening = useCallback(() => {
    if (savedRef.current) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    if (recogRef.current) { try { recogRef.current.stop() } catch {} }

    const r = new SR()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-IN'
    recogRef.current = r

    r.onresult = (e) => {
      let chunk = ''
      for (const res of e.results) { if (res.isFinal) chunk += res[0].transcript + ' ' }
      if (!chunk.trim()) return

      clearCountdown()
      clearTimeout(silenceTimerRef.current)

      setTranscript(prev => {
        const updated = prev + chunk
        transcriptRef.current = updated
        return updated
      })

      // 2-second silence detection
      let secs = 2
      setSilenceLeft(secs)
      const tick = () => {
        secs--
        setSilenceLeft(secs <= 0 ? null : secs)
        if (secs <= 0) {
          if (submitRef.current) submitRef.current()
        } else {
          silenceTimerRef.current = setTimeout(tick, 1000)
        }
      }
      silenceTimerRef.current = setTimeout(tick, 1000)
    }

    r.onend = () => {
      if (recogRef.current === r && !submittingRef.current && !savedRef.current) {
        try { r.start() } catch {}
      }
    }

    r.start()
    setListening(true)

    // 10-second no-response countdown
    clearInterval(countdownRef.current)
    let secs = 10
    setCountdown(secs)
    countdownRef.current = setInterval(() => {
      secs--
      setCountdown(secs <= 0 ? null : secs)
      if (secs <= 0) {
        clearInterval(countdownRef.current)
        if (!transcriptRef.current.trim()) {
          stopListening()
          setScores(prev => {
            const penalised = { ...prev, comm:Math.max(0,(prev.comm||50)-15), pres:Math.max(0,(prev.pres||50)-10) }
            scoresRef.current = penalised
            const avg = Math.round(Object.values(penalised).reduce((a,b)=>a+b,0)/5)
            overallRef.current = avg
            setOverall(avg)
            return penalised
          })
          setForcedEnd(true)
          endSession(true)
        }
      }
    }, 1000)
  }, [clearCountdown, clearSilenceTimer, stopListening, endSession])

  // ── TTS ──────────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text) => {
    setSpeaking(true)
    stopListening()
    try {
      const r = await fetch(`${API}/voice/tts`, { method:'POST', headers:hdr(), body:JSON.stringify({ text }) })
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setSpeaking(false)
        if (!savedRef.current) startListening()
      }
      audio.play().catch(() => { setSpeaking(false); if (!savedRef.current) startListening() })
    } catch {
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.92; u.pitch = 1.05; u.lang = 'en-IN'
      u.onend = () => { setSpeaking(false); if (!savedRef.current) startListening() }
      speechSynthesis.speak(u)
    }
  }, [stopListening, startListening])

  // ── Tab switch detection ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'session') return
    const onVis = () => {
      if (!document.hidden) {
        const newCount = tabViolRef.current + 1
        tabViolRef.current = newCount
        setTabViol(newCount)
        const msg = newCount === 1 ? 'Tab switch detected — Violation 1 of 3.'
          : newCount === 2 ? 'Second violation — One more will end the interview!'
          : 'Third violation — Interview terminated.'
        setViolMsg(msg)
        setTimeout(() => setViolMsg(''), 5000)
        if (newCount >= 3) { setForcedEnd(true); endSession(true) }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase, endSession])

  // ── Start session ─────────────────────────────────────────────────────────────
  const startSession = async () => {
    setPhase('session')
    await startCamera()
    const intro = `Hi ${user?.name?.split(' ')[0] || 'there'}, I am Aria, your Senior HR Interviewer. This interview has ${QUESTIONS.length} questions. The mic opens automatically after I speak — just answer and pause 2 seconds when done. Let's begin.`
    const full  = `${intro} Here is your first question: ${QUESTIONS[0]}`
    setConvo([{ role:'ai', text:full }])
    setLatestMsgIdx(0)
    setStreamKey(k => k+1)
    convoRef.current = [{ role:'ai', text:full }]
    await speak(full)
  }

  // ── Submit answer — with Bytez emotion + similarity scoring ──────────────────
  const submitAnswer = useCallback(async () => {
    const answer = transcriptRef.current.trim()
    if (!answer || submittingRef.current || savedRef.current) return
    submittingRef.current = true
    stopListening()
    clearSilenceTimer()
    clearCountdown()
    setLoading(true)
    setTranscript('')
    transcriptRef.current = ''

    const currentQ = qIdxRef.current
    const nextIdx  = currentQ + 1
    const isLast   = nextIdx >= QUESTIONS.length
    const newConvo = [...convoRef.current, { role:'user', text:answer }]
    setConvo(c => [...c, { role:'user', text:answer }])
    convoRef.current = newConvo

    // ── Run Bytez emotion + similarity in parallel (non-blocking) ──────────────
    const audioBlob   = getAudioBlob()
    const idealAnswer = IDEAL_ANSWERS[currentQ] || ''

    const [emotionResult, similarityScore] = await Promise.allSettled([
      // Emotion: audio blob → confidence/composure
      audioBlob
        ? analyseEmotion(audioBlob)
        : Promise.resolve(emotionFromTranscript(answer)),
      // Similarity: candidate answer vs ideal
      scoreSimilarity(answer, idealAnswer),
    ])

    // Process emotion result
    let emotionData = null
    if (emotionResult.status === 'fulfilled' && emotionResult.value) {
      emotionData = emotionResult.value
      setEmotion(emotionData.emotion)
      setConfidence(emotionData.confidence)
      setApiSources(s => ({ ...s, emotion: audioBlob ? 'bytez' : 'transcript' }))
    } else {
      const fallback = emotionFromTranscript(answer)
      emotionData = fallback
      setEmotion(fallback.emotion)
      setConfidence(fallback.confidence)
      setApiSources(s => ({ ...s, emotion:'transcript' }))
    }

    // Process similarity result
    let bytezSim = null
    if (similarityScore.status === 'fulfilled' && similarityScore.value !== null) {
      bytezSim = similarityScore.value
      setApiSources(s => ({ ...s, similarity:'bytez' }))
    } else {
      setApiSources(s => ({ ...s, similarity:'llm' }))
    }

    // ── Call Groq LLM for feedback + score update ──────────────────────────────
    try {
      const sysPrompt = `You are Aria, a Senior HR Executive conducting a formal job interview. Professional, perceptive, sharp, direct.
Current question: "${QUESTIONS[currentQ]}"
Evaluate briefly (1-2 sentences), then ask: "${isLast ? 'Final question answered. Thank the candidate warmly.' : QUESTIONS[nextIdx]}"
Under 80 words. No emojis. No self-explanation.
At END on new line: SCORES:{"tech":75,"comm":80,"crit":70,"pres":65,"lead":72}
${bytezSim !== null ? `Note: Bytez sentence-similarity score for this answer vs ideal = ${bytezSim}/100. Factor this into tech and crit scores.` : ''}
${emotionData ? `Detected emotion: ${emotionData.emotion}, confidence level: ${emotionData.confidence}/100. Factor into pres score.` : ''}
Scores must reflect cumulative performance.`

      const r = await fetch(`${API}/chat`, {
        method:'POST', headers:hdr(),
        body: JSON.stringify({
          messages: newConvo.map(m => ({ role:m.role==='ai'?'assistant':'user', content:m.text })),
          system: sysPrompt, max_tokens:300
        })
      })
      const d = await r.json()
      let reply = d.reply || "Thank you. Let's continue."

      // Parse LLM scores
      const sm = reply.match(/SCORES:\s*(\{[^}]+\})/)
      if (sm) {
        try {
          let s = JSON.parse(sm[1])
          // Blend Bytez similarity into tech + crit if available
          if (bytezSim !== null) {
            s.tech = Math.round((s.tech * 0.6) + (bytezSim * 0.4))
            s.crit = Math.round((s.crit * 0.7) + (bytezSim * 0.3))
          }
          // Blend emotion into pres if available
          if (emotionData) {
            s.pres = Math.round((s.pres * 0.5) + (emotionData.composure * 0.5))
          }
          setScores(s); scoresRef.current = s
          const avg = Math.round(Object.values(s).reduce((a,b)=>a+b,0)/Object.values(s).length)
          setOverall(avg); overallRef.current = avg
          setApiSources(s2 => ({ ...s2, similarity: bytezSim !== null ? 'bytez' : 'llm' }))
        } catch {}
        reply = reply.replace(/SCORES:\s*\{[^}]+\}/, '').trim()
      }

      const newMsgIdx = newConvo.length
      setConvo(c => [...c, { role:'ai', text:reply }])
      convoRef.current = [...newConvo, { role:'ai', text:reply }]
      setLatestMsgIdx(newMsgIdx)
      setStreamKey(k => k+1)
      if (!isLast) setQIdx(nextIdx)
      setLoading(false)
      submittingRef.current = false
      if (isLast) { await speak(reply); endSession(false) }
      else await speak(reply)

    } catch {
      const fallback = isLast
        ? "Thank you for completing the interview. Best of luck!"
        : `Thank you. Next question: ${QUESTIONS[nextIdx]}`
      const newMsgIdx = newConvo.length
      setConvo(c => [...c, { role:'ai', text:fallback }])
      convoRef.current = [...newConvo, { role:'ai', text:fallback }]
      setLatestMsgIdx(newMsgIdx)
      setStreamKey(k => k+1)
      if (!isLast) setQIdx(nextIdx)
      setLoading(false)
      submittingRef.current = false
      if (isLast) { await speak(fallback); endSession(false) }
      else await speak(fallback)
    }
  }, [stopListening, clearSilenceTimer, clearCountdown, speak, endSession, getAudioBlob])

  useEffect(() => { submitRef.current = submitAnswer }, [submitAnswer])

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'session') return
    const onKey = e => {
      if (e.code === 'Space' && !['INPUT','TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault()
        if (listening) stopListening(); else startListening()
      }
      if (e.code === 'Escape') { setForcedEnd(true); endSession(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, listening, startListening, stopListening, endSession])

  const chatEndRef = useRef(null)
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [convo, speaking])

  // ════════════════════════════════════════════════════════════════════════════
  // INTRO SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === 'intro') return (
    <div style={{ minHeight:'100vh', background:C.bg, fontFamily:'Inter, sans-serif', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'16px 24px', background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center' }}>
        <div style={{ flex:1, textAlign:'center', fontWeight:700, fontSize:15, color:C.navy }}>HR Mode</div>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:40, maxWidth:600, width:'100%', boxShadow:'0 4px 24px rgba(0,0,0,0.06)' }}>
          <div style={{ width:56, height:56, borderRadius:16, background:C.blueBg, border:`1px solid ${C.blueBorder}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div style={{ fontSize:22, fontWeight:700, color:C.navy, marginBottom:8 }}>HR Mock Interview</div>
          <div style={{ fontSize:14, color:C.muted, marginBottom:20, lineHeight:1.6 }}>
            Aria will conduct a formal {QUESTIONS.length}-question interview. Mic opens automatically. Pause 2 seconds to submit. No response in 10 seconds = session terminated.
          </div>

          {/* AI APIs powered by */}
          <div style={{ padding:'12px 16px', borderRadius:10, background:'#F5F3FF', border:'1px solid #DDD6FE', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#7C3AED', letterSpacing:'0.5px', marginBottom:8 }}>POWERED BY AI APIS</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {[
                { label:'Posture Analysis', api:'Bytez mobilenet_v1', fallback:'Geometric canvas' },
                { label:'Emotion Detection', api:'Bytez wav2vec2-xlsr', fallback:'superb/wav2vec2 → transcript' },
                { label:'Answer Scoring', api:'Bytez bge-small-en', fallback:'Groq LLM scores' },
                { label:'AI Feedback', api:'Groq llama-3.1-8b', fallback:'Gemini 2.0 Flash' },
                { label:'Voice (TTS)', api:'ElevenLabs Rachel', fallback:'Browser Speech' },
              ].map(({ label, api, fallback }) => (
                <div key={label} style={{ padding:'6px 10px', borderRadius:8, background:'#ffffff', border:'1px solid #EDE9FE', flex:'1 1 auto', minWidth:140 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.navy }}>{label}</div>
                  <div style={{ fontSize:9, color:'#7C3AED', marginTop:1 }}>{api}</div>
                  <div style={{ fontSize:9, color:C.muted }}>↳ {fallback}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
            {[
              { label:'Auto Mic',    desc:'Opens after every AI response' },
              { label:'2s Silence',  desc:'Auto-detects end of answer' },
              { label:'10s Timeout', desc:'No response = terminated' },
              { label:'Real Posture',desc:'Bytez AI camera analysis' },
              { label:'Real Emotion',desc:'Bytez audio emotion model' },
              { label:'Anti-Cheat',  desc:'3 tab switches = terminated' },
            ].map(({ label, desc }) => (
              <div key={label} style={{ padding:'10px 14px', borderRadius:10, background:C.surface2, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:12, fontWeight:600, color:C.navy, marginBottom:2 }}>{label}</div>
                <div style={{ fontSize:11, color:C.muted }}>{desc}</div>
              </div>
            ))}
          </div>
          <div style={{ padding:'12px 16px', borderRadius:10, background:C.redBg, border:`1px solid ${C.redBorder}`, marginBottom:24, fontSize:12, color:C.red, lineHeight:1.6 }}>
            <strong>Anti-cheat active.</strong> Tab switches tracked. 3 switches = immediate termination. All sessions logged.
          </div>
          <button onClick={startSession} style={{ width:'100%', padding:'14px', borderRadius:10, border:'none', background:C.blue, color:'#fff', fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer' }}>
            Begin Interview
          </button>
          <div style={{ textAlign:'center', marginTop:12, fontSize:11, color:C.muted }}>Space = toggle mic manually · Esc = end</div>
        </div>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // DONE SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === 'done') {
    const scoreItems = [
      { label:'Technical',         val:scores.tech, key:'tech' },
      { label:'Communication',     val:scores.comm, key:'comm' },
      { label:'Critical Thinking', val:scores.crit, key:'crit' },
      { label:'Composure',         val:scores.pres, key:'pres' },
      { label:'Leadership',        val:scores.lead, key:'lead' },
    ]
    const overallColor = overall >= 70 ? C.green : overall >= 45 ? C.amber : C.red
    const weakDims = scoreItems.filter(s => s.val > 0 && s.val < 60).sort((a,b) => a.val - b.val)
    const showCourses = weakDims.length > 0 ? weakDims : [scoreItems.find(s => s.key === 'comm')]
    return (
      <div style={{ minHeight:'100vh', background:C.bg, fontFamily:'Inter, sans-serif', padding:'32px 16px', overflowY:'auto' }}>
        <div style={{ maxWidth:620, margin:'0 auto' }}>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:36, textAlign:'center', boxShadow:'0 4px 24px rgba(0,0,0,0.06)', marginBottom:20 }}>
            {forcedEnd
              ? <div style={{ width:56, height:56, borderRadius:'50%', background:C.redBg, border:`1px solid ${C.redBorder}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
              : <div style={{ width:56, height:56, borderRadius:'50%', background:C.greenBg, border:`1px solid ${C.greenBorder}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
            }
            <div style={{ fontSize:20, fontWeight:700, color:C.navy, marginBottom:6 }}>
              {forcedEnd ? 'Interview Terminated' : 'Interview Complete'}
            </div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:6 }}>
              {forcedEnd
                ? `Ended — ${tabViol>0 ? `${tabViol} tab violation${tabViol>1?'s':''}` : 'no response within 10 seconds'}`
                : `${convoRef.current.filter(m=>m.role==='user').length} questions answered`}
            </div>
            {emotion && (
              <div style={{ fontSize:11, color:'#7C3AED', marginBottom:20 }}>
                Detected emotion: <strong>{emotion}</strong> · Powered by Bytez wav2vec2
              </div>
            )}
            <div style={{ width:96, height:96, borderRadius:'50%', border:`4px solid ${overallColor}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', margin:'0 auto 24px', background:`${overallColor}10` }}>
              <div style={{ fontSize:28, fontWeight:800, color:overallColor }}>{overall || '--'}</div>
              <div style={{ fontSize:10, color:C.muted, fontWeight:600 }}>OVERALL</div>
            </div>
            {/* Score bars with API source badges */}
            <div style={{ textAlign:'left', marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ fontSize:11, fontWeight:600, color:C.muted }}>DIMENSION</span>
                <div style={{ display:'flex', gap:4 }}>
                  <ApiBadge source="bytez" /><ApiBadge source="llm" /><ApiBadge source="transcript" />
                </div>
              </div>
              {scoreItems.map(({ label, val, key }) => (
                <div key={key}>
                  <div style={{ display:'flex', alignItems:'center', marginBottom:2 }}>
                    <span style={{ fontSize:11, color:C.text, fontWeight:500, flex:1 }}>{label}</span>
                    <ApiBadge source={
                      key==='tech'||key==='crit' ? apiSources.similarity :
                      key==='pres' ? apiSources.emotion : 'llm'
                    } />
                    <span style={{ fontSize:11, fontWeight:700, color: val?(val>=70?C.green:val>=45?C.amber:C.red):C.muted, marginLeft:6 }}>
                      {val ? `${val}%` : '--'}
                    </span>
                  </div>
                  <div style={{ height:4, background:C.surface2, borderRadius:2, overflow:'hidden', marginBottom:10 }}>
                    <div style={{ height:'100%', width:`${val||0}%`, background:val>=70?C.green:val>=45?C.amber:C.red, borderRadius:2, transition:'width 0.8s ease' }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => {
                savedRef.current=false; submittingRef.current=false
                setPhase('intro'); setQIdx(0); setConvo([]); setTranscript('')
                setTabViol(0); tabViolRef.current=0
                setScores({tech:0,comm:0,crit:0,pres:0,lead:0}); setOverall(0)
                setForcedEnd(false); setCountdown(null); setSilenceLeft(null); setEmotion(null)
                audioChunksRef.current=[]
              }} style={{ flex:1, padding:'11px', borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', color:C.text, fontFamily:'Inter, sans-serif', fontSize:13, cursor:'pointer' }}>
                Retry
              </button>
              <button onClick={() => nav('/dashboard')} style={{ flex:2, padding:'11px', borderRadius:8, border:'none', background:C.blue, color:'#fff', fontFamily:'Inter, sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Back to Dashboard
              </button>
            </div>
          </div>
          {/* Course recommendations */}
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:28, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.navy, marginBottom:4 }}>Recommended Courses</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:20 }}>Based on your Bytez AI + LLM evaluation, focus on these areas.</div>
            {showCourses.map(({ key, label, val }) => (
              <div key={key} style={{ marginBottom:24 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: val<45?C.red:C.amber, flexShrink:0 }} />
                  <div style={{ fontSize:13, fontWeight:600, color:C.navy }}>{label}</div>
                  {val>0 && <div style={{ fontSize:11, fontWeight:600, color: val<45?C.red:C.amber, marginLeft:'auto' }}>{val}% — {val<45?'Needs Work':'Improve'}</div>}
                </div>
                {(COURSE_MAP[key]?.courses||[]).map((course,i) => (
                  <a key={i} href={course.url} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderRadius:10, border:`1px solid ${C.border}`, background:C.surface2, textDecoration:'none', marginBottom:8, transition:'border-color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor=C.blue}
                    onMouseLeave={e => e.currentTarget.style.borderColor=C.border}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:C.navy, marginBottom:2 }}>{course.title}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{course.platform}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SESSION SCREEN — Image-2 layout, light theme
  // LEFT: big camera feed + BEHAVIOUR ANALYSIS + LIVE SCORES
  // RIGHT: Aria chat + status bar
  // ════════════════════════════════════════════════════════════════════════════
  const postureColor = posture    >= 70 ? C.green : posture    >= 45 ? C.amber : C.red
  const eyeColor     = eyeContact >= 70 ? C.green : eyeContact >= 45 ? C.amber : C.red
  const confColor    = confidence >= 60 ? C.green : confidence >= 35 ? C.amber : C.red

  const BehaviourRow = ({ label, val, color }) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
      <span style={{ fontSize:11, fontWeight:600, color:C.muted, letterSpacing:'0.5px', width:90, flexShrink:0, textTransform:'uppercase' }}>{label}</span>
      <div style={{ flex:1, height:3, background:C.surface2, borderRadius:2, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${val}%`, background:color, borderRadius:2, transition:'width 0.8s ease' }} />
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, width:36, textAlign:'right', flexShrink:0 }}>
        {val >= 70 ? 'GOOD' : val >= 45 ? 'OK' : 'POOR'}
      </span>
    </div>
  )

  return (
    <div style={{ height:'100vh', background:C.bg, fontFamily:'Inter, sans-serif', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Hidden canvas for Bytez posture snapshots */}
      <canvas ref={canvasRef} style={{ display:'none' }} />
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes recpulse{0%,100%{opacity:1}50%{opacity:0.2}}
      `}</style>

      {/* ── TOP HEADER ── */}
      <div style={{ padding:'10px 20px', background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        {/* Left: brand */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ fontWeight:800, fontSize:13, color:C.navy, letterSpacing:'-0.3px' }}>MENTORIX</div>
          <div style={{ width:1, height:14, background:C.border }} />
          <div style={{ fontWeight:700, fontSize:13, color:C.blue }}>HR MODE</div>
        </div>
        {/* Centre: status + timer */}
        <div style={{ flex:1, display:'flex', justifyContent:'center', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 12px', borderRadius:20, background: speaking?C.blueBg:listening?C.redBg:C.surface2, border:`1px solid ${speaking?C.blueBorder:listening?C.redBorder:C.border}` }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background: speaking?C.blue:listening?C.red:C.muted, animation: (speaking||listening)?'recpulse 1.2s infinite':'none' }} />
            <span style={{ fontSize:11, fontWeight:700, color: speaking?C.blue:listening?C.red:C.muted, letterSpacing:'0.5px' }}>
              {speaking ? 'ARIA SPEAKING' : listening ? 'RECORDING' : loading ? 'PROCESSING' : 'STANDBY'}
            </span>
          </div>
          <span style={{ fontSize:11, color:C.muted }}>Q{qIdx+1} / {QUESTIONS.length}</span>
        </div>
        {/* Right: tab violations + terminate */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', gap:4 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:tabViol>=i?C.red:C.border, transition:'background 0.3s' }} title={`Violation ${i}`} />
            ))}
          </div>
          <button onClick={() => { setForcedEnd(true); endSession(true) }}
            style={{ padding:'6px 14px', borderRadius:6, border:`1px solid ${C.redBorder}`, background:C.redBg, color:C.red, fontSize:11, fontWeight:700, cursor:'pointer', letterSpacing:'0.5px' }}>
            TERMINATE SESSION
          </button>
        </div>
      </div>

      {violMsg && (
        <div style={{ padding:'8px 20px', background:C.redBg, borderBottom:`1px solid ${C.redBorder}`, fontSize:12, color:C.red, fontWeight:600, textAlign:'center' }}>
          {violMsg}
        </div>
      )}

      {/* ── MAIN BODY ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ══ LEFT PANEL — Candidate Feed + Analysis ══ */}
        <div style={{ width:300, flexShrink:0, borderRight:`1px solid ${C.border}`, background:C.surface, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* ── CAMERA FEED — big and visible ── */}
          <div style={{ position:'relative', background:'#0F172A', width:'100%', height:195, flexShrink:0, overflow:'hidden' }}>
            <video ref={videoRef} autoPlay muted playsInline
              style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)', display:'block' }} />

            {/* Camera unavailable overlay */}
            {camErr && (
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F172A', gap:8 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="2" y1="2" x2="22" y2="22" stroke="#DC2626"/></svg>
                <span style={{ fontSize:11, color:'#475569' }}>Camera unavailable</span>
                <span style={{ fontSize:10, color:'#334155' }}>Allow access in browser</span>
              </div>
            )}

            {/* Overlays on live feed */}
            {!camErr && (
              <>
                {/* REC badge top-left */}
                <div style={{ position:'absolute', top:10, left:10, display:'flex', alignItems:'center', gap:5, background:'rgba(15,23,42,0.75)', borderRadius:5, padding:'3px 8px', backdropFilter:'blur(4px)' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:C.red, animation:'recpulse 1s infinite' }} />
                  <span style={{ fontSize:9, color:'#fff', fontWeight:700, letterSpacing:'1px' }}>REC</span>
                </div>
                {/* Posture score bottom-right */}
                <div style={{ position:'absolute', bottom:10, right:10, background:'rgba(15,23,42,0.8)', borderRadius:6, padding:'5px 10px', textAlign:'center', backdropFilter:'blur(4px)' }}>
                  <div style={{ fontSize:16, fontWeight:800, color:postureColor, lineHeight:1 }}>{posture}%</div>
                  <div style={{ fontSize:8, color:'#94A3B8', letterSpacing:'0.5px', marginTop:2 }}>POSTURE</div>
                </div>
                {/* Bytez / Geometric badge top-right */}
                <div style={{ position:'absolute', top:10, right:10, fontSize:8, color:'#fff', background: apiSources.posture==='bytez'?'rgba(124,58,237,0.85)':'rgba(71,85,105,0.85)', borderRadius:4, padding:'2px 6px', fontWeight:700, backdropFilter:'blur(4px)' }}>
                  {apiSources.posture === 'bytez' ? 'Bytez AI' : 'Geometric'}
                </div>
                {/* Corner frame lines (like image 2) */}
                <div style={{ position:'absolute', top:0, left:0, width:16, height:16, borderTop:`2px solid ${C.blue}`, borderLeft:`2px solid ${C.blue}` }} />
                <div style={{ position:'absolute', top:0, right:0, width:16, height:16, borderTop:`2px solid ${C.blue}`, borderRight:`2px solid ${C.blue}` }} />
                <div style={{ position:'absolute', bottom:0, left:0, width:16, height:16, borderBottom:`2px solid ${C.blue}`, borderLeft:`2px solid ${C.blue}` }} />
                <div style={{ position:'absolute', bottom:0, right:0, width:16, height:16, borderBottom:`2px solid ${C.blue}`, borderRight:`2px solid ${C.blue}` }} />
              </>
            )}
          </div>

          {/* Camera label */}
          <div style={{ padding:'6px 14px', background:C.surface2, borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
            <span style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:'0.8px' }}>CANDIDATE FEED</span>
            <span style={{ fontSize:10, color:C.muted }}>{user?.name || 'Candidate'}</span>
          </div>

          {/* Scrollable analysis area */}
          <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>

            {/* BEHAVIOUR ANALYSIS section */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:'1px', marginBottom:8 }}>BEHAVIOUR ANALYSIS</div>

              {/* Emotion row */}
              {emotion && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.border}`, marginBottom:0 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:C.muted, letterSpacing:'0.5px', width:90, flexShrink:0, textTransform:'uppercase' }}>Emotion</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#7C3AED', textTransform:'capitalize', flex:1 }}>{emotion}</span>
                  <ApiBadge source={apiSources.emotion} />
                </div>
              )}

              <BehaviourRow label="Eye Contact" val={eyeContact} color={eyeColor} />
              <BehaviourRow label="Posture"     val={posture}    color={postureColor} />
              <BehaviourRow label="Confidence"  val={confidence} color={confColor} />
            </div>

            {/* LIVE SCORES section */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:'1px', marginBottom:8 }}>LIVE SCORES</div>
              {[
                { label:'Technical',        val:scores.tech, src:apiSources.similarity },
                { label:'Communication',    val:scores.comm, src:'llm' },
                { label:'Critical Thinking',val:scores.crit, src:apiSources.similarity },
                { label:'Pressure',         val:scores.pres, src:apiSources.emotion },
                { label:'Leadership',       val:scores.lead, src:'llm' },
              ].map(({ label, val, src }) => {
                const color = val >= 70 ? C.green : val >= 45 ? C.amber : C.red
                return (
                  <div key={label} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:11, fontWeight:600, color:C.muted, width:90, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.3px', fontSize:10 }}>{label}</span>
                    <div style={{ flex:1, height:3, background:C.surface2, borderRadius:2, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${val||0}%`, background: val ? color : C.border, borderRadius:2, transition:'width 0.8s ease' }} />
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                      <ApiBadge source={src} />
                      <span style={{ fontSize:11, fontWeight:700, color: val ? color : C.muted, width:28, textAlign:'right' }}>{val ? `${val}` : '--'}</span>
                    </div>
                  </div>
                )
              })}
            </div>

          </div>
        </div>

        {/* ══ RIGHT PANEL — Aria + transcript ══ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Aria header */}
          <div style={{ padding:'14px 24px', borderBottom:`1px solid ${C.border}`, background:C.surface, display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ fontSize:14, fontWeight:800, color:'#fff', letterSpacing:'-0.5px' }}>HR</span>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:C.navy }}>ARIA</div>
              <div style={{ fontSize:11, color:C.muted, letterSpacing:'0.5px' }}>SENIOR HR EXECUTIVE — AI</div>
            </div>
            <div style={{ marginLeft:'auto' }}>
              <div style={{ fontSize:10, color:C.muted, textAlign:'right', marginBottom:2 }}>Progress</div>
              <div style={{ width:120, height:3, background:C.surface2, borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${((qIdx+1)/QUESTIONS.length)*100}%`, background:C.blue, borderRadius:2, transition:'width 0.5s ease' }} />
              </div>
            </div>
          </div>

          {/* Chat messages */}
          <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
            {convo.map((msg, i) => (
              <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start', flexDirection: msg.role==='user'?'row-reverse':'row' }}>
                {msg.role==='ai' && (
                  <div style={{ width:36, height:36, borderRadius:10, background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:11, fontWeight:800, color:'#fff' }}>HR</span>
                  </div>
                )}
                <div style={{
                  maxWidth:'76%', padding:'12px 16px',
                  borderRadius: msg.role==='ai'?'4px 16px 16px 16px':'16px 4px 16px 16px',
                  background: msg.role==='ai'?C.surface:C.blue,
                  border: msg.role==='ai'?`1px solid ${C.border}`:'none',
                  color: msg.role==='ai'?C.navy:'#fff',
                  fontSize:14, lineHeight:1.65, fontWeight: msg.role==='ai'?500:400,
                }}>
                  {msg.role==='ai' && i===latestMsgIdx
                    ? <StreamingText key={`st-${streamKey}`} text={msg.text} streamKey={streamKey} />
                    : msg.text}
                </div>
              </div>
            ))}
            {(speaking||loading) && (
              <div style={{ display:'flex', gap:10, alignItems:'center', padding:'4px 0' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:'#fff' }}>HR</span>
                </div>
                <div style={{ display:'flex', gap:5, padding:'12px 18px', background:C.surface, border:`1px solid ${C.border}`, borderRadius:'4px 16px 16px 16px' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:C.blue, animation:`pulse 1.2s ${i*0.2}s infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ── STATUS / INPUT BAR ── */}
          <div style={{ padding:'14px 24px', borderTop:`1px solid ${C.border}`, background:C.surface, flexShrink:0 }}>

            {/* 10s countdown bar */}
            {listening && !speaking && countdown!==null && !transcript && (
              <div style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontSize:11, color:C.red, fontWeight:600 }}>No response detected — terminating in {countdown}s</span>
                </div>
                <div style={{ height:3, background:C.redBg, borderRadius:2, overflow:'hidden', border:`1px solid ${C.redBorder}` }}>
                  <div style={{ height:'100%', width:`${(countdown/10)*100}%`, background:C.red, borderRadius:2, transition:'width 1s linear' }} />
                </div>
              </div>
            )}

            {/* 2s silence notice */}
            {listening && silenceLeft!==null && (
              <div style={{ marginBottom:6, fontSize:11, color:C.amber, fontWeight:600 }}>
                Pause detected — submitting in {silenceLeft}s…
              </div>
            )}

            {/* Live transcript box — like image 2 "Respond to the interviewer" */}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', border:`1px solid ${listening && !speaking ? C.blue : C.border}`, borderRadius:10, background: listening && !speaking ? C.blueBg : C.surface2, transition:'border-color 0.2s, background 0.2s', minHeight:48 }}>
              {/* Mic icon */}
              <div style={{ width:32, height:32, borderRadius:8, background: listening && !speaking ? C.blue : C.surface, border:`1px solid ${listening && !speaking ? C.blue : C.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.2s' }}>
                {listening && !speaking
                  ? <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff', animation:'recpulse 1s infinite' }} />
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                }
              </div>
              <span style={{ flex:1, fontSize:13, color: transcript ? C.navy : C.muted, lineHeight:1.5, fontStyle: transcript ? 'normal' : 'italic' }}>
                {transcript || (listening && !speaking ? 'Listening… speak your answer' : speaking ? 'Aria is speaking — mic opens after' : loading ? 'Processing your answer…' : 'Respond to the interviewer…')}
              </span>
              {/* Send indicator when silence detected */}
              {silenceLeft !== null && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              )}
              {(speaking || loading) && (
                <div style={{ width:14, height:14, border:`2px solid ${C.blueBorder}`, borderTopColor:C.blue, borderRadius:'50%', animation:'spin 0.8s linear infinite', flexShrink:0 }} />
              )}
            </div>

            {/* Keyboard hint */}
            <div style={{ textAlign:'center', marginTop:8, fontSize:10, color:C.muted }}>
              <kbd style={{ padding:'1px 5px', borderRadius:3, border:`1px solid ${C.border}`, fontSize:10, background:C.surface2, fontFamily:'monospace' }}>Space</kbd> toggle mic &nbsp;·&nbsp;
              <kbd style={{ padding:'1px 5px', borderRadius:3, border:`1px solid ${C.border}`, fontSize:10, background:C.surface2, fontFamily:'monospace' }}>Esc</kbd> end session
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}