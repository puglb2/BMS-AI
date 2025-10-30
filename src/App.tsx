// src/App.tsx  (or src/app.tsx if you prefer lowercase)
import React, { useMemo, useState } from "react"

type Service = { id: string; label: string }
type RankResult = {
  package_id: string
  package_name: string
  monthly_price?: number
  price_usd?: number
  overage_cost?: number
  total_cost?: number
  over_units?: Record<string, number>
  waste_units?: Record<string, number>
  sessions_included?: number
  need?: number
  notes?: string
}

const DEFAULT_SERVICES: Service[] = [
  { id: "iv_therapy", label: "IV Therapy (sessions/mo)" },
  { id: "massage", label: "Medical Massage (sessions/mo)" },
  { id: "shockwave", label: "Shock Wave Therapy (sessions/mo)" },
  { id: "acupuncture", label: "Acupuncture (sessions/mo)" },
]

export default function App() {
  const [services] = useState<Service[]>(DEFAULT_SERVICES)
  const [wants, setWants] = useState<Record<string, number>>(
    () => Object.fromEntries(services.map(s => [s.id, 0]))
  )
  const [results, setResults] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalRequested = useMemo(
    () => Object.values(wants).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0),
    [wants]
  )

  function setCount(id: string, val: number) {
    const v = Number.isFinite(val) && val >= 0 ? Math.floor(val) : 0
    setWants(prev => ({ ...prev, [id]: v }))
  }

  async function optimize() {
    setLoading(true); setError(null); setResults(null)
    try {
      const res = await fetch("/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wants }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(
          res.status === 404
            ? "Optimization API not available yet. Start your backend at chat/index.js."
            : `Backend error ${res.status}: ${msg}`
        )
      }
      const data = await res.json()
      setResults(data.plan)
    } catch (e: any) {
      setError(e?.message ?? "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 840, margin: "40px auto", padding: 16 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>BMS AI — Membership Picker</h1>
        <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
          Enter desired sessions per month. We’ll compare against packages once the optimizer API is running.
        </p>
      </header>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Your monthly needs</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {services.map(s => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ minWidth: 290 }}>{s.label}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={wants[s.id] ?? 0}
                onChange={e => setCount(s.id, Number(e.target.value))}
                style={{ width: 120, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
              />
            </label>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button
            onClick={OptimizeButtonHandler}
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
            {loading ? "Calculating…" : "Find Best Plan"}
          </button>
          <span style={{ color: "#6b7280", fontSize: 14 }}>
            Total requested units: <strong>{totalRequested}</strong>
          </span>
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FCA5A5" }}>
            {error}
          </div>
        )}
      </section>

      {results && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Recommended plan</h2>
          {Object.entries(results.categories || {}).map(([key, entry]: any, i) => {
            const s = entry?.suggestion
            return (
              <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong>{entry?.label || key}</strong>
                  {!!s && <span>${(s.price_usd ?? 0).toFixed(2)} one-time</span>}
                </div>
                <div style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
                  Need: {entry?.need ?? 0} · {s ? `Includes ${s.sessions_included ?? 0}` : "No suggestion"}
                </div>
                {entry?.caveat && <div style={{ marginTop: 6, color: "#92400e", fontSize: 14 }}>{entry.caveat}</div>}
                {s?.notes && <div style={{ marginTop: 6, color: "#374151", fontSize: 14 }}>{s.notes}</div>}
              </div>
            )
          })}
          <div style={{ marginTop: 12 }}>
            <strong>Total:</strong> ${Number(results.total_price_usd || 0).toFixed(2)}
          </div>
        </section>
      )}

      {!results && !error && (
        <p style={{ marginTop: 16, color: "#6b7280", fontSize: 14 }}>
          Tip: until the backend exists, the button will report that the optimizer API isn’t available. That’s expected.
        </p>
      )}
    </div>
  )

  function OptimizeButtonHandler(){ optimize() }
}
Keep src/main.tsx minimal:

tsx
Copy code
// src/main.tsx
import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App" // or "./app" to match your file name

const el = document.getElementById("bms-ai-root")!
createRoot(el).render(<App />)
