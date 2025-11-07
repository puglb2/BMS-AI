// api/chat/index.js
// BMS AI backend — packages + providers support with prompt/token discipline (no unsupported params)

const fs = require("fs");
const path = require("path");

// ===== Tunables =====
const MAX_HISTORY_TURNS = 20;        // shorter history → smaller prompt
const DEFAULT_TEMP = 1;              // per your requirement
const DEFAULT_MAX_TOKENS = 4096;     // you want 4096 cap; we constrain with instructions

// Dataset prompt budgets (keep prompt small)
const PKG_CHAR_BUDGET   = 4000;      // ~4k chars from packages max
const PKG_LINES_BUDGET  = 30;        // hard cap on package lines
const PROV_CHAR_BUDGET  = 4000;      // ~4k chars from providers max
const PROV_LINES_BUDGET = 36;        // hard cap on provider lines

// Output-length guidance (instructional)
const LENGTH_PROFILE = {
  firstTurn:  "Use a friendly client-facing tone. ≤6 short lines.",
  laterTurns: "Use a friendly client-facing tone. ≤5 short lines."
};

// ===== Utils =====
const norm = (v) => (v || "").toString().trim();
const readIfExists = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };

// ===== Globals =====
let SYS_PROMPT = "";
let PACKAGES_TEXT = "";   // raw YAML (if present)
let PACKAGES = null;      // JSON (if present)
let PROVIDERS_TXT = "";   // raw providers file
let PROVIDERS = [];       // parsed providers

// ===== Config load (API-bundled files first) =====
function initConfig() {
  if (SYS_PROMPT) return;

  const cfgDir  = path.join(__dirname, "../_config");
  const dataDir = path.join(__dirname, "../_data");

  // System prompt (file is optional; we also add dynamic guidance below)
  SYS_PROMPT = readIfExists(path.join(cfgDir, "system_prompt.txt")).trim();
  if (!SYS_PROMPT) {
    SYS_PROMPT = `
You are BMS AI — a friendly, knowledgeable assistant for Body Mind Spirit (BMS) clients.
Help people understand and compare memberships and prepaid bundles. Keep it simple and reassuring.
Avoid overly technical wording. If something isn't listed, say staff can confirm.

Tone: supportive and clear, like a front desk care coordinator. Explain unfamiliar terms briefly.
Format: plain sentences (no markdown). Short, readable lines.
`.trim();
  }
  if (SYS_PROMPT.length > 1400) SYS_PROMPT = SYS_PROMPT.slice(0, 1400); // safety belt

  // Data files (prefer api/_data, fallback to repo root)
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
    PACKAGES_TEXT = readIfExists(rootYaml);
  }

  // Providers file
  let provPath = path.join(dataDir, "providers.txt");
  if (!fs.existsSync(provPath)) {
    provPath = path.resolve(process.cwd(), "providers.txt");
  }
  PROVIDERS_TXT = readIfExists(provPath);
  PROVIDERS = parseProviders(PROVIDERS_TXT);
}

