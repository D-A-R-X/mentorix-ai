import { useState, useEffect, useRef, useCallback } from 'react'
import AdminAI from './AdminAI'
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

// ── Inline SVG Icons (Lucide paths, zero dependencies) ───────────────────────
function Ic({ n, size = 16, color = 'currentColor', style: s }) {
  const P = {
    dashboard:  <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users:      <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    mic:        <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></>,
    building:   <><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4a2 2 0 0 0-2 2v8h20v-8a2 2 0 0 0-2-2h-2"/><rect x="10" y="6" width="4" height="4"/></>,
    barchart:   <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    shield:     <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>,
    monitor:    <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
    cpu:        <><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></>,
    banstop:    <><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>,
    refresh:    <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
    arrowleft:  <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    logout:     <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    download:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    trash:      <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
    userx:      <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/></>,
    usercheck:  <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></>,
    warning:    <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    trendingup: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    activity:   <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    award:      <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    zap:        <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    database:   <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
    checkcirc:  <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xcircle:    <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    plus:       <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    search:     <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    filter:     <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    clock:      <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    star:       <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    briefcase:  <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    server:     <><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
      style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0, ...s }}>
      {P[n] || <circle cx="12" cy="12" r="10"/>}
    </svg>
  )
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
        <div style={{ fontSize:16, fontWeight:700, color:C.navy, marginBottom:8, display:'flex', alignItems:'center', gap:8 }}><Ic n='warning' size={18} color={C.red}/>{title}</div>
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
// ── Service On/Off Toggle for each institution ───────────────────────────────
function ServiceToggle({ inst, onToggle }) {
  const [on,  setOn]  = useState(inst.active !== false)
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    const newVal = !on
    setOn(newVal)
    try { await onToggle(inst.id, newVal) } catch { setOn(!newVal) }
    setBusy(false)
  }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:11, color: on ? C.green : C.muted, fontWeight:600 }}>{on ? 'ON' : 'OFF'}</span>
      <div onClick={busy ? undefined : toggle} style={{
        width:36, height:20, borderRadius:10,
        background: on ? C.green : '#CBD5E1',
        cursor: busy ? 'default' : 'pointer',
        position:'relative', transition:'background 0.2s', flexShrink:0,
        opacity: busy ? 0.6 : 1,
      }}>
        <div style={{ position:'absolute', top:2, left: on ? 18 : 2, width:16, height:16, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 0.2s' }} />
      </div>
    </div>
  )
}

