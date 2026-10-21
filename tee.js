// Draws the shirt, zoomed in on the chest so the print is readable.
//
//   renderTee(container, {
//     cipherHex,      // the memo ciphertext, as printed (hex)
//     pieceLength,    // how many key characters are missing (16)
//     typed,          // what the reader has typed so far (normalised); never the piece itself
//     teeColor, ink, bar, barInk, quiet, edge,   // colours
//     printWidth,     // print width in cm (26)
//     url, urlFont,   // the site address, small, in the print's bottom-right corner
//     plain, revealed // after decryption only: the message, and how many bytes to show as letters
//   })
//
// This file never receives the key piece: only its length and the reader's own typing.

const NS = "http://www.w3.org/2000/svg";
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const DEFAULTS = {
  cipherHex: "",
  pieceLength: 16,
  typed: "",
  teeColor: "#1C1A19", // placeholder until the designer confirms the fabric colour
  ink: "#E8E0D4",
  bar: "#E8E0D4",
  barInk: "#1C1A19",
  quiet: "#A39B92",
  edge: "#3A3633",
  printWidth: 26,
  url: "",
  urlFont: MONO,
  plain: "",
  revealed: 0,
};

const GROUP = 4, GROUPS_PER_LINE = 8, LINES = 4;

function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

// The print, in millimetres, top-left at (0, 0). Returns { g, height }.
function drawPrint(o) {
  const W = o.printWidth * 10;
  const cols = GROUPS_PER_LINE * (GROUP + 1) - 1; // 8 groups of 4, single spaces between
  const cell = W / cols;
  const size = cell * 1.55;
  const lineH = size * 1.45;
  const g = svgEl("g");
  const hex = o.cipherHex.toUpperCase().slice(0, LINES * GROUPS_PER_LINE * GROUP);

  // Where the h-th hex character sits.
  const at = (h) => {
    const grp = Math.floor(h / GROUP);
    return { x: ((grp % GROUPS_PER_LINE) * (GROUP + 1) + (h % GROUP) + 0.5) * cell, y: (Math.floor(grp / GROUPS_PER_LINE) + 1) * lineH - lineH * 0.28 };
  };

  // 1. The message, encrypted. Revealed bytes become their letters.
  const shown = Math.min(Math.max(0, o.revealed | 0), Math.floor(hex.length / 2), o.plain.length);
  for (let h = 0; h < hex.length; h++) {
    if ((h >> 1) < shown) {
      if (h % 2) continue;
      const a = at(h), b = at(h + 1), ch = o.plain[h >> 1];
      if (ch !== " ") g.append(svgEl("text", { x: (a.x + b.x) / 2, y: a.y, "text-anchor": "middle", "font-family": MONO, "font-size": size * 1.15, "font-weight": 700, fill: o.ink }, ch));
      continue;
    }
    const a = at(h);
    g.append(svgEl("text", { x: a.x, y: a.y, "text-anchor": "middle", "font-family": MONO, "font-size": size, fill: o.ink }, hex[h]));
  }

  // 2. The missing key characters: inverted blocks, filled with what the reader types.
  let y = LINES * lineH + lineH * 0.35;
  const bars = Math.ceil(o.pieceLength / GROUP);
  const gap = cell * 0.9;
  const barW = (W - gap * (bars - 1)) / bars;
  const barH = size * 1.6;
  const typed = o.typed.toUpperCase();
  for (let b = 0; b < bars; b++) {
    const x0 = b * (barW + gap);
    g.append(svgEl("rect", { x: x0, y, width: barW, height: barH, fill: o.bar }));
    for (let i = 0; i < GROUP; i++) {
      const ch = typed[b * GROUP + i];
      if (ch) g.append(svgEl("text", { x: x0 + barW * (i + 0.5) / GROUP, y: y + barH * 0.7, "text-anchor": "middle", "font-family": MONO, "font-size": size * 1.05, "font-weight": 700, fill: o.barInk }, ch));
    }
  }
  y += barH;

  // 3. The site address: small, regular, tucked into the bottom-right corner.
  if (o.url) {
    const urlSize = size * 0.62;
    y += urlSize * 1.6;
    g.append(svgEl("text", { x: W, y, "text-anchor": "end", "font-family": o.urlFont, "font-size": urlSize, "font-weight": 400, fill: o.quiet }, o.url));
    y += urlSize * 0.4;
  }
  return { g, height: y };
}

// The chest of the shirt, in centimetres: neckline and shoulder seams visible, print to scale.
function drawShirt(o) {
  const cx = 46, top = 2, chestL = cx - 26, chestR = cx + 26, hem = 74;
  const printTop = top + 13;
  const print = drawPrint(o);
  const printH = print.height / 10;
  const viewW = o.printWidth + 6, viewX = cx - viewW / 2, viewY = top + 2, viewH = printTop + printH + 3 - viewY;
  const svg = svgEl("svg", {
    viewBox: `${viewX} ${viewY} ${viewW} ${viewH.toFixed(2)}`,
    role: "img",
    "aria-label": `The shirt's chest print: the encrypted message, then ${Math.ceil(o.pieceLength / GROUP)} blocks for the last ${o.pieceLength} characters of the viewing key.`,
  });
  const body = [
    `M${cx - 9},${top}`, `Q${cx},${top + 9} ${cx + 9},${top}`,
    `L${chestR - 2},${top + 3.5}`, `L${cx + 42},${top + 17}`, `L${cx + 35},${top + 27}`, `L${chestR},${top + 22}`,
    `L${chestR},${hem}`, `L${chestL},${hem}`,
    `L${chestL},${top + 22}`, `L${cx - 35},${top + 27}`, `L${cx - 42},${top + 17}`, `L${chestL + 2},${top + 3.5}`, "Z",
  ].join(" ");
  svg.append(svgEl("path", { d: body, fill: o.teeColor, stroke: o.edge, "stroke-width": 0.12, "stroke-linejoin": "miter" }));
  // Neck rib and shoulder seams.
  svg.append(svgEl("path", { d: `M${cx - 9},${top} Q${cx},${top + 9} ${cx + 9},${top}`, fill: "none", stroke: o.edge, "stroke-width": 0.5 }));
  svg.append(svgEl("path", { d: `M${cx - 9},${top} L${chestL + 2},${top + 3.5} M${cx + 9},${top} L${chestR - 2},${top + 3.5}`, fill: "none", stroke: o.edge, "stroke-width": 0.12, "stroke-dasharray": "0.5 0.35" }));
  print.g.setAttribute("transform", `translate(${cx - o.printWidth / 2} ${printTop}) scale(0.1)`);
  svg.append(print.g);
  return svg;
}

export function renderTee(container, options = {}) {
  const o = { ...DEFAULTS, ...options };
  o.cipherHex = String(o.cipherHex || "").replace(/[^0-9a-f]/gi, "");
  o.typed = String(o.typed || "").slice(0, o.pieceLength);
  o.plain = String(o.plain || "");
  container.replaceChildren(drawShirt(o));
}
