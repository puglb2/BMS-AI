// src/App.tsx
import React, { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { role: Role; content: string };

function Header({
  dark,
  setDark,
  busy,
}: {
  dark: boolean;
  setDark: (v: boolean) => void;
  busy: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: "20px 20px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: dark
          ? "linear-gradient(135deg, rgba(2,6,23,0.95) 0%, rgba(2,6,23,0.75) 60%, rgba(15,23,42,0.7) 100%)"
          : "linear-gradient(135deg, rgba(17,24,39,0.95) 0%, rgba(17,24,39,0.75) 60%, rgba(31,41,55,0.65) 100%)",
        color: "#fff",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {/* App Icon */}
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

      {/* Title + Subtitle */}
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

      {/* Live/Busy pill */}
      <div
        style={{
          fontSize: 11,
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.14)",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginRight: 10,
        }}
        aria-label={busy ? "Assistant busy" : "Assistant live"}
      >
        {busy ? "Working" : "Live"}
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            background: busy ? "#f59e0b" : "#34d399",
            borderRadius: "50%",
            boxShadow: `0 0 0 2px ${
              busy ? "rgba(245,158,11,0.25)" : "rgba(52,211,153,0.25)"
            }`,
            verticalAlign: "middle",
          }}
        />
      </div>

      {/* Dark mode switch */}
      <button
        onClick={() => setDark(!dark)}
        title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.08)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          userSelect: "none",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 16,
            height: 16,
            borderRadius: 6,
            background: dark ? "#facc15" : "#60a5fa",
            boxShadow: dark
              ? "0 0 0 3px rgba(250,204,21,0.18)"
              : "0 0 0 3px rgba(96,165,250,0.18)",
          }}
        />
        {dark ? "Dark" : "Light"}
      </button>
    </div>
  );
}

function Bubble({ role, children, dark }: { role: Role; children: React.ReactNode; dark: boolean }) {
  const isUser = role === "user";
  const bg = isUser ? (dark ? "#0b1220" : "#111827") : dark ? "#0f172a" : "#ffffff";
  const fg = isUser ? "#ffffff" : dark ? "#e5e7eb" : "#0f172a";
  const border = isUser
    ? `1px solid ${dark ? "#0b1220" : "#0b1220"}`
    : `1px solid ${dark ? "rgba(148,163,184,0.18)" : "#e5e7eb"}`;
  const shadow = isUser
    ? "0 8px 18px rgba(2,6,23,0.45)"
    : dark
    ? "0 8px 18px rgba(2,6,23,0.35)"
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
  const [dark, setDark] = useState(false);

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

  // theme surfaces
  const pageBg = dark
    ? "radial-gradient(1200px 600px at 20% -20%, #0b1220 0%, #0b1220 40%, #0b1220 70%)"
    : "radial-gradient(1200px 600px at 20% -20%, #e0e7ff 0%, #f5f3ff 40%, #fafafa 70%)";

  const shellBg = dark ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.82)";
  const shellBorder = dark ? "1px solid rgba(148,163,184,0.15)" : "1px solid rgba(15,23,42,0.08)";
  const shellShadow = dark
    ? "0 20px 60px rgba(2,6,23,0.65), inset 0 1px 0 rgba(255,255,255,0.06)"
    : "0 20px 60px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.6)";
  const chatBg = dark
    ? "linear-gradient(180deg, rgba(2,6,23,0.85) 0%, rgba(15,23,42,0.9) 100%)"
    : "linear-gradient(180deg, rgba(249,250,251,0.85) 0%, rgba(255,255,255,0.9) 100%)";
  const divider = dark ? "1px solid rgba(148,163,184,0.16)" : "1px solid #eef2f7";
  const inputCardBorder = dark ? "1px solid rgba(148,163,184,0.22)" : "1px solid #e5e7eb";
  const inputCardBg = dark ? "rgba(15,23,42,0.7)" : "#ffffff";
  const inputPlaceholder = dark ? "Assistant is typing…" : "Type a message";

  return (
    <div
      style={{
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif",
        height: "100vh",
        overflow: "hidden",
        background: pageBg,
        padding: 12,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: dark ? "#e5e7eb" : "#0f172a",
        transition: "background 240ms ease, color 240ms ease",
      }}
    >
      <div
        style={{
          width: "96vw",
          maxWidth: 1300,
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          background: shellBg,
          border: shellBorder,
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: shellShadow,
          backdropFilter: "blur(6px)",
          transition: "background 240ms ease, border 240ms ease, box-shadow 240ms ease",
        }}
      >
        <Header dark={dark} setDark={setDark} busy={busy} />

        {/* Chat area */}
        <div
          ref={scrollerRef}
          style={{
            flex: 1,
            padding: 20,
            overflowY: "auto",
            background: chatBg,
            borderTop: divider,
            position: "relative",
            transition: "background 240ms ease, border-color 240ms ease",
          }}
        >
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} dark={dark}>
              {m.content}
            </Bubble>
          ))}

          {busy && (
            <div
              style={{
                marginTop: 8,
                color: dark ? "#9ca3af" : "#6b7280",
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

        {/* Composer */}
        <div
          style={{
            padding: 14,
            background: dark
              ? "linear-gradient(180deg, rgba(2,6,23,0.8) 0%, rgba(15,23,42,0.86) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(249,250,251,0.9) 100%)",
            borderTop: dark ? "1px solid rgba(148,163,184,0.16)" : "1px solid rgba(15,23,42,0.08)",
            transition: "background 240ms ease, border-color 240ms ease",
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
                background: inputCardBg,
                border: inputCardBorder,
                borderRadius: 14,
                padding: "10px 12px",
                boxShadow: dark
                  ? "0 6px 18px rgba(2,6,23,0.45)"
                  : "0 6px 18px rgba(17,24,39,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
                transition: "background 240ms ease, border-color 240ms ease, box-shadow 240ms ease",
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
                  color: dark ? "#e5e7eb" : "#0f172a",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: dark ? "#9ca3af" : "#9ca3af",
                  paddingLeft: 10,
                  borderLeft: dark ? "1px solid rgba(148,163,184,0.22)" : "1px solid #e5e7eb",
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
                border: dark ? "1px solid #cbd5e1" : "1px solid #0b1220",
                background: busy || !input.trim() ? "#9ca3af" : dark ? "#e2e8f0" : "#0b1220",
                color: busy || !input.trim() ? "#fff" : dark ? "#0b1220" : "#fff",
                cursor: busy || !input.trim() ? "not-allowed" : "pointer",
                fontWeight: 700,
                letterSpacing: 0.2,
                boxShadow:
                  busy || !input.trim()
                    ? "none"
                    : dark
                    ? "0 8px 18px rgba(2,6,23,0.45), inset 0 1px 0 rgba(255,255,255,0.25)"
                    : "0 8px 18px rgba(2,6,23,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
                transition: "background 240ms ease, color 240ms ease, border-color 240ms ease",
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
