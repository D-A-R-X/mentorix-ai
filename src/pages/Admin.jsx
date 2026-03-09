import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const API = import.meta.env.VITE_API_URL || 'https://mentorix-ai-backend.onrender.com'

// ── Design tokens (matches main app) ─────────────────────────────────────────
const C = {
  bg:       '#F8F9FC',
  surface:  '#FFFFFF',
  surface2: '#F1F4F9',
  border:   '#E2E8F0',
  blue:     '#2563EB',
  navy:     '#0F172A',
  text:     '#334155',
  muted:    '#94A3B8',
  green:    '#059669',
  red:      '#DC2626',
  amber:    '#D97706',
  blueBg:   '#EFF6FF',
  blueBorder:'#BFDBFE',
  greenBg:  '#ECFDF5',
  greenBorder:'#A7F3D0',
  redBg:    '#FEF2F2',
  redBorder:'#FECACA',
  amberBg:  '#FFFBEB',
  amberBorder:'#FDE68A',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const mono  = { fontFamily: "'JetBrains Mono', 'Fira Mono', monospace" }
const syne  = { fontFamily: "'Inter', sans-serif" }
const fmtShort = dt => dt ? new Date(dt).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '--'
const fmt      = dt => dt ? new Date(dt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '--'
const scoreColor = s => s >= 70 ? C.green : s >= 45 ? C.amber : C.red
const scoreBg    = s => s >= 70 ? C.greenBg : s >= 45 ? C.amberBg : C.redBg

function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => '"'+(v||'').toString().replace(/"/g,'""')+'"').join(',')).join('\n')
  const a = document.createElement('a')
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
  a.download = filename; a.click()
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer
function showToast(msg, type = 'ok') {
  let t = document.getElementById('__adminToast')
  if (!t) {
    t = document.createElement('div'); t.id = '__adminToast'
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;border-radius:10px;padding:11px 16px;font-size:13px;z-index:9999;transition:all 0.25s;opacity:0;transform:translateY(6px);max-width:340px;line-height:1.5;font-family:Inter,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.1)'
    document.body.appendChild(t)
  }
  t.style.background = type === 'error' ? C.redBg    : C.greenBg
  t.style.border     = `1px solid ${type === 'error' ? C.redBorder : C.greenBorder}`
  t.style.color      = type === 'error' ? C.red      : C.green
  t.textContent = msg
  t.style.opacity = '1'; t.style.transform = 'translateY(0)'
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(6px)' }, 3200)
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 16 }) {
  return <div style={{ display:'inline-block', width:size, height:size, border:`2px solid ${C.border}`, borderTopColor:C.blue, borderRadius:'50%', animation:'adm-spin 0.7s linear infinite', flexShrink:0 }} />
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ children, color = 'blue' }) {
  const map = { blue:{ bg:C.blueBg, border:C.blueBorder, text:C.blue }, green:{ bg:C.greenBg, border:C.greenBorder, text:C.green }, red:{ bg:C.redBg, border:C.redBorder, text:C.red }, amber:{ bg:C.amberBg, border:C.amberBorder, text:C.amber }, muted:{ bg:C.surface2, border:C.border, text:C.muted } }
  const { bg, border, text } = map[color] || map.blue
  return <span style={{ ...mono, fontSize:10, padding:'2px 7px', borderRadius:4, background:bg, border:`1px solid ${border}`, color:text, letterSpacing:0.4, whiteSpace:'nowrap' }}>{children}</span>
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function Modal({ show, title, body, onCancel, onConfirm, confirmLabel = 'Delete', confirmColor = C.red }) {
  if (!show) return null
  return (
    <div onClick={onCancel} style={{ position:'fixed',inset:0,zIndex:600,background:'rgba(15,23,42,0.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:28, maxWidth:420, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.navy, marginBottom:8 }}>⚠ {title}</div>
        <div style={{ fontSize:13, color:C.text, lineHeight:1.7, marginBottom:22 }}>{body}</div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${C.border}`, color:C.muted, background:'transparent', cursor:'pointer', fontSize:13 }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${confirmColor}55`, color:confirmColor, background:`${confirmColor}10`, cursor:'pointer', fontSize:13, fontWeight:600 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Institution Modal ─────────────────────────────────────────────────────
function AddInstModal({ show, onClose, onSubmit }) {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [env,     setEnv]     = useState('dev')
  const [loading, setLoading] = useState(false)

  const iStyle = { width:'100%', padding:'9px 12px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, color:C.navy, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none' }
  const lStyle = { display:'block', fontSize:11, fontWeight:600, color:C.text, marginBottom:5 }

  const submit = async () => {
    if (!name.trim()) { showToast('Institution name required','error'); return }
    setLoading(true)
    await onSubmit({ name: name.trim(), contact_email: email||null, env })
    setLoading(false); setName(''); setEmail(''); setEnv('dev')
  }
  if (!show) return null
  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:600,background:'rgba(15,23,42,0.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:28, maxWidth:440, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.navy, marginBottom:20 }}>Add Institution</div>
        <div style={{ marginBottom:14 }}>
          <label style={lStyle}>Institution Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. DSCE, Bangalore" style={iStyle} />
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={lStyle}>Contact Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="admin@college.edu" style={iStyle} />
        </div>
        <div style={{ marginBottom:22 }}>
          <label style={lStyle}>Plan / Environment</label>
          <select value={env} onChange={e=>setEnv(e.target.value)} style={{ ...iStyle, cursor:'pointer' }}>
            <option value="dev">DEV — Demo / Trial (Free)</option>
            <option value="prod">PROD — Live / Paid (Enterprise)</option>
          </select>
          <div style={{ marginTop:7, fontSize:12, color:C.muted, lineHeight:1.6, padding:'8px 10px', background:env==='prod'?C.blueBg:C.amberBg, borderRadius:7, border:`1px solid ${env==='prod'?C.blueBorder:C.amberBorder}` }}>
            {env==='prod'
              ? '🚀 Production — institution visible on student login. Full feature access.'
              : '🔧 Demo mode — for testing/trial. Can activate to PROD when ready.'}
          </div>
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${C.border}`, color:C.muted, background:'transparent', cursor:'pointer', fontSize:13 }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ padding:'8px 20px', borderRadius:8, background:C.blue, border:'none', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity:loading?0.7:1 }}>
            {loading ? 'Creating…' : 'Create Institution'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function Admin() {
  const { user, logout } = useAuth()
  const nav   = useNavigate()
  const token = localStorage.getItem('mentorix_token') || ''

  const [page,       setPage]       = useState('overview')
  const [loading,    setLoading]    = useState(true)
  const [lastUp,     setLastUp]     = useState('')
  const [sideOpen,   setSideOpen]   = useState(true)

  // Data
  const [overview,   setOverview]   = useState(null)
  const [users,      setUsers]      = useState([])
  const [sessions,   setSessions]   = useState([])
  const [honor,      setHonor]      = useState([])
  const [insts,      setInsts]      = useState([])
  const [sysLatency, setSysLatency] = useState('--')

  // Filters
  const [userQ,      setUserQ]      = useState('')
  const [sessQ,      setSessQ]      = useState('')
  const [sessModeF,  setSessModeF]  = useState('')
  const [honorQ,     setHonorQ]     = useState('')

  // Modals
  const [delModal,   setDelModal]   = useState(null)
  const [addInst,    setAddInst]    = useState(false)

  const hdr = useCallback(() => ({ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }), [token])

  // ── Load all ───────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    const t0 = Date.now()
    try {
      const [ovR, usR, seR, hoR, inR] = await Promise.allSettled([
        fetch(`${API}/admin/overview`,     { headers: hdr() }),
        fetch(`${API}/admin/users`,        { headers: hdr() }),
        fetch(`${API}/admin/sessions`,     { headers: hdr() }),
        fetch(`${API}/admin/honor`,        { headers: hdr() }),
        fetch(`${API}/admin/institutions`, { headers: hdr() }),
      ])
      if (ovR.status==='fulfilled'&&ovR.value.ok) setOverview(await ovR.value.json())
      if (usR.status==='fulfilled'&&usR.value.ok) setUsers((await usR.value.json()).users||[])
      if (seR.status==='fulfilled'&&seR.value.ok) setSessions((await seR.value.json()).sessions||[])
      if (hoR.status==='fulfilled'&&hoR.value.ok) setHonor((await hoR.value.json()).honor||[])
      if (inR.status==='fulfilled'&&inR.value.ok) setInsts((await inR.value.json()).institutions||[])
      setSysLatency(`${Date.now()-t0}ms`)
      setLastUp(new Date().toLocaleTimeString())
    } catch {}
    setLoading(false)
  }, [hdr])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Admin guard ────────────────────────────────────────────────────────────
  const email = user?.email || localStorage.getItem('mentorix_email') || ''
  const isAdmin = email.toLowerCase()==='admin@mentorix.ai'||email.toLowerCase().startsWith('admin@')

  if (!isAdmin) return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter,sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:16 }}>🚫</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.navy, marginBottom:8 }}>Admin access required</div>
        <div style={{ fontSize:13, color:C.muted, marginBottom:24 }}>Signed in as {email}</div>
        <button onClick={()=>nav('/dashboard')} style={{ padding:'10px 24px', background:C.blue, border:'none', borderRadius:8, color:'#fff', cursor:'pointer', fontSize:14, fontWeight:600 }}>← Dashboard</button>
      </div>
    </div>
  )

  // ── Shared styles ──────────────────────────────────────────────────────────
  const card  = { background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }
  const th    = { padding:'9px 12px', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:0.5, textAlign:'left', borderBottom:`1px solid ${C.border}`, background:C.surface2 }
  const td    = { padding:'10px 12px', color:C.text, fontSize:13, borderBottom:`1px solid ${C.surface2}`, verticalAlign:'middle' }
  const input = { padding:'8px 12px', background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, color:C.navy, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none' }
  const btnSm = { ...mono, fontSize:10, padding:'4px 10px', borderRadius:6, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, cursor:'pointer' }
  const ov    = overview?.stats || {}

  // ── Actions ────────────────────────────────────────────────────────────────
  const deleteUser = email => setDelModal({
    title:'Delete User', body:`Permanently delete ${email} and all their data? This cannot be undone.`,
    onConfirm: async () => {
      await fetch(`${API}/admin/users/by-email/${encodeURIComponent(email)}`,{method:'DELETE',headers:hdr()})
      setDelModal(null); showToast('User deleted'); loadAll()
    }
  })
  const deleteSession = id => setDelModal({
    title:'Delete Session', body:'Remove this session record permanently?',
    onConfirm: async () => {
      await fetch(`${API}/admin/sessions/${id}`,{method:'DELETE',headers:hdr()})
      setDelModal(null); showToast('Session deleted'); loadAll()
    }
  })
  const deleteInst = (id, name) => setDelModal({
    title:'Remove Institution', body:`Remove "${name}"? Students remain unaffected but the institution will be removed from the login dropdown.`,
    onConfirm: async () => {
      await fetch(`${API}/admin/institutions/${id}`,{method:'DELETE',headers:hdr()})
      setDelModal(null); showToast('Institution removed'); loadAll()
    }
  })
  const toggleSuspend = async (uid, email, isSusp) => {
    await fetch(`${API}/admin/users/${uid}/suspend`,{method:'PATCH',headers:hdr(),body:JSON.stringify({suspended:!isSusp})})
    showToast(isSusp?`Access restored: ${email}`:`Suspended: ${email}`); loadAll()
  }
  const setInstEnv = async (id, env) => {
    const r = await fetch(`${API}/admin/institutions/${id}`,{method:'PATCH',headers:hdr(),body:JSON.stringify({env})})
    if (r.ok) { showToast(`Switched to ${env.toUpperCase()}`); loadAll() }
    else showToast('Failed to update','error')
  }
  const addInstitution = async data => {
    const r = await fetch(`${API}/admin/institutions`,{method:'POST',headers:hdr(),body:JSON.stringify(data)})
    if (r.ok) { showToast('Institution added'); setAddInst(false); loadAll() }
    else { const e=await r.json(); showToast(e.detail||'Failed','error') }
  }

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filtUsers    = users.filter(u => !userQ || (u.email+u.name||'').toLowerCase().includes(userQ.toLowerCase()))
  const filtSessions = sessions.filter(s => {
    const q = sessQ.toLowerCase()
    const ok  = !q || (s.user_email||s.email||s.user_name||'').toLowerCase().includes(q)
    const mok = !sessModeF || s.mode===sessModeF || (sessModeF==='voice'&&s.mode!=='hr_interview')
    return ok && mok
  })
  const filtHonor = honor.filter(h => !honorQ || (h.email+h.name||'').toLowerCase().includes(honorQ.toLowerCase()))

  // ── Sidebar nav ────────────────────────────────────────────────────────────
  const NAV = [
    { group:'Overview',    items:[{ id:'overview',     icon:'⬜', label:'Dashboard' }] },
    { group:'Management',  items:[{ id:'users',        icon:'👥', label:'Users' }, { id:'sessions', icon:'🎤', label:'Sessions' }, { id:'institutions', icon:'🏛', label:'Institutions' }] },
    { group:'Intelligence',items:[{ id:'analytics',    icon:'📊', label:'Analytics' }, { id:'honor', icon:'🛡', label:'Honor Board' }] },
    { group:'System',      items:[{ id:'system',       icon:'🖥', label:'System' }, { id:'ml', icon:'🤖', label:'ML & LLM' }] },
  ]
  const pageTitle = { overview:'Dashboard', users:'User Management', sessions:'Sessions', institutions:'Institutions', analytics:'Analytics', honor:'Honor Board', system:'System Status', ml:'ML & LLM Engine' }

  // ── EnvBadge ───────────────────────────────────────────────────────────────
  const EnvBadge = ({ env }) => (
    <Badge color={env==='prod'?'blue':'amber'}>{env==='prod'?'PROD':'DEV'}</Badge>
  )

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:'Inter,sans-serif', color:C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        @keyframes adm-spin{to{transform:rotate(360deg)}}
        @keyframes adm-up{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        .adm-row:hover td{background:${C.surface2}!important}
        .adm-nav:hover{background:${C.surface2}!important;color:${C.navy}!important}
        .adm-nav.active-nav{background:${C.blueBg}!important;color:${C.blue}!important;border-left-color:${C.blue}!important}
        input:focus,select:focus{border-color:${C.blue}!important;box-shadow:0 0 0 3px ${C.blueBg}!important}
        .adm-btn-del:hover{border-color:${C.red}!important;color:${C.red}!important;background:${C.redBg}!important}
        .adm-btn-warn:hover{border-color:${C.amber}!important;color:${C.amber}!important;background:${C.amberBg}!important}
        .adm-btn-act:hover{border-color:${C.blue}!important;color:${C.blue}!important;background:${C.blueBg}!important}
      `}</style>

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <div style={{ width:220, minWidth:220, height:'100vh', background:C.surface, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 }}>
        {/* Logo */}
        <div style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, background:C.blue, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
              <path d="M4 32 L4 10 L13 10 L20 22 L27 10 L36 10 L36 32 L30 32 L30 18 L22 30 L18 30 L10 18 L10 32 Z" fill="white"/>
              <path d="M24 10 L30 10 L36 10 L30 20 L36 32 L29 32 L24 23 L19 32 L13 32 L20 20 Z" fill="rgba(0,0,0,0.28)"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:C.navy, display:'flex', alignItems:'center', gap:6 }}>
              Mentorix
              <span style={{ fontSize:9, fontWeight:700, color:C.red, background:C.redBg, border:`1px solid ${C.redBorder}`, padding:'1px 5px', borderRadius:3 }}>ADMIN</span>
            </div>
            <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>Console</div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
          {NAV.map(({ group, items }) => (
            <div key={group} style={{ marginBottom:2 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.muted, letterSpacing:1, textTransform:'uppercase', padding:'10px 18px 4px' }}>{group}</div>
              {items.map(({ id, icon, label }) => (
                <div key={id} className={`adm-nav${page===id?' active-nav':''}`} onClick={() => setPage(id)} style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 18px', cursor:'pointer', borderLeft:`2px solid ${page===id?C.blue:'transparent'}`, color:page===id?C.blue:C.muted, fontSize:13, fontWeight:page===id?600:400, transition:'all 0.15s' }}>
                  <span style={{ fontSize:14, width:18, textAlign:'center', opacity:0.8 }}>{icon}</span>{label}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 18px', borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>A</div>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:C.navy }}>{user?.name||'Admin'}</div>
              <div style={{ fontSize:10, color:C.muted }}>{email}</div>
            </div>
          </div>
          <button onClick={() => { logout(); nav('/login') }} style={{ width:'100%', padding:'7px', background:C.redBg, border:`1px solid ${C.redBorder}`, borderRadius:7, color:C.red, fontSize:12, cursor:'pointer', fontWeight:500 }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Topbar */}
        <div style={{ padding:'12px 24px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:C.surface, flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color:C.navy }}>{pageTitle[page]||page}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:1 }}>Mentorix Admin · {email}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {lastUp && <span style={{ fontSize:11, color:C.muted }}>Updated {lastUp}</span>}
            <button onClick={loadAll} disabled={loading} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:13, cursor:'pointer', fontWeight:500 }}>
              {loading ? <Spinner size={13}/> : '↺'} Refresh
            </button>
            <button onClick={() => nav('/dashboard')} style={{ padding:'7px 14px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, fontSize:13, cursor:'pointer' }}>
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px' }}>

          {/* ════ OVERVIEW ════ */}
          {page==='overview' && (
            <div style={{ animation:'adm-up 0.3s ease' }}>
              {/* Stat cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:24 }}>
                {[
                  { label:'Total Users',    val: ov.total_users??users.length,     icon:'👥', accent:C.blue,  bg:C.blueBg,  sub:`+${ov.active_7d||0} this week` },
                  { label:'Voice Sessions', val: (ov.total_sessions??sessions.length)-(ov.hr_sessions??sessions.filter(s=>s.mode==='hr_interview').length), icon:'🎤', accent:C.green, bg:C.greenBg },
                  { label:'HR Sessions',    val: ov.hr_sessions??sessions.filter(s=>s.mode==='hr_interview').length, icon:'💼', accent:C.amber, bg:C.amberBg },
                  { label:'Active Today',   val: ov.active_today??0,               icon:'⚡', accent:C.blue,  bg:C.blueBg },
                  { label:'Avg Score',      val: ov.avg_score ? ov.avg_score+'/100' : '--', icon:'📈', accent:C.green, bg:C.greenBg },
                  { label:'Avg Honor',      val: ov.avg_honor ?? '--',             icon:'🛡', accent:C.blue,  bg:C.blueBg },
                ].map(({ label, val, icon, accent, bg, sub }) => (
                  <div key={label} style={{ ...card, position:'relative', overflow:'hidden' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
                      <div style={{ width:30, height:30, borderRadius:8, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{icon}</div>
                    </div>
                    <div style={{ fontSize:26, fontWeight:800, color:C.navy }}>{val??'--'}</div>
                    {sub && <div style={{ fontSize:11, color:accent, marginTop:4 }}>{sub}</div>}
                  </div>
                ))}
              </div>

              {/* Recent activity */}
              <div style={card}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:C.navy }}>Recent Activity</div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Latest sessions across all users</div>
                  </div>
                  {loading && <Spinner />}
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead><tr>{['Student','Mode','Score','Institution','Date'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {(overview?.recent_activity||sessions.slice(0,10)).length===0
                        ? <tr><td colSpan={5} style={{ ...td, textAlign:'center', color:C.muted, padding:28 }}>No sessions yet</td></tr>
                        : (overview?.recent_activity||sessions.slice(0,10)).map((s,i)=>(
                          <tr key={i} className="adm-row">
                            <td style={td}>
                              <div style={{ fontWeight:600, color:C.navy, fontSize:13 }}>{s.user_name||s.name||'Unknown'}</div>
                              <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>{s.user_email||s.email||''}</div>
                            </td>
                            <td style={td}><Badge color={s.mode==='hr_interview'?'amber':'blue'}>{s.mode==='hr_interview'?'HR Mode':'Voice'}</Badge></td>
                            <td style={td}>{s.overall_score ? <span style={{ fontWeight:700, color:scoreColor(s.overall_score), fontSize:13 }}>{s.overall_score}/100</span> : <span style={{ color:C.muted }}>--</span>}</td>
                            <td style={{ ...td, fontSize:12 }}>{s.institution_name||'Independent'}</td>
                            <td style={{ ...td, color:C.muted, fontSize:12 }}>{fmtShort(s.created_at||s.time)}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ════ USERS ════ */}
          {page==='users' && (
            <div style={{ animation:'adm-up 0.3s ease' }}>
              <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
                <input value={userQ} onChange={e=>setUserQ(e.target.value)} placeholder="Search by email or name…" style={{ ...input, flex:1, minWidth:180 }} />
                <button onClick={()=>downloadCSV([['Name','Email','Institution','Dept','Sessions','Honor','Status','Joined'],...users.map(u=>[u.name,u.email,u.institution_name||'Independent',u.department,u.session_count,parseFloat(u.honor_score||0).toFixed(1),u.is_suspended?'Suspended':'Active',u.created_at])],'mentorix_users.csv')} style={{ ...btnSm, padding:'8px 14px', color:C.green, borderColor:C.greenBorder, background:C.greenBg }}>
                  ↓ Export CSV
                </button>
              </div>
              <div style={card}>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead><tr>{['Name / Email','Institution / Dept','Sessions','Honor','Joined','Status','Actions'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {filtUsers.length===0
                        ? <tr><td colSpan={7} style={{ ...td, textAlign:'center', color:C.muted, padding:28 }}>{loading?'Loading…':'No users found'}</td></tr>
                        : filtUsers.map(u => {
                          const susp  = u.is_suspended||u.suspended
                          const honor = parseFloat(u.honor_score||0).toFixed(0)
                          return (
                            <tr key={u.id||u.email} className="adm-row">
                              <td style={td}>
                                <div style={{ fontWeight:600, color:C.navy, fontSize:13 }}>{u.name||'--'}</div>
                                <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>{u.email||'--'}</div>
                              </td>
                              <td style={td}>
                                <div style={{ fontSize:12 }}>{u.institution_name||'Independent'}</div>
                                <div style={{ fontSize:11, color:C.muted }}>{u.department||'--'}</div>
                              </td>
                              <td style={{ ...td, textAlign:'center', fontWeight:600 }}>{u.session_count||0}</td>
                              <td style={{ ...td, textAlign:'center' }}>
                                <span style={{ fontWeight:700, fontSize:14, color:scoreColor(parseFloat(honor)) }}>{honor}</span>
                              </td>
                              <td style={{ ...td, color:C.muted, fontSize:12 }}>{fmt(u.created_at)}</td>
                              <td style={td}><Badge color={susp?'red':'green'}>{susp?'SUSPENDED':'ACTIVE'}</Badge></td>
                              <td style={{ ...td }}>
                                <div style={{ display:'flex', gap:5 }}>
                                  <button className="adm-btn-warn" onClick={()=>toggleSuspend(u.id,u.email,susp)} style={{ ...btnSm, color:C.amber, borderColor:C.amberBorder }}>{susp?'Restore':'Suspend'}</button>
                                  <button className="adm-btn-del"  onClick={()=>deleteUser(u.email)} style={{ ...btnSm, color:C.red, borderColor:C.redBorder }}>Delete</button>
                                </div>
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

          {/* ════ SESSIONS ════ */}
          {page==='sessions' && (
            <div style={{ animation:'adm-up 0.3s ease' }}>
              <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
                <input value={sessQ} onChange={e=>setSessQ(e.target.value)} placeholder="Search by email or name…" style={{ ...input, flex:1, minWidth:180 }} />
                <select value={sessModeF} onChange={e=>setSessModeF(e.target.value)} style={{ ...input, cursor:'pointer', minWidth:140 }}>
                  <option value="">All Modes</option>
                  <option value="voice">Voice</option>
                  <option value="hr_interview">HR Mode</option>
                </select>
                <button onClick={()=>downloadCSV([['Name','Email','Institution','Dept','Mode','Exchanges','Score','Tab Warns','Date'],...sessions.map(s=>[s.user_name,s.user_email||s.email,s.institution_name,s.department,s.mode,s.exchange_count,s.overall_score,s.tab_warnings,s.created_at])],'mentorix_sessions.csv')} style={{ ...btnSm, padding:'8px 14px', color:C.green, borderColor:C.greenBorder, background:C.greenBg }}>
                  ↓ Export CSV
                </button>
              </div>
              <div style={card}>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead><tr>{['Student','Institution','Mode','Exchanges','Score','Tab Warns','Date',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {filtSessions.length===0
                        ? <tr><td colSpan={8} style={{ ...td, textAlign:'center', color:C.muted, padding:28 }}>{loading?'Loading…':'No sessions found'}</td></tr>
                        : filtSessions.map(s => (
                          <tr key={s.id} className="adm-row">
                            <td style={td}>
                              <div style={{ fontWeight:600, color:C.navy, fontSize:13 }}>{s.user_name||'Unknown'}</div>
                              <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>{s.user_email||s.email||'--'}</div>
                            </td>
                            <td style={td}>
                              <div style={{ fontSize:12 }}>{s.institution_name||'Independent'}</div>
                              <div style={{ fontSize:11, color:C.muted }}>{s.department||'--'}</div>
                            </td>
                            <td style={td}><Badge color={s.mode==='hr_interview'?'amber':'blue'}>{s.mode==='hr_interview'?'HR Mode':'Voice'}</Badge></td>
                            <td style={{ ...td, textAlign:'center', fontWeight:600 }}>{s.exchange_count||0}</td>
                            <td style={{ ...td, textAlign:'center' }}>{s.overall_score ? <span style={{ fontWeight:700, color:scoreColor(s.overall_score) }}>{s.overall_score}/100</span> : <span style={{ color:C.muted }}>--</span>}</td>
                            <td style={{ ...td, textAlign:'center' }}>{s.tab_warnings>0 ? <span style={{ fontWeight:700, color:C.red }}>{s.tab_warnings}</span> : <span style={{ color:C.green }}>0</span>}</td>
                            <td style={{ ...td, color:C.muted, fontSize:12 }}>{fmtShort(s.created_at)}</td>
                            <td style={td}><button className="adm-btn-del" onClick={()=>deleteSession(s.id)} style={{ ...btnSm, color:C.red, borderColor:C.redBorder }}>Delete</button></td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ════ INSTITUTIONS ════ */}
          {page==='institutions' && (
            <div style={{ animation:'adm-up 0.3s ease' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, gap:14, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:15, color:C.navy, marginBottom:4 }}>Deployment Management</div>
                  <div style={{ fontSize:13, color:C.muted, maxWidth:520, lineHeight:1.65 }}>
                    <Badge color="amber">DEV</Badge>&nbsp; Demo / trial access (free) &nbsp;·&nbsp; <Badge color="blue">PROD</Badge>&nbsp; Paid live deployment (Enterprise)
                  </div>
                </div>
                <button onClick={()=>setAddInst(true)} style={{ padding:'9px 18px', background:C.blue, border:'none', color:'#fff', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer', flexShrink:0 }}>+ Add Institution</button>
              </div>

              {insts.length===0
                ? <div style={{ ...card, textAlign:'center', padding:48, color:C.muted, fontSize:13 }}>
                    <div style={{ fontSize:36, marginBottom:12, opacity:0.3 }}>🏛</div>
                    No institutions yet. Add your first deployment.
                  </div>
                : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
                    {insts.map(inst => {
                      const isProd = inst.env === 'prod'
                      return (
                        <div key={inst.id} style={{ ...card, border:`1px solid ${isProd ? C.blueBorder : C.border}`, transition:'border-color 0.2s' }}>
                          {/* Header */}
                          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                            <div style={{ flex:1, minWidth:0, paddingRight:10 }}>
                              <div style={{ fontWeight:700, fontSize:14, color:C.navy, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:3 }}>{inst.name}</div>
                              <div style={{ fontSize:11, color:C.muted }}>{inst.contact_email||'No contact email'}</div>
                            </div>
                            <EnvBadge env={inst.env} />
                          </div>

                          {/* Env selector */}
                          <div style={{ marginBottom:14 }}>
                            <div style={{ fontSize:11, fontWeight:600, color:C.text, marginBottom:5 }}>Plan / Environment</div>
                            <select value={inst.env} onChange={e=>setInstEnv(inst.id,e.target.value)} style={{ width:'100%', padding:'8px 10px', background:C.surface2, border:`1px solid ${isProd?C.blueBorder:C.border}`, borderRadius:7, fontSize:12, color:C.navy, cursor:'pointer', outline:'none', transition:'all 0.2s' }}>
                              <option value="dev">DEV — Demo / Trial (Free)</option>
                              <option value="prod">PROD — Live / Paid (Enterprise)</option>
                            </select>
                            <div style={{ marginTop:6, fontSize:11, color:isProd?C.blue:C.amber, padding:'6px 10px', background:isProd?C.blueBg:C.amberBg, borderRadius:6, border:`1px solid ${isProd?C.blueBorder:C.amberBorder}` }}>
                              {isProd ? '🚀 Live — visible to students on login page' : '🔧 Demo — hidden from student login, testing only'}
                            </div>
                          </div>

                          {/* Footer */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                            <div style={{ fontSize:11, color:C.muted }}>Added {fmt(inst.created_at)}</div>
                            <button className="adm-btn-del" onClick={()=>deleteInst(inst.id,inst.name)} style={{ ...btnSm, color:C.red, borderColor:C.redBorder, fontSize:11, padding:'5px 12px' }}>Remove</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          )}

          {/* ════ ANALYTICS ════ */}
          {page==='analytics' && (
            <div style={{ animation:'adm-up 0.3s ease' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:16, marginBottom:20 }}>
                {/* Mode split */}
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:14 }}>Session Split</div>
                  {[{ label:'Voice Sessions', val:sessions.filter(s=>s.mode!=='hr_interview').length, color:C.blue, bg:C.blueBg },{ label:'HR Mock Interviews', val:sessions.filter(s=>s.mode==='hr_interview').length, color:C.amber, bg:C.amberBg }].map(({ label,val,color,bg })=>(
                    <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${C.surface2}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:color }} />
                        <span style={{ fontSize:13 }}>{label}</span>
                      </div>
                      <span style={{ fontWeight:800, color:C.navy, fontSize:15 }}>{val}</span>
                    </div>
                  ))}
                </div>

                {/* Score distribution */}
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:14 }}>Score Distribution</div>
                  {[['81–100',C.green],[' 61–80',C.blue],[' 41–60',C.amber],[' 21–40','#F97316'],[' 0–20',C.red]].map(([range,col])=>{
                    const cnt = sessions.filter(s=>{ const sc=s.overall_score||0; const [lo,hi]=range.trim().split('–').map(Number); return sc>=lo&&sc<=hi }).length
                    const pct = sessions.length ? Math.round(cnt/sessions.length*100) : 0
                    return (
                      <div key={range} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:`1px solid ${C.surface2}` }}>
                        <span style={{ fontSize:11, color:C.muted, width:50 }}>{range.trim()}</span>
                        <div style={{ flex:1, height:5, background:C.surface2, borderRadius:3, overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:3, transition:'width 0.6s' }} />
                        </div>
                        <span style={{ fontSize:12, fontWeight:600, color:col, width:28, textAlign:'right' }}>{cnt}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Top performers */}
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:14 }}>Top Performers</div>
                  {(() => {
                    const byEmail = {}
                    sessions.forEach(s=>{ const e=s.user_email||s.email; if(!e) return; if(!byEmail[e]){byEmail[e]={name:s.user_name||e,scores:[]}} if(s.overall_score) byEmail[e].scores.push(s.overall_score) })
                    return Object.entries(byEmail).filter(([,d])=>d.scores.length).map(([e,d])=>({ e,name:d.name,avg:Math.round(d.scores.reduce((a,b)=>a+b,0)/d.scores.length) })).sort((a,b)=>b.avg-a.avg).slice(0,5)
                  })().map(({ e,name,avg },i)=>(
                    <div key={e} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:`1px solid ${C.surface2}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11, color:C.muted, width:18 }}>#{i+1}</span>
                        <span style={{ fontSize:12, color:C.navy, fontWeight:500 }}>{name.split('@')[0]}</span>
                      </div>
                      <span style={{ fontWeight:700, fontSize:13, color:scoreColor(avg) }}>{avg}/100</span>
                    </div>
                  ))}
                  {sessions.length===0 && <div style={{ color:C.muted, fontSize:12 }}>No session data yet</div>}
                </div>
              </div>

              {/* Institution breakdown */}
              <div style={card}>
                <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:16 }}>Institution Activity</div>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>{['Institution','Users','Sessions','Avg Score','Plan'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {insts.length===0
                      ? <tr><td colSpan={5} style={{ ...td, textAlign:'center', color:C.muted, padding:20 }}>No institutions configured</td></tr>
                      : insts.map(inst=>{
                        const iUs = users.filter(u=>u.institution_name===inst.name||u.institution_id===inst.id)
                        const iSe = sessions.filter(s=>s.institution_name===inst.name)
                        const avgSc = iSe.filter(s=>s.overall_score).length ? Math.round(iSe.filter(s=>s.overall_score).reduce((a,s)=>a+s.overall_score,0)/iSe.filter(s=>s.overall_score).length) : 0
                        return (
                          <tr key={inst.id} className="adm-row">
                            <td style={{ ...td, fontWeight:600, color:C.navy }}>{inst.name}</td>
                            <td style={{ ...td, textAlign:'center' }}>{iUs.length}</td>
                            <td style={{ ...td, textAlign:'center' }}>{iSe.length}</td>
                            <td style={{ ...td, textAlign:'center' }}>{avgSc ? <span style={{ fontWeight:700, color:scoreColor(avgSc) }}>{avgSc}/100</span> : '--'}</td>
                            <td style={td}><EnvBadge env={inst.env} /></td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════ HONOR BOARD ════ */}
          {page==='honor' && (
            <div style={{ animation:'adm-up 0.3s ease' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:15, color:C.navy, marginBottom:4 }}>Honor Leaderboard</div>
                  <div style={{ fontSize:13, color:C.muted }}>Ranked by behavioral integrity & engagement score</div>
                </div>
                <div style={{ display:'flex', gap:10 }}>
                  <input value={honorQ} onChange={e=>setHonorQ(e.target.value)} placeholder="Search…" style={{ ...input, width:180 }} />
                  <button onClick={()=>downloadCSV([['Rank','Name','Email','Institution','Dept','Score','Events'],...filtHonor.map((h,i)=>[i+1,h.name,h.email,h.institution_name,h.department,parseFloat(h.total_score||0).toFixed(1),h.event_count])],'mentorix_honor.csv')} style={{ ...btnSm, padding:'8px 14px', color:C.green, borderColor:C.greenBorder, background:C.greenBg }}>↓ Export</button>
                </div>
              </div>
              <div style={card}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>{['Rank','Student','Institution','Dept','Honor Score','Events'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filtHonor.length===0
                      ? <tr><td colSpan={6} style={{ ...td, textAlign:'center', color:C.muted, padding:28 }}>{loading?'Loading…':'No honor data yet'}</td></tr>
                      : filtHonor.map((h,i)=>{
                        const score = parseFloat(h.total_score||100).toFixed(1)
                        const medals = ['🥇','🥈','🥉']
                        return (
                          <tr key={h.email} className="adm-row">
                            <td style={{ ...td, textAlign:'center', width:48, fontSize:18 }}>{medals[i]||<span style={{ fontSize:12, color:C.muted }}>#{i+1}</span>}</td>
                            <td style={td}>
                              <div style={{ fontWeight:600, color:C.navy, fontSize:13 }}>{h.name||'--'}</div>
                              <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>{h.email||'--'}</div>
                            </td>
                            <td style={{ ...td, fontSize:12 }}>{h.institution_name||'Independent'}</td>
                            <td style={{ ...td, fontSize:12, color:C.muted }}>{h.department||'--'}</td>
                            <td style={{ ...td, textAlign:'center' }}>
                              <span style={{ fontWeight:800, fontSize:16, color:scoreColor(parseFloat(score)) }}>{score}</span>
                            </td>
                            <td style={{ ...td, textAlign:'center', color:C.muted, fontSize:12 }}>{h.event_count||0}</td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════ SYSTEM ════ */}
          {page==='system' && (
            <div style={{ animation:'adm-up 0.3s ease' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:16 }}>Service Health</div>
                  {[
                    { label:'Backend API (Render)',  val:'● Online',   latency:sysLatency, color:C.green },
                    { label:'PostgreSQL Database',   val:'● Connected', color:C.green },
                    { label:'Netlify Frontend',      val:'● Online',    color:C.green },
                    { label:'Groq LLM (Primary)',    val:'● Active',    color:C.green },
                    { label:'Gemini (Fallback)',      val:'● Active',    color:C.green },
                    { label:'ElevenLabs TTS',         val:'● Active',    color:C.green },
                  ].map(({ label, val, color, latency }) => (
                    <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${C.surface2}` }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <span style={{ fontSize:12, fontWeight:600, color }}>{val}{latency ? ` (${latency})` : ''}</span>
                    </div>
                  ))}
                </div>
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:16 }}>Config & Stats</div>
                  {[
                    { label:'API Response',   val:sysLatency },
                    { label:'Render Region',  val:'Oregon, US' },
                    { label:'Auth',           val:'Google OAuth + JWT' },
                    { label:'STT',            val:'Web Speech API' },
                    { label:'TTS',            val:'ElevenLabs / Browser' },
                    { label:'Total Users',    val:String(ov.total_users||users.length||0) },
                    { label:'Total Sessions', val:String(ov.total_sessions||sessions.length||0) },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${C.surface2}` }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:C.navy }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={card}>
                <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:14 }}>Database Tables</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:8 }}>
                  {['users','voice_sessions','honor_events','assessments','course_completions','institutions'].map(t=>(
                    <div key={t} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 12px', fontSize:12, color:C.green, fontWeight:500, display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:8 }}>●</span>{t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════ ML & LLM ════ */}
          {page==='ml' && (
            <div style={{ animation:'adm-up 0.3s ease' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:16 }}>ML Model</div>
                  {[
                    { label:'Version',    val:'risk_model_v1' },
                    { label:'Algorithm',  val:'Random Forest' },
                    { label:'Predictions',val:String(sessions.length||0) },
                    { label:'Updated',    val:'2025-01-01' },
                    { label:'Status',     val:'Active', color:C.green },
                  ].map(({ label,val,color })=>(
                    <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${C.surface2}` }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:color||C.navy }}>{val}</span>
                    </div>
                  ))}
                  <button onClick={()=>showToast('Retraining requires a dataset upload. Contact CRONIX engineering.','error')} style={{ width:'100%', marginTop:14, padding:'9px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, color:C.text, cursor:'pointer', fontWeight:500 }}>Retrain Model</button>
                </div>
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:16 }}>LLM Engine</div>
                  {[
                    { label:'Primary LLM',   val:'Groq · llama-3.1-8b' },
                    { label:'Fallback LLM',  val:'Gemini 2.0 Flash' },
                    { label:'STT',           val:'Web Speech API' },
                    { label:'TTS',           val:'ElevenLabs Rachel' },
                    { label:'TTS Fallback',  val:'Browser SpeechSynthesis' },
                    { label:'Aria Persona',  val:'Active (Voice + Chat)' },
                  ].map(({ label,val })=>(
                    <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${C.surface2}` }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:C.navy }}>{val}</span>
                    </div>
                  ))}
                  <button onClick={async e=>{
                    e.target.textContent='Testing…'; e.target.disabled=true
                    try {
                      const r=await fetch(`${API}/chat`,{method:'POST',headers:hdr(),body:JSON.stringify({messages:[{role:'user',content:'ping'}],system:'Reply with pong only.',max_tokens:10})})
                      const d=await r.json()
                      e.target.textContent='✓ LLM OK'; e.target.style.color=C.green
                      showToast('LLM responded: '+(d.reply||'ok'))
                    } catch {
                      e.target.textContent='✗ Failed'; e.target.style.color=C.red
                      showToast('LLM test failed','error')
                    }
                    e.target.disabled=false
                  }} style={{ width:'100%', marginTop:14, padding:'9px', background:C.blueBg, border:`1px solid ${C.blueBorder}`, borderRadius:8, fontSize:12, color:C.blue, cursor:'pointer', fontWeight:500 }}>Test LLM Endpoint</button>
                </div>
              </div>
            </div>
          )}

        </div>{/* /content */}
      </div>{/* /main */}

      {/* Modals */}
      <Modal show={!!delModal} title={delModal?.title||''} body={delModal?.body||''} onCancel={()=>setDelModal(null)} onConfirm={delModal?.onConfirm} />
      <AddInstModal show={addInst} onClose={()=>setAddInst(false)} onSubmit={addInstitution} />
    </div>
  )
}