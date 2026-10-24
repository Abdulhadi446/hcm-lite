/**
 * Vendors the face models used by the browser engine (@vladmandic/human) into
 * public/models so they are served from our own origin (no CDN at runtime).
 * Runs on postinstall; safe to re-run.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@vladmandic", "human", "models");
const dest = join(root, "public", "models");
const files = [
  "blazeface.json", "blazeface.bin",
  "facemesh.json", "facemesh.bin",
  "faceres.json", "faceres.bin",
  "antispoof.json", "antispoof.bin",
];

if (!existsSync(src)) {
  console.log("[models] @vladmandic/human not installed — skipping model copy");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
let copied = 0;
for (const file of files) {
  const from = join(src, file);
  if (!existsSync(from)) continue;
  copyFileSync(from, join(dest, file));
  copied += 1;
}
console.log(`[models] copied ${copied} face model files to public/models`);
