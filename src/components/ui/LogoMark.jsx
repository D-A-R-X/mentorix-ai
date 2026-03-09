// src/components/ui/LogoMark.jsx
// Uses custom PNG logo from src/assets/logo.png
import logoSrc from '../../assets/logo.png'

export function LogoMark({ size = 32 }) {
  return (
    <img
      src={logoSrc}
      alt="Mentorix"
      width={size}
      height={size}
      style={{ objectFit: 'contain', display: 'block' }}
    />
  )
}

export function LogoWordmark({ size = 32 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3 }}>
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
