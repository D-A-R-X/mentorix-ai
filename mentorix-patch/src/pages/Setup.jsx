import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AmbientBg, LogoMark, Btn, Icon, Input, useToast } from '../components/ui/index.jsx'
import { setupApi } from '../lib/api'

export default function Setup() {
  const nav = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ secret:'', email:'', password:'', name:'' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k, v) => setForm(f => ({...f, [k]:v}))

  const submit = async () => {
    if (!form.secret || !form.email || !form.password || !form.name) {
      toast('All fields required', 'warn'); return
    }
    setLoading(true)
    try {
      await setupApi.create(form.secret, form.email, form.password, form.name)
      setDone(true)
      toast('Admin account created successfully', 'success')
    } catch (e) {
      toast(e.message || 'Setup failed. Check your secret key.', 'error')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#06050e', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing:border-box; }
        input:focus { border-color:rgba(124,77,255,0.5)!important; outline:none; }
      `}</style>

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:440 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:36 }}>
          <LogoMark size={30} />
          <span style={{ fontFamily:'Bricolage Grotesque, sans-serif', fontWeight:700, fontSize:18, color:'#f4f0ff' }}>Mentorix<span style={{ color:'#7c4dff' }}>.</span>AI Setup</span>
        </div>

        <div style={{ background:'#0e0c1a', border:'1px solid rgba(255,255,255,0.07)', borderRadius:20, padding:'clamp(28px,6vw,40px)' }}>

          {done ? (
            <div style={{ textAlign:'center' }}>
              <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(0,229,180,0.1)', border:'1px solid rgba(0,229,180,0.3)', margin:'0 auto 20px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="check-circle" size={32} color="#00e5b4" />
              </div>
              <h2 style={{ fontFamily:'Bricolage Grotesque, sans-serif', fontSize:22, fontWeight:700, color:'#f4f0ff', margin:'0 0 8px' }}>Admin Created</h2>
              <p style={{ color:'#6e6888', fontSize:14, margin:'0 0 28px' }}>
                Admin account for <strong style={{ color:'#f4f0ff' }}>{form.email}</strong> has been created.
              </p>
              <Btn onClick={() => nav('/login')} fullWidth>
                <Icon name="log-in" size={14} color="#fff" /> Sign In to Admin Panel
              </Btn>
            </div>
          ) : (
            <>
              <div style={{ marginBottom:28 }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:100, background:'rgba(255,77,109,0.08)', border:'1px solid rgba(255,77,109,0.2)', marginBottom:20 }}>
                  <Icon name="shield" size={12} color="#ff4d6d" />
                  <span style={{ fontFamily:'DM Mono, monospace', fontSize:11, color:'#ff4d6d', letterSpacing:'0.04em' }}>ONE-TIME SETUP</span>
                </div>
                <h2 style={{ fontFamily:'Bricolage Grotesque, sans-serif', fontSize:22, fontWeight:700, color:'#f4f0ff', margin:'0 0 6px' }}>Create Admin Account</h2>
                <p style={{ color:'#6e6888', fontSize:13, margin:0 }}>Requires the secret key set in your backend environment.</p>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <Input label="Setup Secret" type="password" value={form.secret}
                  onChange={e => set('secret', e.target.value)}
                  placeholder="Backend secret key" icon="key" />
                <Input label="Admin Name" value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Admin Name" icon="user" />
                <Input label="Admin Email" type="email" value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="admin@mentorix.ai" icon="mail" />
                <Input label="Password" type="password" value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Strong password" icon="lock" />
              </div>

              <Btn onClick={submit} loading={loading} fullWidth style={{ marginTop:24 }}>
                <Icon name="shield-check" size={14} color="#fff" /> Create Admin Account
              </Btn>

              <div style={{ marginTop:20, textAlign:'center' }}>
                <button onClick={() => nav('/login')} style={{ background:'none', border:'none', cursor:'pointer', color:'#6e6888', fontSize:13, fontFamily:'DM Sans, sans-serif' }}>
                  Back to login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
