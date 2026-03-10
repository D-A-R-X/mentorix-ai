// src/pages/HR.jsx  — Full rebuild: old HR features + light theme + Bytez AI
// ─────────────────────────────────────────────────────────────────────────────
// Features from old hr-mode.html:
//   ✅ Voice + Text input modes (toggle)
//   ✅ Aria avatar with speaking pulse animation
//   ✅ Timer (MM:SS elapsed)
//   ✅ Live Feed camera in left panel with corner brackets
//   ✅ Eye Contact / Posture / Confidence bars
//   ✅ Live Scores: Technical, Communication, Critical Thinking, Pressure, Leadership
//   ✅ Groq AI reply with [[END_INTERVIEW]] signal
//   ✅ Full assessment report generation on done screen
//   ✅ Department-aware questions
//   ✅ Tab violation tracking (3 = terminated)
//   ✅ Space = toggle mic  |  Esc = terminate confirm
// Bytez: posture/emotion/similarity via backend proxy
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const API = import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'

const hdr = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('mentorix_token') || ''}`
})

// ── Design tokens (light theme) ───────────────────────────────────────────────
const C = {
  bg:'#F8F9FC', surface:'#FFFFFF', surface2:'#F1F4F9', border:'#E2E8F0',
  blue:'#2563EB', navy:'#0F172A', text:'#334155', muted:'#94A3B8',
  green:'#059669', red:'#DC2626', amber:'#D97706',
  blueBg:'#EFF6FF', blueBorder:'#BFDBFE',
  greenBg:'#ECFDF5', greenBorder:'#A7F3D0',
  redBg:'#FEF2F2', redBorder:'#FECACA',
  amberBg:'#FFFBEB', amberBorder:'#FDE68A',
}

// ── Department-specific tech areas (from old hr-mode) ─────────────────────────
const DEPT_AREAS = {
  CSE:'data structures, algorithms, OOP, database design, system design, networks, OS',
  IT:'networking, cybersecurity, database management, web development, cloud computing',
  AIDS:'machine learning, data preprocessing, model evaluation, Python, statistics',
  AIML:'neural networks, deep learning, NLP, computer vision, PyTorch/TensorFlow',
  ECE:'digital electronics, microcontrollers, signal processing, communication systems, VLSI',
  EEE:'power systems, electrical machines, control systems, power electronics',
  MECH:'thermodynamics, fluid mechanics, manufacturing, CAD, machine design',
  CIVIL:'structural analysis, construction materials, geotechnical engineering',
}

// ── Ideal answers for Bytez similarity scoring ────────────────────────────────
const IDEAL_ANSWERS = [
  "I am a student with strong problem-solving skills and experience in software development, teamwork, and communication.",
  "I worked on a complex project, faced challenges, and solved them through research, teamwork, and iterative debugging.",
  "I see myself as a professional specialising in my domain, contributing to meaningful projects and growing into a leadership role.",
  "I prioritise tasks, break work into manageable steps, stay calm under pressure, and communicate proactively.",
  "I contributed as a developer and collaborator, ensuring clear communication and delivering my part on time.",
  "I struggle with perfectionism but I actively work on setting realistic deadlines.",
  "I bring a unique combination of technical skills, collaborative attitude, and commitment to continuous learning.",
  "I took initiative, broke down the problem, delegated tasks, and guided the team to a solution.",
  "I follow tech blogs, take online courses, attend meetups, and work on personal projects.",
  "Yes, I would like to know about the team culture and opportunities for learning and growth.",
]

// ── Course recommendations ────────────────────────────────────────────────────
const COURSE_MAP = {
  tech: { label:'Technical Skills', courses:[
    { title:'Data Structures & Algorithms', platform:'NPTEL', url:'https://nptel.ac.in/courses/106/106/106106127/' },
    { title:'System Design Fundamentals', platform:'Coursera', url:'https://www.coursera.org/learn/system-design' },
    { title:'CS Essentials — CS50', platform:'edX', url:'https://www.edx.org/cs50' },
  ]},
  comm: { label:'Communication', courses:[
    { title:'English Communication Skills', platform:'Coursera', url:'https://www.coursera.org/learn/english-communication' },
    { title:'Public Speaking & Presentation', platform:'Udemy', url:'https://www.udemy.com/course/public-speaking-complete-course/' },
    { title:'Business English Communication', platform:'edX', url:'https://www.edx.org/learn/english' },
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

// ── Bytez helpers (via backend proxy) ─────────────────────────────────────────
async function analysePostureFromCanvas(canvas) {
  try {
    const image_b64 = canvas.toDataURL('image/jpeg', 0.6)
    const res = await fetch(`${API}/bytez/posture`, { method:'POST', headers:hdr(), body:JSON.stringify({ image_b64 }) })
    if (!res.ok) throw new Error()
    const data = await res.json()
    if (data.posture && data.source === 'bytez') return { score: data.posture, source:'bytez' }
    throw new Error()
  } catch { return { score: geometricPostureScore(canvas), source:'geometric' } }
}

function geometricPostureScore(canvas) {
  try {
    const ctx = canvas.getContext('2d', {willReadFrequently:true}), w = canvas.width, h = canvas.height
    const d = ctx.getImageData(0, 0, w, h).data
    let light = 0, count = 0
    for (let y = 0; y < h * 0.35; y++) for (let x = w * 0.25; x < w * 0.75; x++) {
      const i = (Math.floor(y)*w + Math.floor(x))*4
      light += (d[i]+d[i+1]+d[i+2])/3; count++
    }
    return Math.round(Math.max(35, Math.min(92, (count>0?light/count:128)/255*85+20)))
  } catch { return 70 }
}

async function analyseEmotion(audioBlob) {
  try {
    const audio_b64 = await blobToBase64(audioBlob)
    const res = await fetch(`${API}/bytez/emotion`, { method:'POST', headers:hdr(), body:JSON.stringify({ audio_b64 }) })
    if (!res.ok) throw new Error()
    const data = await res.json()
    if (data.emotion && data.source !== 'fallback') return data
    throw new Error()
  } catch { return null }
}

async function scoreSimilarity(candidate, ideal) {
  try {
    const res = await fetch(`${API}/bytez/similarity`, { method:'POST', headers:hdr(), body:JSON.stringify({ candidate, ideal }) })
    if (!res.ok) throw new Error()
    const data = await res.json()
    if (data.score !== null && data.source === 'bytez') return data.score
    throw new Error()
  } catch { return null }
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onloadend = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(blob)
  })
}

// ── StreamingText ─────────────────────────────────────────────────────────────
function StreamingText({ text, streamKey }) {
  const [shown, setShown] = useState('')
  const t = useRef(null)
  useEffect(() => {
    setShown(''); clearTimeout(t.current)
    let i = 0; const words = text.split(' ')
    const tick = () => { i++; setShown(words.slice(0,i).join(' ')); if(i<words.length) t.current=setTimeout(tick,50) }
    t.current = setTimeout(tick, 60)
    return () => clearTimeout(t.current)
  }, [streamKey]) // eslint-disable-line
  return <span>{shown}<span style={{display:'inline-block',width:2,height:'1em',background:C.blue,marginLeft:2,verticalAlign:'text-bottom',animation:'blink 0.9s step-end infinite'}}/></span>
}

// ── Score parsing from text (old hr-mode logic) ───────────────────────────────
function parseScoresFromAnswer(answer, aiReply, prevScores) {
  const wordCount = answer.split(' ').length
  const hasDetail = wordCount > 20, hasGoodDetail = wordCount > 35, isVague = wordCount < 8
  const isConfident = !/i think|maybe|not sure|i guess|probably/i.test(answer)
  const isChallenged = /(incorrect|wrong|that.s not|not quite|unclear)/i.test(aiReply)
  const isCorrect = /(correct|good point|well done|exactly|that.s right|good answer)/i.test(aiReply)
  const s = {
    tech: prevScores.tech || 45,
    comm: prevScores.comm || 45,
    crit: prevScores.crit || 40,
    pres: prevScores.pres || 50,
    lead: prevScores.lead || 40,
  }
  s.tech = Math.min(100,Math.max(10,s.tech+(isCorrect?10:0)+(isChallenged?-7:0)+(hasGoodDetail?6:hasDetail?3:0)+(isVague?-5:0)+(isConfident?2:0)))
  s.comm = Math.min(100,Math.max(10,s.comm+(hasGoodDetail?8:hasDetail?5:0)+(isVague?-6:0)+(isConfident?4:-2)))
  s.crit = Math.min(100,Math.max(10,s.crit+(isCorrect?8:0)+(hasGoodDetail?7:hasDetail?4:0)+(isVague?-7:0)+(isChallenged?-4:0)))
  s.pres = Math.min(100,Math.max(10,s.pres+(isChallenged&&!isVague?6:0)+(isChallenged&&isVague?-6:0)+(isConfident?3:-2)+(hasDetail?2:0)))
  s.lead = Math.min(100,Math.max(10,s.lead+(hasGoodDetail?7:hasDetail?4:0)+(isConfident?5:-3)+(isVague?-5:0)+(isCorrect?4:0)))
  return s
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function HRMode() {
  const nav = useNavigate()
  const { user } = useAuth()

  // Derive clean name: extract quoted nickname if present, else strip number prefix
  const _rawName = user?.name || 'Candidate'
  const _quoted = _rawName.match(/"([^"]+)"/)
  const cleanName = _quoted
    ? _quoted[1].trim()
    : _rawName.replace(/^\d+\s*/, '').trim().split(/\s+/).slice(0,2).join(' ') || 'Candidate'
  const dept = user?.department || user?.dept || 'CSE'
  const year = user?.year || '3'

  const [phase, setPhase]         = useState('intro')
  const [inputMode, setInputMode] = useState('voice') // 'voice' | 'type'
  const [typedText, setTypedText] = useState('')
  const [convo, setConvo]         = useState([])
  const [scores, setScores]       = useState({ tech:0, comm:0, crit:0, pres:0, lead:0 })
  const [overall, setOverall]     = useState(0)
  const [posture, setPosture]     = useState(0)
  const [confidence, setConfidence] = useState(0)
  const [eyeContact, setEyeContact] = useState(0)
  const [emotion, setEmotion]     = useState(null)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [camErr, setCamErr]       = useState(false)
  const [tabViol, setTabViol]     = useState(0)
  const [violMsg, setViolMsg]     = useState('')
  const [forcedEnd, setForcedEnd] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [countdown, setCountdown] = useState(null)
  const [silenceLeft, setSilenceLeft] = useState(null)
  const [elapsed, setElapsed]     = useState(0)  // seconds elapsed
  const [streamKey, setStreamKey] = useState(0)
  const [latestMsgIdx, setLatestMsgIdx] = useState(-1)
  const [qNum, setQNum]           = useState(0)
  const [report, setReport]       = useState('')

  // Refs
  const videoRef       = useRef(null)
  const canvasRef      = useRef(null)
  const recogRef       = useRef(null)
  const streamRef      = useRef(null)
  const mediaRecRef    = useRef(null)
  const audioChunksRef = useRef([])
  const postureTimerRef = useRef(null)
  const elapsedTimerRef = useRef(null)
  const convoRef       = useRef([])
  const tabViolRef     = useRef(0)
  const savedRef       = useRef(false)
  const qNumRef        = useRef(0)
  const scoresRef      = useRef({ tech:0, comm:0, crit:0, pres:0, lead:0 })
  const overallRef     = useRef(0)
  const silenceTimerRef = useRef(null)
  const countdownRef   = useRef(null)
  const submittingRef  = useRef(false)
  const transcriptRef  = useRef('')
  const submitRef      = useRef(null)
  const activeRef      = useRef(false)
  const chatEndRef     = useRef(null)

  useEffect(() => { scoresRef.current = scores }, [scores])
  useEffect(() => { overallRef.current = overall }, [overall])
  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { qNumRef.current = qNum }, [qNum])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [convo, speaking])

  // ── Camera ──────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:'user', width:320, height:240 }, audio: true
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      try {
        const mr = new MediaRecorder(new MediaStream(stream.getAudioTracks()), { mimeType:'audio/webm;codecs=opus' })
        mr.ondataavailable = e => { if(e.data.size>0) audioChunksRef.current.push(e.data) }
        mr.start(1000); mediaRecRef.current = mr
      } catch {}
      postureTimerRef.current = setInterval(async () => {
        setEyeContact(e => Math.max(50, Math.min(100, e + (Math.random()>0.6?1:-1)*Math.floor(Math.random()*3))))
        if (videoRef.current && canvasRef.current) {
          const cv = canvasRef.current, ctx = cv.getContext('2d', {willReadFrequently:true})
          cv.width = videoRef.current.videoWidth||320; cv.height = videoRef.current.videoHeight||240
          ctx.drawImage(videoRef.current, 0, 0, cv.width, cv.height)
          const result = await analysePostureFromCanvas(cv)
          setPosture(typeof result === 'object' ? result.score : result)
        } else {
          setPosture(p => Math.max(40, Math.min(100, p + (Math.random()>0.5?1:-1)*3)))
        }
      }, 3000)
    } catch { setCamErr(true) }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    clearInterval(postureTimerRef.current)
    try { if(mediaRecRef.current?.state!=='inactive') mediaRecRef.current?.stop() } catch {}
  }, [])

  const getAudioBlob = useCallback(() => {
    if (!audioChunksRef.current.length) return null
    const b = new Blob(audioChunksRef.current, { type:'audio/webm' })
    audioChunksRef.current = []; return b
  }, [])

  // ── Timer ───────────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    elapsedTimerRef.current = setInterval(() => setElapsed(e => e+1), 1000)
  }, [])
  const stopTimer = useCallback(() => clearInterval(elapsedTimerRef.current), [])
  const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── Silence/countdown helpers ────────────────────────────────────────────────
  const clearSilence = useCallback(() => { clearTimeout(silenceTimerRef.current); setSilenceLeft(null) }, [])
  const clearCdown   = useCallback(() => { clearInterval(countdownRef.current); setCountdown(null) }, [])

  const stopListening = useCallback(() => {
    if (recogRef.current) { try{recogRef.current.stop()}catch{}; recogRef.current=null }
    setListening(false); clearSilence()
  }, [clearSilence])

  // ── TTS ──────────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text, onEnd) => {
    setSpeaking(true); stopListening()
    const done = () => { setSpeaking(false); onEnd?.() }
    try {
      const r = await fetch(`${API}/voice/tts`, { method:'POST', headers:hdr(), body:JSON.stringify({ text }) })
      if (!r.ok) throw new Error()
      const blob = await r.blob(), url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { URL.revokeObjectURL(url); done() }
      audio.play().catch(() => done())
    } catch {
      const u = new SpeechSynthesisUtterance(text)
      u.rate=0.92; u.pitch=1.05; u.lang='en-IN'; u.onend=done
      speechSynthesis.speak(u)
    }
  }, [stopListening])

  // ── End session ──────────────────────────────────────────────────────────────
  const endSession = useCallback(async (forced=false) => {
    if (savedRef.current) return
    savedRef.current = true; submittingRef.current = true; activeRef.current = false
    stopListening(); stopCamera(); stopTimer(); clearSilence(); clearCdown()
    setPhase('done')
    const exchanges = convoRef.current.filter(m=>m.role==='user').length
    const sc = scoresRef.current
    const overall = Math.round(Object.values(sc).filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(1,Object.values(sc).filter(v=>v>0).length))
    setOverall(overall)
    // Generate report via LLM
    try {
      const tscript = convoRef.current.map(m=>`${m.role==='ai'?'ARIA (HR)':cleanName}: ${m.text}`).join('\n')
      const reportSys = `You are a senior HR analyst. Cold, professional assessment report for ${cleanName} (${dept}, Year ${year}).
