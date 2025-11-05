// src/App.tsx
import React, { useEffect, useRef, useState } from 'react'

type Role = 'user' | 'assistant'
type Msg = { role: Role; content: string }

function Header() {
  return (
    <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: 8,
          background: '#111', color: '#fff',
          display: 'grid', placeItems: 'center', fontWeight: 700
        }}
        aria-hidden
      >
        B
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>BMS AI | Membership & Services Assistant</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Compare IV therapy, medical massage, acupuncture, and memberships.
        </div>
      </div>
    </div>
  )
}

function Bubble({ role, children }: { role: Role; children: React.ReactNode }) {
  const isUser = role === 'user'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        margin: '8px 0'
      }}
    >
      <div
        style={{
          maxWidth: 760,
          background: isUser ? '#111827' : '#ffffff',
          color: isUser ? '#ffffff' : '#111827',
          border: isUser ? '1px solid #111827' : '1px solid #e5e7eb',
          padding: '10px 12px',
          borderRadius: 12,
          boxShadow: isUser ? '0 1px 2px rgba(0,0,0,0.15)' : '0 1px 2px rgba(0,0,0,0.06)',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.4
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const didInit = useRef(false)

  // expose last HTTP for on-screen debugging (like Polaris)
  const [lastStatus, setLastStatus] = useState<number | null>(null)
  const [lastBody, setLastBody] = useState<any>(null)

  // 🔒 Lock body scroll
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    const prevOB = (document.body.style as any).overscrollBehavior
    document.body.style.overflow = 'hidden'
    ;(document.body.style as any).overscrollBehavior = 'contain'
    return () => {
      document.body.style.overflow = prevOverflow
      ;(document.body.style as any).overscrollBehavior = prevOB || ''
    }
  }, [])

  // focus management
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { if (!busy) inputRef.current?.focus() }, [busy])

  // one-time welcome
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    setMessages([
      {
        role: 'assistant',
        content:
          "Hi, I’m the BMS Assistant. Tell me what services you’re interested in and I’ll explain memberships and bundles that might fit. Services include: Massages, IV therapy, Acupuncture, and Shockwave Therapy. If you have any questions let me know!"
      }
    ])
  }, [])

  const wait = (ms: number) => new Promise(res => setTimeout(res, ms))

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages(m => [...m, { role: 'user', content: text }])
    setBusy(true)

    try {
      const history = messages.slice(-34).map(m => ({ role: m.role, content: m.content }))

      // ✅ Keep the same Polaris-style debug query params
      const res = await fetch('/api/chat?ui=1&debug=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history })
      })

      setLastStatus(res.status)

      let data: any = null
      let textBody = ''
      try {
        data = await res.json()
        setLastBody(data)
      } catch {
        textBody = await res.text().catch(() => '')
        setLastBody(textBody)
      }

      if (!res.ok) {
        // ❗ Do not hide errors; show exactly what came back
        const serverMsg =
          (typeof data?.error === 'string' && data.error) ||
          (textBody || `Server error (${res.status})`)
        setMessages(m => [...m, { role: 'assistant', content: `Error: ${serverMsg}` }])
        return
      }

      const raw = typeof data?.reply === 'string' ? data.reply.trim() : ''
      const err = typeof data?.error === 'string' ? data.error.trim() : ''
      const reply = raw || (err ? `Error: ${err}` : '')

      // If there’s no reply AND no error text, surface the payload for debugging
      if (!reply) {
        setMessages(m => [...m, { role: 'assistant', content: 'Empty reply. See Diagnostics below.' }])
        return
      }

      // ⏳ Simulate human typing delay (~100–150ms/char, capped at 6s)
      const perChar = 100 + Math.random() * 50
      const totalDelay = Math.min(reply.length * perChar, 6000)
      await wait(totalDelay)

      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      console.error('chat error', e)
      setLastStatus(-1)
      setLastBody(String((e as any)?.message || e))
      setMessages(m => [...m, { role: 'assistant', content: 'Network error. See Diagnostics below.' }])
    } finally {
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
      // scroll to bottom after each turn
      requestAnimationFrame(() => {
        const el = scrollerRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    }
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        height: '100vh',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #e5e7eb 0%, #f8fafc 100%)',
        padding: 12,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <div
        style={{
          width: '96vw',
          maxWidth: 1400,
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          border: '1px solid #d1d5db',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 12px 28px rgba(0,0,0,0.1)'
        }}
      >
        <Header />

        {/* Chat area */}
        <div
          ref={scrollerRef}
          style={{
            flex: 1,
            padding: 20,
            overflowY: 'auto',
            background: '#f9fafb',
            borderTop: '1px solid #e5e7eb',
            borderBottom: '1px solid #e5e7eb',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role}>
              {m.content}
            </Bubble>
          ))}

          {busy && (
            <div style={{ marginTop: 6, color: '#6b7280', fontStyle: 'italic', fontSize: 13 }}>
              Assistant is typing…
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          style={{
            padding: 14,
            background: '#f3f4f6',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            gap: 8
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: 12,
              padding: '8px 10px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (!busy) send()
                }
              }}
              placeholder={busy ? 'Assistant is typing…' : 'Type a message'}
              style={{
                flex: 1,
                outline: 'none',
                border: 'none',
                background: 'transparent',
                fontSize: 14
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: '#9ca3af',
                paddingLeft: 8,
                borderLeft: '1px solid #e5e7eb',
                userSelect: 'none'
              }}
              title="Press Enter to send"
            >
              ↵ Send
            </span>
          </div>

          <button
            onClick={() => { if (!busy) send() }}
            disabled={busy || !input.trim() }
            title={
              busy ? 'Please wait for the assistant to finish'
              : input.trim() ? 'Send' : 'Type a message'
            }
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              border: '1px solid #111',
              background: busy || !input.trim() ? '#9ca3af' : '#111',
              color: '#fff',
              cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
          >
            Send
          </button>
        </div>

        {/* Diagnostics (mirrors Polaris-style surface) */}
        <div style={{ padding: 12, borderTop: '1px solid #e5e7eb', background: '#fff' }}>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#374151', userSelect: 'none' }}>
              Diagnostics {lastStatus !== null ? `— HTTP ${lastStatus}` : ''}
            </summary>
            <pre
              style={{
                marginTop: 8,
                background: '#111827',
                color: '#e5e7eb',
                padding: 12,
                borderRadius: 8,
                maxHeight: 260,
                overflow: 'auto',
                fontSize: 12,
                lineHeight: 1.45
              }}
            >
{typeof lastBody === 'string' ? lastBody : JSON.stringify(lastBody, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  )
}
