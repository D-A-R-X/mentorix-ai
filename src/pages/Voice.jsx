import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoMark, Btn, Icon, Badge, useToast } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth'
import { voiceApi } from '../lib/api'

const MAX_W         = 3
const MAX_Q         = 8
const INACTIVITY_MS = 50000
const API = import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'

const QUESTIONS = [
  "Tell me about your current academic focus and what you find most challenging.",
  "What projects have you worked on recently? Walk me through your approach.",
  "How do you manage your time between studies and other activities?",
  "Describe a technical problem you solved recently.",
  "What are your career goals after graduation?",
  "How do you stay updated with new developments in your field?",
  "What skills do you feel you need to improve most?",
  "Where do you see yourself in 5 years?",
]

// ── Typewriter ─────────────────────────────────────────────────────────────────
function TypewriterText({ text, speed = 22 }) {
  const [shown, setShown] = useState('')
  useEffect(() => {
    setShown('')
    if (!text) return
    let i = 0
    const t = setInterval(() => { i++; setShown(text.slice(0, i)); if (i >= text.length) clearInterval(t) }, speed)
    return () => clearInterval(t)
  }, [text])
  return <span>{shown}</span>
}

// ── StreamingText ─────────────────────────────────────────────────────────────
function StreamingText({ text, isNew, speed = 55 }) {
  const [shown, setShown] = useState('')
  const timerRef = useRef(null)
  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!isNew) { setShown(text); return }
    setShown('')
    const words = text.split(' ')
    let idx = 0
    const tick = () => {
      if (idx >= words.length) return
      idx++
      setShown(words.slice(0, idx).join(' '))
      timerRef.current = setTimeout(tick, speed)
    }
    timerRef.current = setTimeout(tick, 80)
    return () => clearTimeout(timerRef.current)
  }, [text, isNew])
  return <span>{shown}</span>
}

