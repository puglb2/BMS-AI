// api/chat/index.js
// BMS AI backend with debug mode (?debug=1) and TOKEN-SAFE dataset filtering

const fs = require("fs");
const path = require("path");

const MAX_HISTORY_TURNS = 10;       // ↓ tighter history to save tokens
const DEFAULT_TEMP = 1;
const DEFAULT_MAX_TOKENS = 512;     // ↓ smaller model output to stay under total limits
const DEBUG_PREVIEW_LINES = 16;

// Hard budgets for dataset context (controls *prompt tokens*)
const PKG_CHAR_BUDGET  = 1200;      // ~1.2k chars max from packages
const PKG_LINES_BUDGET = 30;        // cap lines in context

const norm = (v) => (v || "").toString().trim();
const readIfExists = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };

let SYS_PROMPT = "";
let PACKAGES_TEXT = "";   // raw YAML (if present)
let PACKAGES = null;      // parsed JSON (if present)

// -------------------------
// INIT: read prompt + data
// -------------------------
function initConfig() {
  if (SYS_PROMPT) return;

  const cfgDir  = path.join(__dirname, "../_config");
  const dataDir = path.join(__dirname, "../_data");

  // Prompt file (preferred)
  SYS_PROMPT = readIfExists(path.join(cfgDir, "system_prompt.txt")).trim();
  if (!SYS_PROMPT) {
    SYS_PROMPT = `
You are BMS AI, a helpful assistant that explains and compares BMS memberships and service bundles.
- Be concise and factual. If data is missing, say so clearly.
- Focus on IV therapy, medical massage, acupuncture, shockwave, and similar services.
- If the user gives quantities (e.g., "5 massages"), respond with guidance on memberships/bundles that might fit, based ONLY on available data.
`.trim();
  }

  // Data files (prefer api/_data, fallback to repo root if not found)
  let rootYaml = path.join(dataDir, "packages.yaml");
  let rootJson = path.join(dataDir, "packages.json");
  if (!fs.existsSync(rootYaml) && !fs.existsSync(rootJson)) {
    rootYaml = path.resolve(process.cwd(), "packages.yaml");
    rootJson = path.resolve(process.cwd(), "packages.json");
  }

  if (fs.existsSync(rootJson)) {
    const txt = readIfExists(rootJson);
    try { PACKAGES = JSON.parse(txt); } catch { PACKAGES = null; }
    PACKAGES_TEXT = "";
  } else {
    // YAML raw text (we won’t parse to keep deps 0)
    PACKAGES_TEXT = readIfExists(rootYaml);
  }
}

// -------------------------
// SMALL, RELEVANT CONTEXT
// -------------------------

// Keyword map → which category/terms we’ll include
const CATEGORY_KEYWORDS = [
  { key: "iv",          rx: /\b(iv|drip|infusion|nad\+?)\b/i,              cats: ["iv_therapy","iv","nad"] },
  { key: "nad",         rx: /\bnad\+?\b/i,                                 cats: ["iv_therapy","nad"] },
  { key: "massage",     rx: /\b(massage|medical\s*massage)\b/i,            cats: ["medical_massage","massage"] },
  { key: "acupuncture", rx: /\b(acupuncture|acu|tcm)\b/i,                  cats: ["acupuncture"] },
  { key: "shockwave",   rx: /\b(shock\s*wave|shockwave|eswt)\b/i,          cats: ["shockwave","extracorporeal"] },
  // generic quantity/visit words help pull packages instead of memberships-only answers
  { key: "quantity",    rx: /\b(pack(age|s)?|bundle|sessions?|visits?)\b/i, cats: ["iv_therapy","medical_massage","acupuncture","shockwave"] }
];

