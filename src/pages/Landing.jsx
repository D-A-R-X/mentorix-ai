import { useNavigate } from 'react-router-dom'
import { AmbientBg, LogoMark, Icon, Btn } from '../components/ui/index.jsx'

const FEATURES = [
  { icon: 'mic',          title: 'Voice Mentoring',     desc: 'AI-powered voice sessions tailored to your department and goals.' },
  { icon: 'shield-check', title: 'Honor System',        desc: 'Transparent integrity tracking visible to your institution.' },
  { icon: 'bar-chart-2',  title: 'Risk Assessment',     desc: 'Real-time academic risk analysis with AI-generated insights.' },
  { icon: 'briefcase',    title: 'HR Interview Prep',   desc: 'Simulated mock interviews with posture and confidence scoring.' },
  { icon: 'book-open',    title: 'Course Tracking',     desc: 'Track your learning progress with personalised recommendations.' },
  { icon: 'zap',          title: 'Instant Feedback',    desc: 'Get detailed performance breakdowns after every session.' },
]

const STATS = [
  { val: '10+', label: 'Departments' },
  { val: '98%', label: 'Accuracy' },
  { val: '8Q',  label: 'Flow Model' },
  { val: 'AI',  label: 'Powered' },
]

export default function Landing() {
  const nav = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', fontFamily: 'Inter, sans-serif' }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .feat:hover { border-color: #BFDBFE !important; box-shadow: 0 4px 20px rgba(37,99,235,0.06) !important; }
        a { text-decoration: none; }
      `}</style>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50, padding: '0 clamp(24px,5vw,64px)',
        height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(248,249,252,0.9)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #E2E8F0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={28} />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Mentorix<span style={{ color: '#2563EB' }}>.</span>AI
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" size="sm" onClick={() => nav('/login')}>Sign In</Btn>
          <Btn size="sm" onClick={() => nav('/login')}>Get Started</Btn>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(64px,10vw,120px) clamp(24px,5vw,64px)', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24,
          padding: '5px 14px', borderRadius: 100,
          background: '#EFF6FF', border: '1px solid #BFDBFE',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669', boxShadow: '0 0 6px #059669' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: '#1D4ED8', letterSpacing: '0.04em' }}>AI-POWERED STUDENT MENTORING</span>
        </div>

        <h1 style={{
          fontSize: 'clamp(36px,6vw,72px)', fontWeight: 700, color: '#0F172A',
          lineHeight: 1.1, letterSpacing: '-0.03em', maxWidth: 800, margin: '0 auto 20px',
        }}>
          Your academic career,<br />
          <span style={{ color: '#2563EB' }}>intelligently guided</span>
        </h1>

        <p style={{
          fontSize: 18, color: '#64748B', maxWidth: 520, margin: '0 auto 40px',
          lineHeight: 1.7, fontWeight: 400,
        }}>
          Voice mentoring, honor tracking, and AI-powered assessments — built for engineering students who want to get placed.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn size="lg" onClick={() => nav('/login')}>
            <Icon name="arrow-right" size={16} color="#fff" /> Start Free
          </Btn>
          <Btn variant="secondary" size="lg" onClick={() => nav('/login')}>
            <Icon name="log-in" size={16} color="#334155" /> Sign In
          </Btn>
        </div>

        {/* Stats */}
        <div style={{
          display: 'flex', gap: 0, justifyContent: 'center', marginTop: 64,
          border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden',
          background: '#fff', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          {STATS.map((s, i) => (
            <div key={s.label} style={{
              flex: 1, padding: '20px 16px', textAlign: 'center',
              borderRight: i < STATS.length - 1 ? '1px solid #E2E8F0' : 'none',
            }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#2563EB', letterSpacing: '-0.02em' }}>{s.val}</div>
              <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '0 clamp(24px,5vw,64px) 96px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: 10 }}>
            Everything you need to excel
          </h2>
          <p style={{ color: '#64748B', fontSize: 16 }}>Designed around how engineering students actually learn and grow.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
          {FEATURES.map(f => (
            <div key={f.title} className="feat" style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '24px', transition: 'all 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon name={f.icon} size={20} color="#2563EB" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section style={{ padding: '0 clamp(24px,5vw,64px) 96px', position: 'relative', zIndex: 1 }}>
        <div style={{
          background: '#2563EB', borderRadius: 16, padding: 'clamp(40px,6vw,64px)',
          textAlign: 'center', maxWidth: 700, margin: '0 auto',
          boxShadow: '0 8px 40px rgba(37,99,235,0.2)',
        }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: 12 }}>
            Ready to get started?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 16, marginBottom: 28 }}>
            Join thousands of students already using Mentorix AI.
          </p>
          <Btn size="lg" onClick={() => nav('/login')} style={{ background: '#fff', color: '#2563EB' }}>
            <Icon name="arrow-right" size={16} color="#2563EB" /> Get Started Free
          </Btn>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid #E2E8F0', fontSize: 13, color: '#94A3B8' }}>
        Mentorix AI — Powered by Cronix &copy; 2025
      </footer>
    </div>
  )
}
