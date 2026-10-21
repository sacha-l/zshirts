// Checks that shirt.json decrypts to the message you expect, using the same
// decryptor the page uses. With --save it embeds the raw transaction into
// shirt.json so the live page never depends on an outside API.
//
//   node tools/test.mjs          check only
//   node tools/test.mjs --save   check, then embed the raw transaction
//
// Split-key mode (shirt.json has a "key" object, see tools/split.mjs): the piece
// comes from --piece <chars>, or else shirt.private.json, and so does expectedMemo.
// Without shirt.private.json (e.g. a fresh clone), pass --piece "<the 16 characters on the shirt>".
// --save only ever writes rawHex: never the full key, the memo or the piece.
//
// Needs Node 18 or newer.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import init, { decrypt_memo, detect_key_type } from "../zcash_wasm.js";
import { CHARSET, normalisePiece, completeKey } from "../bech32m.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfgPath = path.join(root, "shirt.json");
const save = process.argv.includes("--save");
const API = { mainnet: "https://api.zecblock.com", testnet: "https://api.testnet.zecblock.com" };
const KNOWN = ["00000000", "191ba85b", "bb09b876", "602bb42b", "0b23b9f5", "a675ffe9", "b4d0d6c2"];

const ok = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1; };
const warn = (m) => console.log(`  WARN  ${m}`);

function patchBranchId(hex) {
  if (hex.length < 24) return hex;
  const id = hex.substring(16, 24);
  return KNOWN.includes(id) ? hex : hex.substring(0, 16) + "b4d0d6c2" + hex.substring(24);
}

const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const network = cfg.network === "testnet" ? "testnet" : "mainnet";
const split = cfg.key && typeof cfg.key === "object";
console.log(`\nShirt decoder test (${network}${split ? ", split key" : ""})\n`);

await init({ module_or_path: fs.readFileSync(path.join(root, "zcash_wasm_bg.wasm")) });

// 0. Split key: complete it the way the page does.
let ufvk = cfg.ufvk || "";
let expectedMemo = cfg.expectedMemo || "";
let piece = "";
let hasPrivate = false;
if (split) {
  const privPath = path.join(root, "shirt.private.json");
  hasPrivate = fs.existsSync(privPath);
  const priv = hasPrivate ? JSON.parse(fs.readFileSync(privPath, "utf8")) : {};
  const argAt = process.argv.indexOf("--piece");
  piece = normalisePiece(argAt > 0 ? process.argv[argAt + 1] || "" : priv.piece || "").piece;
  expectedMemo = priv.expectedMemo || "";
  const { head = "", tail = "", missing } = cfg.key;
  if (!piece && !hasPrivate) { fail('no piece: run with --piece "<the 16 characters printed on the shirt>"'); process.exit(); }
  if (missing === 16 && piece.length === 16) ok("exactly 16 characters are hidden");
  else { fail(`key.missing is ${missing} and the piece has ${piece.length} characters: exactly 16 must be hidden`); process.exit(); }
  if (cfg.ufvk || cfg.expectedMemo || cfg.revealOnFailure) fail("shirt.json must have ufvk and expectedMemo empty and revealOnFailure false in split-key mode");
  const done = completeKey(head, piece, tail);
  if (done && done.fixedAt === null && (!priv.ufvk || done.key === priv.ufvk)) ok("piece completes the viewing key");
  else { fail("piece does not complete the viewing key"); process.exit(); }
  ufvk = done.key;
}

// 1. Settings look right
if (/^[0-9a-f]{64}$/i.test(cfg.txid || "")) ok("transaction ID is 64 hex characters");
else { fail("txid must be the 64-character transaction ID"); process.exit(); }

const keyType = (() => { try { return detect_key_type(ufvk); } catch { return "invalid"; } })();
const wantType = network === "mainnet" ? "ufvk-mainnet" : "ufvk-testnet";
if (keyType === wantType) ok(`viewing key is a ${network} unified full viewing key`);
else { fail(`viewing key type is "${keyType}", expected "${wantType}" (starts with ${network === "mainnet" ? "uview1" : "uviewtest1"})`); process.exit(); }

