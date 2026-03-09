import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AmbientBg, LogoMark, Btn, Icon, Badge, Card, Spinner, Modal, useToast } from '../components/ui/index.jsx'
import { useAuth } from '../hooks/useAuth'
import { adminApi } from '../lib/api'

const TABS = [
  { id: 'overview',     label: 'Overview',      icon: 'layout-dashboard' },
  { id: 'users',        label: 'Users',          icon: 'users' },
  { id: 'sessions',     label: 'Sessions',       icon: 'mic' },
  { id: 'honor',        label: 'Honor Board',    icon: 'shield' },
  { id: 'institutions', label: 'Institutions',   icon: 'building' },
  { id: 'analytics',    label: 'Analytics',      icon: 'bar-chart-2' },
]

export default function Admin() {
  const { user, logout } = useAuth()
  const nav   = useNavigate()
  const toast = useToast()

  const email   = user?.email || ''
  const isAdmin = email === 'admin@mentorix.ai' || email.startsWith('admin@') || (user?.name || '').toLowerCase().startsWith('admin')

  const [tab,              setTab]              = useState('overview')
  const [data,             setData]             = useState({})
  const [loadingKey,       setLoadingKey]       = useState(null)
  const [search,           setSearch]           = useState('')
  const [addInstOpen,      setAddInstOpen]      = useState(false)
  const [newInst,          setNewInst]          = useState({ name: '', contact_email: '' })
  const [instSaving,       setInstSaving]       = useState(false)

  if (!isAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F9FC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AmbientBg />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <Icon name="shield-off" size={48} color="#ff4d6d" />
          <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, color: '#0F172A', margin: '20px 0 10px' }}>Access Denied</h2>
          <p style={{ color: '#94A3B8', marginBottom: 24 }}>This page is restricted to administrators.</p>
          <Btn onClick={() => nav('/dashboard')}>Back to Dashboard</Btn>
        </div>
      </div>
    )
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  const load = async (key, fn) => {
    if (data[key] !== undefined) return
    setLoadingKey(key)
    try { const r = await fn(); setData(d => ({ ...d, [key]: r }) ) }
    catch (e) { toast(e.message || 'Load failed', 'error') }
    finally { setLoadingKey(null) }
  }

  const reload = async (key, fn) => {
    setLoadingKey(key)
    try { const r = await fn(); setData(d => ({ ...d, [key]: r })) }
    catch (e) { toast(e.message || 'Load failed', 'error') }
    finally { setLoadingKey(null) }
  }

  useEffect(() => {
    if (tab === 'overview')     load('overview',     adminApi.overview)
    if (tab === 'users')        load('users',        adminApi.users)
    if (tab === 'sessions')     load('sessions',     adminApi.sessions)
    if (tab === 'honor')        load('honor',        adminApi.honor)
    if (tab === 'institutions') load('institutions', adminApi.institutions)
    if (tab === 'analytics')    load('analytics',    adminApi.analytics)
  }, [tab])

  // ── Actions ───────────────────────────────────────────────────────────────
  const suspendUser = async (id, currentlySuspended) => {
    try {
      currentlySuspended
        ? await adminApi.unsuspendUser(id)
        : await adminApi.suspendUser(id)
      toast(currentlySuspended ? 'User unsuspended' : 'User suspended', 'success')
      reload('users', adminApi.users)
    } catch (e) { toast(e.message, 'error') }
  }

  const deleteUser = async (id) => {
    if (!confirm('Permanently delete this user?')) return
    try { await adminApi.deleteUser(id); toast('User deleted', 'success'); reload('users', adminApi.users) }
    catch (e) { toast(e.message, 'error') }
  }

  const deleteSession = async (id) => {
    if (!confirm('Delete this session?')) return
    try { await adminApi.deleteSession(id); toast('Session deleted', 'success'); reload('sessions', adminApi.sessions) }
    catch (e) { toast(e.message, 'error') }
  }

  // FIX: was toggleInstitutionEnv (wrong) → now toggleInstitution (correct)
  const toggleInst = async (id) => {
    try { await adminApi.toggleInstitution(id); toast('Status toggled', 'success'); reload('institutions', adminApi.institutions) }
    catch (e) { toast(e.message, 'error') }
  }

  const deleteInst = async (id) => {
    if (!confirm('Delete institution permanently?')) return
    try { await adminApi.deleteInstitution(id); toast('Institution deleted', 'success'); reload('institutions', adminApi.institutions) }
    catch (e) { toast(e.message, 'error') }
  }

  const addInstitution = async () => {
    if (!newInst.name.trim()) { toast('Name is required', 'warn'); return }
    setInstSaving(true)
    try {
      await adminApi.addInstitution({ name: newInst.name.trim(), contact_email: newInst.contact_email.trim() })
      toast('Institution added', 'success')
      setAddInstOpen(false); setNewInst({ name: '', contact_email: '' })
      reload('institutions', adminApi.institutions)
    } catch (e) { toast(e.message, 'error') }
    finally { setInstSaving(false) }
  }

  const currentData   = data[tab]
  const isTabLoading  = loadingKey === tab

  // ── Helpers ───────────────────────────────────────────────────────────────
  const filterUsers = (users = []) => {
    if (!search) return users
    const q = search.toLowerCase()
    return users.filter(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', display: 'flex', fontFamily: 'Inter, sans-serif' }}>
      <AmbientBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .nav-item:hover { background: rgba(255,255,255,0.04); }
        tr:hover td { background: rgba(255,255,255,0.02); }
        input:focus { outline: none; border-color: rgba(37,99,235,0.4) !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2e2a42; border-radius: 2px; }
      `}</style>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 220, background: '#FFFFFF', borderRight: '1px solid rgba(0,0,0,0.04)', zIndex: 10, display: 'flex', flexDirection: 'column', padding: '24px 0' }}>
        <div style={{ padding: '0 20px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={26} />
          <div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: '#0F172A' }}>Admin Panel</div>
            <div style={{ fontFamily: 'Inter, monospace', fontSize: 10, color: '#94A3B8' }}>Mentorix.AI</div>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(0,0,0,0.04)', margin: '16px 0' }} />

        {TABS.map(t => (
          <button key={t.id} className="nav-item" onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
            background: tab === t.id ? 'rgba(37,99,235,0.1)' : 'transparent',
            borderLeft: `2px solid ${tab === t.id ? '#2563EB' : 'transparent'}`,
            border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
            color: tab === t.id ? '#0F172A' : '#94A3B8',
            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
          }}>
            <Icon name={t.icon} size={15} color={tab === t.id ? '#2563EB' : '#94A3B8'} />
            {t.label}
          </button>
        ))}

        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
          <Btn variant="ghost" size="sm" fullWidth onClick={() => nav('/dashboard')}>
            <Icon name="arrow-left" size={14} color="#6e6888" /> Back
          </Btn>
          <Btn variant="ghost" size="sm" fullWidth onClick={() => { logout(); nav('/login') }} style={{ marginTop: 6 }}>
            <Icon name="log-out" size={14} color="#6e6888" /> Sign Out
          </Btn>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main style={{ marginLeft: 220, flex: 1, padding: '32px clamp(24px,4vw,48px)', position: 'relative', zIndex: 1, color: '#334155' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: 24, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
            {TABS.find(t => t.id === tab)?.label}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', fontFamily: 'Inter, monospace' }}>admin@mentorix.ai</p>
        </div>

        {isTabLoading && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner size={32} /></div>}

        {!isTabLoading && (
          <>
            {/* ── OVERVIEW ─────────────────────────────────────────────── */}
            {tab === 'overview' && currentData && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
                {Object.entries(currentData).filter(([k,v]) => typeof v !== 'object' || v === null).map(([k, v]) => (
                  <Card key={k}>
                    <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{k.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#0F172A' }}>{v === null ? '0' : String(v)}</div>
                  </Card>
                ))}
              </div>
            )}

            {/* ── USERS ────────────────────────────────────────────────── */}
            {tab === 'users' && (
              <div>
                <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    style={{ flex: 1, maxWidth: 340, padding: '9px 14px', background: '#F8F9FC', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 10, color: '#0F172A', fontSize: 13, fontFamily: 'Inter, sans-serif' }} />
                  <span style={{ fontSize: 13, color: '#94A3B8', fontFamily: 'Inter, monospace' }}>
                    {filterUsers(currentData?.users).length} users
                  </span>
                </div>
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          {['Name','Email','Dept','Year','Institution','Status','Actions'].map(h => (
                            <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'Inter, monospace', fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filterUsers(currentData?.users || []).map(u => (
                          <tr key={u.id || u.email}>
                            {[
                              <td key="n" style={td}>{u.name || '—'}</td>,
                              <td key="e" style={{ ...td, fontFamily: 'Inter, monospace', fontSize: 12 }}>{u.email}</td>,
                              <td key="d" style={td}>{u.department || '—'}</td>,
                              <td key="y" style={td}>{u.year ? `Y${u.year}` : '—'}</td>,
                              <td key="i" style={td}>{u.institution_name || '—'}</td>,
                              <td key="s" style={td}><Badge color={u.suspended ? 'rose' : 'teal'}>{u.suspended ? 'Suspended' : 'Active'}</Badge></td>,
                              <td key="a" style={td}>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <Btn size="sm" variant="ghost" onClick={() => suspendUser(u.id, u.suspended)}>
                                    <Icon name={u.suspended ? 'check-circle' : 'slash'} size={13} color="#6e6888" />
                                  </Btn>
                                  <Btn size="sm" variant="ghost" onClick={() => deleteUser(u.id)}>
                                    <Icon name="trash-2" size={13} color="#ff4d6d" />
                                  </Btn>
                                </div>
                              </td>,
                            ]}
                          </tr>
                        ))}
                        {!filterUsers(currentData?.users || []).length && (
                          <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No users found</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* ── SESSIONS ─────────────────────────────────────────────── */}
            {tab === 'sessions' && (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        {['User','Mode','Score','Exchanges','Tab Warnings','Date','Delete'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'Inter, monospace', fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(currentData?.sessions || []).map(s => (
                        <tr key={s.id}>
                          <td style={{ ...td, fontFamily: 'Inter, monospace', fontSize: 12 }}>{s.email}</td>
                          <td style={td}><Badge color={s.mode === 'hr_interview' ? 'teal' : 'violet'}>{s.mode || 'voice'}</Badge></td>
                          <td style={td}>{s.overall_score ?? '—'}</td>
                          <td style={td}>{s.exchange_count ?? '—'}</td>
                          <td style={td}>
                            <span style={{ color: (s.tab_warnings || 0) >= 3 ? '#DC2626' : '#94A3B8', fontFamily: 'Inter, monospace', fontSize: 13, fontWeight: (s.tab_warnings || 0) >= 3 ? 700 : 400 }}>
                              {s.tab_warnings || 0}
                            </span>
                          </td>
                          <td style={{ ...td, fontFamily: 'Inter, monospace', fontSize: 11 }}>
                            {s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN') : '—'}
                          </td>
                          <td style={td}>
                            <Btn size="sm" variant="ghost" onClick={() => deleteSession(s.id)}>
                              <Icon name="trash-2" size={13} color="#ff4d6d" />
                            </Btn>
                          </td>
                        </tr>
                      ))}
                      {!(currentData?.sessions?.length) && (
                        <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No sessions yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ── HONOR BOARD ──────────────────────────────────────────── */}
            {tab === 'honor' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(currentData?.leaderboard || currentData?.honor || []).map((u, i) => (
                  <Card key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: i === 0 ? 'rgba(245,166,35,0.15)' : i === 1 ? 'rgba(192,192,192,0.15)' : 'rgba(205,127,50,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, monospace', fontWeight: 700, color: i === 0 ? '#f5a623' : i === 1 ? '#c0c0c0' : '#cd7f32', fontSize: 14, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>{u.name || u.email}</div>
                      <div style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'Inter, monospace' }}>{u.department || '—'} · {u.institution_name || 'Independent'}</div>
                    </div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 800, color: i === 0 ? '#f5a623' : '#2563EB' }}>
                      {u.honor_score ?? u.score ?? 0}
                    </div>
                  </Card>
                ))}
                {!(currentData?.leaderboard?.length || currentData?.honor?.length) && (
                  <Card style={{ textAlign: 'center', padding: 48 }}>
                    <p style={{ color: '#94A3B8' }}>No honor data yet</p>
                  </Card>
                )}
              </div>
            )}

            {/* ── INSTITUTIONS ─────────────────────────────────────────── */}
            {tab === 'institutions' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <Btn onClick={() => setAddInstOpen(true)}>
                    <Icon name="plus" size={14} color="#fff" /> Add Institution
                  </Btn>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(currentData?.institutions || []).map(inst => (
                    <Card key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="building" size={20} color="#7c4dff" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14, marginBottom: 3 }}>{inst.name}</div>
                        <div style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'Inter, monospace' }}>{inst.contact_email || '—'}</div>
                      </div>
                      <Badge color={inst.env === 'prod' ? 'teal' : 'muted'}>{inst.env === 'prod' ? 'Active' : 'Inactive'}</Badge>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn size="sm" variant="ghost" onClick={() => toggleInst(inst.id)}>
                          <Icon name={inst.env === 'prod' ? 'toggle-right' : 'toggle-left'} size={15} color={inst.env === 'prod' ? '#059669' : '#94A3B8'} />
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => deleteInst(inst.id)}>
                          <Icon name="trash-2" size={14} color="#ff4d6d" />
                        </Btn>
                      </div>
                    </Card>
                  ))}
                  {!(currentData?.institutions?.length) && (
                    <Card style={{ textAlign: 'center', padding: 48 }}>
                      <Icon name="building" size={36} color="#2e2a42" />
                      <p style={{ color: '#94A3B8', marginTop: 16 }}>No institutions yet. Add one above.</p>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {/* ── ANALYTICS ────────────────────────────────────────────── */}
            {tab === 'analytics' && currentData && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
                {Object.entries(currentData).map(([k, v]) => (
                  typeof v !== 'object' ? (
                    <Card key={k}>
                      <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'Inter, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{k.replace(/_/g, ' ')}</div>
                      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 28, fontWeight: 800, color: '#0F172A' }}>{String(v)}</div>
                    </Card>
                  ) : null
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Add Institution Modal ─────────────────────────────────────────── */}
      <Modal open={addInstOpen} onClose={() => setAddInstOpen(false)} title="Add Institution">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Institution Name *</label>
            <input value={newInst.name} onChange={e => setNewInst(n => ({ ...n, name: e.target.value }))}
              placeholder="e.g. Chennai Institute of Technology" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Contact Email</label>
            <input type="email" value={newInst.contact_email} onChange={e => setNewInst(n => ({ ...n, contact_email: e.target.value }))}
              placeholder="admin@institution.edu" style={inputStyle} />
          </div>
          <Btn onClick={addInstitution} loading={instSaving} fullWidth>
            <Icon name="plus" size={14} color="#fff" /> Add Institution
          </Btn>
        </div>
      </Modal>
    </div>
  )
}

const td = { padding: '12px 16px', fontSize: 13, color: '#334155', borderBottom: '1px solid rgba(255,255,255,0.04)' }
const labelStyle = { display: 'block', fontFamily: 'Inter, monospace', fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: '#F8F9FC', color: '#0F172A', fontSize: 14, fontFamily: 'Inter, sans-serif' }
