// Azure Function: /api/optimize  (CommonJS)
// Accepts POST/GET/OPTIONS so we can test via browser and avoid 405 preflight.

module.exports = async function (context, req) {
  const method = String(req.method || "").toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    context.res = {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    };
    return;
  }

  // Simple GET for sanity check in browser
  if (method === "GET") {
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { ok: true, route: "optimize", note: "GET reached the function. POST from the app should work too." }
    };
    return;
  }

  // Normal POST
  try {
    const wants = (req.body && req.body.wants) || {};
    const n = (k) => Math.max(0, Number(wants[k] || 0)) || 0;

    const plan = {
      categories: {
        iv_therapy:  { label: "IV Therapy", need: n("iv_therapy"), suggestion: null },
        massage:     { label: "Medical Massage", need: n("massage"), suggestion: null },
        shockwave:   { label: "Extracorporeal Shock Wave Therapy", need: n("shockwave"), suggestion: null },
        acupuncture: { label: "Acupuncture", need: n("acupuncture"), suggestion: null }
      },
      total_price_usd: 0,
      caveats: ["Stub: add real optimizer once dataset is finalized."]
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
