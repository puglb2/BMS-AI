import React, { useState } from "react";

type Role = "user" | "assistant";
type Msg = { role: Role; content: string };

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Debug flag comes from URL:  .../?debug=1
  const DEBUG = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";

  // for inspection
  const [lastStatus, setLastStatus] = useState<number | null>(null);
  const [lastBody, setLastBody] = useState<any>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  async function send() {
    const content = input.trim();
    if (!content) return;

    const nextMessages = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setLastError(null);

    try {
      const url = `/api/chat${DEBUG ? "?debug=1" : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: nextMessages,
        }),
      });

      setLastStatus(res.status);

      // Try to parse JSON always; if it fails, capture text
      let body: any = null;
      let text = "";
      try {
        body = await res.json();
      } catch {
        text = await res.text().catch(() => "");
      }
      setLastBody(body ?? text);

      if (!res.ok) {
        // ❌ Do NOT auto-insert any assistant message; surface the error
        setLastError(`HTTP ${res.status} ${res.statusText} — ${text || (body && body.error) || "no body"}`);
        return;
      }

      // Only append assistant message if the backend actually returned one
      const reply: string | undefined = body?.reply;
      if (reply) {
        setMessages([...nextMessages, { role: "assistant", content: reply }]);
      }
    } catch (e: any) {
      setLastError(`Fetch failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "32px auto", fontFamily: "Inter, system-ui, sans-serif", padding: "0 12px" }}>
      <h2 style={{ margin: 0 }}>💬 BMS AI Assistant</h2>
      <p style={{ color: "#6b7280", marginTop: 6 }}>
        {DEBUG ? "Debug mode is ON (appending ?debug=1 to requests)." : "Append ?debug=1 to the URL for verbose diagnostics."}
      </p>

      {/* Chat transcript */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, height: 360, overflowY: "auto", marginTop: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ textAlign: m.role === "user" ? "right" : "left", marginBottom: 10 }}>
            <div
              style={{
                display: "inline-block",
                background: m.role === "user" ? "#111827" : "#f3f4f6",
                color: m.role === "user" ? "#fff" : "#111827",
                padding: "8px 12px",
                borderRadius: 12,
                maxWidth: "80%",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {!messages.length && (
          <div style={{ color: "#9ca3af" }}>Start by asking about memberships, IV therapy, massage bundles, etc.</div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && send()}
          placeholder="Type a message…"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: loading ? "#f9fafb" : "#111827",
            color: loading ? "#111827" : "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </div>

      {/* Debug panel */}
      <div style={{ marginTop: 16 }}>
        {lastError && (
          <div
            role="alert"
            style={{
              marginBottom: 10,
              padding: 12,
              borderRadius: 10,
              background: "#FEF2F2",
              color: "#991B1B",
              border: "1px solid #FCA5A5",
            }}
          >
            {lastError}
          </div>
        )}

        <details style={{ border: "1px solid #e5e7eb", borderRadius: 12 }}>
          <summary style={{ padding: 10, cursor: "pointer", fontWeight: 600 }}>
            Diagnostics {lastStatus !== null ? `— HTTP ${lastStatus}` : ""}
          </summary>
          <div style={{ padding: 12 }}>
            <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
{typeof lastBody === "string" ? lastBody : JSON.stringify(lastBody, null, 2)}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}
