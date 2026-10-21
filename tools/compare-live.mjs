// Checks that a live site serves exactly the files in this checkout.
//
//   node tools/compare-live.mjs                      against https://key-inside.vercel.app
//   node tools/compare-live.mjs https://example.com
//
// Needs Node 18 or newer. No keys or private files involved.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] || "https://key-inside.vercel.app").replace(/\/+$/, "");
const FILES = [
  "index.html", "raw.html", "tee.js", "bech32m.mjs", "shirt.json",
  "zcash_wasm.js", "zcash_wasm_bg.wasm", "LICENSE-cipherscan.txt",
  "fonts/jetbrains-mono-var.woff2", "fonts/LICENSE.txt",
];
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

console.log(`\nComparing ${base} with this checkout\n`);
let differ = 0;
for (const f of FILES) {
  const local = sha(fs.readFileSync(path.join(root, f)));
  let live = "", status = 0;
  try {
    const res = await fetch(`${base}/${f}`, { cache: "no-store" });
    status = res.status;
    if (res.ok) live = sha(Buffer.from(await res.arrayBuffer()));
  } catch (e) { status = e.message; }
  const same = live === local;
  if (!same) differ++;
  console.log(`  ${same ? "SAME   " : "DIFFERS"}  ${f.padEnd(32)} ${same ? local.slice(0, 16) : `local ${local.slice(0, 16)}, live ${live ? live.slice(0, 16) : `HTTP ${status}`}`}`);
}
console.log(differ ? `\n${differ} file(s) differ.\n` : "\nEvery file is identical: the live site runs this code.\n");
process.exitCode = differ ? 1 : 0;
