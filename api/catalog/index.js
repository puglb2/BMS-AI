import fs from "node:fs";
import path from "node:path";

function loadYamlMaybe(filePath) {
  try {
    const yaml = JSON.parse('{"noop":true}'); // placeholder if js-yaml isn’t installed
    return yaml; // not used here; keeping minimal
  } catch { return null; }
}

export default async function (context, req) {
  // Minimal placeholder: if you have packages.yaml at repo root, return a stub
  const file = path.resolve(process.cwd(), "packages.yaml");
  const exists = fs.existsSync(file);
  return {
    status: 200,
    body: { ok: true, packages_present: exists }
  };
}
