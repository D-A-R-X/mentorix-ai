import { useState, useEffect, useRef, createContext, useContext } from 'react'

// ── Ambient Background ────────────────────────────────────────────────────────
export function AmbientBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%',
        width: '55vw', height: '55vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,77,255,0.13) 0%, transparent 70%)',
        filter: 'blur(40px)',
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%',
        width: '50vw', height: '50vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,229,180,0.09) 0%, transparent 70%)',
        filter: 'blur(40px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.022'/%3E%3C/svg%3E")`,
        opacity: 0.4,
      }} />
    </div>
  )
}

// ── Logo Mark ─────────────────────────────────────────────────────────────────
export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="rgba(124,77,255,0.15)" />
      <path d="M8 22L16 10L24 22" stroke="#7c4dff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 18L21 18" stroke="#00e5b4" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="16" cy="10" r="2" fill="#7c4dff"/>
    </svg>
  )
}

// ── Score Ring ────────────────────────────────────────────────────────────────
export function ScoreRing({ score = 0, max = 100, size = 120, label = 'Score' }) {
  const r = (size - 16) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(score / max, 1)
  const dash = pct * circ
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#7c4dff" strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}/>
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: size * 0.22, color: '#f4f0ff', fontWeight: 600 }}>{score}</span>
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: size * 0.1, color: '#6e6888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="rgba(124,77,255,0.2)" strokeWidth="3"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#7c4dff" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  )
}

export function FullPageSpinner() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#06050e',
    }}>
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
  const colors = { info: '#7c4dff', success: '#00e5b4', error: '#ff4d6d', warn: '#f5a623' }
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '12px 20px', borderRadius: 10,
            background: '#161328', border: `1px solid ${colors[t.type]}44`,
            borderLeft: `3px solid ${colors[t.type]}`,
            color: '#f4f0ff', fontFamily: 'DM Sans, sans-serif', fontSize: 14,
            boxShadow: `0 4px 24px ${colors[t.type]}22`,
            animation: 'slideIn 0.25s ease',
            maxWidth: 320,
          }}>
            {t.msg}
          </div>
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
      background: 'rgba(6,5,14,0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth, background: '#0e0c1a',
        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16,
        padding: 32, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        animation: 'modalIn 0.2s ease',
      }} onClick={e => e.stopPropagation()}>
        <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }`}</style>
        {title && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 20, color: '#f4f0ff', margin: 0 }}>{title}</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e6888', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── Icon ──────────────────────────────────────────────────────────────────────
export function Icon({ name, size = 20, color = 'currentColor' }) {
  const hex = color.startsWith('#') ? color.slice(1) : color === 'currentColor' ? 'c0bbd8' : color.replace('#','')
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
    fontFamily: 'DM Sans, sans-serif', fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.5 : 1, border: 'none', borderRadius: 10,
    transition: 'all 0.15s', textDecoration: 'none',
    width: fullWidth ? '100%' : undefined,
    fontSize: size === 'sm' ? 13 : size === 'lg' ? 16 : 14,
    padding: size === 'sm' ? '8px 16px' : size === 'lg' ? '14px 28px' : '11px 22px',
  }
  const variants = {
    primary: { background: '#7c4dff', color: '#fff', boxShadow: '0 2px 16px rgba(124,77,255,0.25)' },
    secondary: { background: 'rgba(124,77,255,0.1)', color: '#c0bbd8', border: '1px solid rgba(124,77,255,0.22)' },
    ghost: { background: 'transparent', color: '#6e6888', border: '1px solid rgba(255,255,255,0.07)' },
    danger: { background: 'rgba(255,77,109,0.12)', color: '#ff4d6d', border: '1px solid rgba(255,77,109,0.2)' },
    teal: { background: 'rgba(0,229,180,0.1)', color: '#00e5b4', border: '1px solid rgba(0,229,180,0.2)' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      style={{ ...base, ...variants[variant], ...sx }}>
      {loading ? <Spinner size={16} /> : children}
    </button>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, error, icon, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#6e6888', fontWeight: 500 }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {icon && <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><Icon name={icon} size={16} color="#6e6888"/></div>}
        <input {...props} style={{
          width: '100%', boxSizing: 'border-box',
          padding: icon ? '12px 14px 12px 40px' : '12px 14px',
          background: '#161328', border: `1px solid ${error ? 'rgba(255,77,109,0.4)' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 10, color: '#f4f0ff', fontSize: 14,
          fontFamily: 'DM Sans, sans-serif', outline: 'none',
          transition: 'border-color 0.15s',
          ...props.style,
        }} />
      </div>
      {error && <span style={{ fontSize: 12, color: '#ff4d6d' }}>{error}</span>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ label, options = [], ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#6e6888', fontWeight: 500 }}>{label}</label>}
      <select {...props} style={{
        width: '100%', boxSizing: 'border-box', padding: '12px 14px',
        background: '#161328', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, color: props.value ? '#f4f0ff' : '#6e6888',
        fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none',
        cursor: 'pointer', appearance: 'none',
        ...props.style,
      }}>
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o} style={{ background: '#161328' }}>
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
      background: '#0e0c1a', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, padding: 24, cursor: onClick ? 'pointer' : undefined,
      transition: hover ? 'all 0.2s' : undefined,
      ...sx,
    }}>
      {children}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ children, color = 'violet' }) {
  const colors = {
    violet: { bg: 'rgba(124,77,255,0.12)', border: 'rgba(124,77,255,0.22)', text: '#a87fff' },
    teal: { bg: 'rgba(0,229,180,0.1)', border: 'rgba(0,229,180,0.2)', text: '#00e5b4' },
    rose: { bg: 'rgba(255,77,109,0.1)', border: 'rgba(255,77,109,0.2)', text: '#ff4d6d' },
    muted: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.07)', text: '#6e6888' },
  }
  const c = colors[color] || colors.violet
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 100,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
    }}>{children}</span>
  )
}
