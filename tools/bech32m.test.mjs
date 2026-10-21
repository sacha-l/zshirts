// Unit tests for bech32m.mjs.
//
//   node tools/bech32m.test.mjs
//   node tools/bech32m.test.mjs --piece "<the 16 characters on the shirt>"
//
// Uses the real key from shirt.private.json (after split.mjs), shirt.json (before), or
// shirt.json's head + --piece + tail. With none of those (a fresh clone), it tests a
// synthetic key of the same shape with a valid checksum.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { CHARSET, isValidBech32m, normalisePiece, completeKey } from "../bech32m.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(root, f), "utf8")); } catch { return {}; } };
const priv = read("shirt.private.json");
const pub = read("shirt.json");
const argAt = process.argv.indexOf("--piece");
const typedPiece = argAt > 0 ? normalisePiece(process.argv[argAt + 1] || "").piece : "";

// A test-only Bech32m encoder, to build a synthetic key when no real one is available.
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}
const hrpExpand = (h) => [...[...h].map((c) => c.charCodeAt(0) >> 5), 0, ...[...h].map((c) => c.charCodeAt(0) & 31)];
function encode(hrp, data) {
  const pm = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 0x2bc830a3;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (pm >>> (5 * (5 - i))) & 31);
  return hrp + "1" + [...data, ...checksum].map((v) => CHARSET[v]).join("");
}

let ufvk = (pub.ufvk || priv.ufvk || "").trim();
let source = "the real key";
let fromPiece = false;
if (!ufvk && pub.key && typedPiece.length === 16) { ufvk = pub.key.head + typedPiece + pub.key.tail; source = "the real key (shirt.json + --piece)"; fromPiece = true; }
if (!ufvk) {
  ufvk = encode("uviewtest", Array.from({ length: 183 }, () => crypto.randomInt(32)));
  source = "a synthetic key (no real key here: pass --piece to test the real one)";
}

let failed = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failed++; };
const check = (cond, m) => (cond ? ok(m) : fail(m));

console.log("\nbech32m.mjs tests\n");

// BIP 350 test vectors (lowercase ones; this helper is lowercase-only by design).
const valid = ["a1lqfn3a", "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx", "split1checkupstagehandshakeupstreamerranterredcaperredlc445v", "?1v759aa"];
const invalid = ["a1lqfn3q", "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryy", "1qyrz8wqd2c9m", "a1lqfn3", "A1LQFN3A", "abc1o2nhgw4"];
check(valid.every(isValidBech32m), "BIP 350 valid vectors pass");
check(!invalid.some(isValidBech32m), "BIP 350 invalid vectors, uppercase and non-charset strings fail");

const n = normalisePiece(" Ab-c.D eo 1i ");
check(n.piece === "a8cde01i" && n.bad.join("") === "1i", "normalisePiece: lowercase, drops space/-/., maps o→0 and b→8, reports bad characters");

check(isValidBech32m(ufvk), `${source} is valid Bech32m (${ufvk.length} characters)`);
const sep = ufvk.lastIndexOf("1");
const dataLen = ufvk.length - sep - 1;

// The real piece if split.mjs has run, plus 20 random windows.
const realStart = Number.isInteger(priv.start) ? priv.start
  : fromPiece ? pub.key.head.length - (sep + 1) : null;
const starts = new Set(realStart === null ? [] : [realStart]);
while (starts.size < 21) starts.add(crypto.randomInt(dataLen - 16 + 1));

const first = [...starts][0];
let singlesOk = true, singles = 0, doublesOk = true, doubles = 0;
for (const start of starts) {
  const at = sep + 1 + start;
  const head = ufvk.slice(0, at), piece = ufvk.slice(at, at + 16), tail = ufvk.slice(at + 16);
  if (head + piece + tail !== ufvk || piece.length !== 16) { fail(`window ${start} doesn't split cleanly`); continue; }

  for (let i = 0; i < 16; i++) for (const c of CHARSET) {
    if (c === piece[i]) continue;
    const r = completeKey(head, piece.slice(0, i) + c + piece.slice(i + 1), tail);
    singles++;
    if (!r || r.key !== ufvk || r.fixedAt !== i + 1) singlesOk = false;
  }
  const exact = completeKey(head, piece, tail);
  if (!exact || exact.key !== ufvk || exact.fixedAt !== null) singlesOk = false;

  const runs = start === first ? 1000 : 50;
  for (let t = 0; t < runs; t++) {
    const a = crypto.randomInt(16); let b = crypto.randomInt(15); if (b >= a) b++;
    const p = piece.split("");
    p[a] = CHARSET.replace(p[a], "")[crypto.randomInt(31)];
    p[b] = CHARSET.replace(p[b], "")[crypto.randomInt(31)];
    doubles++;
    if (completeKey(head, p.join(""), tail) !== null) doublesOk = false;
  }
}
const real = realStart !== null;
const label = real ? `the real piece (start ${realStart}) and 20 random windows` : "21 random windows";
check(singlesOk, `every single-character change in the piece is caught and fixed back (${singles} cases, ${label})`);
check(doublesOk, `random two-character changes are all rejected (${doubles} cases, 1,000 of them on ${real ? "the real piece" : `window ${first}`})`);

console.log(failed ? `\n${failed} FAILED\n` : "\nAll passed.\n");
process.exitCode = failed ? 1 : 0;