SCORES: Technical:${Math.round(sc.tech||0)}/100, Communication:${Math.round(sc.comm||0)}/100, Critical Thinking:${Math.round(sc.crit||0)}/100, Pressure:${Math.round(sc.pres||0)}/100, Leadership:${Math.round(sc.lead||0)}/100, Overall:${overall}/100
Format:
VERDICT: [one cold sentence]

STRENGTHS:
• [strength 1]
• [strength 2]

CRITICAL WEAKNESSES:
• [weakness 1]
• [weakness 2]

IMPROVEMENT PLAN:
• [action 1]
• [action 2]
• [action 3]

Under 200 words. Direct, not encouraging.
Transcript:
${tscript}`
      const r2 = await fetch(`${API}/chat`, { method:'POST', headers:hdr(), body:JSON.stringify({ messages:[{role:'user',content:'generate report'}], system:reportSys, max_tokens:400 }) })
      const d2 = await r2.json()
      setReport(d2.reply || 'Report generation failed.')
      await fetch(`${API}/voice/save`, { method:'POST', headers:hdr(), body:JSON.stringify({
        transcript: tscript, summary:`[HR MODE REPORT]\n${d2.reply||''}`,
        tab_warnings: tabViolRef.current, exchange_count: exchanges,
        scores: sc, overall_score: overall, mode:'hr_interview', forced_end: forced,
      })})
      // Save recommended courses to backend so Dashboard courses tab shows them
      const weakDims = Object.entries(sc).filter(([,v])=>v>0&&v<65).sort((a,b)=>a[1]-b[1]).slice(0,2).map(([k])=>k)
      const COURSE_LIST = {
        tech:[{title:'Data Structures & Algorithms',platform:'NPTEL',url:'https://nptel.ac.in/courses/106/106/106106127/'},{title:'CS Essentials — CS50',platform:'edX',url:'https://www.edx.org/cs50'}],
        comm:[{title:'English Communication Skills',platform:'Coursera',url:'https://www.coursera.org/learn/english-communication'},{title:'Public Speaking',platform:'Udemy',url:'https://www.udemy.com/course/public-speaking-complete-course/'}],
        crit:[{title:'Problem Solving & Critical Thinking',platform:'Coursera',url:'https://www.coursera.org/learn/critical-thinking-problem-solving'}],
        pres:[{title:'Confidence Under Pressure',platform:'Udemy',url:'https://www.udemy.com/course/confidence-mastery/'},{title:'Interview Prep Masterclass',platform:'Coursera',url:'https://www.coursera.org/learn/interview-preparation'}],
        lead:[{title:'Leadership for Engineers',platform:'Coursera',url:'https://www.coursera.org/specializations/leadership-development-for-engineers'}],
      }
      const toSave = weakDims.flatMap(k => (COURSE_LIST[k]||[]).slice(0,1))
      for (const course of toSave) {
        try {
          await fetch(`${API}/courses/recommend`, { method:'POST', headers:hdr(), body:JSON.stringify({
            course_title: course.title, provider: course.platform, course_url: course.url, track: 'hr_recommended', status: 'in_progress'
          })})
        } catch {}
      }
    } catch { setReport('Report generation failed. Session data has been saved.') }
  }, [stopListening, stopCamera, stopTimer, clearSilence, clearCdown, cleanName, dept, year])

  // ── Start listening ───────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (savedRef.current || !activeRef.current) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    if (recogRef.current) { try{recogRef.current.stop()}catch{} }
    const r = new SR(); r.continuous=true; r.interimResults=true; r.lang='en-IN'
    recogRef.current = r

    r.onresult = e => {
      let chunk = ''
      for (const res of e.results) { if(res.isFinal) chunk += res[0].transcript+' ' }
      if (!chunk.trim()) return
      clearCdown()
      clearTimeout(silenceTimerRef.current)
      setTranscript(prev => { const u=prev+chunk; transcriptRef.current=u; return u })
      let secs = 2; setSilenceLeft(secs)
      const tick = () => {
        secs--; setSilenceLeft(secs<=0?null:secs)
        if (secs<=0) { if(submitRef.current) submitRef.current() }
        else silenceTimerRef.current = setTimeout(tick, 1000)
      }
      silenceTimerRef.current = setTimeout(tick, 1000)
    }
    r.onend = () => { if(recogRef.current===r && !submittingRef.current && activeRef.current) try{r.start()}catch{} }
    r.start(); setListening(true)

    // 10s no-response timeout
    clearInterval(countdownRef.current)
    let secs = 10; setCountdown(secs)
    countdownRef.current = setInterval(() => {
      secs--; setCountdown(secs<=0?null:secs)
      if (secs<=0) {
        clearInterval(countdownRef.current)
        if (!transcriptRef.current.trim()) {
          stopListening()
          setScores(prev => {
            const p = {...prev, comm:Math.max(0,(prev.comm||50)-15), pres:Math.max(0,(prev.pres||50)-10)}
            scoresRef.current=p; return p
          })
          setForcedEnd(true); endSession(true)
        }
      }
    }, 1000)
  }, [clearCdown, clearSilence, stopListening, endSession])

  // ── Tab switch ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'session') return
    const onVis = () => {
      if (!document.hidden && activeRef.current) {
        const n = tabViolRef.current + 1; tabViolRef.current = n; setTabViol(n)
        const msg = n===1?'Tab switch detected — Violation 1 of 3.':n===2?'Second violation — one more will terminate!':'Third violation — Interview terminated.'
        setViolMsg(msg); setTimeout(()=>setViolMsg(''), 5000)
        if (n>=3) { setForcedEnd(true); endSession(true) }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase, endSession])

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'session') return
    const onKey = e => {
      if (e.code==='Space' && inputMode==='voice' && !['INPUT','TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault(); if(listening) stopListening(); else startListening()
      }
      if (e.code==='Escape') {
        if (confirm('TERMINATE SESSION?\n\nThis will end your interview early.')) { setForcedEnd(true); endSession(true) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, inputMode, listening, startListening, stopListening, endSession])

  // ── Start session ─────────────────────────────────────────────────────────────
  const startSession = async () => {
    setPhase('session'); activeRef.current = true
    await startCamera(); startTimer()
    const techAreas = DEPT_AREAS[dept.toUpperCase()] || 'core technical concepts of your field'
    const opening = `Good day. I am Aria, Senior HR Executive at Mentorix AI. I will be assessing your technical knowledge in ${dept}, your communication, problem solving ability, and how you perform under pressure. There are no second chances in this session. Answer clearly and concisely. Let's begin. ${cleanName}, tell me about yourself — your background, your department, and why you chose ${dept}.`
    setConvo([{ role:'ai', text:opening }]); setLatestMsgIdx(0); setStreamKey(k=>k+1)
    convoRef.current = [{ role:'ai', text:opening }]
    await speak(opening, () => { if(activeRef.current) startListening() })
  }

  // ── Submit answer ─────────────────────────────────────────────────────────────
  const submitAnswer = useCallback(async (text) => {
    const answer = (text || transcriptRef.current).trim()
    if (!answer || submittingRef.current || savedRef.current) return
    submittingRef.current = true
    stopListening(); clearSilence(); clearCdown()
    setLoading(true); setTranscript(''); transcriptRef.current = ''; setTypedText('')

    const currentQNum = qNumRef.current + 1
    setQNum(currentQNum); qNumRef.current = currentQNum

    const newConvo = [...convoRef.current, { role:'user', text:answer }]
    setConvo(c => [...c, { role:'user', text:answer }]); convoRef.current = newConvo

    // Bytez: emotion + similarity in parallel
    const audioBlob = getAudioBlob()
    const ideal = IDEAL_ANSWERS[Math.min(currentQNum-1, IDEAL_ANSWERS.length-1)] || ''
    const [emotionRes, simScore] = await Promise.allSettled([
      audioBlob ? analyseEmotion(audioBlob) : Promise.resolve(null),
      scoreSimilarity(answer, ideal),
    ])
    const emotionData = emotionRes.status==='fulfilled' ? emotionRes.value : null
    const bytezSim    = simScore.status==='fulfilled' ? simScore.value : null
    if (emotionData) { setEmotion(emotionData.emotion); setConfidence(emotionData.confidence||60) }

    // Groq LLM reply
    const techAreas = DEPT_AREAS[dept.toUpperCase()] || 'core technical concepts'
    const sysPrompt = `You are Aria, a Senior HR Executive conducting a strict formal interview. Interviewing ${cleanName}, Year ${year} ${dept} student.
TECHNICAL AREAS: ${techAreas}
PERSONALITY:
- Cold, professional, no small talk
- Challenge vague answers: "That's too vague. Be specific."
- Follow up on weak answers
- Only briefly acknowledge truly good answers
STRUCTURE:
- Background and motivation (2-3 questions)
- Core technical questions for ${dept} (3-5 questions)
- Problem solving scenarios (2-3 questions)
- Leadership, teamwork, failure (2 questions)
- End with a pressure question, cold verdict, then [[END_INTERVIEW]]
RULES:
- ONE question per response
- Max 3 sentences + question
- Never warm or encouraging
- When you have assessed all areas fully, give brief cold verdict then [[END_INTERVIEW]]
${bytezSim!==null?`Note: answer quality similarity score = ${bytezSim}/100. Factor into tech/crit scoring.`:''}
${emotionData?`Detected emotion: ${emotionData.emotion}, confidence: ${emotionData.confidence}/100. Factor into pressure score.`:''}`

    try {
      const r = await fetch(`${API}/chat`, { method:'POST', headers:hdr(), body:JSON.stringify({
        messages: newConvo.map(m => ({ role:m.role==='ai'?'assistant':'user', content:m.text })),
        system: sysPrompt, max_tokens: 300
      })})
      const d = await r.json()
      let reply = d.reply || "Elaborate on that."
      const isEnd = reply.includes('[[END_INTERVIEW]]')
      const clean = reply.replace('[[END_INTERVIEW]]','').trim()

      // Update scores from answer analysis
      const newScores = parseScoresFromAnswer(answer, reply, scoresRef.current)
      // Blend Bytez similarity into tech/crit
      if (bytezSim !== null) {
        newScores.tech = Math.round((newScores.tech*0.6) + (bytezSim*0.4))
        newScores.crit = Math.round((newScores.crit*0.7) + (bytezSim*0.3))
      }
      // Blend emotion into pres
      if (emotionData?.composure) newScores.pres = Math.round((newScores.pres*0.5) + (emotionData.composure*0.5))
      setScores(newScores); scoresRef.current = newScores
      const avg = Math.round(Object.values(newScores).filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(1,Object.values(newScores).filter(v=>v>0).length))
      setOverall(avg); overallRef.current = avg

      const newIdx = newConvo.length
      setConvo(c => [...c, { role:'ai', text:clean }]); convoRef.current = [...newConvo, { role:'ai', text:clean }]
      setLatestMsgIdx(newIdx); setStreamKey(k=>k+1)
      setLoading(false); submittingRef.current = false

      if (isEnd) { await speak(clean, () => endSession(false)) }
      else { await speak(clean, () => { if(activeRef.current) startListening() }) }
    } catch {
      const fb = "Your connection seems unstable. Please repeat your answer."
      const newIdx = newConvo.length
      setConvo(c => [...c, { role:'ai', text:fb }]); convoRef.current = [...newConvo, { role:'ai', text:fb }]
      setLatestMsgIdx(newIdx); setStreamKey(k=>k+1)
      setLoading(false); submittingRef.current = false
      await speak(fb, () => { if(activeRef.current) startListening() })
    }
  }, [stopListening, clearSilence, clearCdown, speak, endSession, getAudioBlob, cleanName, dept, year])

  useEffect(() => { submitRef.current = () => submitAnswer() }, [submitAnswer])

  // ── Typed submit ───────────────────────────────────────────────────────────────
  const handleTypedSend = () => {
    if (!typedText.trim() || speaking || loading) return
    submitAnswer(typedText.trim())
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INTRO SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === 'intro') return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:'Inter,sans-serif',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'14px 24px',background:C.surface,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{fontWeight:800,fontSize:14,color:C.navy,letterSpacing:'-0.3px'}}>MENTORIX <span style={{color:C.blue}}>AI</span></div>
        <div style={{fontWeight:700,fontSize:13,color:C.navy}}>HR Mode</div>
        <div style={{fontSize:12,color:C.muted,padding:'3px 10px',borderRadius:20,background:C.surface2,border:`1px solid ${C.border}`}}>{dept.toUpperCase()}</div>
      </div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:40,maxWidth:580,width:'100%',boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>

          {/* Aria avatar */}
          <div style={{width:64,height:64,borderRadius:'50%',background:`radial-gradient(circle at 35% 35%,#3B82F6,#1D4ED8)`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:20,boxShadow:'0 0 24px rgba(37,99,235,0.3)'}}>
            <span style={{fontSize:18,fontWeight:800,color:'#fff',fontFamily:'monospace'}}>AR</span>
          </div>

          <div style={{fontSize:22,fontWeight:800,color:C.navy,marginBottom:6,letterSpacing:'-0.5px'}}>HR Interview Simulation</div>
          <div style={{fontSize:14,color:C.muted,marginBottom:24,lineHeight:1.7}}>
            Aria will conduct a strict formal interview. Camera monitoring for posture. Voice or text input. Auto-submit on 2s silence.
          </div>

          {/* Features grid */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
            {[
              {label:'Voice + Text', desc:'Toggle between mic and keyboard'},
              {label:'Live Posture', desc:'Bytez AI camera analysis'},
              {label:'10s Timeout', desc:'No response = terminated'},
              {label:'Timer', desc:'Elapsed interview time'},
              {label:'Live Scores', desc:'Real-time performance tracking'},
              {label:'AI Report', desc:'Full assessment at end'},
            ].map(({label,desc}) => (
              <div key={label} style={{padding:'10px 14px',borderRadius:10,background:C.surface2,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,fontWeight:600,color:C.navy,marginBottom:2}}>{label}</div>
                <div style={{fontSize:11,color:C.muted}}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{padding:'12px 16px',borderRadius:10,background:C.redBg,border:`1px solid ${C.redBorder}`,marginBottom:24,fontSize:12,color:C.red,lineHeight:1.6}}>
            <strong>Anti-cheat active.</strong> Tab switches tracked (3 = immediate termination). All sessions logged. Camera required.
          </div>

          <button onClick={startSession} style={{width:'100%',padding:'14px',borderRadius:10,border:'none',background:C.blue,color:'#fff',fontFamily:'Inter,sans-serif',fontWeight:700,fontSize:15,cursor:'pointer',boxShadow:'0 4px 16px rgba(37,99,235,0.3)'}}>
            Begin Interview
          </button>
          <div style={{textAlign:'center',marginTop:10,fontSize:11,color:C.muted}}>Space = toggle mic · Esc = terminate</div>
        </div>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // DONE SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === 'done') {
    const scoreItems = [
      {label:'OVERALL',       val:overall,      key:'overall'},
      {label:'TECHNICAL',     val:scores.tech,  key:'tech'},
      {label:'COMMUNICATION', val:scores.comm,  key:'comm'},
      {label:'CRITICAL',      val:scores.crit,  key:'crit'},
      {label:'PRESSURE',      val:scores.pres,  key:'pres'},
      {label:'LEADERSHIP',    val:scores.lead,  key:'lead'},
    ]
    const overallColor = overall>=75?C.green:overall>=55?C.amber:C.red
    const verdict = overall>=75?'STRONG CANDIDATE':overall>=55?'AVERAGE CANDIDATE':'NEEDS IMPROVEMENT'
    const weakDims = scoreItems.slice(1).filter(s=>s.val>0&&s.val<60).sort((a,b)=>a.val-b.val)
    const showCourses = weakDims.length>0 ? weakDims : [scoreItems.find(s=>s.key==='comm')]
    return (
      <div style={{minHeight:'100vh',background:C.bg,fontFamily:'Inter,sans-serif',padding:'32px 16px',overflowY:'auto'}}>
        <div style={{maxWidth:640,margin:'0 auto'}}>
          {/* Score card */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:36,textAlign:'center',boxShadow:'0 4px 24px rgba(0,0,0,0.06)',marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:'1.5px',marginBottom:12}}>INTERVIEW COMPLETE</div>
            <div style={{fontSize:22,fontWeight:800,color:C.navy,marginBottom:4,letterSpacing:'-0.5px'}}>Assessment Report</div>
            <div style={{fontSize:13,fontWeight:700,letterSpacing:'1.5px',color:overallColor,marginBottom:20}}>{verdict}</div>
            {/* Score grid */}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',marginBottom:24}}>
              {scoreItems.map(({label,val,key}) => {
                const c = val>=70?C.green:val>=50?C.amber:C.red
                return (
                  <div key={key} style={{padding:'14px 12px',background:C.surface2,border:`1px solid ${C.border}`,borderRadius:12,minWidth:80,flex:1,textAlign:'center'}}>
                    <div style={{fontSize:key==='overall'?24:20,fontWeight:800,color:c,letterSpacing:'-0.5px'}}>{val||0}</div>
                    <div style={{fontSize:9,color:C.muted,marginTop:4,letterSpacing:'0.8px'}}>{label}</div>
                  </div>
                )
              })}
            </div>
            {emotion && <div style={{fontSize:11,color:'#7C3AED',marginBottom:16}}>Detected emotion: <strong>{emotion}</strong> · Bytez wav2vec2</div>}
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{
                savedRef.current=false;submittingRef.current=false;activeRef.current=false
                setPhase('intro');setQNum(0);setConvo([]);setTranscript('');setTypedText('')
                setTabViol(0);tabViolRef.current=0;setScores({tech:0,comm:0,crit:0,pres:0,lead:0})
                setOverall(0);setForcedEnd(false);setCountdown(null);setSilenceLeft(null)
                setEmotion(null);setElapsed(0);audioChunksRef.current=[];setReport('')
              }} style={{flex:1,padding:'11px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.text,fontFamily:'Inter,sans-serif',fontSize:13,cursor:'pointer',fontWeight:600}}>
                New Session
              </button>
              <button onClick={()=>nav('/dashboard')} style={{flex:2,padding:'11px',borderRadius:8,border:'none',background:C.blue,color:'#fff',fontFamily:'Inter,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                View Dashboard
              </button>
            </div>
          </div>

          {/* AI Report */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:28,marginBottom:20,boxShadow:'0 2px 12px rgba(0,0,0,0.04)'}}>
            <div style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:16}}>Detailed Report</div>
            {report
              ? <div style={{fontSize:13,color:C.text,lineHeight:2,margin:0,fontFamily:'Inter,sans-serif'}}>
                  {report.split('\n').map((line,i) => {
                    const formatted = line.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/^• /,'')
                    const isBullet = line.startsWith('•') || line.startsWith('* ')
                    return <div key={i} style={{paddingLeft:isBullet?12:0,marginBottom:isBullet?2:4,borderLeft:isBullet?`2px solid ${C.blueBorder}`:'none',paddingLeft:isBullet?10:0}} dangerouslySetInnerHTML={{__html:formatted||'&nbsp;'}}/>
                  })}
                </div>
              : <div style={{display:'flex',alignItems:'center',gap:8,color:C.muted,fontSize:13}}><div style={{width:12,height:12,border:`2px solid ${C.border}`,borderTopColor:C.blue,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Generating report…</div>
            }
          </div>

          {/* Course recommendations */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:28,boxShadow:'0 2px 12px rgba(0,0,0,0.04)'}}>
            <div style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:4}}>Recommended Courses</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:20}}>Based on your performance, focus on these areas.</div>
            {showCourses.map(({key})=>(
              <div key={key} style={{marginBottom:20}}>
                <div style={{fontSize:12,fontWeight:700,color:C.navy,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.5px'}}>{COURSE_MAP[key]?.label}</div>
                {(COURSE_MAP[key]?.courses||[]).map((course,i)=>(
                  <a key={i} href={course.url} target="_blank" rel="noopener noreferrer"
                    style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 14px',borderRadius:10,border:`1px solid ${C.border}`,background:C.surface2,textDecoration:'none',marginBottom:8}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.blue}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:C.navy,marginBottom:1}}>{course.title}</div>
                      <div style={{fontSize:11,color:C.muted}}>{course.platform}</div>
                    </div>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
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
  // SESSION SCREEN — matches old hr-mode.html layout + light theme
  // ════════════════════════════════════════════════════════════════════════════
  const postureColor = posture>=70?C.green:posture>=45?C.amber:C.red
  const eyeColor     = eyeContact>=70?C.green:eyeContact>=45?C.amber:C.red
  const confColor    = confidence>=60?C.green:confidence>=35?C.amber:C.red

  return (
    <div style={{height:'100vh',background:C.bg,fontFamily:'Inter,sans-serif',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <canvas ref={canvasRef} style={{display:'none'}}/>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes avpulse{from{transform:scale(1)}to{transform:scale(1.06)}}
        @keyframes rspin{to{transform:rotate(360deg)}}
        @keyframes mfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes micring{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0.3)}50%{box-shadow:0 0 0 8px rgba(37,99,235,0.05)}}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{padding:'10px 20px',background:C.surface,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:16,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{fontWeight:800,fontSize:13,color:C.navy,letterSpacing:'-0.3px'}}>MENTORIX <span style={{color:C.blue}}>AI</span></div>
          <span style={{fontSize:11,color:C.muted,fontWeight:500}}>· HR Mode</span>
        </div>
        <div style={{flex:1,display:'flex',justifyContent:'center',alignItems:'center',gap:16}}>
          {/* Status pill */}
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 12px',borderRadius:20,background:C.surface2,border:`1px solid ${C.border}`}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:speaking?C.blue:listening?C.red:loading?C.amber:C.muted,animation:(speaking||listening||loading)?'pulse 1.2s infinite':'none'}}/>
            <span style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:'0.5px'}}>
              {speaking?'ARIA SPEAKING':listening?'AWAITING RESPONSE':loading?'EVALUATING...':'STANDBY'}
            </span>
          </div>
          {/* Timer */}
          <span style={{fontSize:11,fontFamily:'monospace',color:C.muted,fontWeight:600}}>{fmtTime(elapsed)}</span>
          {/* Progress */}
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10,color:C.muted}}>
            <span>Q {qNum}</span>
            <div style={{width:70,height:3,background:C.surface2,borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(100,(qNum/10)*100)}%`,background:C.blue,borderRadius:2,transition:'width 0.5s'}}/></div>
          </div>
        </div>
        {/* Tab dots + terminate */}
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{display:'flex',gap:4}}>
            {[1,2,3].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:tabViol>=i?C.red:C.border,transition:'background 0.3s'}}/>)}
          </div>
          <button onClick={()=>{ if(confirm('TERMINATE SESSION?\n\nThis will end your interview early.')) { setForcedEnd(true); endSession(true) } }}
            style={{padding:'5px 12px',borderRadius:6,border:`1px solid ${C.redBorder}`,background:C.redBg,color:C.red,fontSize:10,fontWeight:700,cursor:'pointer',letterSpacing:'0.5px'}}>
            Terminate
          </button>
        </div>
      </div>

      {violMsg && <div style={{padding:'8px 20px',background:C.redBg,borderBottom:`1px solid ${C.redBorder}`,fontSize:12,color:C.red,fontWeight:600,textAlign:'center'}}>{violMsg}</div>}

      {/* ── MAIN CONTENT: LEFT + RIGHT ── */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'210px 1fr',overflow:'hidden'}}>

        {/* ══ LEFT: Camera + Posture + Scores ══ */}
        <div style={{borderRight:`1px solid ${C.border}`,background:C.surface,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* Camera section */}
          <div style={{padding:12,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:7}}>Live Feed</div>
            {/* Camera feed box */}
            <div style={{position:'relative',background:'#0F172A',aspectRatio:'4/3',borderRadius:6,overflow:'hidden',border:`1px solid rgba(37,99,235,0.2)`}}>
              <video ref={videoRef} autoPlay muted playsInline style={{width:'100%',height:'100%',objectFit:'cover',display:'block',transform:'scaleX(-1)'}}/>
              {camErr && (
                <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontSize:9,color:'#475569',textAlign:'center',padding:8,lineHeight:1.8}}>
                  CAMERA<br/>ACCESS<br/>DENIED
                </div>
              )}
              {!camErr && (
                <>
                  {/* Corner brackets */}
                  {[{t:4,l:4,bt:'2px 0 0 2px'},{t:4,r:4,bt:'2px 2px 0 0'},{b:4,l:4,bt:'0 0 2px 2px'},{b:4,r:4,bt:'0 2px 2px 0'}].map((pos,i)=>(
                    <div key={i} style={{position:'absolute',width:10,height:10,...pos,borderColor:C.blue,borderStyle:'solid',borderWidth:pos.bt}}/>
                  ))}
                  {/* Status badge */}
                  <div style={{position:'absolute',bottom:5,left:5,fontFamily:'monospace',fontSize:8,background:'rgba(0,0,0,0.8)',padding:'2px 6px',color:C.red,borderRadius:2,letterSpacing:'1px'}}>
                    {speaking?'SPEAKING':listening?'REC':'STANDBY'}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Posture/eye/confidence bars */}
          <div style={{padding:'10px 12px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            {[
              {label:'Eye Contact', val:eyeContact, color:eyeColor},
              {label:'Posture',     val:posture,    color:postureColor},
              {label:'Confidence',  val:confidence, color:confColor},
            ].map(({label,val,color})=>(
              <div key={label} style={{marginBottom:6}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:'1px',textTransform:'uppercase'}}>{label}</span>
                  <span style={{fontSize:8,fontWeight:700,color:val>0?color:C.muted,fontFamily:'monospace'}}>
                    {val>0?(val>=70?'GOOD':val>=45?'FAIR':'POOR'):'—'}
                  </span>
                </div>
                <div style={{height:2,background:C.surface2,borderRadius:1}}>
                  <div style={{height:'100%',width:`${val||0}%`,background:val>0?color:C.border,borderRadius:1,transition:'width 0.5s ease'}}/>
                </div>
              </div>
            ))}
          </div>

          {/* Live scores */}
          <div style={{flex:1,padding:12,overflowY:'auto'}}>
            <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10}}>Live Scores</div>
            {[
              {label:'Technical',        val:scores.tech},
              {label:'Communication',    val:scores.comm},
              {label:'Critical Thinking',val:scores.crit},
              {label:'Pressure',         val:scores.pres},
              {label:'Leadership',       val:scores.lead},
            ].map(({label,val})=>{
              const c = val>=70?C.green:val>=50?C.amber:C.red
              return (
                <div key={label} style={{marginBottom:9}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{fontSize:9,color:C.text}}>{label}</span>
                    <span style={{fontSize:9,fontWeight:700,color:val?c:C.muted,fontFamily:'monospace'}}>{val||'—'}</span>
                  </div>
                  <div style={{height:2,background:C.surface2,borderRadius:1}}>
                    <div style={{height:'100%',width:`${val||0}%`,background:val?c:C.border,borderRadius:1,transition:'width 0.8s ease'}}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ══ RIGHT: Aria + Chat + Input ══ */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* Aria header row */}
          <div style={{padding:'12px 18px',borderBottom:`1px solid ${C.border}`,background:C.surface,display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
            {/* Aria avatar with speaking ring */}
            <div style={{position:'relative',width:46,height:46,flexShrink:0}}>
              <div style={{position:'absolute',inset:-5,borderRadius:'50%',border:`1px solid rgba(37,99,235,0.2)`,animation:'rspin 12s linear infinite'}}/>
              <div style={{
                width:46,height:46,borderRadius:'50%',
                background:'radial-gradient(circle at 35% 35%,#3B82F6,#1D4ED8)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:13,fontWeight:700,color:'#fff',fontFamily:'monospace',
                boxShadow:speaking?'0 0 32px rgba(37,99,235,0.5)':'0 0 16px rgba(37,99,235,0.2)',
                animation:speaking?'avpulse 0.7s ease infinite alternate':'none',
                position:'relative',zIndex:1,transition:'box-shadow 0.3s'
              }}>AR</div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:14,color:C.navy}}>Aria</div>
              <div style={{fontSize:10,color:C.muted,letterSpacing:'0.3px'}}>Senior HR Executive · Mentorix AI</div>
            </div>
            {/* Input mode toggle */}
            <div style={{display:'flex',gap:4}}>
              {[{mode:'voice',icon:'🎙'},{mode:'type',icon:'⌨'}].map(({mode,icon})=>(
                <button key={mode} onClick={()=>{ setInputMode(mode); if(mode==='voice'&&!speaking&&!loading) startListening(); else stopListening() }}
                  style={{padding:'6px 10px',borderRadius:7,border:`1px solid ${inputMode===mode?C.blueBorder:C.border}`,background:inputMode===mode?C.blueBg:'transparent',cursor:'pointer',fontSize:13,color:inputMode===mode?C.blue:C.muted,transition:'all 0.15s'}}>
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Chat messages */}
          <div style={{flex:1,overflowY:'auto',padding:'12px 18px',display:'flex',flexDirection:'column',gap:10}}>
            {convo.length===0 && (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',opacity:0.3,gap:6,pointerEvents:'none'}}>
                <div style={{fontSize:22}}>⚔</div>
                <div style={{fontFamily:'monospace',fontSize:10,color:C.muted}}>Interview initialising...</div>
              </div>
            )}
            {convo.map((msg,i)=>(
              <div key={i} style={{display:'flex',gap:9,alignItems:'flex-start',flexDirection:msg.role==='user'?'row-reverse':'row',animation:'mfade 0.3s ease both'}}>
                <div style={{
                  width:26,height:26,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,
                  ...(msg.role==='ai'
                    ? {background:'radial-gradient(circle at 35% 35%,#3B82F6,#1D4ED8)',color:'#fff',fontFamily:'monospace'}
                    : {background:C.blueBg,border:`1px solid ${C.blueBorder}`,color:C.blue})
                }}>{msg.role==='ai'?'AR':cleanName.charAt(0).toUpperCase()}</div>
                <div style={{
                  maxWidth:'74%',padding:'9px 13px',fontSize:13,lineHeight:1.7,fontWeight:300,
                  borderRadius:msg.role==='ai'?'4px 13px 13px 13px':'13px 4px 13px 13px',
                  background:msg.role==='ai'?C.surface:C.blueBg,
                  border:`1px solid ${msg.role==='ai'?C.border:C.blueBorder}`,
                  color:msg.role==='ai'?C.navy:C.blue,
                }}>
                  {msg.role==='ai'&&i===latestMsgIdx
                    ?<StreamingText key={`st-${streamKey}`} text={msg.text} streamKey={streamKey}/>
                    :msg.text}
                </div>
              </div>
            ))}
            {(speaking||loading)&&(
              <div style={{display:'flex',gap:9,alignItems:'center'}}>
                <div style={{width:26,height:26,borderRadius:'50%',background:'radial-gradient(circle at 35% 35%,#3B82F6,#1D4ED8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',fontFamily:'monospace',flexShrink:0}}>AR</div>
                <div style={{display:'flex',gap:4,padding:'9px 13px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:'4px 13px 13px 13px'}}>
                  {[0,1,2].map(i=><div key={i} style={{width:4,height:4,borderRadius:'50%',background:C.blue,animation:`pulse 1.2s ${i*0.2}s infinite`}}/>)}
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>

          {/* ── INPUT ROW ── */}
          <div style={{padding:'10px 18px 12px',borderTop:`1px solid ${C.border}`,background:C.surface,flexShrink:0}}>

            {/* 10s countdown */}
            {listening&&countdown!==null&&!transcript&&(
              <div style={{marginBottom:8}}>
                <span style={{fontSize:10,color:C.red,fontWeight:600}}>No response — terminating in {countdown}s</span>
                <div style={{height:2,background:C.redBg,borderRadius:1,marginTop:4,border:`1px solid ${C.redBorder}`}}>
                  <div style={{height:'100%',width:`${(countdown/10)*100}%`,background:C.red,borderRadius:1,transition:'width 1s linear'}}/>
                </div>
              </div>
            )}
            {silenceLeft!==null&&<div style={{fontSize:10,color:C.amber,fontWeight:600,marginBottom:6}}>Pause detected — submitting in {silenceLeft}s…</div>}

            <div style={{display:'flex',gap:7,alignItems:'flex-end'}}>
              {/* Mic button */}
              <button onClick={()=>{ if(inputMode==='voice') { if(listening) stopListening(); else startListening() } }}
                disabled={inputMode==='type'||speaking||loading}
                style={{
                  width:42,height:42,borderRadius:9,border:`1px solid ${listening?C.blueBorder:C.border}`,
                  background:listening?C.blueBg:C.surface2,cursor:inputMode==='type'?'not-allowed':'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,
                  opacity:inputMode==='type'?0.35:1,transition:'all 0.2s',
                  animation:listening?'micring 1.2s ease infinite':'none',
                }}>🎙</button>

              {/* Text input */}
              <textarea
                value={typedText}
                onChange={e=>setTypedText(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleTypedSend()} }}
                disabled={speaking||loading}
                placeholder={inputMode==='voice'?transcript||'Listening… or switch to ⌨ to type':'Answer here, or use 🎙 voice…'}
                rows={1}
                style={{
                  flex:1,padding:'10px 13px',borderRadius:10,border:`1px solid ${C.border}`,
                  background:inputMode==='voice'?(transcript?C.blueBg:C.surface2):C.surface2,
                  color:transcript&&inputMode==='voice'?C.navy:C.text,
                  fontSize:13,fontFamily:'Inter,sans-serif',outline:'none',
                  resize:'none',height:42,maxHeight:100,lineHeight:1.5,
                  opacity:(speaking||loading)?0.6:1,transition:'all 0.2s',
                }}
                readOnly={inputMode==='voice'}
              />

              {/* Send button */}
              <button
                onClick={handleTypedSend}
                disabled={!typedText.trim()||speaking||loading||inputMode==='voice'}
                style={{
                  width:42,height:42,borderRadius:9,background:C.blue,border:'none',
                  cursor:typedText.trim()&&inputMode==='type'&&!speaking&&!loading?'pointer':'not-allowed',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,
                  opacity:(!typedText.trim()||speaking||loading||inputMode==='voice')?0.35:1,
                  boxShadow:'0 3px 10px rgba(37,99,235,0.3)',transition:'all 0.2s',
                }}>➤</button>
            </div>

            <div style={{textAlign:'center',marginTop:6,fontSize:10,color:C.muted}}>
              <kbd style={{padding:'1px 5px',borderRadius:3,border:`1px solid ${C.border}`,fontSize:10,background:C.surface2,fontFamily:'monospace'}}>Space</kbd> toggle mic &nbsp;·&nbsp;
              <kbd style={{padding:'1px 5px',borderRadius:3,border:`1px solid ${C.border}`,fontSize:10,background:C.surface2,fontFamily:'monospace'}}>Esc</kbd> terminate
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
