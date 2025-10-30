export default async function (context, req) {
  const wants = req.body?.wants || {};
  // Minimal echo so the UI works.
  // Later, replace with real optimization logic (or call your Node/FastAPI).
  return {
    status: 200,
    body: {
      plan: {
        categories: {
          iv_therapy: { label: "IV Therapy", need: Number(wants.iv_therapy || 0), suggestion: null },
          massage: { label: "Medical Massage", need: Number(wants.massage || 0), suggestion: null },
          shockwave: { label: "Extracorporeal Shock Wave Therapy", need: Number(wants.shockwave || 0), suggestion: null },
          acupuncture: { label: "Acupuncture", need: Number(wants.acupuncture || 0), suggestion: null }
        },
        total_price_usd: 0
      },
      wants
    }
  };
}
