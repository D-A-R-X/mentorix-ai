import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoMark, ScoreRing, Icon, Btn, Card, Badge, Spinner, useToast } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { userApi, coursesApi } from '../lib/api'

const NAV = [
  { id: 'overview', label: 'Overview',  icon: 'layout-dashboard' },
  { id: 'sessions', label: 'Sessions',  icon: 'mic' },
  { id: 'courses',  label: 'Courses',   icon: 'book-open' },
  { id: 'chat',     label: 'AI Chat',   icon: 'message-circle' },
]

const API = import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'
const CHAT_CACHE_KEY = 'mentorix_chat_cache'
const CACHE_TTL = 24 * 60 * 60 * 1000  // 24 hours

// ── Chat cache helpers ────────────────────────────────────────────────────────
function loadChatCache() {
  try {
    const raw = localStorage.getItem(CHAT_CACHE_KEY)
    if (!raw) return null
    const { messages, savedAt } = JSON.parse(raw)
    if (Date.now() - savedAt > CACHE_TTL) {
      localStorage.removeItem(CHAT_CACHE_KEY)
      return null
    }
    return messages
  } catch { return null }
}

function saveChatCache(messages) {
  try {
    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify({ messages, savedAt: Date.now() }))
  } catch {}
}

function clearChatCache() {
  localStorage.removeItem(CHAT_CACHE_KEY)
}

