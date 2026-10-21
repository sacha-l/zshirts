// Splits the viewing key between the page and the shirt.
//
//   node tools/split.mjs              random window of 16 characters
//   node tools/split.mjs --start <n>  window starting at data character n (0 = first after "1")
//
// Writes the head and tail to shirt.json (public) and the full key, memo and
// piece to shirt.private.json (never deployed, never committed). Running it
// again picks a new window from the key in shirt.private.json.
//
// Needs Node 18 or newer.

import fs from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidBech32m } from "../bech32m.mjs";

const MISSING = 16; // never fewer: the checksum gives away 30 bits, so 16 hidden leaves 2^50 keys

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pubPath = path.join(root, "shirt.json");
const privPath = path.join(root, "shirt.private.json");
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };

const cfg = JSON.parse(fs.readFileSync(pubPath, "utf8"));
const priv = fs.existsSync(privPath) ? JSON.parse(fs.readFileSync(privPath, "utf8")) : {};

// 1. The full key: shirt.json first, else shirt.private.json.
const ufvk = (cfg.ufvk || priv.ufvk || "").trim();
if (!ufvk) die("no full ufvk in shirt.json or shirt.private.json");
const expectedMemo = cfg.expectedMemo || priv.expectedMemo || "";

// 2. Valid Bech32m with the HRP for this network.
const hrp = cfg.network === "testnet" ? "uviewtest" : "uview";
const sep = ufvk.lastIndexOf("1");
if (!isValidBech32m(ufvk)) die("ufvk is not valid Bech32m");
if (ufvk.slice(0, sep) !== hrp) die(`ufvk HRP is "${ufvk.slice(0, sep)}", expected "${hrp}" for network "${cfg.network}"`);

// 3. A window of 16 consecutive data characters, uniform over every position where it fits.
const dataLen = ufvk.length - sep - 1;
const choices = dataLen - MISSING + 1;
const arg = process.argv.indexOf("--start");
let start;
if (arg > 0) {
  start = Number(process.argv[arg + 1]);
  if (!Number.isInteger(start) || start < 0 || start >= choices) die(`--start must be an integer from 0 to ${choices - 1}`);
} else {
  // Rejection sampling so every start is equally likely.
  const limit = Math.floor(0x100000000 / choices) * choices;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  start = buf[0] % choices;
}
const at = sep + 1 + start;
const head = ufvk.slice(0, at);
const piece = ufvk.slice(at, at + MISSING);
const tail = ufvk.slice(at + MISSING);

// 7. Self-check before writing anything.
if (head + piece + tail !== ufvk) die("self-check: head + piece + tail !== ufvk");
if (!isValidBech32m(head + piece + tail)) die("self-check: completed key is not valid Bech32m");
if (head.length + MISSING + tail.length !== ufvk.length) die("self-check: lengths don't add up");
if (piece.length !== MISSING) die("self-check: piece is not 16 characters");

// 4. Public: head and tail only. No full key, no memo text, no fallback that would show it.
cfg.key = { v: 1, head, tail, missing: MISSING };
cfg.ufvk = "";
cfg.expectedMemo = "";
cfg.revealOnFailure = false;
fs.writeFileSync(pubPath, JSON.stringify(cfg, null, 2) + "\n");

// 5. Private.
fs.writeFileSync(privPath, JSON.stringify({ ufvk, expectedMemo, piece, start }, null, 2) + "\n");

// 6. Both ignore files must list shirt.private.json.
for (const f of [".vercelignore", ".gitignore"]) {
  const p = path.join(root, f);
  const text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  if (!text.split(/\r?\n/).some((l) => /^\/?(\*\*\/)?shirt\.private\.json$/.test(l.trim()))) {
    fs.writeFileSync(p, text + (text.endsWith("\n") || !text ? "" : "\n") + "shirt.private.json\n");
    console.log(`added shirt.private.json to ${f}`);
  }
}

// 8. For the designer.
const grouped = piece.toUpperCase().match(/.{4}/g).join(" ");
console.log(`\nPiece for the shirt: ${grouped}`);
console.log(`Start: data character ${start} of ${dataLen} (key characters ${at + 1}–${at + MISSING} of ${ufvk.length}), one of ${choices} possible windows.`);
console.log(`Wrote shirt.json (head ${head.length} + tail ${tail.length} characters) and shirt.private.json.\n`);
