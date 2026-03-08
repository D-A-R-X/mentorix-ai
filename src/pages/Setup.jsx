import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoMark, Icon, Btn, Spinner } from '../components/ui/index.jsx'
import { setupApi } from '../lib/api'

export default function Setup() {
  const nav = useNavigate()
  const [form,    setForm]    = useState({ secret: '', name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [done,    setDone]    = useState(false)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }

  const submit = async () => {
    if (!form.secret || !form.email || !form.password || !form.name) { setError('All fields required'); return }
    setLoading(true)
    try {
      await setupApi.create(form.secret, form.email, form.password, form.name)
      setDone(true)
    } catch (e) { setError(e.message || 'Setup failed') }
    finally { setLoading(false) }
  }

  const iStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8F9FC', color: '#0F172A', fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }
  const lStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 5 }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <style>{`input:focus { border-color: #93C5FD !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.08) !important; outline: none !important; }`}</style>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36 }}>
          <LogoMark size={28} />
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', letterSpacing: '-0.02em' }}>Mentorix<span style={{ color: '#2563EB' }}>.</span>AI</span>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 36, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#ECFDF5', border: '1px solid #A7F3D0', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check-circle" size={30} color="#059669" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Admin Created</h2>
              <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>Your admin account has been set up successfully.</p>
              <Btn onClick={() => nav('/login')} fullWidth><Icon name="log-in" size={14} color="#fff" /> Sign In</Btn>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: 4 }}>Admin Setup</h2>
              <p style={{ fontSize: 14, color: '#64748B', marginBottom: 28 }}>Create the initial administrator account.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label style={lStyle}>Setup Secret Key</label><input type="password" value={form.secret} onChange={e => set('secret', e.target.value)} placeholder="Secret key from server" style={iStyle} /></div>
                <div><label style={lStyle}>Admin Name</label><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Administrator" style={iStyle} /></div>
                <div><label style={lStyle}>Email Address</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="admin@mentorix.ai" style={iStyle} /></div>
                <div><label style={lStyle}>Password</label><input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 8 characters" style={iStyle} /></div>
              </div>
              {error && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 13, color: '#DC2626' }}>{error}</div>}
              <button onClick={submit} disabled={loading} style={{
                width: '100%', marginTop: 20, padding: '11px', borderRadius: 8, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer', background: '#2563EB', color: '#fff',
                fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: loading ? 0.7 : 1,
              }}>
                {loading ? <><Spinner size={15} /> Creating…</> : 'Create Admin Account'}
              </button>
            </>
          )}
        </div>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button onClick={() => nav('/login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 13, fontFamily: 'Inter, sans-serif' }}>← Back to Login</button>
        </div>
      </div>
    </div>
  )
}