const INITIAL_MSG = { role: 'assistant', content: "Hi! I'm Aria, your AI mentor. Ask me anything about academics, placement, or career planning." }

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth()
  const nav   = useNavigate()
  const toast = useToast()

  const [tab,       setTab]       = useState('overview')
  const [sessions,  setSessions]  = useState([])
  const [honor,     setHonor]     = useState(null)
  const [courses,   setCourses]   = useState([])
  const [loading,   setLoading]   = useState(true)

  // Chat — load from cache or use initial
  const [chatMsgs,  setChatMsgs]  = useState(() => loadChatCache() || [INITIAL_MSG])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy,  setChatBusy]  = useState(false)

  const chatEndRef = useRef(null)

  useEffect(() => {
    Promise.all([
      userApi.sessions().then(d => setSessions(d?.sessions || [])).catch(() => {}),
      userApi.honor().then(setHonor).catch(() => {}),
      coursesApi.progress().then(d => setCourses(d?.completions || [])).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMsgs])

  // Save chat to cache whenever messages change (skip initial)
  useEffect(() => {
    if (chatMsgs.length > 1) saveChatCache(chatMsgs)
  }, [chatMsgs])

  const sendChat = async () => {
    if (!chatInput.trim() || chatBusy) return
    const msg = chatInput.trim()
    setChatInput('')
    const updated = [...chatMsgs, { role: 'user', content: msg }]
    setChatMsgs(updated)
    setChatBusy(true)
    try {
      const res = await fetch(API + '/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('mentorix_token'),
        },
        body: JSON.stringify({
          messages: [...updated.slice(-10)],  // last 10 messages for context
          system: `You are Aria, a warm, encouraging AI academic mentor for ${user?.name || 'a student'} studying ${user?.department || user?.dept || 'engineering'}. Be concise, empathetic, and supportive. Max 3 sentences.`,
          max_tokens: 300,
        }),
      })
      const data  = await res.json()
      const reply = data.reply || data.content || 'I could not respond right now. Please try again.'
      setChatMsgs(m => [...m, { role: 'assistant', content: reply }])
    } catch {
      setChatMsgs(m => [...m, { role: 'assistant', content: 'Could not connect. Please try again.' }])
    } finally {
      setChatBusy(false)
    }
  }

  const clearChat = () => {
    clearChatCache()
    setChatMsgs([INITIAL_MSG])
  }

  const honorScore       = honor?.honor_score ?? honor?.score ?? 0
  const completedCourses = courses.filter(c => c.status === 'completed').length
  const cached           = JSON.parse(localStorage.getItem('mentorix_onboarding') || '{}')
  const dept             = user?.dept || user?.department || cached.department || ''

  const S = {
    sidebar: { position: 'fixed', top: 0, left: 0, bottom: 0, width: 220, background: '#fff', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', zIndex: 10, padding: '20px 0' },
    navItem: (active) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px', cursor: 'pointer', background: active ? '#EFF6FF' : 'transparent', borderLeft: `2px solid ${active ? '#2563EB' : 'transparent'}`, border: 'none', width: '100%', textAlign: 'left', color: active ? '#1D4ED8' : '#64748B', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: active ? 600 : 400, transition: 'all 0.15s' }),
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', display: 'flex', fontFamily: 'Inter, sans-serif', color: '#334155' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .nav-item:hover { background: #F8FAFC !important; }
        .action-card:hover { border-color: #BFDBFE !important; box-shadow: 0 4px 12px rgba(37,99,235,0.06) !important; }
        input:focus, textarea:focus { border-color: #93C5FD !important; outline: none !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 2px; }
      `}</style>

      {/* Sidebar */}
      <aside style={S.sidebar}>
        <div style={{ padding: '0 20px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={26} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Mentorix<span style={{ color: '#2563EB' }}>.</span>AI
          </span>
        </div>

        {NAV.map(n => (
          <button key={n.id} className="nav-item" onClick={() => setTab(n.id)} style={S.navItem(tab === n.id)}>
            <Icon name={n.icon} size={15} color={tab === n.id ? '#2563EB' : '#94A3B8'} />
            {n.label}
          </button>
        ))}

        <div style={{ height: 1, background: '#F1F4F9', margin: '12px 20px' }} />
        <button className="nav-item" onClick={() => nav('/assessment')} style={S.navItem(false)}>
          <Icon name="clipboard-check" size={15} color="#94A3B8" /> Assessment
        </button>
        <button className="nav-item" onClick={() => nav('/voice')} style={S.navItem(false)}>
          <Icon name="mic" size={15} color="#94A3B8" /> Voice Session
        </button>
        <button className="nav-item" onClick={() => nav('/hr')} style={S.navItem(false)}>
          <Icon name="briefcase" size={15} color="#94A3B8" /> HR Mode
        </button>

        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #F1F4F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#2563EB', fontSize: 13, flexShrink: 0 }}>
              {(user?.name || 'U')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{user?.name || 'User'}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{dept || 'Student'}</div>
            </div>
          </div>
          <Btn variant="ghost" size="sm" fullWidth onClick={() => { logout(); nav('/login') }}>
            <Icon name="log-out" size={13} color="#64748B" /> Sign Out
          </Btn>
        </div>
      </aside>

      {/* Main */}
      <main style={{ marginLeft: 220, flex: 1, padding: '28px clamp(20px,4vw,44px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: 2 }}>
              {tab === 'overview' ? `Good day, ${(user?.name || '').split(' ')[0] || 'there'}` : NAV.find(n => n.id === tab)?.label}
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: '#94A3B8' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => nav('/voice')} size="sm"><Icon name="mic" size={13} color="#fff" /> Voice Session</Btn>
            <Btn onClick={() => nav('/hr')} variant="secondary" size="sm"><Icon name="briefcase" size={13} color="#334155" /> HR Mode</Btn>
          </div>
        </div>

        {loading ? <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner size={30} /></div> : (
          <>
            {/* OVERVIEW */}
            {tab === 'overview' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 18 }}>
                  {[
                    { label: 'Honor Score',  val: honorScore,        sub: '/ 100',    icon: 'shield-check', accent: '#2563EB' },
                    { label: 'Sessions',     val: sessions.length,   sub: 'recorded', icon: 'mic',          accent: '#059669' },
                    { label: 'Courses Done', val: completedCourses,  sub: 'completed',icon: 'check-circle', accent: '#2563EB' },
                    { label: 'CGPA',         val: cached.cgpa ?? '—', sub: '/ 10',   icon: 'award',        accent: '#059669' },
                  ].map(s => (
                    <Card key={s.label}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{s.label}</div>
                          <div style={{ fontSize: 28, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                            {s.val}<span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 400 }}> {s.sub}</span>
                          </div>
                        </div>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: s.accent === '#059669' ? '#ECFDF5' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={s.icon} size={17} color={s.accent} />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, marginBottom: 18 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { label: 'Voice Session', desc: 'Practice with Aria',        icon: 'mic',             to: '/voice',      bg: '#EFF6FF', fg: '#2563EB' },
                      { label: 'HR Mode',       desc: 'Mock interview prep',        icon: 'briefcase',       to: '/hr',         bg: '#ECFDF5', fg: '#059669' },
                      { label: 'Assessment',    desc: 'Skill evaluation',           icon: 'clipboard-check', to: '/assessment', bg: '#EFF6FF', fg: '#2563EB' },
                      { label: 'AI Chat',       desc: 'Ask Aria anything',          icon: 'message-circle',  action: () => setTab('chat'), bg: '#ECFDF5', fg: '#059669' },
                    ].map(a => (
                      <button key={a.label} className="action-card" onClick={() => a.to ? nav(a.to) : a.action()} style={{
                        padding: 18, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                        background: '#fff', border: '1px solid #E2E8F0', transition: 'all 0.18s',
                      }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                          <Icon name={a.icon} size={17} color={a.fg} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 3 }}>{a.label}</div>
                        <div style={{ fontSize: 12, color: '#94A3B8' }}>{a.desc}</div>
                      </button>
                    ))}
                  </div>
                  <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 160, gap: 8 }}>
                    <ScoreRing score={honorScore} size={110} label="Honor" />
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {honorScore >= 80 ? 'Excellent' : honorScore >= 60 ? 'Good' : honorScore >= 40 ? 'Fair' : 'Building'}
                    </div>
                  </Card>
                </div>

                <Card>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 16 }}>Recent Sessions</h3>
                  {sessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: 14 }}>
                      No sessions yet.{' '}
                      <button onClick={() => nav('/voice')} style={{ color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Start your first session</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sessions.slice(0, 5).map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: '#F8F9FC', border: '1px solid #F1F4F9' }}>
                          <Icon name={s.mode === 'hr_interview' ? 'briefcase' : 'mic'} size={14} color="#94A3B8" />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: '#0F172A', fontWeight: 500 }}>{s.mode === 'hr_interview' ? 'HR Interview' : 'Voice Session'}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN') : '—'}{s.exchange_count ? ` · ${s.exchange_count} exchanges` : ''}</div>
                          </div>
                          {s.overall_score ? <Badge color={s.overall_score >= 70 ? 'teal' : 'blue'}>{s.overall_score}/100</Badge> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* SESSIONS */}
            {tab === 'sessions' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontSize: 13, color: '#94A3B8' }}>{sessions.length} sessions total</span>
                  <Btn size="sm" onClick={() => nav('/voice')}><Icon name="plus" size={13} color="#fff" /> New Session</Btn>
                </div>
                {sessions.length === 0 ? (
                  <Card style={{ textAlign: 'center', padding: 48 }}>
                    <Icon name="mic-off" size={32} color="#CBD5E1" />
                    <p style={{ color: '#94A3B8', marginTop: 14 }}>No sessions yet</p>
                    <Btn onClick={() => nav('/voice')} style={{ marginTop: 12 }}><Icon name="mic" size={13} color="#fff" /> Start Session</Btn>
                  </Card>
                ) : sessions.map((s, i) => (
                  <Card key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: s.mode === 'hr_interview' ? '#ECFDF5' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={s.mode === 'hr_interview' ? 'briefcase' : 'mic'} size={18} color={s.mode === 'hr_interview' ? '#059669' : '#2563EB'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14, marginBottom: 3 }}>{s.mode === 'hr_interview' ? 'HR Mode Interview' : 'Voice Mentoring Session'}</div>
                      <div style={{ fontSize: 12, color: '#94A3B8', display: 'flex', gap: 10 }}>
                        {s.created_at && <span>{new Date(s.created_at).toLocaleDateString('en-IN')}</span>}
                        {s.exchange_count > 0 && <span>{s.exchange_count} exchanges</span>}
                        {s.tab_warnings > 0 && <span style={{ color: '#DC2626' }}>{s.tab_warnings} tab warnings</span>}
                      </div>
                      {s.summary && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>{s.summary.slice(0, 180)}</p>}
                    </div>
                    {s.overall_score ? <Badge color={s.overall_score >= 70 ? 'teal' : 'blue'}>{s.overall_score}/100</Badge> : null}
                  </Card>
                ))}
              </div>
            )}

            {/* COURSES */}
            {tab === 'courses' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {courses.length === 0 ? (
                  <Card style={{ textAlign: 'center', padding: 48 }}>
                    <Icon name="book-open" size={32} color="#CBD5E1" />
                    <p style={{ color: '#94A3B8', marginTop: 14 }}>No courses tracked yet. Complete an assessment to get recommendations.</p>
                  </Card>
                ) : courses.map((c, i) => {
                  const done = c.status === 'completed'
                  return (
                    <Card key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: done ? '#ECFDF5' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={done ? 'check-circle' : 'book-open'} size={18} color={done ? '#059669' : '#2563EB'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.course_title}</div>
                        <div style={{ fontSize: 12, color: '#94A3B8' }}>{c.provider || c.track || '—'}</div>
                      </div>
                      {c.course_url && <a href={c.course_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#2563EB', fontWeight: 500, textDecoration: 'none' }}>Open →</a>}
                      <Badge color={done ? 'teal' : 'muted'}>{done ? 'Completed' : 'In Progress'}</Badge>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* AI CHAT */}
            {tab === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)' }}>
                <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>

                  {/* Chat header */}
                  <div style={{ padding: '13px 18px', borderBottom: '1px solid #F1F4F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#EFF6FF,#ECFDF5)', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="message-circle" size={16} color="#2563EB" />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Aria — AI Mentor</div>
                        <div style={{ fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#059669' }} /> Online
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', align: 'center', gap: 8 }}>
                      {chatMsgs.length > 1 && (
                        <span style={{ fontSize: 11, color: '#CBD5E1' }}>
                          Chat saved for 24h
                        </span>
                      )}
                      <button onClick={clearChat} title="Clear chat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', padding: '2px 6px', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="trash-2" size={13} color="#CBD5E1" /> Clear
                      </button>
                    </div>
                  </div>

                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {chatMsgs.map((m, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        {m.role === 'assistant' && (
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                            <Icon name="message-circle" size={13} color="#2563EB" />
                          </div>
                        )}
                        <div style={{ maxWidth: '72%', padding: '11px 15px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: m.role === 'user' ? '#2563EB' : '#F8F9FC', color: m.role === 'user' ? '#fff' : '#334155', fontSize: 14, lineHeight: 1.6, border: m.role === 'user' ? 'none' : '1px solid #E2E8F0' }}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {chatBusy && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name="message-circle" size={13} color="#2563EB" />
                        </div>
                        <div style={{ padding: '11px 15px', background: '#F8F9FC', borderRadius: '12px 12px 12px 2px', border: '1px solid #E2E8F0', display: 'flex', gap: 5, alignItems: 'center' }}>
                          {[0,1,2].map(i => (
                            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#CBD5E1', animation: `pulse 1.2s infinite ${i * 0.2}s` }} />
                          ))}
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input */}
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F4F9', display: 'flex', gap: 8 }}>
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                      placeholder="Ask Aria anything…"
                      style={{ flex: 1, padding: '10px 14px', background: '#F8F9FC', border: '1px solid #E2E8F0', borderRadius: 8, color: '#0F172A', fontSize: 14, fontFamily: 'Inter, sans-serif' }}
                    />
                    <Btn onClick={sendChat} loading={chatBusy}>
                      <Icon name="send" size={14} color="#fff" />
                    </Btn>
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}