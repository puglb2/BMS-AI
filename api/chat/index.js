// api/chat/index.js
// Single-entry BMS AI backend: membership + services assistant (no optimize route)

const fs = require("fs");
const path = require("path");

const MAX_HISTORY_TURNS = 20;
const DEFAULT_TEMP = 0.8;
const DEFAULT_MAX_TOKENS = 1024;

const norm = (v) => (v || "").toString().trim();
const readIfExists = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };

let SYS_PROMPT = "";
let PACKAGES_TEXT = "";
let PACKAGES = null;

function initConfig() {
  if (SYS_PROMPT) return;

  const cfgDir = path.join(__dirname, "../_config");
  SYS_PROMPT = readIfExists(path.join(cfgDir, "system_prompt.txt")).trim();

  if (!SYS_PROMPT) {
    SYS_PROMPT = `
You are BMS AI, a helpful assistant that explains and compares BMS memberships and service bundles.
- Be concise and factual. If data is missing, say so clearly.
- Focus on IV therapy, medical massage, acupuncture, shockwave, and similar services.
- If the user gives quantities (e.g., "5 massages"), respond with guidance on memberships/bundles that might fit, based ONLY on available data.
`.trim();
  }

  // Load dataset (prefer JSON if present; otherwise keep YAML excerpt as context text)
  const rootYaml = path.resolve(process.cwd(), "packages.yaml");
  const rootJson = path.resolve(process.cwd(), "packages.json");

  if (fs.existsSync(rootJson)) {
    const txt = readIfExists(rootJson);
    try { PACKAGES = JSON.parse(txt); } catch { PACKAGES = null; }
    PACKAGES_TEXT = "";
  } else {
    PACKAGES_TEXT = readIfExists(rootYaml);
  }
}

function buildPackagesContext() {
  if (PACKAGES) {
    const keys = Object.keys(PACKAGES);
    return `# Packages Summary\n${keys.slice(0, 8).join(", ")}${keys.length > 8 ? " ..." : ""}`;
  }
  if (PACKAGES_TEXT) {
    const sample = PACKAGES_TEXT.slice(0, 1500);
    return [
      "# Packages (excerpt)",
      "```yaml",
      sample,
      PACKAGES_TEXT.length > sample.length ? "\n# ...truncated..." : "",
      "```"
    ].join("\n");
  }
  return "# Packages: (none loaded)";
}

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

  // Quick GET sanity check
  if (method === "GET") {
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { ok: true, route: "chat", note: "POST with {message,history} to chat." }
    };
    return;
  }

  try {
    initConfig();

    const message = norm(req.body?.message);
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const normalizedHistory = history
      .slice(-MAX_HISTORY_TURNS)
      .map(m => ({ role: m?.role === "assistant" ? "assistant" : "user", content: norm(m?.content) }))
      .filter(m => m.content);

    if (!message) {
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

    const pkgContext = buildPackagesContext();
    const systemContent = [SYS_PROMPT, "", pkgContext].join("\n");

    const messages = [
      { role: "system", content: systemContent },
      ...normalizedHistory,
      { role: "user", content: message }
    ];

    // If OpenAI not configured yet, friendly fallback
    if (!endpoint || !deployment || !apiKey) {
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: { reply: "Hi! I can help you understand BMS memberships and service packages. What are you looking for?" }
      };
      return;
    }

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

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { reply }
    };
  } catch (e) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { error: String(e?.message || e) }
    };
  }
};