function AddInstModal({ show, onClose, onSubmit }) {
  const [name,        setName]        = useState('')
  const [email,       setEmail]       = useState('')
  const [collegeCode, setCollegeCode] = useState('')
  const [env,         setEnv]         = useState('dev')
  const [active,      setActive]      = useState(true)
  const [loading,     setLoading]     = useState(false)

  const iStyle = { width:'100%', padding:'9px 12px', background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, color:C.navy, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none' }
  const lStyle = { display:'block', fontSize:11, fontWeight:600, color:C.text, marginBottom:5 }

  const submit = async () => {
    if (!name.trim()) { showToast('Institution name required','error'); return }
    setLoading(true)
    await onSubmit({ name: name.trim(), contact_email: email||null, env, college_code: collegeCode.trim()||null, active })
    setLoading(false); setName(''); setEmail(''); setCollegeCode(''); setEnv('dev'); setActive(true)
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
          <label style={lStyle}>College Code <span style={{ color:C.muted, fontWeight:400 }}>(optional — e.g. 7219 for DSCE)</span></label>
          <input value={collegeCode} onChange={e=>setCollegeCode(e.target.value)} placeholder="e.g. 7219" style={iStyle} />
          <div style={{ marginTop:5, fontSize:11, color:C.muted }}>University affiliation code — helps identify the institution uniquely</div>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={lStyle}>Contact Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="admin@college.edu" style={iStyle} />
        </div>
        <div style={{ marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:active?C.greenBg:C.surface2, border:`1px solid ${active?C.greenBorder:C.border}`, borderRadius:10 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:active?C.green:C.muted }}>Service {active ? 'Active' : 'Disabled'}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{active ? 'Students from this institution can sign up' : 'No new students from this institution'}</div>
          </div>
          <div onClick={()=>setActive(v=>!v)} style={{ width:44, height:24, borderRadius:12, background:active?C.green:'#CBD5E1', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
            <div style={{ position:'absolute', top:2, left:active?22:2, width:20, height:20, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 0.2s' }} />
          </div>
        </div>
        <div style={{ marginBottom:22 }}>
          <label style={lStyle}>Plan / Environment</label>
          <select value={env} onChange={e=>setEnv(e.target.value)} style={{ ...iStyle, cursor:'pointer' }}>
            <option value="dev">DEV — Demo / Trial (Free)</option>
            <option value="prod">PROD — Live / Paid (Enterprise)</option>
          </select>
          <div style={{ marginTop:7, fontSize:12, color:C.muted, lineHeight:1.6, padding:'8px 10px', background:env==='prod'?C.blueBg:C.amberBg, borderRadius:7, border:`1px solid ${env==='prod'?C.blueBorder:C.amberBorder}` }}>
            {env==='prod'
              ? 'PROD — Advanced paid AI models + dedicated DB. Switch when institution upgrades.'
              : 'DEV — Current free-tier stack (Groq + shared DB). Students can see and use this institution.'}
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
  const [emailDomainQ, setEmailDomainQ] = useState('')
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
        <div style={{ marginBottom:16 }}><Ic n='banstop' size={52} color={C.red}/></div>
        <div style={{ fontSize:18, fontWeight:700, color:C.navy, marginBottom:8 }}>Admin access required</div>
        <div style={{ fontSize:13, color:C.muted, marginBottom:24 }}>Signed in as {email}</div>
        <button onClick={()=>nav('/dashboard')} style={{ padding:'10px 24px', background:C.blue, border:'none', borderRadius:8, color:'#fff', cursor:'pointer', fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}><Ic n='arrowleft' size={13} color="#fff"/> Dashboard</button>
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
  const filtUsers    = users.filter(u => {
    const q = userQ.toLowerCase()
    const dq = emailDomainQ.toLowerCase().trim()
    const matchQ = !q || (u.email+u.name||'').toLowerCase().includes(q)
    const matchDomain = !dq || (u.email||'').toLowerCase().includes(dq)
    return matchQ && matchDomain
  })
  const filtSessions = sessions.filter(s => {
    const q = sessQ.toLowerCase()
    const ok  = !q || (s.user_email||s.email||s.user_name||'').toLowerCase().includes(q)
    const mok = !sessModeF || s.mode===sessModeF || (sessModeF==='voice'&&s.mode!=='hr_interview')
    return ok && mok
  })
  const filtHonor = honor.filter(h => !honorQ || (h.email+h.name||'').toLowerCase().includes(honorQ.toLowerCase()))

  // ── Sidebar nav ────────────────────────────────────────────────────────────
  const NAV = [
    { group:'Overview',    items:[{ id:'overview',     icon:'dashboard', label:'Dashboard' }] },
    { group:'Management',  items:[{ id:'users',        icon:'users', label:'Users' }, { id:'sessions', icon:'mic', label:'Sessions' }, { id:'institutions', icon:'building', label:'Institutions' }] },
    { group:'Intelligence',items:[{ id:'analytics',    icon:'barchart', label:'Analytics' }, { id:'honor', icon:'shield', label:'Honor Board' }] },
    { group:'System',      items:[{ id:'system',       icon:'monitor', label:'System' }, { id:'ml', icon:'cpu', label:'ML & LLM' }] },
    { group:'AI',          items:[{ id:'ai_command',   icon:'zap',     label:'AI Command' }] },
  ]
  const pageTitle = { overview:'Dashboard', users:'User Management', sessions:'Sessions', institutions:'Institutions', analytics:'Analytics', honor:'Honor Board', system:'System Status', ml:'ML & LLM Engine', ai_command:'AI Command' }

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
                  <Ic n={icon} size={15} color={page===id?C.blue:C.muted}/>{label}
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
              {loading ? <Spinner size={13}/> : <Ic n='refresh' size={13} color={C.muted}/>} Refresh
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
                  { label:'Total Users',    val: ov.total_users??users.length,     icon:'users', accent:C.blue,  bg:C.blueBg,  sub:`+${ov.active_7d||0} this week` },
                  { label:'Voice Sessions', val: (ov.total_sessions??sessions.length)-(ov.hr_sessions??sessions.filter(s=>s.mode==='hr_interview').length), icon:'mic', accent:C.green, bg:C.greenBg },
                  { label:'HR Sessions',    val: ov.hr_sessions??sessions.filter(s=>s.mode==='hr_interview').length, icon:'briefcase', accent:C.amber, bg:C.amberBg },
                  { label:'Active Today',   val: ov.active_today??0,               icon:'zap', accent:C.blue,  bg:C.blueBg },
                  { label:'Avg Score',      val: ov.avg_score ? ov.avg_score+'/100' : '--', icon:'trendingup', accent:C.green, bg:C.greenBg },
                  { label:'Avg Honor',      val: ov.avg_honor ?? '--',             icon:'shield', accent:C.blue,  bg:C.blueBg },
                ].map(({ label, val, icon, accent, bg, sub }) => (
                  <div key={label} style={{ ...card, position:'relative', overflow:'hidden' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
                      <div style={{ width:30, height:30, borderRadius:8, background:bg, display:'flex', alignItems:'center', justifyContent:'center' }}><Ic n={icon} size={16} color={accent}/></div>
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
                <input value={emailDomainQ} onChange={e=>setEmailDomainQ(e.target.value)} placeholder="Filter by email key (e.g. dsce)…" style={{ ...input, width:220 }} title="Filters users whose email contains this text — e.g. type 'dsce' to find surya.j22@dsce.ac.in" />
                {emailDomainQ && <button onClick={()=>setEmailDomainQ('')} style={{ ...btnSm, padding:'8px 12px', color:C.muted, borderColor:C.border }}>Clear</button>}
                <button onClick={()=>downloadCSV([['Name','Email','Institution','Dept','Sessions','Honor','Status','Joined'],...users.map(u=>[u.name,u.email,u.institution_name||'Independent',u.department,u.session_count,parseFloat(u.honor_score||0).toFixed(1),u.is_suspended?'Suspended':'Active',u.created_at])],'mentorix_users.csv')} style={{ ...btnSm, padding:'8px 14px', color:C.green, borderColor:C.greenBorder, background:C.greenBg }}>
                  
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
                    <Badge color="amber">DEV</Badge>&nbsp; Free tier — Groq + shared DB (students can sign in) &nbsp;·&nbsp; <Badge color="blue">PROD</Badge>&nbsp; Paid tier — advanced models + dedicated DB
                  </div>
                </div>
                <button onClick={()=>setAddInst(true)} style={{ padding:'9px 18px', background:C.blue, border:'none', color:'#fff', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer', flexShrink:0 }}>+ Add Institution</button>
              </div>

              {insts.length===0
                ? <div style={{ ...card, textAlign:'center', padding:48, color:C.muted, fontSize:13 }}>
                    <div style={{ marginBottom:14 }}><Ic n='building' size={44} color={C.border}/></div>
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
                              {inst.college_code && <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>Code: <strong style={{ color:C.blue }}>{inst.college_code}</strong></div>}
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
                              {isProd ? 'PROD — Paid tier: advanced AI models + dedicated DB' : 'DEV — Free tier: Groq + shared DB · students can sign in'}
                            </div>
                          </div>

                          {/* Footer */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                            <div style={{ fontSize:11, color:C.muted }}>Added {fmt(inst.created_at)}</div>
                            <ServiceToggle inst={inst} onToggle={async (id, newActive) => {
                              await fetch(`${API}/admin/institutions/${id}/service`, { method:'PATCH', headers:hdr(), body:JSON.stringify({ active: newActive }) })
                              loadAll()
                            }} />
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
                  <button onClick={()=>downloadCSV([['Rank','Name','Email','Institution','Dept','Score','Events'],...filtHonor.map((h,i)=>[i+1,h.name,h.email,h.institution_name,h.department,parseFloat(h.total_score||0).toFixed(1),h.event_count])],'mentorix_honor.csv')} style={{ ...btnSm, padding:'8px 14px', color:C.green, borderColor:C.greenBorder, background:C.greenBg }}></button>
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
                        const medalColors = ['#D97706','#9CA3AF','#B45309']
                        return (
                          <tr key={h.email} className="adm-row">
                            <td style={{ ...td, textAlign:'center', width:48 }}>{i<3 ? <Ic n='award' size={20} color={medalColors[i]}/> : <span style={{ fontSize:12, color:C.muted }}>#{i+1}</span>}</td>
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
                    { label:'Backend API (Render)',  val:'Online', latency:sysLatency, color:C.green },
                    { label:'PostgreSQL Database',   val:'Connected', color:C.green },
                    { label:'Netlify Frontend',      val:'Online', color:C.green },
                    { label:'Groq LLM (Primary)',    val:'Active', color:C.green },
                    { label:'Gemini (Fallback)',      val:'Active', color:C.green },
                    { label:'ElevenLabs TTS',         val:'Active', color:C.green },
                  ].map(({ label, val, color, latency }) => (
                    <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${C.surface2}` }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}><div style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0 }}/><span style={{ fontSize:12, fontWeight:600, color }}>{val}{latency ? ` (${latency})` : ''}</span></div>
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
                      <Ic n='checkcirc' size={13} color={C.green}/>{t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════ ML & LLM ════ */}
          {page==='ml' && (
            <MLLLMPanel sessions={sessions} api={API} hdr={hdr} showToast={showToast} C={C} card={card} />
          )}

          {/* ════ AI COMMAND ════ */}
          {page==='ai_command' && (
            <div style={{ height:'calc(100vh - 120px)', display:'flex', flexDirection:'column', animation:'adm-up 0.3s ease' }}>
              <AdminAI />
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

// ── MLLLMPanel — Live LLM stats for admin ─────────────────────────────────────
function MLLLMPanel({ sessions, api, hdr, showToast, C, card }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    fetch(`${api}/admin/llm-stats`, { headers: hdr() })
      .then(r => r.json()).then(setStats).catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [])

  const MODEL_COLORS = {
    'llama-3.1-8b-instant':    '#2563EB',
    'llama-3.3-70b-versatile': '#059669',
    'mixtral-8x7b-32768':      '#D97706',
    'gemini-1.5-flash':        '#7C3AED',
  }

  const testLLM = async () => {
    setTestResult('testing')
    try {
      const t0 = Date.now()
      const r = await fetch(`${api}/chat`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ messages:[{role:'user',content:'ping'}], system:'Reply pong only.', max_tokens:10 })
      })
      const d = await r.json()
      const ms = Date.now() - t0
      setTestResult({ ok: true, ms, reply: d.reply || 'ok' })
      showToast(`LLM OK — ${ms}ms`)
    } catch (e) {
      setTestResult({ ok: false, error: String(e) })
      showToast('LLM test failed', 'error')
    }
  }

  return (
    <div style={{ animation:'adm-up 0.3s ease' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

        {/* ML Model card */}
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:16 }}>ML Risk Model</div>
          {[
            { label:'Version',     val:'risk_model_v1' },
            { label:'Algorithm',   val:'Random Forest' },
            { label:'Predictions', val:String(sessions?.length||0) },
            { label:'Status',      val:'Active', color:C.green },
          ].map(({label,val,color})=>(
            <div key={label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid ${C.surface2}`}}>
              <span style={{fontSize:13}}>{label}</span>
              <span style={{fontSize:12,fontWeight:600,color:color||C.navy}}>{val}</span>
            </div>
          ))}
        </div>

        {/* LLM config card */}
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:16 }}>LLM Chain Config</div>
          {[
            { label:'1st (fastest)', val:'llama-3.1-8b-instant', color:MODEL_COLORS['llama-3.1-8b-instant'] },
            { label:'2nd (quality)', val:'llama-3.3-70b-versatile', color:MODEL_COLORS['llama-3.3-70b-versatile'] },
            { label:'3rd (backup)',  val:'mixtral-8x7b-32768', color:MODEL_COLORS['mixtral-8x7b-32768'] },
            { label:'4th (final)',   val:'gemini-1.5-flash', color:MODEL_COLORS['gemini-1.5-flash'] },
            { label:'TTS Primary',   val:'Browser SpeechSynthesis (instant)' },
            { label:'TTS Enhance',   val:'Bytez suno/bark → gTTS' },
            { label:'STT',           val:'Web Speech API' },
          ].map(({label,val,color})=>(
            <div key={label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:`1px solid ${C.surface2}`}}>
              <span style={{fontSize:12,color:C.muted}}>{label}</span>
              <span style={{fontSize:11,fontWeight:600,color:color||C.navy,maxWidth:200,textAlign:'right'}}>{val}</span>
            </div>
          ))}
          <button onClick={testLLM} disabled={testResult==='testing'} style={{
            width:'100%', marginTop:14, padding:'9px',
            background: testResult?.ok ? '#ECFDF5' : testResult?.ok===false ? '#FEF2F2' : C.blueBg,
            border:`1px solid ${testResult?.ok ? C.green : testResult?.ok===false ? C.red : C.border}`,
            borderRadius:8, fontSize:12,
            color: testResult?.ok ? C.green : testResult?.ok===false ? C.red : C.blue,
            cursor:'pointer', fontWeight:500
          }}>
            {testResult==='testing' ? 'Testing...' : testResult?.ok ? `✓ OK (${testResult.ms}ms)` : testResult?.ok===false ? '✗ Failed' : 'Test LLM Speed'}
          </button>
        </div>
      </div>

      {/* Live stats card */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:14,color:C.navy}}>Live LLM Activity</div>
          {loading && <span style={{fontSize:11,color:C.muted}}>Loading...</span>}
          {stats && (
            <div style={{display:'flex',gap:16}}>
              {[
                {label:'Total Calls', val:stats.calls},
                {label:'Success Rate', val:`${stats.success_rate}%`, color:stats.success_rate>95?C.green:C.amber},
                {label:'Avg Latency', val:`${stats.avg_latency_ms}ms`, color:stats.avg_latency_ms<500?C.green:stats.avg_latency_ms<1500?C.amber:C.red},
              ].map(({label,val,color})=>(
                <div key={label} style={{textAlign:'center'}}>
                  <div style={{fontSize:18,fontWeight:700,color:color||C.navy}}>{val}</div>
                  <div style={{fontSize:10,color:C.muted}}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Model usage breakdown */}
        {stats?.model_usage && Object.keys(stats.model_usage).length > 0 && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:8}}>Model Usage</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}>
              {Object.entries(stats.model_usage).map(([model,data])=>(
                <div key={model} style={{background:C.surface2,borderRadius:8,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:11,fontWeight:700,color:MODEL_COLORS[model]||C.navy,marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{model}</div>
                  <div style={{fontSize:11,color:C.text}}>{data.calls} calls · {data.success_rate}% ok · {data.avg_latency}ms avg</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent calls log */}
        {stats?.recent?.length > 0 && (
          <div>
            <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:8}}>Recent Calls</div>
            <div style={{maxHeight:240,overflowY:'auto'}}>
              {stats.recent.slice(0,15).map((e,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:`1px solid ${C.surface2}`,fontSize:11}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:e.success?C.green:C.red,flexShrink:0}}/>
                  <span style={{color:MODEL_COLORS[e.model]||C.navy,fontWeight:600,minWidth:180}}>{e.model}</span>
                  <span style={{color:e.latency_ms<500?C.green:e.latency_ms<1500?C.amber:C.red,minWidth:60}}>{e.latency_ms}ms</span>
                  <span style={{color:C.muted,minWidth:50}}>{e.tokens}tok</span>
                  <span style={{color:C.muted}}>{e.time}</span>
                  {!e.success && <span style={{color:C.red,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && (!stats || stats.calls === 0) && (
          <div style={{textAlign:'center',padding:'24px 0',color:C.muted,fontSize:13}}>No LLM calls recorded yet. Start a Voice Session or HR Mode to see activity.</div>
        )}
      </div>
    </div>
  )
}