// ===== Parse providers.txt (simple, Polaris-like but lighter) =====
function parseProviders(raw) {
  if (!raw || !raw.trim()) return [];
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let cur = [];
  for (const line of lines) {
    const s = (line || "").trim();
    if (!s) { cur.push(""); continue; }
    if (/^prov_\d+\b/i.test(s)) { if (cur.length) blocks.push(cur); cur = [s]; }
    else cur.push(s);
  }
  if (cur.length) blocks.push(cur);

  const out = [];
  for (const arr of blocks) {
    if (!arr.length) continue;
    const header = arr[0].replace(/[–—−]/g, "-").trim();

    // "prov_001  Name (Creds) – Title" OR "prov_001  Name (Creds)"
    const m = header.match(/^(\S+)\s+(.+?)\s*[–-]\s*(.+)$/) || header.match(/^(\S+)\s+(.+)$/);
    if (!m) continue;
    const id = (m[1] || "").trim();
    const name = (m[2] || "").trim();
    const title = (m[3] || "").trim();

    const rec = { id, name, title, roles:"", services:"", locations:"", insurance:"", email:"" };
    for (let i = 1; i < arr.length; i++) {
      const l = (arr[i] || "").trim();
      if (!l) continue;
      const lower = l.toLowerCase();
      const val = l.includes(":") ? l.split(":").slice(1).join(":").trim() : "";

      if (lower.startsWith("roles:"))       rec.roles = val || rec.roles;
      else if (lower.startsWith("services:"))   rec.services = val || rec.services;
      else if (lower.startsWith("locations:"))  rec.locations = val || rec.locations;
      else if (lower.startsWith("insurance:"))  rec.insurance = val || rec.insurance;
      else if (lower.startsWith("email:"))      rec.email = val || rec.email;
    }
    out.push(rec);
  }
  return out;
}

// ===== Build packages context (filtered & small) =====
const CATEGORY_KEYWORDS = [
  { key: "iv",          rx: /\b(iv|drip|infusion|nad\+?)\b/i,               cats: ["iv_therapy","iv","nad"] },
  { key: "nad",         rx: /\bnad\+?\b/i,                                  cats: ["iv_therapy","nad"] },
  { key: "massage",     rx: /\b(massage|medical\s*massage)\b/i,             cats: ["medical_massage","massage"] },
  { key: "acupuncture", rx: /\b(acupuncture|acu|tcm)\b/i,                   cats: ["acupuncture"] },
  { key: "shockwave",   rx: /\b(shock\s*wave|shockwave|eswt)\b/i,           cats: ["shockwave","extracorporeal"] },
  { key: "quantity",    rx: /\b(pack(age|s)?|bundle|sessions?|visits?)\b/i, cats: ["iv_therapy","medical_massage","acupuncture","shockwave"] }
];

function buildCatalogSummary() {
  if (PACKAGES && typeof PACKAGES === "object") {
    const cats = Object.keys(PACKAGES);
    return `Catalog: ${cats.slice(0,8).join(", ")}${cats.length>8?" ...":""}`;
  }
  if (PACKAGES_TEXT) {
    const lines = PACKAGES_TEXT.split(/\r?\n/);
    const keys = [];
    for (const l of lines) {
      const m = l.match(/^([A-Za-z0-9_ -]+):\s*$/);
      if (m && !/^\s/.test(l)) keys.push(m[1].trim());
      if (keys.length >= 8) break;
    }
    return keys.length ? `Catalog: ${keys.join(", ")}` : "Catalog: general memberships and packages";
  }
  return "Catalog: (no data loaded)";
}

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

function buildPackagesContextFiltered(userMessage = "", historyLen = 0) {
  const msg = (userMessage || "").toLowerCase();
  let catHints = new Set();
  for (const def of CATEGORY_KEYWORDS) {
    if (def.rx.test(msg)) def.cats.forEach(c => catHints.add(c));
  }
  const minimalFirstTurn = historyLen === 0 && catHints.size === 0;

  if (PACKAGES && typeof PACKAGES === "object") {
    const lines = [];
    const cats = Object.keys(PACKAGES);
    const pickCats = catHints.size ? cats.filter(c => catHints.has(c.toLowerCase())) : cats;

    for (const cat of pickCats) {
      const items = Array.isArray(PACKAGES[cat]) ? PACKAGES[cat] : [];
      if (!items.length) continue;
      lines.push(`${cat}:`);
      for (const it of items) {
        const name  = (it.name || "").toString().trim();
        const price = (it.price || "").toString().trim();
        const type  = (it.type  || "").toString().trim() || "package/membership";
        const perks = Array.isArray(it.perks) ? `; perks: ${it.perks.slice(0,3).join("; ")}` : "";
        lines.push(`- ${name}${price ? " — "+price : ""}; ${type}${perks}`);
      }
    }
    const capped = hardCapLines(lines, PKG_LINES_BUDGET, PKG_CHAR_BUDGET);
    if (capped.length === 0 || minimalFirstTurn) return buildCatalogSummary();
    return capped.join("\n");
  }

  if (PACKAGES_TEXT) {
    const all = PACKAGES_TEXT.split(/\r?\n/);
    let selected = [];
    if (catHints.size) {
      const termRx = new RegExp(
        Array.from(catHints).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "i"
      );
      for (let i = 0; i < all.length; i++) {
        if (termRx.test(all[i])) {
          selected.push(...all.slice(Math.max(0, i-2), Math.min(all.length, i+3)));
        }
      }
    }
    const linesToUse = (selected.length ? selected : all);
    const capped = hardCapLines(linesToUse, PKG_LINES_BUDGET, PKG_CHAR_BUDGET);
    if (capped.length === 0 || minimalFirstTurn) return buildCatalogSummary();
    return capped.join("\n");
  }

  return "Packages: (none loaded)";
}

