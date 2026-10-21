// Bech32m helpers (BIP 350), shared by the page and the tools.
// A unified viewing key (ZIP 316) is Bech32m with no length limit: HRP `uview`
// (testnet `uviewtest`), the separator `1`, then data characters, the last 6 of
// which are the checksum.

export const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M_CONST = 0x2bc830a3;
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

// Lowercase only, no length limit, split at the last "1".
export function isValidBech32m(str) {
  if (typeof str !== "string" || str !== str.toLowerCase()) return false;
  const sep = str.lastIndexOf("1");
  if (sep < 1 || str.length - sep - 1 < 6) return false;
  const hrp = str.slice(0, sep);
  if ([...hrp].some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126)) return false;
  const data = [];
  for (const c of str.slice(sep + 1)) {
    const v = CHARSET.indexOf(c);
    if (v < 0) return false;
    data.push(v);
  }
  return polymod(hrpExpand(hrp).concat(data)) === BECH32M_CONST;
}

// Lowercase; drop spaces, hyphens and dots; o→0 and b→8 (Bech32 never uses o or b).
// `bad` lists, once each and in order, the characters that still aren't in CHARSET.
export function normalisePiece(input) {
  const piece = String(input).toLowerCase().replace(/[\s.\-]/g, "").replace(/o/g, "0").replace(/b/g, "8");
  const bad = [...new Set([...piece].filter((c) => !CHARSET.includes(c)))];
  return { piece, bad };
}

// head + piece + tail if valid; else the unique single-character fix inside the piece
// (fixedAt is its 1-based position in the piece); else null.
export function completeKey(head, piece, tail) {
  const exact = head + piece + tail;
  if (isValidBech32m(exact)) return { key: exact, fixedAt: null };
  let found = null;
  for (let i = 0; i < piece.length; i++) {
    for (const c of CHARSET) {
      if (c === piece[i]) continue;
      const key = head + piece.slice(0, i) + c + piece.slice(i + 1) + tail;
      if (!isValidBech32m(key)) continue;
      if (found) return null;
      found = { key, fixedAt: i + 1 };
    }
  }
  return found;
}
