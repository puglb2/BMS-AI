// src/App.tsx
import React, { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { role: Role; content: string };

function Header() {
  return (
    <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "#111",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
        }}
        aria-hidden
      >
        B
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>BMS Assistant</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Help choosing memberships and bundles (massage, IV therapy, acupuncture, shockwave).
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: Role; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        margin: "8px 0",
      }}
    >
      <div
        style={{
          maxWidth: 760,
          background: isUser ? "#111827" : "#ffffff",
          color: isUser ? "#ffffff" : "#111827",
          border: isUser ? "1px solid #111827" : "1px solid #e5e7eb",
          padding: "10px 12px",
          borderRadius: 12,
          boxShadow: isUser ? "0 1px 2px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.06)",
          whiteSpace: "pre-wrap",
          lineHeight: 1.4,
          overflowWrap: "anywhere",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi, I’m the BMS Assistant. Tell me what services you’re interested in and I’ll explain memberships and bundles that might fit. Services include: Massages, IV Therapy, Acupuncture, and Shockwave Therapy. If you have any questions, please let me know!",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // lock body scroll
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    (document.body.style as any).overscrollBehavior = "contain";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      (document.body.style as any).overscrollBehavior = "";
    };
  }, []);

  // focus input on mount and when not busy
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  // auto-scroll to bottom when messages change
  useEffect(() => {
    // try scrollIntoView on a sentinel
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    // also nudge the container in case of overflow edge cases
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);

    try {
      const history = messages.slice(-34).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat?ui=1&debug=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      // show raw error details for debugging (no simulated fallback)
      if (!res.ok) {
        let detail: any = null;
        try {
          detail = await res.json();
        } catch {
          // ignore
        }
        const errText = [
          `Server error (${res.status})`,
          detail ? JSON.stringify(detail, null, 2) : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        setMessages((m) => [...m, { role: "assistant", content: errText }]);
        return;
      }

      const data = await res.json().catch(() => ({} as any));
      const reply =
        typeof data?.reply === "string"
          ? data.reply.trim()
          : typeof data?.error === "string"
          ? `Error: ${data.error}`
          : "Empty reply.";

      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e: any) {
      const msg =
        e && typeof e.message === "string" ? e.message : "Network or fetch error.";
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setBusy(false);
      // focus back on the input after send
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        height: "100vh",
        overflow: "hidden",
        background: "linear-gradient(180deg, #e5e7eb 0%, #f8fafc 100%)",
        padding: 12,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "96vw",
          maxWidth: 1400,
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          border: "1px solid #d1d5db",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 12px 28px rgba(0,0,0,0.1)",
        }}
      >
        <Header />

        {/* Chat area */}
        <div
          ref={scrollerRef}
          style={{
            flex: 1,
            padding: 20,
            overflowY: "auto",
            background: "#f9fafb",
            borderTop: "1px solid #e5e7eb",
            borderBottom: "1px solid #e5e7eb",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role}>
              {m.content}
            </Bubble>
          ))}
          {/* sentinel for scrollIntoView */}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div
          style={{
            padding: 14,
            background: "#f3f4f6",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            gap: 8,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              background: "#ffffff",
              border: "1px solid #d1d5db",
              borderRadius: 12,
              padding: "8px 10px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!busy) send();
                }
              }}
              placeholder={busy ? "Sending…" : "Type a message"}
              style={{
                flex: 1,
                outline: "none",
                border: "none",
                background: "transparent",
                fontSize: 14,
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: "#9ca3af",
                paddingLeft: 8,
                borderLeft: "1px solid #e5e7eb",
                userSelect: "none",
              }}
              title="Press Enter to send"
            >
              ↵ Send
            </span>
          </div>

          <button
            onClick={() => {
              if (!busy) send();
            }}
            disabled={busy || !input.trim()}
            title={busy ? "Please wait" : input.trim() ? "Send" : "Type a message"}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid #111",
              background: busy || !input.trim() ? "#9ca3af" : "#111",
              color: "#fff",
              cursor: busy || !input.trim() ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
