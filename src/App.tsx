// src/App.tsx
import React, { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { role: Role; content: string };

function Header() {
  return (
    <div
      style={{
        position: "relative",
        padding: "20px 20px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        background:
          "linear-gradient(135deg, rgba(17,24,39,0.95) 0%, rgba(17,24,39,0.75) 60%, rgba(31,41,55,0.65) 100%)",
        color: "#fff",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background:
            "radial-gradient(120% 120% at 10% 10%, #60a5fa 0%, #93c5fd 30%, #c084fc 60%, #f472b6 100%)",
          color: "#0b0f19",
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          letterSpacing: 0.5,
          boxShadow: "0 6px 18px rgba(99,102,241,0.45)",
        }}
        aria-hidden
      >
        B
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 0.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          BMS Assistant
        </div>
        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.85)",
            marginTop: 2,
          }}
        >
          Memberships & bundles • Massage • IV Therapy • Acupuncture • Shockwave
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.14)",
          userSelect: "none",
        }}
        aria-hidden
      >
        Live
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            background: "#34d399",
            borderRadius: "50%",
            marginLeft: 6,
            boxShadow: "0 0 0 2px rgba(52,211,153,0.25)",
            verticalAlign: "middle",
          }}
        />
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: Role; children: React.ReactNode }) {
  const isUser = role === "user";
  const bg = isUser ? "#111827" : "#ffffff";
  const fg = isUser ? "#ffffff" : "#0f172a";
  const border = isUser ? "1px solid #0b1220" : "1px solid #e5e7eb";
  const shadow = isUser
    ? "0 8px 18px rgba(2,6,23,0.45)"
    : "0 6px 14px rgba(15,23,42,0.08)";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        margin: "10px 0",
        padding: "0 6px",
      }}
    >
      <div
        style={{
          maxWidth: 820,
          background: bg,
          color: fg,
          border,
          padding: "12px 14px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          boxShadow: shadow,
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
          overflowWrap: "anywhere",
          backdropFilter: isUser ? undefined : "saturate(120%)",
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

  // focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  // auto scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);

    try {
      const history = messages.slice(-34).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await fetch("/api/chat?ui=1&debug=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

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
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <div
      style={{
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif",
        height: "100vh",
        overflow: "hidden",
        background:
          "radial-gradient(1200px 600px at 20% -20%, #e0e7ff 0%, #f5f3ff 40%, #fafafa 70%)",
        padding: 12,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "96vw",
          maxWidth: 1300,
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          background: "rgba(255,255,255,0.82)",
          border: "1px solid rgba(15,23,42,0.08)",
          borderRadius: 22,
          overflow: "hidden",
          boxShadow:
            "0 20px 60px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.6)",
          backdropFilter: "blur(6px)",
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
            background:
              "linear-gradient(180deg, rgba(249,250,251,0.85) 0%, rgba(255,255,255,0.9) 100%)",
            borderTop: "1px solid #eef2f7",
            position: "relative",
          }}
        >
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role}>
              {m.content}
            </Bubble>
          ))}

          {busy && (
            <div
              style={{
                marginTop: 8,
                color: "#6b7280",
                fontStyle: "italic",
                fontSize: 13,
                paddingLeft: 10,
              }}
            >
              BMS Assistant is typing…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Composer (floating bar look) */}
        <div
          style={{
            padding: 14,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(249,250,251,0.9) 100%)",
            borderTop: "1px solid rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              width: "100%",
              maxWidth: 980,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: "10px 12px",
                boxShadow:
                  "0 6px 18px rgba(17,24,39,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
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
                placeholder={busy ? "Assistant is typing…" : "Type a message"}
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
                  paddingLeft: 10,
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
                border: "1px solid #0b1220",
                background: busy || !input.trim() ? "#9ca3af" : "#0b1220",
                color: "#fff",
                cursor: busy || !input.trim() ? "not-allowed" : "pointer",
                fontWeight: 700,
                letterSpacing: 0.2,
                boxShadow: busy
                  ? "none"
                  : "0 8px 18px rgba(2,6,23,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
