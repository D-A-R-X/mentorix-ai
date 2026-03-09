// src/components/ui/LogoMark.jsx
// Drop-in replacement — works at any size, renders cleanly at 24px–128px

export function LogoMark({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Blue rounded square background */}
      <rect width="40" height="40" rx="10" fill="#2563EB" />

      {/* Clean white M letterform — geometric, even strokes */}
      <path
        d="M7 30 L7 11 L14 11 L20 21 L26 11 L33 11 L33 30 L28.5 30 L28.5 18.5 L21.5 29 L18.5 29 L11.5 18.5 L11.5 30 Z"
        fill="white"
      />

      {/* Small accent dot — top right, represents AI/neural node */}
      <circle cx="32" cy="8" r="3" fill="#60A5FA" />
    </svg>
  )
}

// ── Wordmark: logo + "Mentorix" text ─────────────────────────────────────────
export function LogoWordmark({ size = 32 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap: size * 0.28 }}>
      <LogoMark size={size} />
      <span style={{
        fontFamily: 'Inter, sans-serif',
        fontWeight: 800,
        fontSize:   size * 0.55,
        letterSpacing: '-0.02em',
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