import { useNavigate } from 'react-router-dom'
import { AmbientBg, LogoMark, Icon, Btn } from '../components/ui/index.jsx'

const features = [
  { icon: 'mic', label: 'Voice Mentoring', desc: 'Speak naturally with AI mentors trained on your department curriculum' },
  { icon: 'shield', label: 'Honor System', desc: 'Build integrity with a transparent honor score visible to institutions' },
  { icon: 'bar-chart-2', label: 'Progress Tracking', desc: 'Real-time dashboards, course completions, and performance analytics' },
  { icon: 'cpu', label: 'Smart Assessments', desc: 'Risk-level evaluations that adapt to your academic standing' },
  { icon: 'briefcase', label: 'HR Readiness Mode', desc: 'Camera-monitored mock interviews with posture and confidence scoring' },
  { icon: 'users', label: 'Institution Insights', desc: 'Admins get cohort-wide analytics, leaderboards, and audit logs' },
]

const stats = [
  { val: '10+', label: 'Departments' },
  { val: '98%', label: 'Session Accuracy' },
  { val: '8-Q', label: 'Voice Flow' },
  { val: 'AI', label: 'Powered' },
]

export default function Landing() {
  const nav = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: '#06050e', color: '#c0bbd8', fontFamily: 'DM Sans, sans-serif' }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .feat-card:hover { border-color: rgba(124,77,255,0.22) !important; transform: translateY(-2px); }
        .nav-link:hover { color: #f4f0ff; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        .hero-text { animation: fadeUp 0.7s ease both; }
        .hero-sub { animation: fadeUp 0.7s 0.15s ease both; }
        .hero-cta { animation: fadeUp 0.7s 0.3s ease both; }
        .hero-stats { animation: fadeUp 0.7s 0.45s ease both; }
        @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
        .float { animation: float 4s ease-in-out infinite; }
      `}</style>

      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '0 clamp(24px,6vw,80px)',
        height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(6,5,14,0.8)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={28} />
          <span style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, fontSize: 18, color: '#f4f0ff' }}>
            Mentorix<span style={{ color: '#7c4dff' }}>.</span>AI
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {['Features', 'About'].map(l => (
            <a key={l} href="#" className="nav-link" style={{ fontSize: 14, color: '#6e6888', textDecoration: 'none', transition: 'color 0.15s' }}>{l}</a>
          ))}
          <Btn onClick={() => nav('/login')} size="sm">Sign In</Btn>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(80px,12vw,120px) clamp(24px,6vw,80px) 60px',
        textAlign: 'center',
      }}>
        <div className="hero-text" style={{ marginBottom: 20 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24,
            padding: '6px 16px', borderRadius: 100,
            background: 'rgba(124,77,255,0.1)', border: '1px solid rgba(124,77,255,0.22)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e5b4', boxShadow: '0 0 8px #00e5b4' }} />
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#a87fff', letterSpacing: '0.06em' }}>AI-POWERED STUDENT MENTORING</span>
          </div>
          <h1 style={{
            fontFamily: 'Bricolage Grotesque, sans-serif',
            fontSize: 'clamp(40px,7vw,84px)',
            fontWeight: 800, lineHeight: 1.05,
            color: '#f4f0ff', margin: 0, letterSpacing: '-0.02em',
          }}>
            Your Academic<br />
            <span style={{
              background: 'linear-gradient(135deg, #7c4dff 0%, #00e5b4 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>Mentor Awaits.</span>
          </h1>
        </div>

        <p className="hero-sub" style={{
          maxWidth: 540, fontSize: 'clamp(15px,2vw,18px)', lineHeight: 1.7,
          color: '#6e6888', margin: '0 0 40px',
        }}>
          Voice-first AI mentoring that adapts to your department, tracks your honor score,
          and prepares you for the real world — one session at a time.
        </p>

        <div className="hero-cta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Btn onClick={() => nav('/login')} size="lg" style={{ background: 'linear-gradient(135deg, #7c4dff, #5530cc)', boxShadow: '0 4px 32px rgba(124,77,255,0.35)' }}>
            <Icon name="zap" size={16} color="#fff" /> Get Started Free
          </Btn>
          <Btn onClick={() => nav('/login')} variant="secondary" size="lg">
            <Icon name="play-circle" size={16} color="#c0bbd8" /> Watch Demo
          </Btn>
        </div>

        {/* Stats */}
        <div className="hero-stats" style={{
          display: 'flex', gap: 40, marginTop: 64, flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {stats.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 28, fontWeight: 800, color: '#f4f0ff' }}>{s.val}</div>
              <div style={{ fontSize: 12, color: '#6e6888', fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', opacity: 0.4 }} className="float">
          <Icon name="chevrons-down" size={20} color="#6e6888" />
        </div>
      </section>

      {/* Features */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(60px,8vw,100px) clamp(24px,6vw,80px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, color: '#f4f0ff', margin: '0 0 16px' }}>
            Everything you need to excel
          </h2>
          <p style={{ color: '#6e6888', fontSize: 16, maxWidth: 480, margin: '0 auto' }}>
            Built for students who are serious about their academic and professional future.
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16,
          maxWidth: 1100, margin: '0 auto',
        }}>
          {features.map(f => (
            <div key={f.icon} className="feat-card" style={{
              padding: 28, borderRadius: 16,
              background: '#0e0c1a', border: '1px solid rgba(255,255,255,0.07)',
              transition: 'all 0.2s',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, marginBottom: 20,
                background: 'rgba(124,77,255,0.1)', border: '1px solid rgba(124,77,255,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={f.icon} size={20} color="#7c4dff" />
              </div>
              <h3 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 16, fontWeight: 600, color: '#f4f0ff', margin: '0 0 8px' }}>{f.label}</h3>
              <p style={{ margin: 0, fontSize: 14, color: '#6e6888', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Banner */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(40px,6vw,80px) clamp(24px,6vw,80px)' }}>
        <div style={{
          maxWidth: 800, margin: '0 auto', padding: 'clamp(40px,6vw,64px)',
          borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(124,77,255,0.12) 0%, rgba(0,229,180,0.06) 100%)',
          border: '1px solid rgba(124,77,255,0.22)',
          textAlign: 'center',
        }}>
          <h2 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 'clamp(24px,4vw,40px)', fontWeight: 700, color: '#f4f0ff', margin: '0 0 16px' }}>
            Start your mentoring journey
          </h2>
          <p style={{ color: '#6e6888', fontSize: 16, margin: '0 0 32px' }}>Join students already leveling up with AI-powered mentoring.</p>
          <Btn onClick={() => nav('/login')} size="lg" style={{ background: 'linear-gradient(135deg, #7c4dff, #5530cc)', boxShadow: '0 4px 32px rgba(124,77,255,0.35)' }}>
            <Icon name="arrow-right" size={16} color="#fff" /> Create Free Account
          </Btn>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        position: 'relative', zIndex: 1,
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '24px clamp(24px,6vw,80px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={20} />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#2e2a42' }}>Mentorix AI — 2025</span>
        </div>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#2e2a42' }}>Built for academic excellence</span>
      </footer>
    </div>
  )
}