// ── Sound bars ────────────────────────────────────────────────────────────────
function SoundBars({ active }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:3, height:40 }}>
      {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => (
        <div key={i} style={{
          width:4, borderRadius:2,
          background: active ? '#2563EB' : '#CBD5E1',
          height: active ? undefined : 6,
          minHeight:6, maxHeight:32,
          animation: active ? `bar-bounce 0.9s ease-in-out infinite ${(i*0.07).toFixed(2)}s` : 'none',
        }} />
      ))}
      <style>{`@keyframes bar-bounce{0%,100%{height:6px}50%{height:28px}}`}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Voice() {
  const { user }  = useAuth()
  const nav       = useNavigate()
  const toast     = useToast()
  const token     = localStorage.getItem('mentorix_token') || ''
  const hdr = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` })

  const [phase,      setPhase]      = useState('intro')
  const [qIdx,       setQIdx]       = useState(0)
  const [answers,    setAnswers]    = useState([])
  const [transcript, setTranscript] = useState('')
  const [inputMode,  setInputMode]  = useState('voice')
  const [typed,      setTyped]      = useState('')
  const [tabWarns,   setTabWarns]   = useState(0)
  const [saving,     setSaving]     = useState(false)
  const [ariaText,   setAriaText]   = useState('')
  const [ariaIsNew,  setAriaIsNew]  = useState(false)
  const [micStatus,  setMicStatus]  = useState('idle')

  // refs
  const recogRef     = useRef(null)
  const inactiveRef  = useRef(null)
  const answersRef   = useRef([])
  const tabRef       = useRef(0)
  const phaseRef     = useRef('intro')
  const txRef        = useRef('')
  const qIdxRef      = useRef(0)
  const speakingRef  = useRef(false)  // ← mirrors speaking for async closures
  const unmountedRef = useRef(false)  // ← guards all state after navigation

  const totalQ = Math.min(MAX_Q, QUESTIONS.length)

  useEffect(() => { answersRef.current = answers },    [answers])
  useEffect(() => { phaseRef.current   = phase },      [phase])
  useEffect(() => { txRef.current      = transcript }, [transcript])
  useEffect(() => { qIdxRef.current    = qIdx },       [qIdx])
  useEffect(() => { tabRef.current     = tabWarns },   [tabWarns])

  // ── UNMOUNT CLEANUP — stops all audio when user navigates away ────────────
  useEffect(() => {
    return () => {
      unmountedRef.current = true
      speakingRef.current  = false
      try { window.speechSynthesis.cancel() } catch {}
      // Stop mic
      if (recogRef.current) {
        try {
          recogRef.current.onresult = null
          recogRef.current.onerror  = null
          recogRef.current.onend    = null
          recogRef.current.stop()
        } catch {}
        recogRef.current = null
      }
      clearTimeout(inactiveRef.current)
    }
  }, [])

  // ── stopAllAudio — mid-session use ────────────────────────────────────────
  const stopAllAudio = useCallback(() => {
    try { window.speechSynthesis.cancel() } catch {}
    speakingRef.current = false
  }, [])

  // ── Tab switch ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => {
      if (!document.hidden) return
      const p = phaseRef.current
      if (!['speaking','listening','saving_answer','feedback_speaking'].includes(p)) return
      const w = tabRef.current + 1
      setTabWarns(w); tabRef.current = w
      if (w >= MAX_W) { toast('Session ended: too many tab switches', 'error'); doEndSession(true) }
      else toast(`Warning ${w}/${MAX_W}: stay on this tab`, 'warn')
    }
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Page close ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => {
      const active = ['speaking','listening','saving_answer','feedback_speaking'].includes(phaseRef.current)
      if (!active || answersRef.current.length === 0) return
      voiceApi.save({
        answers: answersRef.current, tab_switches: tabRef.current, forced_end: true,
        questions_answered: answersRef.current.length,
        summary: 'Session abandoned.', transcript: '', scores: {},
        overall: Math.max(0, answersRef.current.length * 4 - 8),
        exchange_count: answersRef.current.length, mode: 'voice',
      }).catch(() => {})
    }
    window.addEventListener('beforeunload', fn)
    return () => window.removeEventListener('beforeunload', fn)
  }, [])

  // ── Inactivity ────────────────────────────────────────────────────────────
  const resetInactive = useCallback(() => {
    clearTimeout(inactiveRef.current)
    inactiveRef.current = setTimeout(() => {
      if (phaseRef.current === 'listening') {
        toast('No speech detected — ending session', 'warn')
        speak("I haven't heard from you — that's okay! Let me save your progress.", () => doEndSession(false))
      }
    }, INACTIVITY_MS)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── SPEAK — browser speechSynthesis only, zero network calls ─────────────
  // Removed server TTS entirely: it caused delays, race conditions, and
  // double-speaking bugs. Browser speech is instant, free, and reliable.
  const speak = useCallback((text, onDone) => {
    if (unmountedRef.current) return
    stopAllAudio()
    speakingRef.current = true
    if (!unmountedRef.current) { setAriaText(text); setAriaIsNew(true) }

    const done = () => {
      speakingRef.current = false
      if (!unmountedRef.current) { setAriaIsNew(false); onDone?.() }
    }

    const go = () => {
      if (unmountedRef.current) return
      window.speechSynthesis.cancel()
      const utt    = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const want   = [
        'Google UK English Female','Microsoft Zira - English (United States)',
        'Microsoft Hazel - English (Great Britain)','Samantha','Karen','Moira','Tessa','Ava',
      ]
      let v = null
      for (const name of want) { v = voices.find(x => x.name === name); if (v) break }
      if (!v) v = voices.find(x => x.lang.startsWith('en') && /female|woman/i.test(x.name))
      if (!v) v = voices.find(x => x.lang === 'en-GB')
      if (!v) v = voices.find(x => x.lang.startsWith('en'))
      if (v) utt.voice = v
      utt.rate = 0.88; utt.pitch = 1.18; utt.volume = 1
      utt.onend = done; utt.onerror = done
      window.speechSynthesis.speak(utt)
    }

    // voices may not be loaded on very first call
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', go, { once: true })
    } else {
      go()
    }
  }, [stopAllAudio])

  const killRecog = useCallback(() => {
    if (!recogRef.current) return
    try {
      recogRef.current.onresult = null
      recogRef.current.onerror  = null
      recogRef.current.onend    = null
      recogRef.current.stop()
    } catch {}
    recogRef.current = null
  }, [])

  // ── Start mic ─────────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    setMicStatus('requesting')
    setTranscript(''); txRef.current = ''

    const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SRClass) {
      setMicStatus('error')
      toast('Speech recognition not available. Switching to type mode.', 'warn')
      setInputMode('type')
      return
    }

    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ])
      stream.getTracks().forEach(t => t.stop())
    } catch (err) {
      setMicStatus('error')
      if (err.message === 'timeout')             toast('Mic permission timed out. Click 🔒 → Allow microphone → refresh.', 'error')
      else if (err.name === 'NotAllowedError')   toast('Microphone blocked. Click 🔒 → Allow microphone → refresh.', 'error')
      else                                       toast(`Mic error: ${err.message}`, 'error')
      return
    }

    killRecog()
    const SR = new SRClass()
    SR.continuous = true; SR.interimResults = true; SR.lang = 'en-IN'
    recogRef.current = SR

    SR.onstart  = () => { setMicStatus('active'); setPhase('listening'); resetInactive() }
    SR.onresult = (e) => {
      let finalText = '', interimText = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText   += e.results[i][0].transcript + ' '
        else                      interimText += e.results[i][0].transcript
      }
      const full = (finalText + interimText).trim()
      setTranscript(full); txRef.current = full
      resetInactive()
    }
    SR.onerror = (e) => {
      if      (e.error === 'no-speech')   setMicStatus('idle')
      else if (e.error === 'not-allowed') { setMicStatus('error'); toast('Mic access denied.', 'error') }
      else if (e.error === 'network')     { setMicStatus('error'); toast('Network error with speech recognition.', 'error') }
      else setMicStatus('idle')
    }
    SR.onend = () => {
      if (phaseRef.current === 'listening' && recogRef.current === SR) {
        try { SR.start(); setMicStatus('active') } catch { setMicStatus('idle') }
      } else { setMicStatus('idle') }
    }
    try { SR.start() } catch (err) {
      setMicStatus('error')
      toast('Could not start microphone: ' + err.message, 'error')
    }
  }, [killRecog, resetInactive, toast])

  // ── Submit answer — 12s hard timeout on /chat ─────────────────────────────
  // FIX: original had no timeout — hung forever on Render cold-start (30s+)
  const submitAnswer = useCallback(async () => {
    killRecog()
    clearTimeout(inactiveRef.current)
    setMicStatus('idle')

    const ans       = inputMode === 'voice' ? txRef.current : typed
    const newAnswer = { question: QUESTIONS[qIdxRef.current], answer: ans, timestamp: new Date().toISOString() }
    const newAll    = [...answersRef.current, newAnswer]
    setAnswers(newAll); answersRef.current = newAll
    setPhase('saving_answer')

    let feedback = ''
    try {
      const ctrl    = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), 12000) // 12s hard cap
      const res = await fetch(API + '/chat', {
        method:  'POST',
        headers: hdr(),
        body: JSON.stringify({
          messages: [{ role: 'user', content: ans || '(no answer given)' }],
          system: `You are Aria, a warm female AI mentor. A student just answered: "${QUESTIONS[qIdxRef.current]}". Give a 1-2 sentence warm reaction with one gentle tip. Under 35 words.`,
          max_tokens: 80,
        }),
        signal: ctrl.signal,
      })
      clearTimeout(timeout)
      if (res.ok) {
        const d = await res.json()
        feedback = d.reply || d.message || ''
      }
    } catch { /* timed out or network error — silently continue */ }

    if (unmountedRef.current) return
    const nextIdx = qIdxRef.current + 1

    if (feedback) {
      setPhase('feedback_speaking')
      speak(feedback, () => {
        if (unmountedRef.current) return
        if (nextIdx >= totalQ) doEndSession(false, newAll)
        else { setQIdx(nextIdx); qIdxRef.current = nextIdx; doAskQuestion(nextIdx) }
      })
    } else {
      if (nextIdx >= totalQ) doEndSession(false, newAll)
      else { setQIdx(nextIdx); qIdxRef.current = nextIdx; doAskQuestion(nextIdx) }
    }
  }, [inputMode, typed, speak, token, totalQ]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ask question ──────────────────────────────────────────────────────────
  const doAskQuestion = useCallback((idx) => {
    if (unmountedRef.current) return
    setTranscript(''); txRef.current = ''
    setTyped(''); setAriaIsNew(false)
    setMicStatus('idle'); setPhase('speaking')
    speak(QUESTIONS[idx], () => {
      if (unmountedRef.current) return
      setPhase('listening')
      if (inputMode === 'voice') startMic()
      else resetInactive()
    })
  }, [speak, inputMode, startMic, resetInactive])

  const startSession = useCallback(() => {
    setQIdx(0); qIdxRef.current = 0
    doAskQuestion(0)
  }, [doAskQuestion])

  // ── End session ───────────────────────────────────────────────────────────
  const doEndSession = useCallback(async (forced, finalAnswers) => {
    killRecog()
    stopAllAudio()
    clearTimeout(inactiveRef.current)
    setMicStatus('idle')
    setPhase('done')
    setSaving(true)

    const all            = finalAnswers ?? answersRef.current
    const incomplete     = all.length < totalQ
    const isReallyForced = forced || all.length === 0 || (incomplete && all.length < 3)
    const overall        = isReallyForced
      ? Math.max(0, all.length * 4 - 8)
      : Math.min(100, 50 + all.length * 6)

    const msg = all.length === 0
      ? "You didn't respond this time — that's okay! Come back whenever you're ready. I'm always here for you!"
      : isReallyForced || incomplete
      ? `Session saved with ${all.length} answers. Try to complete the full session for a better honor score!`
      : `You answered all ${all.length} questions — incredible work! Great effort today!`

    if (!unmountedRef.current) speak(msg, () => {})

    try {
      await voiceApi.save({
        answers:            all,
        tab_warnings:       tabRef.current,
        tab_switches:       tabRef.current,
        forced_end:         isReallyForced,
        questions_answered: all.length,
        summary:    isReallyForced ? `Forced end: ${all.length}/${totalQ}` : incomplete ? `Incomplete: ${all.length}/${totalQ}` : `Completed: ${all.length}/${totalQ}`,
        transcript: all.map(x => `Q: ${x.question}\nA: ${x.answer}`).join('\n\n'),
        scores: {}, overall, exchange_count: all.length, mode: 'voice',
      })
    } catch { /* save failed silently — session data may be lost on network error */ }
    finally { if (!unmountedRef.current) setSaving(false) }
  }, [killRecog, stopAllAudio, speak, totalQ])

  // ── Derived ───────────────────────────────────────────────────────────────
  const isSpeaking  = phase === 'speaking' || phase === 'feedback_speaking'
  const isListening = phase === 'listening' && micStatus === 'active'
  const progress    = ((qIdx + 1) / totalQ) * 100

  const micBtnColor = micStatus === 'active'     ? '#DC2626'
                    : micStatus === 'error'       ? '#D97706'
                    : micStatus === 'requesting'  ? '#94A3B8'
                    : '#2563EB'
  const micBtnLabel = micStatus === 'active'     ? '● Recording — tap to restart'
                    : micStatus === 'requesting'  ? 'Requesting permission…'
                    : micStatus === 'error'       ? 'Error — tap to retry'
                    : 'Tap to start recording'

  return (
    <div style={{ minHeight:'100vh', background:'#F8F9FC', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .mic-btn { transition: transform 0.15s, box-shadow 0.15s; }
        .mic-btn:hover  { transform: scale(1.06) !important; }
        .mic-btn:active { transform: scale(0.93) !important; }
        textarea:focus  { outline: none; border-color: #93C5FD !important; }
      `}</style>

      <div style={{ width:'100%', maxWidth:560 }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <button
            onClick={() => { stopAllAudio(); nav('/dashboard') }}
            style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:13 }}
          >
            <Icon name="arrow-left" size={14} color="#94A3B8" /> Dashboard
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <LogoMark size={20} />
            <span style={{ fontWeight:700, fontSize:14, color:'#0F172A' }}>Voice Session</span>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {tabWarns > 0 && <Badge color="rose">{tabWarns}/{MAX_W}</Badge>}
            {phase !== 'intro' && phase !== 'done' && <Badge color="muted">{qIdx+1}/{totalQ}</Badge>}
          </div>
        </div>

        {/* ── Card ── */}
        <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:20, padding:'clamp(22px,5vw,38px)', boxShadow:'0 2px 10px rgba(0,0,0,0.05)', animation:'fadeUp 0.3s ease' }}>

          {/* ══ INTRO ══ */}
          {phase === 'intro' && (
            <div style={{ textAlign:'center' }}>
              <div style={{ width:88, height:88, borderRadius:'50%', background:'#EFF6FF', border:'2px solid #BFDBFE', margin:'0 auto 20px', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 18px rgba(37,99,235,0.12)' }}>
                <Icon name="mic" size={36} color="#2563EB" />
              </div>
              <h2 style={{ fontSize:22, fontWeight:700, color:'#0F172A', marginBottom:8 }}>Meet Aria</h2>
              <p style={{ color:'#64748B', fontSize:14, lineHeight:1.7, marginBottom:6 }}>
                Your AI mentor asks <strong style={{ color:'#0F172A' }}>{totalQ} questions</strong>, listens to your answers, and gives warm personalised feedback after each one.
              </p>
              <p style={{ color:'#CBD5E1', fontSize:12, marginBottom:28 }}>
                Tab switches monitored — max {MAX_W}. Incomplete sessions reduce your Honor Score.
              </p>
              <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:28 }}>
                {[{id:'voice',icon:'mic',label:'Voice Mode'},{id:'type',icon:'keyboard',label:'Type Mode'}].map(m => (
                  <button key={m.id} onClick={() => setInputMode(m.id)} style={{
                    padding:'9px 20px', borderRadius:8, cursor:'pointer', border:'none',
                    background: inputMode === m.id ? '#EFF6FF' : '#F8F9FC',
                    outline: `1.5px solid ${inputMode === m.id ? '#BFDBFE' : '#E2E8F0'}`,
                    color: inputMode === m.id ? '#1D4ED8' : '#94A3B8',
                    fontSize:13, fontWeight:500, display:'inline-flex', alignItems:'center', gap:6, transition:'all 0.15s',
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

          {/* ══ ACTIVE SESSION ══ */}
          {['speaking','listening','saving_answer','feedback_speaking'].includes(phase) && (
            <div>
              {/* Progress bar */}
              <div style={{ height:3, background:'#F1F4F9', borderRadius:2, marginBottom:20, overflow:'hidden' }}>
                <div style={{ height:'100%', background:'linear-gradient(90deg,#2563EB,#059669)', width:`${progress}%`, transition:'width 0.5s ease' }} />
              </div>

              {/* Status badges */}
              <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
                <Badge color="blue">Q{qIdx+1} / {totalQ}</Badge>
                {phase === 'speaking'                               && <Badge color="teal">Aria is speaking…</Badge>}
                {phase === 'listening' && micStatus === 'active'   && <Badge color="blue">🔴 Recording</Badge>}
                {phase === 'listening' && micStatus === 'requesting'&& <Badge color="muted">Requesting mic…</Badge>}
                {phase === 'listening' && micStatus === 'idle'     && <Badge color="muted">Tap mic to start</Badge>}
                {phase === 'listening' && micStatus === 'error'    && <Badge color="rose">Mic error</Badge>}
                {phase === 'saving_answer'                         && <Badge color="muted">Processing…</Badge>}
                {phase === 'feedback_speaking'                     && <Badge color="teal">Aria responding…</Badge>}
              </div>

              {/* Question */}
              <p style={{ fontSize:18, fontWeight:600, color:'#0F172A', lineHeight:1.55, marginBottom:20 }}>
                <TypewriterText text={QUESTIONS[qIdx]} speed={18} />
              </p>

              {/* Aria bubble — shown while speaking OR giving feedback
                  FIX: original had two blocks with contradictory conditions:
                    block 1: {isSpeaking && ariaText}         ← showed during speaking ✓
                    block 2: {feedback_speaking && !isSpeaking} ← NEVER shows (feedback_speaking IS isSpeaking)
                  FIX: single block, show whenever phase is speaking/feedback */}
              {isSpeaking && ariaText && (
                <div style={{ marginBottom:20, padding:'14px 16px', background:'#EFF6FF', borderRadius:12, border:'1px solid #BFDBFE', animation:'fadeUp 0.3s ease' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#2563EB', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Aria</div>
                  <p style={{ margin:0, fontSize:14, color:'#1D4ED8', lineHeight:1.7 }}>
                    <StreamingText text={ariaText} isNew={ariaIsNew} />
                    {ariaIsNew && <span style={{ display:'inline-block', width:2, height:14, background:'#2563EB', marginLeft:2, verticalAlign:'middle', animation:'blink 1s step-end infinite' }} />}
                  </p>
                  <div style={{ marginTop:10 }}><SoundBars active={true} /></div>
                </div>
              )}

              {/* Voice listening UI */}
              {phase === 'listening' && inputMode === 'voice' && (
                <div style={{ textAlign:'center' }}>
                  <div style={{ marginBottom:14 }}><SoundBars active={isListening} /></div>
                  <div style={{
                    background:'#F8F9FC', borderRadius:12, padding:'14px 16px', marginBottom:18,
                    minHeight:80, textAlign:'left',
                    border:`1.5px solid ${isListening ? '#BFDBFE' : '#F1F4F9'}`,
                    transition:'border-color 0.3s',
                  }}>
                    {micStatus === 'requesting' ? (
                      <p style={{ margin:0, color:'#94A3B8', fontSize:13, fontStyle:'italic' }}>🎤 Requesting microphone permission…</p>
                    ) : micStatus === 'error' ? (
                      <p style={{ margin:0, color:'#DC2626', fontSize:13 }}>❌ Mic error — check permissions and tap the button again</p>
                    ) : transcript ? (
                      <p style={{ margin:0, color:'#0F172A', fontSize:14, lineHeight:1.6 }}>{transcript}</p>
                    ) : (
                      <p style={{ margin:0, color:'#CBD5E1', fontSize:14, fontStyle:'italic' }}>
                        {isListening ? '🎤 Listening… speak your answer' : 'Tap the mic button below to start recording'}
                      </p>
                    )}
                  </div>

                  <div style={{ marginBottom:18 }}>
                    <button
                      className="mic-btn" onClick={startMic} disabled={micStatus === 'requesting'}
                      style={{
                        width:80, height:80, borderRadius:'50%', border:'none',
                        cursor: micStatus === 'requesting' ? 'wait' : 'pointer',
                        background: micBtnColor,
                        display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto',
                        boxShadow: micStatus === 'active'
                          ? '0 0 0 10px rgba(220,38,38,0.12), 0 4px 24px rgba(220,38,38,0.4)'
                          : '0 4px 20px rgba(37,99,235,0.3)',
                        opacity: micStatus === 'requesting' ? 0.7 : 1,
                      }}
                    >
                      {micStatus === 'requesting'
                        ? <div style={{ width:26, height:26, border:'3px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                        : <Icon name="mic" size={32} color="#fff" />}
                    </button>
                    <p style={{ margin:'10px 0 0', fontSize:12, color: micStatus === 'active' ? '#DC2626' : '#94A3B8', fontWeight: micStatus === 'active' ? 600 : 400 }}>
                      {micBtnLabel}
                    </p>
                  </div>

                  <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                    <Btn variant="secondary" size="sm" onClick={startMic} disabled={micStatus === 'requesting'}>
                      <Icon name="refresh-cw" size={13} color="#64748B" /> Re-record
                    </Btn>
                    <Btn onClick={submitAnswer}>
                      <Icon name="arrow-right" size={13} color="#fff" />
                      {transcript.trim() ? 'Submit & Next' : 'Skip'}
                    </Btn>
                  </div>
                </div>
              )}

              {/* Type mode */}
              {phase === 'listening' && inputMode === 'type' && (
                <div>
                  <textarea
                    value={typed} onChange={e => setTyped(e.target.value)}
                    placeholder="Type your answer here…" rows={5} autoFocus
                    style={{ width:'100%', padding:'12px 14px', background:'#F8F9FC', border:'1px solid #E2E8F0', borderRadius:10, color:'#0F172A', fontSize:14, lineHeight:1.6, fontFamily:'Inter, sans-serif', resize:'vertical', marginBottom:14 }}
                  />
                  <Btn onClick={submitAnswer} fullWidth>
                    <Icon name="arrow-right" size={13} color="#fff" />
                    {typed.trim() ? 'Submit & Next' : 'Skip Question'}
                  </Btn>
                </div>
              )}

              {/* Processing */}
              {phase === 'saving_answer' && (
                <div style={{ textAlign:'center', padding:'20px 0', color:'#94A3B8', fontSize:14 }}>
                  <div style={{ width:28, height:28, border:'3px solid #E2E8F0', borderTopColor:'#2563EB', borderRadius:'50%', margin:'0 auto 10px', animation:'spin 0.8s linear infinite' }} />
                  Getting Aria's feedback…
                </div>
              )}
            </div>
          )}

          {/* ══ DONE ══ */}
          {phase === 'done' && (
            <div style={{ textAlign:'center', paddingTop:4 }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background: answers.length >= totalQ ? '#ECFDF5' : '#FEF3C7', border:`2px solid ${answers.length >= totalQ ? '#A7F3D0' : '#FDE68A'}`, margin:'0 auto 18px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name={answers.length >= totalQ ? 'check-circle' : 'alert-circle'} size={34} color={answers.length >= totalQ ? '#059669' : '#D97706'} />
              </div>
              <h2 style={{ fontSize:22, fontWeight:700, color:'#0F172A', marginBottom:8 }}>
                {answers.length >= totalQ ? 'Session Complete! 🎉' : answers.length === 0 ? 'No Responses' : `${answers.length}/${totalQ} Answered`}
              </h2>
              {answers.length === 0 && (
                <div style={{ margin:'0 auto 16px', padding:'10px 16px', background:'#FEF2F2', borderRadius:10, border:'1px solid #FECACA', fontSize:13, color:'#DC2626', maxWidth:380 }}>
                  Honor Score reduced — skipped session with no responses.
                </div>
              )}
              {answers.length > 0 && answers.length < totalQ && (
                <div style={{ margin:'0 auto 16px', padding:'10px 16px', background:'#FEF3C7', borderRadius:10, border:'1px solid #FDE68A', fontSize:13, color:'#92400E', maxWidth:380 }}>
                  ⚠️ Incomplete session — Honor Score reduced. Complete all {totalQ} questions next time.
                </div>
              )}
              {ariaText && (
                <div style={{ margin:'0 auto 18px', padding:'14px 18px', background:'#EFF6FF', borderRadius:12, border:'1px solid #BFDBFE', maxWidth:420, textAlign:'left' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#2563EB', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Aria</div>
                  <p style={{ margin:0, fontSize:14, color:'#1D4ED8', lineHeight:1.6 }}>
                    <StreamingText text={ariaText} isNew={ariaIsNew} />
                  </p>
                </div>
              )}
              <p style={{ color:'#94A3B8', fontSize:13, marginBottom:4 }}>
                {answers.length > 0
                  ? <>Answered <strong style={{ color:'#0F172A' }}>{answers.length}</strong> of {totalQ} questions</>
                  : 'No responses recorded this session.'}
              </p>
              <p style={{ color:'#CBD5E1', fontSize:12, marginBottom:26 }}>
                {saving ? 'Saving…' : '✓ Saved to your profile'}
              </p>
              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                <Btn variant="secondary" onClick={() => {
                  stopAllAudio()
                  setPhase('intro'); setQIdx(0); qIdxRef.current = 0
                  setAnswers([]); answersRef.current = []
                  setAriaText(''); setAriaIsNew(false)
                  setTranscript(''); txRef.current = ''
                }}>
                  <Icon name="refresh-cw" size={13} color="#64748B" /> New Session
                </Btn>
                <Btn onClick={() => { stopAllAudio(); nav('/dashboard') }}>
                  <Icon name="layout-dashboard" size={13} color="#fff" /> Dashboard
                </Btn>
              </div>
            </div>
          )}
        </div>

        {/* End early */}
        {['speaking','listening','saving_answer','feedback_speaking'].includes(phase) && (
          <div style={{ textAlign:'center', marginTop:14 }}>
            <button onClick={() => doEndSession(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', fontSize:12 }}>
              End session early
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