// ===== Build providers context (filtered & small) =====
const INSURANCE_WORDS = ["aetna","bcbs","blue cross","blue shield","cigna","uhc","unitedhealthcare","medicare","medicaid","humana","tricare","triwest","cash","self-pay","self pay","cash pay","medicare advantage"];
const LOCATION_HINTS = ["north","south","mesa","interquest"];
const SERVICE_HINTS  = ["iv","infusion","nad","massage","acupuncture","shock","shockwave","eswt","chiropractic","hormone","gut","women","men","executive"];

function includesAny(hay, words){
  const s = (hay||"").toLowerCase();
  return words.some(w => s.includes(w));
}

function buildProviderContextFiltered(userMessage = "") {
  if (!Array.isArray(PROVIDERS) || !PROVIDERS.length) return "";

  const msg = (userMessage || "").toLowerCase();
  const wantsInsurance = INSURANCE_WORDS.filter(w => msg.includes(w));
  const wantsLocation  = LOCATION_HINTS.filter(w => msg.includes(w));
  const wantsServices  = SERVICE_HINTS.filter(w => msg.includes(w));

  let scored = PROVIDERS.map(p => {
    let s = 0;
    // insurance match
    if (wantsInsurance.length && includesAny(p.insurance, wantsInsurance)) s += 3;
    // location match
    if (wantsLocation.length && includesAny(p.locations, wantsLocation)) s += 2;
    // service match
    if (wantsServices.length && includesAny(p.services, wantsServices)) s += 2;
    return { p, s };
  });

  // If no hints at all, still provide a small sample directory
  if (!(wantsInsurance.length || wantsLocation.length || wantsServices.length)) {
    scored = PROVIDERS.map(p => ({ p, s: 0 }));
  }

  scored.sort((a,b) => b.s - a.s);

  const lines = [];
  for (const {p} of scored) {
    const L = (p.locations || "").replace(/\s+/g, " ").trim();
    const I = (p.insurance || "").replace(/\s+/g, " ").trim();
    const S = (p.services  || "").replace(/\s+/g, " ").trim();

    const line = [
      p.id,
      p.name,
      p.title ? `— ${p.title}` : "",
      L ? `; locations: ${L}` : "",
      I ? `; insurance: ${I}` : "",
      S ? `; services: ${S}` : "",
      p.email ? `; email: ${p.email}` : ""
    ].join(" ").trim();

    lines.push(line);
    if (lines.join("\n").length > PROV_CHAR_BUDGET || lines.length >= PROV_LINES_BUDGET) break;
  }

  if (!lines.length) return "";
  return `Providers (filtered):\n${lines.join("\n")}`;
}

