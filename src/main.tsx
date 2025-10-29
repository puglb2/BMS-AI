// src/main.tsx
import React, { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"

type Service = { id: string; label: string }

// Placeholder services — swap these names/ids once you have the real catalog.
// Keeping the data here avoids adding new files until your data_set_a/b is ready.
const DEFAULT_SERVICES: Service[] = [
  { id: "neuro_chiro_visit", label: "Neuro-Chiro Visit" },
  { id: "spinal_decompression", label: "Spinal Decompression" },
  { id: "red_light_therapy", label: "Red Light Therapy" },
]

type RankResult = {
  package_id: string
  package_name: string
  monthly_price: number
  overage_cost: number
  total_cost: number
  over_units: Record<string, number>
  waste_units: Record<string, number>
  notes?: string
}

function BmsAiApp() {
  const [services] = useState<Service[]>(DEFAULT_SERVICES)
  const [wants, setWants] = useState<Record<string, number>>(
    () => Object.fromEntries(services.map(s => [s.id, 0]))
  )
  const [results, setResults] = useState<RankResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalRequested = useMemo(
    () => Object.values(wants).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0),
    [wants]
  )

  async function optimize() {
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch("/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wants }),
      })
      if (!res.ok) {
        // 404 is expected until you wire the backend; surface a helpful message.
        const msg = await res.text()
        throw new Error(
          res.status === 404
            ? "Optimization API not available yet. Wire POST /optimize when ready."
            : `Backend error ${res.status}: ${msg}`
        )
      }
      const data = await res.json()
      setResults(data.ranked as RankResult[])
    } catch (e: any) {
      setError(e?.message ?? "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  function setCount(id: string, val: number) {
    const v = Number.isFinite(val) && val >= 0 ? Math.floor(val) : 0
    setWants(prev => ({ ...prev, [id]: v }))
  }

  return (
    <div style={{ maxWidth: 840, margin: "40px auto", padding: "16px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>BMS AI — Membership Picker</h1>
        <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
          Enter how many services you want in a typical month. We’ll compare plans once the optimizer API is connected.
        </p>
      </header>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Your monthly needs</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {services.map(s => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ minWidth: 240 }}>{s.label}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={wants[s.id] ?? 0}
                onChange={e => setCount(s.id, Number(e.target.value))}
                style={{
                  width: 120,
                  padding: "8px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                }}
              />
            </label>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button
            onClick={optimize}
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
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              background: "#FEF2F2",
              color: "#991B1B",
              border: "1px solid #FCA5A5",
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        )}
      </section>

      {results && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Best matches</h2>
          {results.length === 0 && (
            <div style={{ color: "#6b7280" }}>No packages returned by the optimizer.</div>
          )}
          {results.slice(0, 3).map((r, i) => (
            <div
              key={r.package_id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 14,
                marginTop: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>
                  #{i + 1} — {r.package_name}
                </strong>
                <span> ${r.total_cost.toFixed(2)} / mo</span>
              </div>
              <div style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
                Base ${r.monthly_price.toFixed(2)} · Overage ${r.overage_cost.toFixed(2)}
              </div>
              <details style={{ marginTop: 6 }}>
                <summary>Usage details</summary>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
{JSON.stringify({ over_units: r.over_units, waste_units: r.waste_units }, null, 2)}
                </pre>
              </details>
              {r.notes && (
                <div style={{ marginTop: 6, color: "#374151", fontSize: 14 }}>{r.notes}</div>
              )}
            </div>
          ))}
        </section>
      )}

      {!results && !error && (
        <p style={{ marginTop: 16, color: "#6b7280", fontSize: 14 }}>
          Tip: until the backend exists, the button will report that the optimizer API isn’t available. That’s expected.
        </p>
      )}
    </div>
  )
}

// Mount
const el = document.getElementById("bms-ai-root")!
createRoot(el).render(<BmsAiApp />)
