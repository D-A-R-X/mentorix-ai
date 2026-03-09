import { useState, useRef, useEffect } from 'react'
import { adminApi } from '../lib/api'

// ── Add this to adminApi in api.js: ──────────────────────────────────────────
// aiCommand: (command, confirm = false) =>
//   post('/admin/ai-command', { command, confirm }),

const SUGGESTIONS = [
  "Show all users not linked to any institution",
  "List users who signed up in the last 7 days",
  "Find all sessions with less than 3 exchanges",
  "Show users with honor score below 30",
  "List all institutions and their type",
  "Show me the top 10 users by honor score",
  "Find all Google OAuth users",
  "Show users from DSCE college",
]

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user'
  const isErr  = msg.role === 'error'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 16,
      animation: 'fadeUp 0.25s ease',
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: isErr ? '#FEF2F2' : 'linear-gradient(135deg,#2563EB,#1D4ED8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginRight: 10, marginTop: 2,
          border: isErr ? '1px solid #FECACA' : 'none',
          fontSize: 13, fontWeight: 700, color: isErr ? '#DC2626' : '#fff',
        }}>
          {isErr ? '!' : 'AI'}
        </div>
      )}
      <div style={{
        maxWidth: '78%',
        background: isUser ? '#2563EB' : isErr ? '#FEF2F2' : '#F8F9FC',
        border: `1px solid ${isUser ? '#2563EB' : isErr ? '#FECACA' : '#E2E8F0'}`,
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding: '12px 16px',
        color: isUser ? '#fff' : isErr ? '#DC2626' : '#0F172A',
        fontSize: 14,
        lineHeight: 1.6,
      }}>
        {msg.content}

        {/* Plan preview */}
        {msg.plan && msg.plan.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Action Plan
            </div>
            {msg.plan.map((step, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '8px 10px', background: '#fff', borderRadius: 8,
                border: '1px solid #E2E8F0', marginBottom: 6,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#EFF6FF',
                  border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#2563EB',
                  flexShrink: 0,
                }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 13, color: '#0F172A', fontWeight: 500 }}>{step.description}</div>
                  {step.affected_items?.length > 0 && (
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
                      Affects: {step.affected_items.slice(0, 5).join(', ')}{step.affected_items.length > 5 ? ` +${step.affected_items.length - 5} more` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {msg.warning && (
              <div style={{ padding: '8px 12px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 13, color: '#92400E', marginTop: 6 }}>
                ⚠ {msg.warning}
              </div>
            )}
          </div>
        )}

        {/* Results table */}
        {msg.results && msg.results.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {msg.results.map((r, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: r.result === 'error' ? '#DC2626' : '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  {r.result === 'error' ? '✗' : '✓'} {r.description}
                </div>
                {Array.isArray(r.data) && r.data.length > 0 && (
                  <ResultTable data={r.data} />
                )}
                {typeof r.data === 'string' && (
                  <div style={{ fontSize: 13, color: '#334155', padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid #E2E8F0' }}>{r.data}</div>
                )}
                {typeof r.data === 'object' && !Array.isArray(r.data) && r.data && (
                  <div style={{ fontSize: 13, color: '#334155', padding: '8px 10px', background: '#fff', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                    {Object.entries(r.data).map(([k, v]) => (
                      <div key={k}><strong>{k}:</strong> {String(v)}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Confirm button */}
        {msg.needsConfirm && !msg.confirmed && (
          <button
            onClick={msg.onConfirm}
            style={{
              marginTop: 14, padding: '9px 20px', background: '#DC2626',
              border: 'none', borderRadius: 8, color: '#fff', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', display: 'block', width: '100%',
            }}
          >
            ✓ Confirm & Execute
          </button>
        )}
        {msg.confirmed && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#059669', fontWeight: 600 }}>✓ Executed</div>
        )}
      </div>
    </div>
  )
}

// ── Compact data table ────────────────────────────────────────────────────────
function ResultTable({ data }) {
  if (!data || data.length === 0) return null
  const keys = Object.keys(data[0]).filter(k => !['id'].includes(k)).slice(0, 5)
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #E2E8F0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff' }}>
        <thead>
          <tr style={{ background: '#F8F9FC' }}>
            {keys.map(k => (
              <th key={k} style={{ padding: '6px 10px', textAlign: 'left', color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((row, i) => (
            <tr key={i} style={{ borderBottom: i < data.length - 1 ? '1px solid #F1F4F9' : 'none' }}>
              {keys.map(k => (
                <td key={k} style={{ padding: '6px 10px', color: '#334155', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(row[k] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
          {data.length > 20 && (
            <tr>
              <td colSpan={keys.length} style={{ padding: '6px 10px', color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>
                +{data.length - 20} more rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Main AI Panel ─────────────────────────────────────────────────────────────
export default function AdminAI() {
  const [messages,  setMessages]  = useState([{
    role: 'assistant',
    content: "Hi! I'm your AI admin assistant. I can query your database, filter users, manage institutions, adjust honor scores, and more. What would you like to do?",
  }])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [lastCmd,   setLastCmd]   = useState('')
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const addMsg = (msg) => setMessages(prev => [...prev, msg])

  const sendCommand = async (cmd, confirm = false) => {
    if (!cmd.trim()) return
    const command = cmd.trim()

    if (!confirm) {
      addMsg({ role: 'user', content: command })
      setLastCmd(command)
      setInput('')
    }

    setLoading(true)
    try {
      const res = await adminApi.aiCommand(command, confirm)

      if (res.mode === 'preview') {
        // Show plan + confirm button
        addMsg({
          role:         'assistant',
          content:      res.understood,
          plan:         res.plan,
          warning:      res.warning,
          needsConfirm: res.plan?.some(p => ['delete_user','bulk_delete_users','delete_session','delete_institution','suspend_user','adjust_honor'].includes(p.action)),
          confirmed:    false,
          onConfirm:    () => {
            // Mark as confirmed in UI
            setMessages(prev => prev.map(m =>
              m.onConfirm === undefined ? m : { ...m, confirmed: true, onConfirm: undefined }
            ))
            sendCommand(command, true)
          },
        })

        // If no destructive actions, auto-execute
        const hasDestructive = res.plan?.some(p =>
          ['delete_user','bulk_delete_users','delete_session','delete_institution'].includes(p.action)
        )
        if (!hasDestructive && res.safe !== false) {
          sendCommand(command, true)
        }

      } else {
        // Executed — show results + summary
        addMsg({
          role:    'assistant',
          content: res.summary,
          results: res.results,
          warning: res.warning,
        })
      }
    } catch (e) {
      addMsg({ role: 'error', content: e.message || 'Command failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendCommand(input)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      fontFamily: 'Inter, sans-serif',
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to { transform: rotate(360deg) } }
        .ai-input:focus { outline: none; border-color: #93C5FD !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.1) !important; }
        .sugg-btn:hover { background: #EFF6FF !important; border-color: #BFDBFE !important; color: #1D4ED8 !important; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '0 0 16px', borderBottom: '1px solid #E2E8F0', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color: '#fff',
          }}>AI</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#0F172A' }}>Admin AI Assistant</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Natural language control over your platform</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669' }} />
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>Live</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, marginBottom: 16 }}>
        {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, animation: 'fadeUp 0.2s ease' }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg,#2563EB,#1D4ED8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>AI</div>
            <div style={{ display: 'flex', gap: 4, padding: '10px 14px', background: '#F8F9FC', borderRadius: '4px 16px 16px 16px', border: '1px solid #E2E8F0' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#2563EB',
                  animation: `spin 1s ease-in-out infinite`,
                  animationDelay: `${i * 0.15}s`,
                  animationName: 'bounce',
                }} />
              ))}
              <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }`}</style>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (shown when input empty) */}
      {!input && messages.length <= 2 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Try asking</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUGGESTIONS.slice(0, 4).map((s, i) => (
              <button key={i} className="sugg-btn" onClick={() => sendCommand(s)} style={{
                padding: '5px 12px', background: '#F8F9FC', border: '1px solid #E2E8F0',
                borderRadius: 20, fontSize: 12, color: '#64748B', cursor: 'pointer',
                transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a command… e.g. 'Remove all users not from DSCE'"
          rows={2}
          style={{
            flex: 1, padding: '10px 14px', background: '#F8F9FC',
            border: '1px solid #E2E8F0', borderRadius: 12, color: '#0F172A',
            fontSize: 14, fontFamily: 'Inter, sans-serif', resize: 'none',
            lineHeight: 1.5, transition: 'all 0.2s',
          }}
        />
        <button
          onClick={() => sendCommand(input)}
          disabled={loading || !input.trim()}
          style={{
            width: 42, height: 42, borderRadius: 12, border: 'none',
            background: loading || !input.trim() ? '#E2E8F0' : '#2563EB',
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.15s',
          }}
        >
          {loading
            ? <div style={{ width: 16, height: 16, border: '2px solid #94A3B8', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={!input.trim() ? '#94A3B8' : '#fff'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          }
        </button>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: '#CBD5E1', textAlign: 'center' }}>
        Enter to send · Destructive actions require confirmation
      </div>
    </div>
  )
}