// ===== AOAI call (no unsupported params) =====
async function callAOAI(endpoint, deployment, apiVersion, apiKey, messages, temperature, maxTokens) {
  const url = `${endpoint.replace(/\/+$/,"")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      messages,
      temperature,
      max_completion_tokens: maxTokens
      // NOTE: no 'stop' or penalties — your model doesn't support them
    })
  });
  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await resp.json() : { text: await resp.text() };
  return { resp, data };
}

// ===== HTTP handler =====
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

    // GET + debug → diagnostics
    if (method === "GET" && isDebug) {
      const apiVersion = norm(process.env.AZURE_OPENAI_API_VERSION || "");
      const endpoint   = norm(process.env.AZURE_OPENAI_ENDPOINT || "");
      const deployment = norm(process.env.AZURE_OPENAI_DEPLOYMENT || "");
      const apiKey     = norm(process.env.AZURE_OPENAI_API_KEY || "");

      const packagesPreview = PACKAGES
        ? Object.keys(PACKAGES).slice(0, 12)
        : (PACKAGES_TEXT ? PACKAGES_TEXT.split("\n").slice(0, 16) : []);

      const providersPreview = PROVIDERS.slice(0, 6).map(p => ({
        id:p.id, name:p.name, title:p.title, locations:p.locations, insurance:p.insurance
      }));

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
            packages_json: Boolean(PACKAGES),
            providers_txt: Boolean(PROVIDERS_TXT)
          },
          counts: {
            providers: PROVIDERS.length
          },
          packages_preview: packagesPreview,
          providers_preview: providersPreview,
          note: "POST with {message,history} to run the chat; GET here only returns diagnostics."
        }
      };
      return;
    }

    // POST flow
    const message = norm(req.body?.message);
    let history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (history.length > 8) {
      history = [
        { role: "assistant", content: "Summarized earlier discussion: user comparing IV therapy, massage counts, and possibly acupuncture." },
        ...history.slice(-6)
      ];
    }
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

    // Build **filtered** dataset contexts
    const pkgContext  = buildPackagesContextFiltered(message, normalizedHistory.length);
    const provContext = buildProviderContextFiltered(message);

    // Auto-augment the system prompt so it "relays" available data & tone
    const hasPkgs = Boolean(PACKAGES || PACKAGES_TEXT);
    const hasProvs = PROVIDERS.length > 0;
    const dataNotice = [
      "DATA AVAILABILITY:",
      hasPkgs ? "- You have package/membership data to explain and compare." : "- No package data loaded.",
      hasProvs ? "- You have a provider directory with roles, services, locations, and insurance." : "- No provider directory loaded.",
      hasProvs ? "- When provider data is present, ask for the user's insurance plan and preferred location to filter matches." : "",
      "- If a detail is not listed (price, location, availability), say staff can confirm."
    ].filter(Boolean).join("\n");

    const isFirst = normalizedHistory.length === 0;
    const lengthGuard = [
      "STYLE:",
      isFirst ? LENGTH_PROFILE.firstTurn : LENGTH_PROFILE.laterTurns,
      "Use plain sentences. Avoid markdown and heavy punctuation.",
      "If unsure, be transparent and suggest checking with staff."
    ].join("\n");

    // Compose the final system content
    const systemContent = [SYS_PROMPT, dataNotice, pkgContext, provContext, lengthGuard].join("\n\n");

    const messages = [
      { role: "system", content: systemContent },
      ...normalizedHistory,
      ...(message ? [{ role: "user", content: message }] : [])
    ];

    if (isDebug && (!endpoint || !deployment || !apiKey)) {
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
          pkg_context_preview: pkgContext.slice(0, 400) + (pkgContext.length > 400 ? " …" : ""),
          prov_context_preview: provContext.slice(0, 400) + (provContext.length > 400 ? " …" : "")
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
    let reply = norm(choice?.message?.content || "");
    if (!reply) reply = "Sorry — the response was cut off. Want me to summarize options again in a shorter list?";

    const body = isDebug
      ? { ok: true, debug: true, reply, usage: data?.usage, history_len: normalizedHistory.length }
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
