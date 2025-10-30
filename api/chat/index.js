// api/chat/index.js  (Azure Functions - CommonJS)
// Tailored for BMS "memberships & services" instead of behavioral-health provider matching.

const fs = require("fs");
const path = require("path");

// ---------------------- Tunables ----------------------
const MAX_HISTORY_TURNS = 20;
const DEFAULT_TEMP = 0.8;
const DEFAULT_MAX_COMPLETION_TOKENS = 1024;
const DEBUG_MAX_LINES = 12; // debug preview brevity

// ---------------------- Helpers ----------------------
function norm(v) { return (v || "").toString().trim(); }
function readIfExists(p) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }

function jsonTryParse(s, fallback = null) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ---------------------- Config / Data ----------------------
let SYS_PROMPT = "";
let PACKAGES_TEXT = "";
let PACKAGES = null; // if you store JSON instead of YAML, we’ll parse it

function initConfigOnce() {
  if (SYS_PROMPT) return; // cold start only

  const cfgDir  = path.join(__dirname, "../_config");
  const sysPath = path.join(cfgDir, "system_prompt.txt");
  SYS_PROMPT = readIfExists(sysPath).trim();

  // Add BMS framing if no custom system prompt is present
  if (!SYS_PROMPT) {
    SYS_PROMPT = `
You are BMS AI, a helpful assistant that guides patients through memberships and service packages.
- Clarify user goals and budget.
- Explain options honestly and concisely.
- Do not invent package details you don't have; say what you do and don't know.
- If the user provides quantities (e.g., "5 massage sessions"), reason about bundles vs. membership using the data supplied below.
`.trim();
  }

  // Load package dataset (support either YAML-as-text or JSON)
  // If you keep your canonical file at repo root: packages.yaml (or .json)
  // Prefer JSON if you want parsing without extra deps.
  const rootPackages = path.resolve(process.cwd(), "packages.yaml");
  const rootPackagesJson = path.resolve(process.cwd(), "packages.json");
  if (fs.existsSync(rootPackagesJson)) {
    PACKAGES_TEXT = readIfExists(rootPackagesJson);
    PACKAGES = jsonTryParse(PACKAGES_TEXT, null);
  } else {
    PACKAGES_TEXT = readIfExists(rootPackages); // keep as raw text (YAML) to include in context
    PACKAGES = null; // no YAML parser here by default
  }
}

// Build a concise, token-friendly context from your packages file
function buildPackagesContext() {
  if (!PACKAGES_TEXT && !PACKAGES) return "# Packages: (no dataset found)";
  if (PACKAGES) {
    // JSON path: summarize quickly
    const keys = Object.keys(PACKAGES);
    const head = keys.slice(0, 8).join(", ");
    return [
      "# Packages (JSON summary)",
      `Top-level keys: ${head}${keys.length > 8 ? " ..." : ""}`,
      "Tip: ask me for specific categories if needed."
    ].join("\n");
  }
  // YAML/text path: include only first ~1500 chars to keep token cost sane
  const slice = PACKAGES_TEXT.slice(0, 1500);
  return [
    "# Packages (YAML excerpt)",
    "Below is a truncated excerpt of the packages file. Do not assume missing details.",
    "```yaml",
    slice,
    (PACKAGES_TEXT.length > slice.length ? "\n# ... (truncated) ..." : ""),
    "```"
  ].join("\n");
}

// Simple safety shim (non-behavioral-health). We just avoid obviously risky queries.
const BLOCK_LIST = [
  /\bkill (myself|him|her|them)\b/i,
  /\bsuicide\b/i,
  /\bmake a bomb\b/i,
  /\bcredit card number\b/i
];

// ---------------------- OpenAI (Azure) ----------------------
async function callAOAIChat(endpoint, deployment, apiVersion, apiKey, messages, temperature, maxTokens) {
  const url = `${endpoint.replace(/\/+$/,"")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      messages,
      temperature,
      max_completion_tokens: maxTokens
    })
  });
  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await resp.json() : { text: await resp.text() };
  return { resp, data };
}

// ---------------------- Main Azure Function ----------------------
module.exports = async function (context, req) {
  // CORS / Preflight
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
    initConfigOnce();

    const userMessage = norm(req.body?.message);
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const normalizedHistory = history
      .slice(-MAX_HISTORY_TURNS)
      .map(m => ({ role: m?.role === "assistant" ? "assistant" : "user", content: norm(m?.content) }))
      .filter(m => m.content);

    if (!userMessage) {
      context.res = { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: { error: "message required" } };
      return;
    }

    // lightweight safety
    if (BLOCK_LIST.some(rx => rx.test(userMessage))) {
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: { reply: "I can’t help with that. If you want to discuss memberships or services, tell me what you’re trying to accomplish and your monthly budget." }
      };
      return;
    }

    // AOAI env
    const apiVersion = norm(process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview");
    const endpoint   = norm(process.env.AZURE_OPENAI_ENDPOINT || "");
    const deployment = norm(process.env.AZURE_OPENAI_DEPLOYMENT || "");
    const apiKey     = norm(process.env.AZURE_OPENAI_API_KEY || "");

    // Compose system context with packages data
    const packagesContext = buildPackagesContext();
    const systemContent = [
      SYS_PROMPT,
      "",
      packagesContext,
      "",
      "# Guidelines",
      "- If the user supplies quantities (e.g., massage sessions), acknowledge and outline which listed bundles or memberships might fit.",
      "- If data is missing, say so plainly and suggest next steps to confirm pricing or inclusions.",
      "- Keep answers concise; offer to break down costs when asked."
    ].join("\n");

    const messages = [
      { role: "system", content: systemContent },
      ...normalizedHistory,
      { role: "user", content: userMessage }
    ];

    const requestedMax = Number.isFinite(req.body?.max_output_tokens) ? req.body.max_output_tokens : 0;
    const maxTokens = Math.max(requestedMax, DEFAULT_MAX_COMPLETION_TOKENS);

    // If AOAI isn’t configured yet, return a friendly placeholder
    if (!endpoint || !deployment || !apiKey) {
      const fallback = "Hi! I can help you compare BMS memberships and service bundles. Tell me what you’re looking for (e.g., “6 acupuncture sessions per month and occasional IV therapy”).";
      context.res = { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: { reply: fallback } };
      return;
    }

    // Call Azure OpenAI
    const { resp, data } = await callAOAIChat(endpoint, deployment, apiVersion, apiKey, messages, DEFAULT_TEMP, maxTokens);
    if (!resp.ok) {
      context.res = {
        status: resp.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: { error: "LLM error", status: resp.status, detail: data }
      };
      return;
    }

    const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
    let reply = norm(choice?.message?.content) || "I’m here to help you compare memberships and packages.";

    // Debug mode: ?debug=1
    if (norm(req.query?.debug) === "1") {
      const pkPreview = PACKAGES
        ? Object.keys(PACKAGES).slice(0, 8)
        : (PACKAGES_TEXT ? PACKAGES_TEXT.split("\n").slice(0, DEBUG_MAX_LINES) : []);
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: {
          reply,
          usage: data?.usage,
          files_present: { packages_file: Boolean(PACKAGES_TEXT) },
          packages_preview: pkPreview
        }
      };
      return;
    }

    // Normal response
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { reply }
    };
  } catch (e) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { error: "server error", detail: String(e?.message || e) }
    };
  }
};
