// CommonJS Azure Function: /api/optimize
// Minimal stub so the frontend stops 405'ing; we can add real logic later.

module.exports = async function (context, req) {
  // Handle CORS preflight
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    };
    return;
  }

  try {
    const wants = (req.body && req.body.wants) || {};
    const n = (k) => Math.max(0, Number(wants[k] || 0)) || 0;

    // minimal shape that your UI expects
    const plan = {
      categories: {
        iv_therapy:   { label: "IV Therapy", need: n("iv_therapy"),   suggestion: null },
        massage:      { label: "Medical Massage", need: n("massage"),  suggestion: null },
        shockwave:    { label: "Extracorporeal Shock Wave Therapy", need: n("shockwave"), suggestion: null },
        acupuncture:  { label: "Acupuncture", need: n("acupuncture"),  suggestion: null }
      },
      total_price_usd: 0,
      caveats: ["Optimization logic not wired yet; this endpoint is a stub."]
    };

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { plan, wants }
    };
  } catch (e) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { error: String(e?.message || e) }
    };
  }
};