// Build a tiny catalog summary (used when we can’t match anything confidently)
function buildCatalogSummary() {
  if (PACKAGES && typeof PACKAGES === "object") {
    const cats = Object.keys(PACKAGES);
    return `# Catalog\n${cats.slice(0,8).join(", ")}${cats.length>8?" ...":""}`;
  }
  if (PACKAGES_TEXT) {
    // Extract likely top-level YAML keys (lines without indentation ending with ':')
    const lines = PACKAGES_TEXT.split(/\r?\n/);
    const keys = [];
    for (const l of lines) {
      const m = l.match(/^([A-Za-z0-9_ -]+):\s*$/);
      if (m && !/^\s/.test(l)) keys.push(m[1].trim());
      if (keys.length >= 8) break;
    }
    return keys.length ? `# Catalog\n${keys.join(", ")}` : "# Catalog\n(general memberships and packages)";
  }
  return "# Catalog\n(no data loaded)";
}

// Truncate helpers
function hardCapLines(lines, maxLines, maxChars) {
  const out = [];
  let used = 0;
  for (const line of lines) {
    const add = line.length + 1;
    if (out.length >= maxLines || used + add > maxChars) break;
    out.push(line);
    used += add;
  }
  return out;
}

// Build a compact, **filtered** context based on the user message
function buildPackagesContextFiltered(userMessage = "", historyLen = 0) {
  const msg = (userMessage || "").toLowerCase();

  // Decide which categories to include
  let catHints = new Set();
  for (const def of CATEGORY_KEYWORDS) {
    if (def.rx.test(msg)) def.cats.forEach(c => catHints.add(c));
  }

  // On very first turn with no clear signal, keep context tiny
  const minimalFirstTurn = historyLen === 0 && catHints.size === 0;

  // If we have structured JSON, emit compact lines for matched categories/items
  if (PACKAGES && typeof PACKAGES === "object") {
    const lines = [];
    const cats = Object.keys(PACKAGES);

    const pickCats = catHints.size ? cats.filter(c => catHints.has(c.toLowerCase())) : cats;

    for (const cat of pickCats) {
      const items = Array.isArray(PACKAGES[cat]) ? PACKAGES[cat] : [];
      if (!items.length) continue;

      // Header for category
      lines.push(`# ${cat}`);

      for (const it of items) {
        const name  = (it.name || "").toString().trim();
        const price = (it.price || "").toString().trim();
        const type  = (it.type  || "").toString().trim() || "package/membership";
        const perks = Array.isArray(it.perks) ? ` | perks: ${it.perks.slice(0,3).join("; ")}` : "";
        lines.push(`- ${name}${price ? " | "+price : ""} | ${type}${perks}`);
      }
    }

    const capped = hardCapLines(lines, PKG_LINES_BUDGET, PKG_CHAR_BUDGET);
    if (capped.length === 0 || minimalFirstTurn) {
      // Fall back to tiny catalog
      return buildCatalogSummary();
    }
    return capped.join("\n");
  }

  // Otherwise, we have raw YAML text: filter by keywords & cap hard
  if (PACKAGES_TEXT) {
    const all = PACKAGES_TEXT.split(/\r?\n/);

    let selected = [];
    if (catHints.size) {
      const termRx = new RegExp(
        Array.from(catHints).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "i"
      );
      for (const l of all) {
        if (termRx.test(l)) selected.push(l);
      }
      if (selected.length < 6) {
        // include nearby lines to give context
        selected = [];
        for (let i = 0; i < all.length; i++) {
          if (termRx.test(all[i])) {
            selected.push(
              ...all.slice(Math.max(0, i-2), Math.min(all.length, i+3))
            );
          }
        }
      }
    }

    const linesToUse = (selected.length ? selected : all);
    const capped = hardCapLines(linesToUse, PKG_LINES_BUDGET, PKG_CHAR_BUDGET);
    if (capped.length === 0 || minimalFirstTurn) {
      return buildCatalogSummary();
    }
    return ["# Packages (filtered excerpt)", "```yaml", ...capped, "```"].join("\n");
  }

  return "# Packages: (none loaded)";
}

