import fs from "node:fs";
import path from "node:path";

export default async function (context, req) {
  // Handle CORS preflight if you hit this from the browser
  if (req.method === "OPTIONS") {
    return {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    };
  }

  try {
    const apiVersion = String(process.env.AZURE_OPENAI_API_VERSION || "").trim();
    const endpoint   = String(process.env.AZURE_OPENAI_ENDPOINT || "").trim();
    const deployment = String(process.env.AZURE_OPENAI_DEPLOYMENT || "").trim();

    const search = {
      endpoint: String(process.env.AZURE_SEARCH_ENDPOINT || "").trim(),
      index: String(process.env.AZURE_SEARCH_INDEX || "").trim(),
      semantic: String(process.env.AZURE_SEARCH_SEMANTIC_CONFIG || "").trim()
    };

    const emr = {
      base: String(process.env.EMR_BASE_URL || "").trim(),
      hasKey: Boolean(String(process.env.EMR_API_KEY || "").trim())
    };

    // Looks for config files under api/_config/
    const cfgDir = path.resolve(process.cwd(), "api", "_config");
    const files = {
      system_prompt: fs.existsSync(path.join(cfgDir, "system_prompt.txt")),
      faqs:          fs.existsSync(path.join(cfgDir, "faqs.txt")),
      policies:      fs.existsSync(path.join(cfgDir, "policies.txt"))
    };

    return {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: {
        aoai: { endpoint: Boolean(endpoint), deployment: Boolean(deployment), apiVersion },
        search: { configured: Boolean(search.endpoint && search.index), ...search, masked: true },
        emr: { configured: Boolean(emr.base), apiKey: emr.hasKey },
        files
      }
    };
  } catch (e) {
    return {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: { error: String(e?.message || e) }
    };
  }
}
