// src/components/ui/LogoMark.jsx
export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Blue rounded square */}
      <rect width="40" height="40" rx="9" fill="#2563EB" />
      {/* Bold geometric M — thick even strokes, proper letterform */}
      <path
        d="M6 31 L6 10 L13.5 10 L20 21.5 L26.5 10 L34 10 L34 31 L29 31 L29 17.5 L22 28.5 L18 28.5 L11 17.5 L11 31 Z"
        fill="white"
      />
    </svg>
  )
}

export function LogoWordmark({ size = 32 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap: size * 0.3 }}>
      <LogoMark size={size} />
      <span style={{
        fontFamily: 'Inter, sans-serif',
        fontWeight: 800,
        fontSize: size * 0.56,
        letterSpacing: '-0.03em',
        color: '#0F172A',
        lineHeight: 1,
        userSelect: 'none',
      }}>
        Mentorix
      </span>
    </div>
  )
}

export default LogoMark