// -------------------------
// AOAI call
// -------------------------
async function callAOAI(endpoint, deployment, apiVersion, apiKey, messages, temperature, maxTokens) {
  const url = `${endpoint.replace(/\/+$/,"")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({ messages, temperature, max_completion_tokens: maxTokens })
  });
  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await resp.json() : { text: await resp.text() };
  return { resp, data };
}

// -------------------------
// HTTP handler
// -------------------------
module.exports = async function (context, req) {
  const method = String(req.method || "").toUpperCase();
  const isDebug = norm(req.query?.debug) === "1";

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

  try {
    initConfig();

    // GET + debug -> diagnostics
    if (method === "GET" && isDebug) {
      const apiVersion = norm(process.env.AZURE_OPENAI_API_VERSION || "");
      const endpoint   = norm(process.env.AZURE_OPENAI_ENDPOINT || "");
      const deployment = norm(process.env.AZURE_OPENAI_DEPLOYMENT || "");
      const apiKey     = norm(process.env.AZURE_OPENAI_API_KEY || "");

      const packagesPreview = PACKAGES
        ? Object.keys(PACKAGES).slice(0, 12)
        : (PACKAGES_TEXT ? PACKAGES_TEXT.split("\n").slice(0, DEBUG_PREVIEW_LINES) : []);

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: {
          ok: true,
          route: "chat",
          debug: true,
          env: {
            aoaiConfigured: Boolean(endpoint && deployment && apiKey),
            apiVersion,
            endpointPresent: Boolean(endpoint),
            deploymentPresent: Boolean(deployment),
            apiKeyPresent: Boolean(apiKey)
          },
          files_present: {
            system_prompt: Boolean(SYS_PROMPT),
            packages_yaml: Boolean(PACKAGES_TEXT),
            packages_json: Boolean(PACKAGES)
          },
          packages_preview: packagesPreview,
          note: "POST with {message,history} to run the chat; GET here only returns diagnostics."
        }
      };
      return;
    }

    // POST flow
    const message = norm(req.body?.message);
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const normalizedHistory = history
      .slice(-MAX_HISTORY_TURNS)
      .map(m => ({ role: m?.role === "assistant" ? "assistant" : "user", content: norm(m?.content) }))
      .filter(m => m.content);

    if (!message && !isDebug) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: { error: "message required" }
      };
      return;
    }

    const apiVersion = norm(process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview");
    const endpoint   = norm(process.env.AZURE_OPENAI_ENDPOINT || "");
    const deployment = norm(process.env.AZURE_OPENAI_DEPLOYMENT || "");
    const apiKey     = norm(process.env.AZURE_OPENAI_API_KEY || "");

    // Build **filtered** dataset context based on user message
    const pkgContext = buildPackagesContextFiltered(message, normalizedHistory.length);
    const systemContent = [SYS_PROMPT, "", pkgContext].join("\n");

    const messages = [
      { role: "system", content: systemContent },
      ...normalizedHistory,
      ...(message ? [{ role: "user", content: message }] : [])
    ];

    if (isDebug && (!endpoint || !deployment || !apiKey)) {
      // Early return with diagnostics; do not call LLM
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: {
          ok: true,
          debug: true,
          will_call_llm: false,
          reason: "Azure OpenAI not fully configured (missing endpoint/deployment/key).",
          env: {
            apiVersion,
            endpointPresent: Boolean(endpoint),
            deploymentPresent: Boolean(deployment),
            apiKeyPresent: Boolean(apiKey)
          },
          messages_preview: messages.slice(0, 3),
          history_len: normalizedHistory.length,
          pkg_context_preview: pkgContext.slice(0, 400) + (pkgContext.length > 400 ? " …" : "")
        }
      };
      return;
    }

    // Call AOAI
    const { resp, data } = await callAOAI(endpoint, deployment, apiVersion, apiKey, messages, DEFAULT_TEMP, DEFAULT_MAX_TOKENS);
    if (!resp.ok) {
      context.res = {
        status: resp.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: { error: "LLM error", detail: data }
      };
      return;
    }

    const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
    const reply = norm(choice?.message?.content) || "(no reply received)";

    const body = isDebug
      ? {
          ok: true,
          debug: true,
          reply,
          usage: data?.usage,
          history_len: normalizedHistory.length
        }
      : { reply };

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body
    };
  } catch (e) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { error: String(e?.message || e) }
    };
  }
};
