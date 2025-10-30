// chat/index.js
// Minimal Node/Express backend for BMS AI v1 (membership/package picker)
// Reads packages.yaml and exposes /catalog and /optimize endpoints.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import express from "express";
import cors from "cors";
import yaml from "js-yaml";

const app = express();
app.use(express.json());
app.use(cors());

// ----- Config -----
const PORT = Number(process.env.PORT || 8787);
// If you placed packages.yaml at the repo root, this default works.
// If you put it under api/, set BMS_PACKAGES_PATH=api/packages.yaml
const PACKAGES_PATH = process.env.BMS_PACKAGES_PATH || "packages.yaml";

// ----- Load dataset -----
function loadYaml(p) {
  const full = path.resolve(process.cwd(), p);
  const raw = fs.readFileSync(full, "utf-8");
  return yaml.load(raw);
}

let DATA = null;
function loadData() {
  try {
    DATA = loadYaml(PACKAGES_PATH);
    if (!DATA || typeof DATA !== "object") throw new Error("Empty/invalid YAML");
    console.log(`[bms-ai] packages loaded from ${PACKAGES_PATH}`);
  } catch (e) {
    console.error(`[bms-ai] Failed to load ${PACKAGES_PATH}:`, e?.message || e);
    DATA = null;
  }
}
loadData();

// Optional: simple file watcher to reload changes during dev
try {
  const fullWatch = path.resolve(process.cwd(), PACKAGES_PATH);
  fs.watch(fullWatch, { persistent: false }, (ev) => {
    if (ev === "change") {
      console.log("[bms-ai] packages.yaml changed; reloading…");
      loadData();
    }
  });
} catch (_) {
  // ignore watcher errors in prod
}

// ----- Helpers -----

/**
 * Normalize dataset into categories we can reason about.
 * We expect keys: iv_therapy, massage, shockwave, acupuncture, memberships
 * Each item should have: id, name, sessions, price_usd, discount?, location?
 */
function catalogFromData(data) {
  if (!data) return null;
  // Maintain the current categories you provided
  const out = {
    iv_therapy: Array.isArray(data.iv_therapy) ? data.iv_therapy : [],
    massage: Array.isArray(data.massage) ? data.massage : [],
    shockwave: Array.isArray(data.shockwave) ? data.shockwave : [],
    acupuncture: Array.isArray(data.acupuncture) ? data.acupuncture : [],
    memberships: Array.isArray(data.memberships) ? data.memberships : [],
  };
  return out;
}

/**
 * Given a category array (each item has {id, name, sessions, price_usd, ...})
 * and a requested session count `need`, pick the single best package that:
 * - covers >= need sessions (minimize price)
 * - if none cover, pick the one with the lowest price_per_session and report shortfall
 */
function pickBestSinglePackage(categoryItems, need) {
  if (!Array.isArray(categoryItems) || categoryItems.length === 0) {
    return { ok: false, reason: "no_packages" };
  }
  if (typeof need !== "number" || need <= 0) {
    return { ok: true, reason: "nothing_requested", suggestion: null };
  }

  // Filter valid items with numeric sessions/price
  const items = categoryItems
    .map((x) => ({
      ...x,
      sessions: Number(x.sessions ?? 0),
      price_usd: Number(x.price_usd ?? 0),
    }))
    .filter((x) => x.sessions > 0 && x.price_usd > 0);

  if (items.length === 0) return { ok: false, reason: "invalid_items" };

  const covering = items
    .filter((x) => x.sessions >= need)
    .sort((a, b) => a.price_usd - b.price_usd);

  if (covering.length > 0) {
    const best = covering[0];
    return {
      ok: true,
      suggestion: {
        package_id: best.id,
        package_name: best.name,
        price_usd: best.price_usd,
        sessions_included: best.sessions,
        need,
        waste_sessions: Math.max(0, best.sessions - need),
        shortfall_sessions: 0,
        price_per_session: Number((best.price_usd / best.sessions).toFixed(2)),
        notes: best.location ? `Location: ${best.location}` : undefined,
      },
    };
  }

  // No single package covers the need: pick cheapest price-per-session and report shortfall
  const withPps = items.map((x) => ({
    ...x,
    pps: x.price_usd / x.sessions,
  }));
  withPps.sort((a, b) => a.pps - b.pps);
  const best = withPps[0];

  return {
    ok: true,
    suggestion: {
      package_id: best.id,
      package_name: best.name,
      price_usd: best.price_usd,
      sessions_included: best.sessions,
      need,
      waste_sessions: 0,
      shortfall_sessions: Math.max(0, need - best.sessions),
      price_per_session: Number(best.pps.toFixed(2)),
      notes:
        (best.location ? `Location: ${best.location}. ` : "") +
        "Need may require multiple packages or per-session add-ons.",
    },
    caveat:
      "Requested sessions exceed any single package; combination logic not yet implemented.",
  };
}

