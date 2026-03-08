import { useState, useEffect, useRef, createContext, useContext } from 'react'

// ── Design tokens ─────────────────────────────────────────────────────────────
// bg:       #F8F9FC  (page background)
// surface:  #FFFFFF  (card / panel)
// surface2: #F1F4F9  (input / inner)
// border:   #E2E8F0  (default border)
// blue:     #2563EB  (primary action)
// blueDim:  #1D4ED8  (hover)
// navy:     #0F172A  (headings)
// text:     #334155  (body)
// muted:    #94A3B8  (captions, labels)
// green:    #059669  (success / teal replacement)
// red:      #DC2626  (danger)
// amber:    #D97706  (warning)

// ── Ambient Background (subtle light gradient) ────────────────────────────────
export function AmbientBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: '-15%', right: '-10%',
        width: '50vw', height: '50vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)',
        filter: 'blur(60px)',
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-10%',
        width: '45vw', height: '45vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(5,150,105,0.04) 0%, transparent 70%)',
        filter: 'blur(60px)',
      }} />
    </div>
  )
}

// ── Logo Mark ─────────────────────────────────────────────────────────────────
export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#2563EB"/>
      <path d="M8 22L16 10L24 22" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 18L21 18" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="16" cy="10" r="2" fill="#fff"/>
    </svg>
  )
}

// ── Score Ring ────────────────────────────────────────────────────────────────
export function ScoreRing({ score = 0, max = 100, size = 120, label = 'Score' }) {
  const r    = (size - 16) / 2
  const circ = 2 * Math.PI * r
  const pct  = Math.min(score / max, 1)
  const dash = pct * circ
  const color = pct >= 0.7 ? '#059669' : pct >= 0.4 ? '#2563EB' : '#DC2626'
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E2E8F0" strokeWidth="8"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: size * 0.22, color: '#0F172A', fontWeight: 700 }}>{score}</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: size * 0.1, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="#E2E8F0" strokeWidth="3"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  )
}

export function FullPageSpinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F9FC' }}>
      <AmbientBg />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <LogoMark size={48} />
        <Spinner size={32} />
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const toast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }
  const colors = { info: '#2563EB', success: '#059669', error: '#DC2626', warn: '#D97706' }
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '12px 20px', borderRadius: 10,
            background: '#fff', border: `1px solid ${colors[t.type]}33`,
            borderLeft: `3px solid ${colors[t.type]}`,
            color: '#0F172A', fontFamily: 'Inter, sans-serif', fontSize: 14,
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            animation: 'slideIn 0.25s ease', maxWidth: 320,
          }}>{t.msg}</div>
        ))}
        <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }`}</style>
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, maxWidth = 480 }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth, background: '#fff',
        border: '1px solid #E2E8F0', borderRadius: 16,
        padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        animation: 'modalIn 0.2s ease',
      }} onClick={e => e.stopPropagation()}>
        <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.97); } to { opacity:1; transform:scale(1); } }`}</style>
        {title && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 600, color: '#0F172A', margin: 0 }}>{title}</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── Icon ──────────────────────────────────────────────────────────────────────
export function Icon({ name, size = 20, color = 'currentColor' }) {
  const hex = color.startsWith('#') ? color.slice(1) : color === 'currentColor' ? '334155' : color.replace('#','')
  return (
    <img
      src={`https://api.iconify.design/lucide/${name}.svg?color=%23${hex}`}
      width={size} height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      alt=""
    />
  )
}

// ── Btn ───────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, loading, style: sx, type = 'button', fullWidth }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'Inter, sans-serif', fontWeight: 500, cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.5 : 1, border: 'none', borderRadius: 8,
    transition: 'all 0.15s', textDecoration: 'none',
    width: fullWidth ? '100%' : undefined,
    fontSize: size === 'sm' ? 13 : size === 'lg' ? 15 : 14,
    padding: size === 'sm' ? '7px 14px' : size === 'lg' ? '13px 26px' : '10px 20px',
    letterSpacing: '-0.01em',
  }
  const variants = {
    primary:   { background: '#2563EB', color: '#fff', boxShadow: '0 1px 3px rgba(37,99,235,0.3)' },
    secondary: { background: '#F1F4F9', color: '#334155', border: '1px solid #E2E8F0' },
    ghost:     { background: 'transparent', color: '#64748B', border: '1px solid #E2E8F0' },
    danger:    { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' },
    teal:      { background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      style={{ ...base, ...variants[variant], ...sx }}>
      {loading ? <Spinner size={15} /> : children}
    </button>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, error, icon, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#334155', fontWeight: 500 }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {icon && <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><Icon name={icon} size={15} color="#94A3B8"/></div>}
        <input {...props} style={{
          width: '100%', boxSizing: 'border-box',
          padding: icon ? '10px 12px 10px 38px' : '10px 12px',
          background: '#F8F9FC', border: `1px solid ${error ? '#FECACA' : '#E2E8F0'}`,
          borderRadius: 8, color: '#0F172A', fontSize: 14,
          fontFamily: 'Inter, sans-serif', outline: 'none',
          transition: 'border-color 0.15s',
          ...props.style,
        }} />
      </div>
      {error && <span style={{ fontSize: 12, color: '#DC2626' }}>{error}</span>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ label, options = [], ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#334155', fontWeight: 500 }}>{label}</label>}
      <select {...props} style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px',
        background: '#F8F9FC', border: '1px solid #E2E8F0',
        borderRadius: 8, color: props.value ? '#0F172A' : '#94A3B8',
        fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none',
        cursor: 'pointer', appearance: 'none',
        ...props.style,
      }}>
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o} style={{ background: '#fff' }}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style: sx, onClick, hover }) {
  return (
    <div onClick={onClick} style={{
      background: '#FFFFFF', border: '1px solid #E2E8F0',
      borderRadius: 12, padding: 24, cursor: onClick ? 'pointer' : undefined,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      transition: hover ? 'all 0.2s' : undefined,
      ...sx,
    }}>
      {children}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ children, color = 'blue' }) {
  const colors = {
    blue:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
    violet: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
    teal:   { bg: '#ECFDF5', border: '#A7F3D0', text: '#059669' },
    rose:   { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
    muted:  { bg: '#F8FAFC', border: '#E2E8F0', text: '#64748B' },
    amber:  { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  }
  const c = colors[color] || colors.blue
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 100,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
    }}>{children}</span>
  )
}