// 2. Get the raw transaction
let hex = (cfg.rawHex || "").trim();
if (hex) {
  ok("using raw transaction embedded in shirt.json");
  // The embedded bytes must be this txid's bytes, not a leftover from another transaction.
  try {
    const res = await fetch(`${API[network]}/v1/transactions/${cfg.txid}/raw`);
    const body = res.ok ? await res.json() : null;
    const chain = (body?.data?.hex ?? body?.hex ?? "").trim().toLowerCase();
    if (!chain) warn(`couldn't fetch the transaction to compare (HTTP ${res.status}); embedded bytes not checked against the chain`);
    else if (chain === hex.toLowerCase()) ok("embedded raw transaction matches the chain's bytes for this txid");
    else fail("embedded rawHex is not this txid's transaction: clear rawHex and run with --save");
  } catch (e) { warn(`offline (${e.message}); embedded bytes not checked against the chain`); }
}
else {
  try {
    const res = await fetch(`${API[network]}/v1/transactions/${cfg.txid}/raw`);
    if (res.status === 404) { fail("transaction not found yet: wait for a confirmation, or check the ID and network"); process.exit(); }
    if (!res.ok) { fail(`couldn't fetch the transaction (HTTP ${res.status})`); process.exit(); }
    const body = await res.json();
    hex = body?.data?.hex ?? body?.hex ?? "";
    if (!hex) { fail("API response had no raw transaction"); process.exit(); }
    ok("fetched raw transaction from the blockchain");
  } catch (e) { fail(`network error: ${e.message}`); process.exit(); }
}

// 3. Decrypt
let result;
try { result = JSON.parse(decrypt_memo(patchBranchId(hex), ufvk)); }
catch (e) { fail(`decryption failed: ${e}`); process.exit(); }
const memo = (result.memo || "").trim();
if (memo) ok(`decrypted memo: "${memo}"  (amount ${result.amount} ZEC)`);
else { fail("decrypted, but the memo is empty"); process.exit(); }

// 4. Matches what will be printed
if (expectedMemo) {
  if (memo === expectedMemo.trim()) ok("memo matches expectedMemo exactly");
  else fail(`memo does not match expectedMemo ("${expectedMemo}")`);
} else if (split && hasPrivate) fail("expectedMemo missing from shirt.private.json");
else if (split) warn("no shirt.private.json, so there's no expected memo to compare against: check the decrypted memo above by eye");
else warn("expectedMemo is empty: set it to catch typos, and to enable the page's last-resort reveal");

if (memo.length > 120) warn(`memo is ${memo.length} characters; it will wrap to many lines on phones`);

// 4a. The cipher box: memoCiphertext must be the message's exact bytes inside this transaction.
if (cfg.memoCiphertext) {
  const mc = cfg.memoCiphertext.toLowerCase();
  const at = hex.toLowerCase().indexOf(mc);
  if (/^[0-9a-f]+$/.test(mc) && at >= 0 && at % 2 === 0 && hex.toLowerCase().indexOf(mc, at + 1) < 0) ok("memoCiphertext occurs exactly once in the transaction");
  else fail("memoCiphertext is not found exactly once (byte-aligned) in rawHex");
  const memoBytes = new TextEncoder().encode(memo).length;
  if (mc.length === 2 * memoBytes) ok(`memoCiphertext covers the whole message (${memoBytes} bytes)`);
  else fail(`memoCiphertext is ${mc.length / 2} bytes but the message is ${memoBytes}`);
}

// 4b. Split key: wrong pieces are refused, single typos are fixed.
if (split) {
  const { head, tail } = cfg.key;
  const swap = (p, i) => p.slice(0, i) + CHARSET.replace(p[i], "")[(i * 7) % 31] + p.slice(i + 1);
  if (completeKey(head, swap(swap(piece, 2), 11), tail) === null) ok("a wrong piece is rejected");
  else fail("a piece with two wrong characters was accepted");
  const typo = completeKey(head, swap(piece, 5), tail);
  if (typo && typo.key === ufvk && typo.fixedAt === 6) ok("a one-character typo is corrected");
  else fail("a one-character typo was not corrected");
}

// 5. Embed (re-read from disk, so only rawHex can ever be written)
if (save && !process.exitCode) {
  const onDisk = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  onDisk.rawHex = hex;
  fs.writeFileSync(cfgPath, JSON.stringify(onDisk, null, 2) + "\n");
  ok("raw transaction saved into shirt.json; the page no longer needs the API");
} else if (!cfg.rawHex) {
  warn("run again with --save to embed the raw transaction (recommended before printing)");
}

console.log(process.exitCode ? "\nNot ready. Fix the FAIL lines above.\n" : "\nReady.\n");
