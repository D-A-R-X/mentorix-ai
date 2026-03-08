import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AmbientBg, LogoMark, ScoreRing, Icon, Btn, Card, Badge, Spinner, useToast,
} from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth'
import { userApi, coursesApi, groqChat } from '../lib/api'

const NAV = [
  { id: 'overview',   label: 'Overview',    icon: 'layout-dashboard' },
  { id: 'sessions',   label: 'Sessions',    icon: 'mic' },
  { id: 'courses',    label: 'Courses',     icon: 'book-open' },
  { id: 'chat',       label: 'AI Chat',     icon: 'message-circle' },
]

export default function Dashboard() {
  const { user, logout } = useAuth()
  const nav   = useNavigate()
  const toast = useToast()

  const [tab,      setTab]      = useState('overview')
  const [sessions, setSessions] = useState([])
  const [honor,    setHonor]    = useState(null)
  const [courses,  setCourses]  = useState([])
  const [loading,  setLoading]  = useState(true)

  // Chat state
  const [chatMsgs,   setChatMsgs]   = useState([{ role: 'assistant', content: "Hi! I'm your AI mentor. Ask me anything about academics, placement, or your progress." }])
  const [chatInput,  setChatInput]  = useState('')
  const [chatLoading,setChatLoading]= useState(false)
  const [groqKey,    setGroqKey]    = useState(() => localStorage.getItem('mentorix_groq_key') || '')
  const chatEndRef = useRef(null)

  // ── Load all data ─────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      // /user/sessions returns { sessions: [...], profile: {...} }
      userApi.sessions().then(d => setSessions(d?.sessions || [])).catch(() => {}),
      // /user/honor returns { score: N, events: [...] }
      userApi.honor().then(setHonor).catch(() => {}),
      // /courses/progress returns { stats: {...}, completions: [...] }
      coursesApi.progress().then(d => setCourses(d?.completions || [])).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMsgs])

  const saveGroqKey = (k) => { setGroqKey(k); localStorage.setItem('mentorix_groq_key', k) }

  const sendChat = async () => {
    if (!chatInput.trim()) return
    if (!groqKey) { toast('Enter your Groq API key above to enable chat', 'warn'); return }
    const msg = chatInput.trim()
    setChatInput('')
    setChatMsgs(m => [...m, { role: 'user', content: msg }])
    setChatLoading(true)
    try {
      const systemCtx = `You are a helpful academic mentor for ${user?.name || 'a student'} studying ${user?.department || user?.dept || 'engineering'}. Be concise and encouraging. Answer only academic and career questions.`
      const reply = await groqChat([
        { role: 'system', content: systemCtx },
        ...chatMsgs.slice(-8),
        { role: 'user', content: msg },
      ], groqKey)
      setChatMsgs(m => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setChatMsgs(m => [...m, { role: 'assistant', content: 'Sorry, something went wrong. Check your Groq API key.' }])
    } finally { setChatLoading(false) }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const honorScore      = honor?.honor_score ?? honor?.score ?? 0
  const sessionCount    = sessions.length
  const completedCourses= courses.filter(c => c.status === 'completed').length

  // Get user info — sessions profile or auth
  const userName   = user?.name || user?.dept ? user.name : 'there'
  const userDept   = user?.dept || user?.department || ''
  const userCgpa   = JSON.parse(localStorage.getItem('mentorix_onboarding') || '{}').cgpa

  return (
    <div style={{ minHeight: '100vh', background: '#06050e', display: 'flex', color: '#c0bbd8', fontFamily: 'DM Sans, sans-serif' }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .nav-item:hover { background: rgba(255,255,255,0.04); }
        .action-card:hover { border-color: rgba(124,77,255,0.3) !important; transform: translateY(-1px); }
        input:focus, textarea:focus { border-color: rgba(124,77,255,0.5) !important; outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2e2a42; border-radius: 2px; }
      `}</style>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 220,
        background: '#0e0c1a', borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column', zIndex: 10, padding: '24px 0',
      }}>
        <div style={{ padding: '0 20px', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={26} />
          <span style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, fontSize: 15, color: '#f4f0ff' }}>
            Mentorix<span style={{ color: '#7c4dff' }}>.</span>AI
          </span>
        </div>

        {NAV.map(n => (
          <button key={n.id} className="nav-item" onClick={() => setTab(n.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
            background: tab === n.id ? 'rgba(124,77,255,0.1)' : 'transparent',
            borderLeft: `2px solid ${tab === n.id ? '#7c4dff' : 'transparent'}`,
            border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
            color: tab === n.id ? '#f4f0ff' : '#6e6888',
            fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
          }}>
            <Icon name={n.icon} size={16} color={tab === n.id ? '#7c4dff' : '#6e6888'} />
            {n.label}
          </button>
        ))}

        <div style={{ marginTop: 'auto', padding: '0 20px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(124,77,255,0.2)', border: '1px solid rgba(124,77,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#7c4dff',
            }}>
              {(user?.name || 'U')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#f4f0ff', fontWeight: 600 }}>{user?.name || 'User'}</div>
              <div style={{ fontSize: 10, color: '#6e6888', fontFamily: 'DM Mono, monospace' }}>{userDept || 'Student'}</div>
            </div>
          </div>
          <Btn variant="ghost" size="sm" fullWidth onClick={() => { logout(); nav('/login') }}>
            <Icon name="log-out" size={14} color="#6e6888" /> Sign Out
          </Btn>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main style={{ marginLeft: 220, flex: 1, padding: '32px clamp(24px,4vw,48px)', position: 'relative', zIndex: 1 }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 26, fontWeight: 700, color: '#f4f0ff', margin: '0 0 4px' }}>
              {tab === 'overview' ? `Welcome back, ${(user?.name || '').split(' ')[0] || 'there'}` : NAV.find(n => n.id === tab)?.label}
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: '#6e6888', fontFamily: 'DM Mono, monospace' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn onClick={() => nav('/voice')} size="sm">
              <Icon name="mic" size={14} color="#fff" /> Start Session
            </Btn>
            <Btn onClick={() => nav('/hr')} variant="secondary" size="sm">
              <Icon name="briefcase" size={14} color="#c0bbd8" /> HR Mode
            </Btn>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner size={32} /></div>
        ) : (
          <>
            {/* ── OVERVIEW ──────────────────────────────────────────────── */}
            {tab === 'overview' && (
              <div>
                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
                  {[
                    { label: 'Honor Score',    val: honorScore,       icon: 'shield',        color: '#7c4dff', sub: '/ 100' },
                    { label: 'Sessions',       val: sessionCount,     icon: 'mic',           color: '#00e5b4', sub: 'total' },
                    { label: 'Courses Done',   val: completedCourses, icon: 'check-circle',  color: '#7c4dff', sub: 'completed' },
                    { label: 'CGPA',           val: userCgpa ?? '—', icon: 'award',         color: '#00e5b4', sub: '/ 10' },
                  ].map(s => (
                    <Card key={s.label}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#6e6888', marginBottom: 8, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                          <div style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 30, fontWeight: 800, color: '#f4f0ff', lineHeight: 1 }}>
                            {s.val}<span style={{ fontSize: 13, color: '#6e6888', fontFamily: 'DM Sans, sans-serif', fontWeight: 400 }}> {s.sub}</span>
                          </div>
                        </div>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: `rgba(${s.color === '#7c4dff' ? '124,77,255' : '0,229,180'},0.1)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={s.icon} size={18} color={s.color} />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Actions + honor ring */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, marginBottom: 20, alignItems: 'start' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { label: 'Voice Session', desc: 'Practice with AI mentor',  icon: 'mic',              to: '/voice',      color: '#7c4dff' },
                      { label: 'HR Mode',       desc: 'Mock interview prep',       icon: 'briefcase',        to: '/hr',         color: '#00e5b4' },
                      { label: 'Assessment',    desc: 'Take skill evaluation',     icon: 'clipboard-check',  to: '/assessment', color: '#7c4dff' },
                      { label: 'AI Chat',       desc: 'Ask your mentor',           icon: 'message-circle',   action: () => setTab('chat'), color: '#00e5b4' },
                    ].map(a => (
                      <button key={a.label} className="action-card" onClick={() => a.to ? nav(a.to) : a.action()} style={{
                        padding: 20, borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                        background: '#0e0c1a', border: '1px solid rgba(255,255,255,0.07)', transition: 'all 0.2s',
                      }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: `rgba(${a.color === '#7c4dff' ? '124,77,255' : '0,229,180'},0.1)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                          <Icon name={a.icon} size={18} color={a.color} />
                        </div>
                        <div style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 14, fontWeight: 600, color: '#f4f0ff', marginBottom: 4 }}>{a.label}</div>
                        <div style={{ fontSize: 12, color: '#6e6888' }}>{a.desc}</div>
                      </button>
                    ))}
                  </div>
                  <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 170, gap: 10 }}>
                    <ScoreRing score={honorScore} size={110} label="Honor" />
                    <div style={{ textAlign: 'center', fontSize: 11, color: '#6e6888', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {honorScore >= 80 ? 'Excellent' : honorScore >= 60 ? 'Good' : honorScore >= 40 ? 'Fair' : 'Building'}
                    </div>
                  </Card>
                </div>

                {/* Recent sessions */}
                <Card>
                  <h3 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 16, fontWeight: 600, color: '#f4f0ff', margin: '0 0 16px' }}>Recent Sessions</h3>
                  {sessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#6e6888', fontSize: 14 }}>
                      No sessions yet.{' '}
                      <button onClick={() => nav('/voice')} style={{ color: '#7c4dff', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                        Start your first voice session
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sessions.slice(0, 5).map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, background: '#161328' }}>
                          <Icon name={s.mode === 'hr_interview' ? 'briefcase' : 'mic'} size={14} color="#6e6888" />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: '#f4f0ff', fontWeight: 500 }}>
                              {s.mode === 'hr_interview' ? 'HR Interview' : 'Voice Session'}
                            </div>
                            <div style={{ fontSize: 11, color: '#6e6888', fontFamily: 'DM Mono, monospace' }}>
                              {s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN') : '—'}
                              {s.exchange_count ? ` · ${s.exchange_count} exchanges` : ''}
                            </div>
                          </div>
                          {s.overall_score
                            ? <Badge color={s.overall_score >= 70 ? 'teal' : 'violet'}>{s.overall_score}/100</Badge>
                            : <Badge color="muted">—</Badge>
                          }
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* ── SESSIONS ──────────────────────────────────────────────── */}
            {tab === 'sessions' && (
              <div>
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#6e6888' }}>{sessionCount} total sessions</p>
                  <Btn onClick={() => nav('/voice')} size="sm"><Icon name="plus" size={14} color="#fff" /> New Session</Btn>
                </div>
                {sessions.length === 0 ? (
                  <Card style={{ textAlign: 'center', padding: 48 }}>
                    <Icon name="mic-off" size={32} color="#2e2a42" />
                    <p style={{ color: '#6e6888', marginTop: 16 }}>No sessions recorded yet</p>
                    <Btn onClick={() => nav('/voice')} style={{ marginTop: 8 }}><Icon name="mic" size={14} color="#fff" /> Start Session</Btn>
                  </Card>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {sessions.map((s, i) => (
                      <Card key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: s.mode === 'hr_interview' ? 'rgba(0,229,180,0.1)' : 'rgba(124,77,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name={s.mode === 'hr_interview' ? 'briefcase' : 'mic'} size={20} color={s.mode === 'hr_interview' ? '#00e5b4' : '#7c4dff'} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 600, color: '#f4f0ff', marginBottom: 4 }}>
                            {s.mode === 'hr_interview' ? 'HR Mode Interview' : 'Voice Mentoring Session'}
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#6e6888', fontFamily: 'DM Mono, monospace', flexWrap: 'wrap' }}>
                            {s.created_at && <span>{new Date(s.created_at).toLocaleDateString('en-IN')}</span>}
                            {s.exchange_count > 0 && <span>{s.exchange_count} exchanges</span>}
                            {s.tab_warnings > 0 && <span style={{ color: '#ff4d6d' }}>{s.tab_warnings} tab warnings</span>}
                          </div>
                          {s.summary && (
                            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6e6888', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {s.summary.slice(0, 200)}
                            </p>
                          )}
                        </div>
                        {s.overall_score
                          ? <Badge color={s.overall_score >= 70 ? 'teal' : s.overall_score >= 50 ? 'violet' : 'rose'}>{s.overall_score}/100</Badge>
                          : null
                        }
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── COURSES ───────────────────────────────────────────────── */}
            {tab === 'courses' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {courses.length === 0 ? (
                  <Card style={{ textAlign: 'center', padding: 48 }}>
                    <Icon name="book-open" size={32} color="#2e2a42" />
                    <p style={{ color: '#6e6888', marginTop: 16 }}>No courses tracked yet. Complete an assessment to get recommendations.</p>
                  </Card>
                ) : courses.map((c, i) => {
                  const done = c.status === 'completed'
                  return (
                    <Card key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: done ? 'rgba(0,229,180,0.1)' : 'rgba(124,77,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={done ? 'check-circle' : 'book-open'} size={20} color={done ? '#00e5b4' : '#7c4dff'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 600, color: '#f4f0ff', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.course_title}
                        </div>
                        <div style={{ fontSize: 12, color: '#6e6888', fontFamily: 'DM Mono, monospace' }}>
                          {c.provider || c.track || '—'}
                        </div>
                      </div>
                      {c.course_url && (
                        <a href={c.course_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#7c4dff', textDecoration: 'none', fontFamily: 'DM Mono, monospace', padding: '4px 10px', border: '1px solid rgba(124,77,255,0.3)', borderRadius: 6 }}>
                          Open
                        </a>
                      )}
                      <Badge color={done ? 'teal' : 'muted'}>{done ? 'Done' : 'Started'}</Badge>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* ── AI CHAT ───────────────────────────────────────────────── */}
            {tab === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
                {/* Groq key banner */}
                {!groqKey && (
                  <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Icon name="key" size={16} color="#f5a623" />
                    <span style={{ fontSize: 13, color: '#f5a623', flex: 1 }}>Paste your Groq API key to enable AI chat</span>
                    <input placeholder="gsk_..." value={groqKey} onChange={e => saveGroqKey(e.target.value)} style={{ padding: '6px 12px', background: '#161328', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 8, color: '#f4f0ff', fontSize: 13, fontFamily: 'DM Mono, monospace', width: 260 }} />
                  </div>
                )}
                <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {chatMsgs.map((m, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '75%', padding: '12px 16px', borderRadius: 14, background: m.role === 'user' ? 'rgba(124,77,255,0.15)' : '#161328', border: m.role === 'user' ? '1px solid rgba(124,77,255,0.3)' : '1px solid rgba(255,255,255,0.06)', color: '#f4f0ff', fontSize: 14, lineHeight: 1.6, fontFamily: 'DM Sans, sans-serif', whiteSpace: 'pre-wrap' }}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div style={{ display: 'flex' }}>
                        <div style={{ padding: '12px 16px', background: '#161328', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                          <Spinner size={16} />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 10 }}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                      placeholder="Ask your AI mentor..." style={{ flex: 1, padding: '11px 16px', background: '#161328', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, color: '#f4f0ff', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }} />
                    <Btn onClick={sendChat} loading={chatLoading}><Icon name="send" size={15} color="#fff" /></Btn>
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
