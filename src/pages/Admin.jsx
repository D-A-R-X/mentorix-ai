import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const API = import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'

// ── Helpers ────────────────────────────────────────────────────────────────────
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const fmt = (dt) => dt ? new Date(dt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '--'
const fmtShort = (dt) => dt ? new Date(dt).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '--'
const mono = { fontFamily:"'JetBrains Mono',monospace" }

function downloadCSV(rows, filename) {
  const csv = rows.map(r=>r.map(v=>'"'+(v||'').toString().replace(/"/g,'""')+'"').join(',')).join('\n')
  const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=filename; a.click()
}

// ── Toast ──────────────────────────────────────────────────────────────────────
let _toastTimer
function showToast(msg, type='ok') {
  let t = document.getElementById('__adminToast')
  if (!t) {
    t = document.createElement('div'); t.id='__adminToast'
    t.style.cssText='position:fixed;bottom:28px;right:24px;border-radius:10px;padding:12px 18px;font-size:13px;z-index:9999;transition:all 0.3s;opacity:0;transform:translateY(8px);max-width:340px;line-height:1.5;font-family:DM Sans,sans-serif'
    document.body.appendChild(t)
  }
  t.style.background = '#120f24'
  t.style.border  = type==='error' ? '1px solid rgba(231,76,60,0.45)' : '1px solid rgba(124,77,255,0.4)'
  t.style.color   = type==='error' ? '#e74c3c' : '#00e5b4'
  t.textContent   = msg
  t.style.opacity='1'; t.style.transform='translateY(0)'
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(8px)' }, 3500)
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner({ size=16 }) {
  return <div style={{ display:'inline-block', width:size, height:size, border:`2px solid rgba(124,77,255,0.2)`, borderTopColor:'#7c4dff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
}

// ── Score color ────────────────────────────────────────────────────────────────
const scoreColor = s => s>=70 ? '#00e5b4' : s>=45 ? '#f39c12' : '#e74c3c'

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ show, title, body, onCancel, onConfirm, confirmLabel='Delete', confirmColor='#e74c3c' }) {
  if (!show) return null
  return (
    <div onClick={onCancel} style={{ position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#0f0d1c',border:'1px solid rgba(124,77,255,0.28)',borderRadius:16,padding:28,maxWidth:440,width:'90%' }}>
        <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:16,color:'#f0ecff',marginBottom:10 }}>⚠ {title}</div>
        <div style={{ fontSize:13,color:'#c4bedd',lineHeight:1.65,marginBottom:22 }}>{body}</div>
        <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ padding:'8px 16px',borderRadius:8,border:'1px solid rgba(124,77,255,0.2)',color:'#6b6480',background:'transparent',cursor:'pointer',fontSize:13 }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${confirmColor}55`,color:confirmColor,background:`${confirmColor}15`,cursor:'pointer',fontSize:13 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Institution Modal ──────────────────────────────────────────────────────
function AddInstModal({ show, onClose, onSubmit }) {
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [env,   setEnv]   = useState('dev')
  const [loading, setLoading] = useState(false)

  const iStyle = { width:'100%',padding:'10px 14px',background:'#161228',border:'1px solid rgba(124,77,255,0.2)',borderRadius:8,color:'#f0ecff',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none' }
  const lStyle = { display:'block',...mono,fontSize:10,color:'#6b6480',letterSpacing:1,textTransform:'uppercase',marginBottom:6 }

  const submit = async () => {
    if (!name.trim()) { showToast('Institution name required','error'); return }
    setLoading(true)
    await onSubmit({ name: name.trim(), contact_email: email||null, env })
    setLoading(false); setName(''); setEmail(''); setEnv('dev')
  }

  if (!show) return null
  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#0f0d1c',border:'1px solid rgba(124,77,255,0.3)',borderRadius:16,padding:28,maxWidth:440,width:'90%' }}>
        <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:16,color:'#f0ecff',marginBottom:20 }}>Add Institution</div>
        <div style={{ marginBottom:14 }}>
          <label style={lStyle}>Institution Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. DSCE, Bangalore" style={iStyle} />
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={lStyle}>Contact Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="admin@college.edu" style={iStyle} />
        </div>
        <div style={{ marginBottom:22 }}>
          <label style={lStyle}>Environment / Plan</label>
          <select value={env} onChange={e=>setEnv(e.target.value)} style={{ ...iStyle,...mono,cursor:'pointer' }}>
            <option value="dev">DEV — Demo / Trial (Free)</option>
            <option value="prod">PROD — Live / Paid (Enterprise)</option>
          </select>
          <div style={{ marginTop:8,fontSize:11,color:'#6b6480',lineHeight:1.6 }}>
            {env==='dev'
              ? '🔧 Demo mode — institution is visible on login page for testing.'
              : '🚀 Production — paid live deployment with full feature access.'}
          </div>
        </div>
        <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 16px',borderRadius:8,border:'1px solid rgba(124,77,255,0.2)',color:'#6b6480',background:'transparent',cursor:'pointer',fontSize:13 }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ padding:'8px 20px',borderRadius:8,background:'#7c4dff',border:'none',color:'#fff',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,cursor:'pointer',opacity:loading?0.7:1 }}>
            {loading ? 'Creating…' : 'Create Institution'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ADMIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function Admin() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const token = localStorage.getItem('mentorix_token') || ''

  const [page,      setPage]      = useState('overview')
  const [loading,   setLoading]   = useState(true)
  const [lastUp,    setLastUp]    = useState('')

  // Data
  const [overview,  setOverview]  = useState(null)
  const [users,     setUsers]     = useState([])
  const [sessions,  setSessions]  = useState([])
  const [honor,     setHonor]     = useState([])
  const [insts,     setInsts]     = useState([])
  const [sysLatency,setSysLatency]= useState('--')

  // Filters
  const [userQ,     setUserQ]     = useState('')
  const [sessQ,     setSessQ]     = useState('')
  const [sessModeF, setSessModeF] = useState('')
  const [honorQ,    setHonorQ]    = useState('')

  // Modals
  const [delModal,  setDelModal]  = useState(null) // { title, body, onConfirm }
  const [addInst,   setAddInst]   = useState(false)

  const h = useCallback(() => ({ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }), [token])

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    const t0 = Date.now()
    try {
      const [ovR, usR, seR, hoR, inR] = await Promise.allSettled([
        fetch(`${API}/admin/overview`,     { headers: h() }),
        fetch(`${API}/admin/users`,        { headers: h() }),
        fetch(`${API}/admin/sessions`,     { headers: h() }),
        fetch(`${API}/admin/honor`,        { headers: h() }),
        fetch(`${API}/admin/institutions`, { headers: h() }),
      ])
      if (ovR.status==='fulfilled' && ovR.value.ok) setOverview(await ovR.value.json())
      if (usR.status==='fulfilled' && usR.value.ok) setUsers((await usR.value.json()).users || [])
      if (seR.status==='fulfilled' && seR.value.ok) setSessions((await seR.value.json()).sessions || [])
      if (hoR.status==='fulfilled' && hoR.value.ok) setHonor((await hoR.value.json()).honor || [])
      if (inR.status==='fulfilled' && inR.value.ok) setInsts((await inR.value.json()).institutions || [])
      setSysLatency(`${Date.now()-t0}ms`)
      setLastUp(new Date().toLocaleTimeString())
    } catch {}
    setLoading(false)
  }, [h])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Guards ─────────────────────────────────────────────────────────────────
  const email = user?.email || localStorage.getItem('mentorix_email') || ''
  const isAdmin = email.toLowerCase()==='admin@mentorix.ai' || email.toLowerCase().startsWith('admin@')
  if (!isAdmin) {
    return (
      <div style={{ minHeight:'100vh',background:'#07060f',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'DM Sans,sans-serif' }}>
        <div style={{ textAlign:'center',color:'#6b6480' }}>
          <div style={{ fontSize:40,marginBottom:16 }}>🚫</div>
          <div style={{ fontSize:18,color:'#f0ecff',marginBottom:8 }}>Admin access required</div>
          <div style={{ fontSize:13,marginBottom:24 }}>You are signed in as {email}</div>
          <button onClick={() => nav('/dashboard')} style={{ padding:'10px 24px',background:'#7c4dff',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:14,fontFamily:"'Syne',sans-serif",fontWeight:700 }}>← Back to Dashboard</button>
        </div>
      </div>
    )
  }

  // ── Derived counts ─────────────────────────────────────────────────────────
  const ov = overview?.stats || {}

  // ── Styles ─────────────────────────────────────────────────────────────────
  const C = {
    bg:'#07060f', surface:'#0f0d1c', surface2:'#161228', surface3:'#1c1830',
    border:'rgba(124,77,255,0.12)', border2:'rgba(124,77,255,0.25)',
    purple:'#7c4dff', accent:'#00e5b4', red:'#e74c3c', orange:'#f39c12',
    white:'#f0ecff', muted:'#6b6480', text:'#c4bedd',
  }

  const card = { background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:20 }
  const tCell = { padding:'9px 12px', color:C.text, borderBottom:`1px solid rgba(124,77,255,0.05)`, fontSize:13 }
  const th = { padding:'9px 12px', ...mono, fontSize:10, color:C.muted, letterSpacing:1, textTransform:'uppercase', fontWeight:400, textAlign:'left', borderBottom:`1px solid ${C.border}` }
  const actionBtn = (col='#6b6480') => ({ ...mono, fontSize:10, padding:'4px 9px', borderRadius:5, border:`1px solid rgba(124,77,255,0.15)`, background:'transparent', color:col, cursor:'pointer' })
  const filterInput = { flex:1, minWidth:160, padding:'8px 12px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, color:C.white, fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none' }

  // ── Nav items ──────────────────────────────────────────────────────────────
  const NAV = [
    { group:'Overview', items:[{ id:'overview', icon:'⬜', label:'Dashboard' }] },
    { group:'Management', items:[
      { id:'users',        icon:'👥', label:'Users' },
      { id:'sessions',     icon:'🎤', label:'Sessions' },
      { id:'institutions', icon:'🏛', label:'Institutions' },
    ]},
    { group:'Intelligence', items:[
      { id:'analytics',   icon:'📊', label:'Analytics' },
      { id:'honor',       icon:'🛡', label:'Honor Scores' },
    ]},
    { group:'System', items:[
      { id:'system', icon:'🖥', label:'System Status' },
      { id:'ml',     icon:'🤖', label:'ML & LLM' },
    ]},
  ]

  const pageTitle = { overview:'Dashboard Overview', users:'User Management', sessions:'Session Records', institutions:'Institutions', analytics:'Behavioral Analytics', honor:'Honor Score Ledger', system:'System Status', ml:'ML & LLM Engine' }

  // ── Delete helpers ─────────────────────────────────────────────────────────
  const deleteUser = (email) => setDelModal({
    title:'Delete User', body:`Permanently delete ${email} and all their sessions, assessments, and honor data?`,
    onConfirm: async () => {
      await fetch(`${API}/admin/users/by-email/${encodeURIComponent(email)}`,{method:'DELETE',headers:h()})
      setDelModal(null); showToast('User deleted'); loadAll()
    }
  })

  const deleteSession = (id) => setDelModal({
    title:'Delete Session', body:'Delete this voice/HR session record permanently?',
    onConfirm: async () => {
      await fetch(`${API}/admin/sessions/${id}`,{method:'DELETE',headers:h()})
      setDelModal(null); showToast('Session deleted'); loadAll()
    }
  })

  const deleteInst = (id, name) => setDelModal({
    title:'Remove Institution', body:`Remove "${name}"? Students from this institution will be unaffected but the institution dropdown will be removed.`,
    onConfirm: async () => {
      await fetch(`${API}/admin/institutions/${id}`,{method:'DELETE',headers:h()})
      setDelModal(null); showToast('Institution removed'); loadAll()
    }
  })

  const toggleSuspend = async (uid, email, isSusp) => {
    await fetch(`${API}/admin/users/${uid}/suspend`,{method:'PATCH',headers:h(),body:JSON.stringify({suspended:!isSusp})})
    showToast(isSusp ? `Access restored: ${email}` : `Suspended: ${email}`)
    loadAll()
  }

  const toggleInst = async (id) => {
    const r = await fetch(`${API}/admin/institutions/${id}/toggle`,{method:'PATCH',headers:h()})
    if (r.ok) { const d=await r.json(); showToast(d.active?'Institution activated':'Institution deactivated'); loadAll() }
    else showToast('Failed to toggle','error')
  }

  const setInstEnv = async (id, env) => {
    const r = await fetch(`${API}/admin/institutions/${id}`,{method:'PATCH',headers:h(),body:JSON.stringify({env})})
    if (r.ok) { showToast(`Switched to ${env.toUpperCase()}`); loadAll() }
    else showToast('Failed to update env','error')
  }

  const addInstitution = async (data) => {
    const r = await fetch(`${API}/admin/institutions`,{method:'POST',headers:h(),body:JSON.stringify(data)})
    if (r.ok) { showToast('Institution added'); setAddInst(false); loadAll() }
    else { const e=await r.json(); showToast(e.detail||'Failed','error') }
  }

  // Filtered data
  const filtUsers   = users.filter(u => !userQ || (u.email+u.name||'').toLowerCase().includes(userQ.toLowerCase()))
  const filtSessions= sessions.filter(s => {
    const q = sessQ.toLowerCase()
    const matchQ = !q || (s.user_email+s.user_name||'').toLowerCase().includes(q)
    const matchM  = !sessModeF || s.mode===sessModeF || (sessModeF==='voice'&&s.mode!=='hr_interview')
    return matchQ && matchM
  })
  const filtHonor   = honor.filter(h => !honorQ || (h.email+h.name||'').toLowerCase().includes(honorQ.toLowerCase()))

  const EnvBadge = ({ env }) => (
    <span style={{ ...mono, fontSize:9, padding:'2px 8px', borderRadius:4, letterSpacing:1,
      background: env==='prod' ? '#7c4dff22' : 'rgba(107,100,128,0.12)',
      border: `1px solid ${env==='prod' ? '#7c4dff55' : 'rgba(107,100,128,0.25)'}`,
      color: env==='prod' ? '#b39dff' : C.muted
    }}>{env==='prod' ? 'PROD' : 'DEV'}</span>
  )

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:'DM Sans,sans-serif', color:C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=JetBrains+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(124,77,255,0.25);border-radius:2px}
        tr:hover td{background:rgba(124,77,255,0.04)!important}
        input::placeholder{color:#3d3856}
        select option{background:#161228;color:#c4bedd}
        .nav-item:hover{background:rgba(124,77,255,0.07)!important;color:#f0ecff!important}
        .act-btn:hover{border-color:#7c4dff!important;color:#7c4dff!important}
        .del-btn:hover{border-color:#e74c3c!important;color:#e74c3c!important}
        .susp-btn:hover{border-color:#f39c12!important;color:#f39c12!important}
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{ width:220,minWidth:220,height:'100vh',background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden' }}>
        {/* Logo */}
        <div style={{ padding:'18px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10 }}>
          <div style={{ width:32,height:32,background:C.purple,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
              <path d="M4 32 L4 10 L13 10 L20 22 L27 10 L36 10 L36 32 L30 32 L30 18 L22 30 L18 30 L10 18 L10 32 Z" fill="white"/>
              <path d="M24 10 L30 10 L36 10 L30 20 L36 32 L29 32 L24 23 L19 32 L13 32 L20 20 Z" fill="rgba(0,0,0,0.5)"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.white,display:'flex',alignItems:'center',gap:5 }}>
              Mentorix <span style={{ ...mono,fontSize:8,color:C.red,background:'rgba(231,76,60,0.1)',border:'1px solid rgba(231,76,60,0.3)',padding:'1px 4px',borderRadius:3 }}>ADMIN</span>
            </div>
            <div style={{ ...mono,fontSize:9,color:C.muted,marginTop:1 }}>Console</div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex:1,overflowY:'auto',padding:'8px 0' }}>
          {NAV.map(({ group, items }) => (
            <div key={group} style={{ marginBottom:4 }}>
              <div style={{ ...mono,fontSize:9,color:C.muted,letterSpacing:1.5,textTransform:'uppercase',padding:'12px 16px 5px' }}>{group}</div>
              {items.map(({ id, icon, label }) => (
                <div key={id} className="nav-item" onClick={() => setPage(id)} style={{
                  display:'flex',alignItems:'center',gap:9,padding:'8px 16px',cursor:'pointer',
                  borderLeft:`2px solid ${page===id ? C.purple : 'transparent'}`,
                  background: page===id ? 'rgba(124,77,255,0.1)' : 'transparent',
                  color: page===id ? C.white : C.muted,
                  fontSize:13,transition:'all 0.15s',
                }}>
                  <span style={{ fontSize:14,width:18,textAlign:'center' }}>{icon}</span>{label}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 16px',borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:10 }}>
            <div style={{ width:26,height:26,borderRadius:'50%',background:C.purple,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff' }}>A</div>
            <div>
              <div style={{ fontSize:12,color:C.text }}>Admin</div>
              <div style={{ ...mono,fontSize:9,color:C.muted }}>Super Admin</div>
            </div>
          </div>
          <button onClick={() => { logout(); nav('/login') }} style={{ width:'100%',padding:'7px',background:'rgba(231,76,60,0.06)',border:'1px solid rgba(231,76,60,0.25)',borderRadius:7,color:C.red,fontSize:12,cursor:'pointer',fontFamily:'DM Sans,sans-serif' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
        {/* Topbar */}
        <div style={{ padding:'12px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(7,6,15,0.85)',backdropFilter:'blur(12px)',flexShrink:0 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,color:C.white }}>{pageTitle[page]||page}</div>
            <div style={{ fontSize:11,color:C.muted,marginTop:1 }}>Mentorix Admin Console</div>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            {lastUp && <span style={{ ...mono,fontSize:9,color:C.muted }}>Updated {lastUp}</span>}
            <button onClick={loadAll} disabled={loading} style={{ ...mono,fontSize:11,padding:'6px 12px',borderRadius:7,border:'1px solid rgba(0,229,180,0.3)',color:C.accent,background:'rgba(0,229,180,0.05)',cursor:'pointer',display:'flex',alignItems:'center',gap:5 }}>
              {loading ? <Spinner size={11}/> : '↺'} Refresh
            </button>
            <button onClick={() => nav('/dashboard')} style={{ ...mono,fontSize:11,padding:'6px 12px',borderRadius:7,border:`1px solid ${C.border}`,color:C.muted,background:'transparent',cursor:'pointer' }}>
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1,overflowY:'auto',padding:'22px 24px' }}>

          {/* ═══ OVERVIEW ═══ */}
          {page==='overview' && (
            <div style={{ animation:'fadeUp 0.3s ease' }}>
              {/* Stat grid */}
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:14,marginBottom:22 }}>
                {[
                  { label:'Total Users',    val: ov.total_users??users.length,    glow:'#7c4dff', delta:`+${ov.active_7d||0} this week` },
                  { label:'Voice Sessions', val: ov.total_sessions??sessions.filter(s=>s.mode!=='hr_interview').length, glow:'#27ae60' },
                  { label:'HR Sessions',    val: ov.hr_sessions??sessions.filter(s=>s.mode==='hr_interview').length, glow:'#e74c3c' },
                  { label:'Active Today',   val: ov.active_today??0,              glow:'#f39c12' },
                  { label:'Avg Score',      val: ov.avg_score ? ov.avg_score+'/100' : '--', glow:'#00e5b4' },
                  { label:'Avg Honor',      val: ov.avg_honor ? ov.avg_honor : '--', glow:'#7c4dff' },
                ].map(({ label, val, glow, delta }) => (
                  <div key={label} style={{ ...card, position:'relative',overflow:'hidden' }}>
                    <div style={{ position:'absolute',top:-10,right:-10,width:70,height:70,borderRadius:'50%',background:glow,filter:'blur(28px)',opacity:0.28 }} />
                    <div style={{ ...mono,fontSize:10,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8 }}>{label}</div>
                    <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:C.white }}>{val??'--'}</div>
                    {delta && <div style={{ fontSize:11,color:C.accent,marginTop:4 }}>{delta}</div>}
                  </div>
                ))}
              </div>

              {/* Recent activity */}
              <div style={{ ...card }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
                  <div>
                    <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white }}>Recent Activity</div>
                    <div style={{ fontSize:11,color:C.muted,marginTop:2 }}>Latest sessions and sign-ups</div>
                  </div>
                  {loading && <Spinner />}
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%',borderCollapse:'collapse' }}>
                    <thead><tr>{['Student','Mode','Score','Institution','Time'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {(overview?.recent_activity||sessions.slice(0,10)).length===0
                        ? <tr><td colSpan={5} style={{ ...tCell,textAlign:'center',color:C.muted,padding:24 }}>No sessions yet</td></tr>
                        : (overview?.recent_activity||sessions.slice(0,10)).map((s,i)=>(
                          <tr key={i}>
                            <td style={tCell}>
                              <div style={{ color:C.white,fontWeight:500,fontSize:13 }}>{s.user_name||s.name||'Unknown'}</div>
                              <div style={{ ...mono,fontSize:10,color:C.muted }}>{s.user_email||s.email||''}</div>
                            </td>
                            <td style={tCell}><span style={{ ...mono,fontSize:10,padding:'2px 8px',borderRadius:4,background:s.mode==='hr_interview'?'rgba(231,76,60,0.12)':'rgba(124,77,255,0.1)',color:s.mode==='hr_interview'?C.red:C.purple }}>{s.mode==='hr_interview'?'HR Mode':'Voice'}</span></td>
                            <td style={tCell}>{s.overall_score ? <span style={{ ...mono,fontWeight:600,color:scoreColor(s.overall_score) }}>{s.overall_score}/100</span> : <span style={{ color:C.muted }}>--</span>}</td>
                            <td style={{ ...tCell,fontSize:12 }}>{s.institution_name||'Independent'}</td>
                            <td style={{ ...tCell,color:C.muted,fontSize:11 }}>{fmtShort(s.created_at||s.time)}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ USERS ═══ */}
          {page==='users' && (
            <div style={{ animation:'fadeUp 0.3s ease' }}>
              <div style={{ display:'flex',gap:10,marginBottom:16,flexWrap:'wrap' }}>
                <input value={userQ} onChange={e=>setUserQ(e.target.value)} placeholder="Search by email or name…" style={filterInput} />
                <button onClick={()=>downloadCSV([['Name','Email','Institution','Dept','Sessions','Honor','Status','Joined'],...users.map(u=>[u.name,u.email,u.institution_name||'Independent',u.department,u.session_count,parseFloat(u.honor_score||0).toFixed(1),u.is_suspended?'Suspended':'Active',u.created_at])],'mentorix_users.csv')} style={{ ...mono,fontSize:11,padding:'8px 14px',borderRadius:8,border:'1px solid rgba(0,229,180,0.3)',color:C.accent,background:'rgba(0,229,180,0.05)',cursor:'pointer' }}>Export CSV</button>
              </div>
              <div style={card}>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%',borderCollapse:'collapse' }}>
                    <thead><tr>{['Name / Email','Institution / Dept','Sessions','Honor','Joined','Status','Actions'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {filtUsers.length===0
                        ? <tr><td colSpan={7} style={{ ...tCell,textAlign:'center',color:C.muted,padding:24 }}>{loading?'Loading…':'No users found'}</td></tr>
                        : filtUsers.map(u=>{
                          const susp = u.is_suspended||u.suspended
                          const honor = parseFloat(u.honor_score||0).toFixed(0)
                          return (
                            <tr key={u.id||u.email}>
                              <td style={tCell}>
                                <div style={{ color:C.white,fontWeight:600,fontSize:13 }}>{u.name||'--'}</div>
                                <div style={{ ...mono,fontSize:10,color:C.muted,marginTop:2 }}>{u.email||'--'}</div>
                              </td>
                              <td style={tCell}>
                                <div style={{ fontSize:12 }}>{u.institution_name||'Independent'}</div>
                                <div style={{ ...mono,fontSize:10,color:C.muted }}>{u.department||'--'}</div>
                              </td>
                              <td style={{ ...tCell,textAlign:'center' }}>{u.session_count||0}</td>
                              <td style={{ ...tCell,textAlign:'center' }}>
                                <span style={{ ...mono,fontSize:13,fontWeight:700,color:scoreColor(parseFloat(honor)) }}>{honor}</span>
                              </td>
                              <td style={{ ...tCell,color:C.muted,fontSize:11 }}>{fmtShort(u.created_at)}</td>
                              <td style={tCell}>
                                <span style={{ ...mono,fontSize:9,padding:'3px 8px',borderRadius:4,background:susp?'rgba(231,76,60,0.1)':'rgba(0,229,180,0.08)',border:`1px solid ${susp?'rgba(231,76,60,0.3)':'rgba(0,229,180,0.2)'}`,color:susp?C.red:C.accent,letterSpacing:0.5 }}>{susp?'SUSPENDED':'ACTIVE'}</span>
                              </td>
                              <td style={{ ...tCell,display:'flex',gap:5 }}>
                                <button className="susp-btn act-btn" onClick={()=>toggleSuspend(u.id,u.email,susp)} style={actionBtn(C.orange)}>{susp?'Restore':'Suspend'}</button>
                                <button className="del-btn act-btn" onClick={()=>deleteUser(u.email)} style={actionBtn(C.red)}>Delete</button>
                              </td>
                            </tr>
                          )
                        })
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SESSIONS ═══ */}
          {page==='sessions' && (
            <div style={{ animation:'fadeUp 0.3s ease' }}>
              <div style={{ display:'flex',gap:10,marginBottom:16,flexWrap:'wrap' }}>
                <input value={sessQ} onChange={e=>setSessQ(e.target.value)} placeholder="Search by email or name…" style={filterInput} />
                <select value={sessModeF} onChange={e=>setSessModeF(e.target.value)} style={{ padding:'8px 10px',background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,...mono,cursor:'pointer',outline:'none' }}>
                  <option value="">All Modes</option>
                  <option value="voice">Voice Session</option>
                  <option value="hr_interview">HR Mode</option>
                </select>
                <button onClick={()=>downloadCSV([['Name','Email','Institution','Dept','Mode','Exchanges','Score','Tab Warnings','Date'],...sessions.map(s=>[s.user_name,s.user_email||s.email,s.institution_name,s.department,s.mode,s.exchange_count,s.overall_score,s.tab_warnings,s.created_at])],'mentorix_sessions.csv')} style={{ ...mono,fontSize:11,padding:'8px 14px',borderRadius:8,border:'1px solid rgba(0,229,180,0.3)',color:C.accent,background:'rgba(0,229,180,0.05)',cursor:'pointer' }}>Export CSV</button>
              </div>
              <div style={card}>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%',borderCollapse:'collapse' }}>
                    <thead><tr>{['Student','Institution','Mode','Exchanges','Score','Tab Warns','Date','Del'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {filtSessions.length===0
                        ? <tr><td colSpan={8} style={{ ...tCell,textAlign:'center',color:C.muted,padding:24 }}>{loading?'Loading…':'No sessions found'}</td></tr>
                        : filtSessions.map(s=>(
                          <tr key={s.id}>
                            <td style={tCell}>
                              <div style={{ color:C.white,fontWeight:500,fontSize:12 }}>{s.user_name||'Unknown'}</div>
                              <div style={{ ...mono,fontSize:10,color:C.muted }}>{s.user_email||s.email||'--'}</div>
                            </td>
                            <td style={{ ...tCell,fontSize:12 }}>
                              <div>{s.institution_name||'Independent'}</div>
                              <div style={{ ...mono,fontSize:10,color:C.muted }}>{s.department||'--'}</div>
                            </td>
                            <td style={tCell}><span style={{ ...mono,fontSize:10,padding:'2px 8px',borderRadius:4,background:s.mode==='hr_interview'?'rgba(231,76,60,0.1)':'rgba(124,77,255,0.1)',color:s.mode==='hr_interview'?C.red:C.purple }}>{s.mode==='hr_interview'?'HR Mode':'Voice'}</span></td>
                            <td style={{ ...tCell,textAlign:'center' }}>{s.exchange_count||0}</td>
                            <td style={{ ...tCell,textAlign:'center' }}>{s.overall_score ? <span style={{ ...mono,fontWeight:600,color:scoreColor(s.overall_score) }}>{s.overall_score}/100</span> : <span style={{ color:C.muted }}>--</span>}</td>
                            <td style={{ ...tCell,textAlign:'center' }}>{s.tab_warnings>0 ? <span style={{ color:C.red,fontWeight:600,...mono }}>{s.tab_warnings}</span> : <span style={{ color:C.accent,...mono }}>0</span>}</td>
                            <td style={{ ...tCell,color:C.muted,fontSize:11 }}>{fmtShort(s.created_at)}</td>
                            <td style={tCell}><button className="del-btn act-btn" onClick={()=>deleteSession(s.id)} style={actionBtn(C.red)}>Del</button></td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ INSTITUTIONS ═══ */}
          {page==='institutions' && (
            <div style={{ animation:'fadeUp 0.3s ease' }}>
              <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12 }}>
                <div>
                  <div style={{ ...mono,fontSize:10,color:C.muted,letterSpacing:1.5,textTransform:'uppercase',marginBottom:6 }}>Deployment Management</div>
                  <div style={{ fontSize:13,color:C.muted,lineHeight:1.65,maxWidth:520 }}>
                    Each institution is tracked separately. <span style={{ color:C.orange }}>DEV</span> = demo / trial access (free).&nbsp;
                    <span style={{ color:C.accent }}>PROD</span> = paid live deployment (enterprise plan).
                  </div>
                </div>
                <button onClick={()=>setAddInst(true)} style={{ padding:'9px 18px',background:C.purple,border:'none',color:'#fff',borderRadius:8,fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,cursor:'pointer',flexShrink:0 }}>+ Add Institution</button>
              </div>

              {insts.length===0
                ? <div style={{ ...card,textAlign:'center',padding:48,color:C.muted,fontSize:13 }}>
                    <div style={{ fontSize:36,marginBottom:14,opacity:0.3 }}>🏛</div>
                    No institutions yet. Add your first deployment.
                  </div>
                : <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16 }}>
                    {insts.map(inst=>{
                      const isProd = inst.env==='prod'
                      return (
                        <div key={inst.id} style={{ ...card,border:`1px solid ${isProd?'rgba(0,229,180,0.2)':C.border}`,transition:'border-color 0.3s' }}>
                          <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14 }}>
                            <div style={{ flex:1,minWidth:0,paddingRight:10 }}>
                              <div style={{ fontSize:14,fontWeight:700,color:C.white,marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{inst.name}</div>
                              <div style={{ ...mono,fontSize:10,color:C.muted }}>{inst.contact_email||'No contact email'}</div>
                            </div>
                            <EnvBadge env={inst.env} />
                          </div>

                          {/* ENV Dropdown */}
                          <div style={{ marginBottom:14 }}>
                            <label style={{ ...mono,fontSize:9,color:C.muted,letterSpacing:1,textTransform:'uppercase',display:'block',marginBottom:6 }}>Plan / Environment</label>
                            <select value={inst.env} onChange={e=>setInstEnv(inst.id,e.target.value)} style={{ width:'100%',background:C.surface2,border:`1px solid ${isProd?'rgba(0,229,180,0.25)':C.border}`,borderRadius:7,padding:'8px 10px',fontSize:12,...mono,color:isProd?C.accent:C.muted,cursor:'pointer',outline:'none',transition:'all 0.2s' }}>
                              <option value="dev">DEV — Demo / Trial (Free)</option>
                              <option value="prod">PROD — Live / Paid (Enterprise)</option>
                            </select>
                            {isProd
                              ? <div style={{ fontSize:11,color:C.accent,marginTop:5 }}>🚀 Live deployment — visible to students on login page</div>
                              : <div style={{ fontSize:11,color:C.orange,marginTop:5 }}>🔧 Demo mode — testing / trial access only</div>
                            }
                          </div>

                          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:14,borderTop:`1px solid ${C.border}` }}>
                            <div style={{ ...mono,fontSize:10,color:C.muted }}>Added {fmtShort(inst.created_at)}</div>
                            <button onClick={()=>deleteInst(inst.id,inst.name)} className="del-btn" style={{ ...actionBtn(C.muted),fontSize:11,padding:'5px 11px',border:'1px solid rgba(231,76,60,0.25)',color:C.red }}>Remove</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          )}

          {/* ═══ ANALYTICS ═══ */}
          {page==='analytics' && (
            <div style={{ animation:'fadeUp 0.3s ease' }}>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16,marginBottom:20 }}>
                {/* Mode breakdown */}
                <div style={card}>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white,marginBottom:14 }}>Session Mode Split</div>
                  {[
                    { label:'Voice Sessions', val:sessions.filter(s=>s.mode!=='hr_interview').length, col:C.purple },
                    { label:'HR Mock Interviews', val:sessions.filter(s=>s.mode==='hr_interview').length, col:C.red },
                  ].map(({ label,val,col })=>(
                    <div key={label} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid rgba(124,77,255,0.05)` }}>
                      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                        <div style={{ width:8,height:8,borderRadius:'50%',background:col }} />
                        <span style={{ fontSize:13 }}>{label}</span>
                      </div>
                      <span style={{ ...mono,fontWeight:700,color:C.white,fontSize:14 }}>{val}</span>
                    </div>
                  ))}
                </div>

                {/* Score distribution */}
                <div style={card}>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white,marginBottom:14 }}>Score Distribution</div>
                  {[['81–100','#00e5b4'],[' 61–80','#7c4dff'],[' 41–60','#f39c12'],[' 21–40','#e57c4d'],[' 0–20','#e74c3c']].map(([range,col])=>{
                    const cnt = sessions.filter(s=>{const sc=s.overall_score||0;const [lo,hi]=range.trim().split('–').map(Number);return sc>=lo&&sc<=hi}).length
                    const pct = sessions.length ? Math.round(cnt/sessions.length*100) : 0
                    return (
                      <div key={range} style={{ display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:`1px solid rgba(124,77,255,0.05)` }}>
                        <span style={{ ...mono,fontSize:11,color:C.muted,width:52 }}>{range.trim()}</span>
                        <div style={{ flex:1,height:4,background:'rgba(255,255,255,0.05)',borderRadius:2,overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`,height:'100%',background:col,borderRadius:2,transition:'width 0.6s ease' }} />
                        </div>
                        <span style={{ ...mono,fontSize:11,color:col,width:30,textAlign:'right' }}>{cnt}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Top performers */}
                <div style={card}>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white,marginBottom:14 }}>Top Performers</div>
                  {(() => {
                    const byEmail = {}
                    sessions.forEach(s=>{ if(!s.user_email&&!s.email) return; const e=s.user_email||s.email; if(!byEmail[e]){byEmail[e]={name:s.user_name||e,scores:[]};} if(s.overall_score) byEmail[e].scores.push(s.overall_score) })
                    return Object.entries(byEmail).filter(([,d])=>d.scores.length).map(([e,d])=>({ e,name:d.name,avg:Math.round(d.scores.reduce((a,b)=>a+b,0)/d.scores.length) })).sort((a,b)=>b.avg-a.avg).slice(0,5)
                  })().map(({ e,name,avg },i)=>(
                    <div key={e} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid rgba(124,77,255,0.05)` }}>
                      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                        <span style={{ ...mono,fontSize:10,color:C.muted }}>#{i+1}</span>
                        <span style={{ fontSize:12 }}>{name.split('@')[0]}</span>
                      </div>
                      <span style={{ ...mono,fontSize:13,fontWeight:700,color:scoreColor(avg) }}>{avg}/100</span>
                    </div>
                  ))}
                  {sessions.length===0 && <div style={{ color:C.muted,fontSize:12 }}>No session data yet</div>}
                </div>
              </div>

              {/* Institution breakdown */}
              <div style={card}>
                <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white,marginBottom:16 }}>Institution Activity</div>
                <table style={{ width:'100%',borderCollapse:'collapse' }}>
                  <thead><tr>{['Institution','Users','Sessions','Avg Score','Plan'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {insts.length===0
                      ? <tr><td colSpan={5} style={{ ...tCell,textAlign:'center',color:C.muted,padding:20 }}>No institutions configured</td></tr>
                      : insts.map(inst=>{
                        const instUsers = users.filter(u=>u.institution_name===inst.name||u.institution_id===inst.id)
                        const instSessions = sessions.filter(s=>s.institution_name===inst.name)
                        const avgSc = instSessions.filter(s=>s.overall_score).length ? Math.round(instSessions.filter(s=>s.overall_score).reduce((a,s)=>a+s.overall_score,0)/instSessions.filter(s=>s.overall_score).length) : 0
                        return (
                          <tr key={inst.id}>
                            <td style={{ ...tCell,color:C.white,fontWeight:500 }}>{inst.name}</td>
                            <td style={{ ...tCell,textAlign:'center' }}>{instUsers.length}</td>
                            <td style={{ ...tCell,textAlign:'center' }}>{instSessions.length}</td>
                            <td style={{ ...tCell,textAlign:'center' }}>{avgSc ? <span style={{ ...mono,color:scoreColor(avgSc) }}>{avgSc}/100</span> : '--'}</td>
                            <td style={tCell}><EnvBadge env={inst.env} /></td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ HONOR SCORES ═══ */}
          {page==='honor' && (
            <div style={{ animation:'fadeUp 0.3s ease' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12 }}>
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:C.white,marginBottom:4 }}>Honor Leaderboard</div>
                  <div style={{ fontSize:13,color:C.muted }}>Ranked by behavioral integrity & engagement score</div>
                </div>
                <div style={{ display:'flex',gap:10 }}>
                  <input value={honorQ} onChange={e=>setHonorQ(e.target.value)} placeholder="Search…" style={{ ...filterInput,flex:'none',width:200 }} />
                  <button onClick={()=>downloadCSV([['Rank','Name','Email','Institution','Dept','Honor Score','Events'],...filtHonor.map((h,i)=>[i+1,h.name,h.email,h.institution_name,h.department,parseFloat(h.total_score||0).toFixed(1),h.event_count])],'mentorix_honor.csv')} style={{ ...mono,fontSize:11,padding:'8px 14px',borderRadius:8,border:'1px solid rgba(0,229,180,0.3)',color:C.accent,background:'rgba(0,229,180,0.05)',cursor:'pointer' }}>Export CSV</button>
                </div>
              </div>
              <div style={card}>
                <table style={{ width:'100%',borderCollapse:'collapse' }}>
                  <thead><tr>{['Rank','Student','Institution','Dept','Honor Score','Events'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filtHonor.length===0
                      ? <tr><td colSpan={6} style={{ ...tCell,textAlign:'center',color:C.muted,padding:28 }}>{loading?'Loading…':'No honor data yet'}</td></tr>
                      : filtHonor.map((h,i)=>{
                        const score = parseFloat(h.total_score||100).toFixed(1)
                        const medals = ['🥇','🥈','🥉']
                        return (
                          <tr key={h.email}>
                            <td style={{ ...tCell,textAlign:'center',fontSize:16,width:48 }}>{medals[i]||<span style={{ ...mono,fontSize:11,color:C.muted }}>#{i+1}</span>}</td>
                            <td style={tCell}>
                              <div style={{ color:C.white,fontWeight:600,fontSize:13 }}>{h.name||'--'}</div>
                              <div style={{ ...mono,fontSize:10,color:C.muted,marginTop:2 }}>{h.email||'--'}</div>
                            </td>
                            <td style={{ ...tCell,fontSize:12 }}>{h.institution_name||'Independent'}</td>
                            <td style={{ ...tCell,fontSize:12,color:C.muted }}>{h.department||'--'}</td>
                            <td style={{ ...tCell,textAlign:'center' }}>
                              <span style={{ ...mono,fontSize:15,fontWeight:800,color:scoreColor(parseFloat(score)) }}>{score}</span>
                            </td>
                            <td style={{ ...tCell,textAlign:'center',...mono,fontSize:11,color:C.muted }}>{h.event_count||0}</td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ SYSTEM STATUS ═══ */}
          {page==='system' && (
            <div style={{ animation:'fadeUp 0.3s ease' }}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16 }}>
                <div style={card}>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white,marginBottom:16 }}>Service Health</div>
                  {[
                    { label:'Backend API (Render)',   val:'● Online', latency:sysLatency, col:C.accent },
                    { label:'PostgreSQL Database',    val:'● Connected', col:C.accent },
                    { label:'Netlify Frontend',       val:'● Online', col:C.accent },
                    { label:'Groq LLM (Primary)',     val:'● Active', col:C.accent },
                    { label:'Gemini (Fallback)',       val:'● Active', col:C.accent },
                    { label:'ElevenLabs TTS',         val:'● Active', col:C.accent },
                  ].map(({ label,val,col,latency })=>(
                    <div key={label} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid rgba(124,77,255,0.05)` }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <span style={{ ...mono,fontSize:12,color:col }}>{val}{latency?` (${latency})`:''}</span>
                    </div>
                  ))}
                </div>
                <div style={card}>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white,marginBottom:16 }}>Performance & Config</div>
                  {[
                    { label:'API Response Time',  val:sysLatency },
                    { label:'Render Region',       val:'Oregon, US' },
                    { label:'Auth Provider',       val:'Google OAuth + JWT' },
                    { label:'STT Engine',          val:'Web Speech API' },
                    { label:'TTS Engine',          val:'ElevenLabs / Browser' },
                    { label:'Total Users',         val:String(ov.total_users||users.length||0) },
                    { label:'Total Sessions',      val:String(ov.total_sessions||sessions.length||0) },
                  ].map(({ label,val })=>(
                    <div key={label} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid rgba(124,77,255,0.05)` }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <span style={{ ...mono,fontSize:12,color:C.white }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={card}>
                <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white,marginBottom:14 }}>Database Tables</div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8 }}>
                  {['users','voice_sessions','honor_events','assessments','course_completions','institutions'].map(t=>(
                    <div key={t} style={{ background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',...mono,fontSize:11,color:C.accent }}>● {t}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ ML & LLM ═══ */}
          {page==='ml' && (
            <div style={{ animation:'fadeUp 0.3s ease' }}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16 }}>
                <div style={card}>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white,marginBottom:16 }}>ML Model Status</div>
                  {[
                    { label:'Model Version',     val:'risk_model_v1' },
                    { label:'Algorithm',          val:'Random Forest' },
                    { label:'Prediction Count',   val:String(sessions.length||0) },
                    { label:'Last Updated',        val:'2025-01-01' },
                    { label:'Status',             val:'● ACTIVE', col:C.accent },
                  ].map(({ label,val,col })=>(
                    <div key={label} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid rgba(124,77,255,0.05)` }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <span style={{ ...mono,fontSize:12,color:col||C.white }}>{val}</span>
                    </div>
                  ))}
                  <button onClick={()=>showToast('Model retraining requires dataset upload. Contact CRONIX engineering.','error')} style={{ width:'100%',marginTop:14,padding:'10px',background:'rgba(124,77,255,0.1)',border:`1px solid ${C.border2}`,...mono,fontSize:12,color:C.purple,borderRadius:8,cursor:'pointer' }}>Retrain Model</button>
                </div>
                <div style={card}>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white,marginBottom:16 }}>LLM Engine</div>
                  {[
                    { label:'Primary LLM',        val:'Groq · llama-3.1-8b' },
                    { label:'Fallback LLM',        val:'Gemini 2.0 Flash' },
                    { label:'Voice STT',           val:'Web Speech API' },
                    { label:'Voice TTS',           val:'ElevenLabs Rachel' },
                    { label:'TTS Fallback',        val:'Browser SpeechSynthesis' },
                    { label:'Aria Persona',        val:'Active (Voice + Chat)' },
                  ].map(({ label,val })=>(
                    <div key={label} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid rgba(124,77,255,0.05)` }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <span style={{ ...mono,fontSize:12,color:C.white }}>{val}</span>
                    </div>
                  ))}
                  <button onClick={async(e)=>{
                    e.target.textContent='Testing…'
                    try{
                      const r=await fetch(`${API}/chat`,{method:'POST',headers:h(),body:JSON.stringify({messages:[{role:'user',content:'ping'}],system:'Reply with pong only.',max_tokens:10})})
                      const d=await r.json()
                      e.target.textContent='✓ LLM OK'; e.target.style.color=C.accent; showToast('LLM responded: '+d.reply)
                    }catch(err){e.target.textContent='✗ LLM Failed'; e.target.style.color=C.red; showToast('LLM test failed','error')}
                  }} style={{ width:'100%',marginTop:14,padding:'10px',background:'rgba(124,77,255,0.1)',border:`1px solid ${C.border2}`,...mono,fontSize:12,color:C.purple,borderRadius:8,cursor:'pointer' }}>Test LLM Endpoint</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Modals ── */}
      <Modal
        show={!!delModal}
        title={delModal?.title||'Confirm'}
        body={delModal?.body||''}
        onCancel={()=>setDelModal(null)}
        onConfirm={delModal?.onConfirm}
      />
      <AddInstModal show={addInst} onClose={()=>setAddInst(false)} onSubmit={addInstitution} />
    </div>
  )
}