/**
 * Compute a combined summary across categories.
 */
function optimizePlan(catalog, wants) {
  const result = {
    categories: {},
    total_price_usd: 0,
    caveats: [],
    memberships_considered: [],
  };

  const planKeys = [
    { key: "iv_therapy", label: "IV Therapy" },
    { key: "massage", label: "Medical Massage" },
    { key: "shockwave", label: "Extracorporeal Shock Wave Therapy" },
    { key: "acupuncture", label: "Acupuncture Medicine" },
  ];

  for (const { key, label } of planKeys) {
    const need = Number(wants?.[key] || 0);
    const pick = pickBestSinglePackage(catalog[key], need);
    result.categories[key] = { label, need, ...pick };

    if (pick.ok && pick.suggestion) {
      result.total_price_usd += Number(pick.suggestion.price_usd || 0);
      if (pick.caveat) result.caveats.push(`${label}: ${pick.caveat}`);
    } else if (!pick.ok) {
      result.caveats.push(`${label}: ${pick.reason}`);
    }
  }

  // Membership note: we *cannot* compare the 6-month IV membership fairly
  // without a per-session price for "1 Standard IV".
  const ivMemberships = (catalog.memberships || []).filter((m) =>
    String(m.id || "").toLowerCase().includes("iv_membership")
  );
  if (ivMemberships.length) {
    result.memberships_considered = ivMemberships.map((m) => ({
      id: m.id,
      name: m.name,
      monthly_price_usd: m.monthly_price_usd,
      duration_months: m.duration_months,
      includes: m.includes,
      note:
        "Not auto-compared due to missing single IV per-session price. Add it to compare fairly.",
    }));
  }

  result.total_price_usd = Number(result.total_price_usd.toFixed(2));
  return result;
}

// ----- Routes -----

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    dataset_loaded: Boolean(DATA),
    packages_path: PACKAGES_PATH,
  });
});

app.get("/catalog", (_req, res) => {
  if (!DATA) return res.status(500).json({ error: "packages.yaml not loaded" });
  const catalog = catalogFromData(DATA);
  res.json({ catalog });
});

/**
 * POST /optimize
 * Body: { wants: { iv_therapy?: number, massage?: number, shockwave?: number, acupuncture?: number } }
 */
app.post("/optimize", (req, res) => {
  if (!DATA) return res.status(500).json({ error: "packages.yaml not loaded" });
  const catalog = catalogFromData(DATA);
  const wants = req.body?.wants || {};

  // Basic validation
  for (const k of Object.keys(wants)) {
    if (!["iv_therapy", "massage", "shockwave", "acupuncture"].includes(k)) {
      return res
        .status(400)
        .json({ error: `Unknown service key: ${k}. Allowed: iv_therapy, massage, shockwave, acupuncture.` });
    }
    const v = Number(wants[k]);
    if (!Number.isFinite(v) || v < 0) {
      return res.status(400).json({ error: `Invalid value for ${k}: ${wants[k]}` });
    }
  }

  const plan = optimizePlan(catalog, wants);
  res.json({ plan, wants });
});

// ----- Start -----
app.listen(PORT, () => {
  console.log(`[bms-ai] server running on http://localhost:${PORT}`);
});
