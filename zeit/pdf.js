"use strict";

/*
 * Kingsley Zeit – Stundenzettel als echtes PDF
 * ============================================
 * Wieder ohne Bibliothek. Ein PDF ist im Kern eine Liste nummerierter
 * Objekte plus eine Tabelle, wo jedes Objekt in der Datei anfaengt. Genau
 * das wird hier gebaut - mehr braucht ein Stundenzettel nicht.
 *
 * Schrift: Helvetica und Helvetica-Bold sind in JEDEM PDF-Betrachter fest
 * eingebaut, es muss also nichts eingebettet werden. Als Zeichensatz nehmen
 * wir WinAnsi (cp1252) - da sind alle deutschen Umlaute drin.
 */

/* ------------------------- Text nach WinAnsi ----------------------------- */

// cp1252 weicht nur im Bereich 0x80–0x9F von latin1 ab. Das sind genau die
// Zeichen, die aus Word & Co. kommen: Gedankenstrich, typografische
// Anfuehrungszeichen, Euro.
const SONDER = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};
function winAnsi(s) {
  const out = [];
  for (const ch of String(s == null ? "" : s)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) { out.push(c); continue; }
    if (SONDER[ch] !== undefined) { out.push(SONDER[ch]); continue; }
    if (c <= 0xff) { out.push(c); continue; }
    out.push(0x3f);   // alles andere (z. B. Emoji) wird zu "?"
  }
  return Buffer.from(out);
}
// In einer PDF-Zeichenkette muessen ( ) \ maskiert werden.
function pdfText(s) {
  const b = winAnsi(s);
  let r = "";
  for (const byte of b) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) r += "\\" + String.fromCharCode(byte);
    else if (byte < 32 || byte > 126) r += "\\" + byte.toString(8).padStart(3, "0");
    else r += String.fromCharCode(byte);
  }
  return r;
}

/* ------------------------- Breiten von Helvetica -------------------------- */
/*
 * Damit Text rechtsbuendig oder zentriert sitzt, muss man wissen, wie breit
 * er wird. Die Tabelle deckt die Zeichen ab, die auf einem Stundenzettel
 * vorkommen; alles Unbekannte wird mit einem mittleren Wert geschaetzt.
 */
const W = { " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667,
  "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278,
  "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333, "{": 334, "|": 260,
  "}": 334, "~": 584 };
for (const c of "0123456789") W[c] = 556;
const GROSS = { A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611 };
const KLEIN = { a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556,
  i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
  s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500 };
Object.assign(W, GROSS, KLEIN);
// Umlaute sind so breit wie ihre Grundbuchstaben.
for (const [um, gr] of [["Ä", "A"], ["Ö", "O"], ["Ü", "U"], ["ä", "a"], ["ö", "o"],
  ["ü", "u"], ["ß", "b"], ["–", "-"], ["—", "-"], ["„", '"'], ["“", '"'], ["”", '"'],
  ["’", "'"], ["‘", "'"], ["É", "E"], ["é", "e"], ["ç", "c"], ["Ç", "C"]]) W[um] = W[gr];

function breite(text, groesse, fett) {
  let n = 0;
  for (const ch of String(text == null ? "" : text)) n += W[ch] === undefined ? 556 : W[ch];
  // Helvetica-Bold ist etwas breiter als die normale Schnittform.
  return (n / 1000) * groesse * (fett ? 1.055 : 1);
}
function kuerzen(text, maxBreite, groesse, fett) {
  let s = String(text == null ? "" : text);
  if (breite(s, groesse, fett) <= maxBreite) return s;
  while (s.length > 1 && breite(s + "…", groesse, fett) > maxBreite) s = s.slice(0, -1);
  return s + "…";
}

/* ------------------------------ Seiten bauen ------------------------------ */

const A4 = { b: 595.28, h: 841.89 };

class Seite {
  constructor() { this.teile = []; }
  _f(fett) { return fett ? "/F2" : "/F1"; }
  text(x, y, s, { groesse = 10, fett = false, grau = 0, rechts = false, mitte = false } = {}) {
    let px = x;
    if (rechts) px = x - breite(s, groesse, fett);
    if (mitte) px = x - breite(s, groesse, fett) / 2;
    this.teile.push("BT " + (grau ? grau.toFixed(2) + " " + grau.toFixed(2) + " " +
      grau.toFixed(2) + " rg " : "0 0 0 rg ") + this._f(fett) + " " + groesse +
      " Tf 1 0 0 1 " + px.toFixed(2) + " " + y.toFixed(2) + " Tm (" + pdfText(s) + ") Tj ET");
    return this;
  }
  linie(x1, y1, x2, y2, { dicke = 0.6, grau = 0.75 } = {}) {
    this.teile.push(grau.toFixed(2) + " " + grau.toFixed(2) + " " + grau.toFixed(2) +
      " RG " + dicke + " w " + x1.toFixed(2) + " " + y1.toFixed(2) + " m " +
      x2.toFixed(2) + " " + y2.toFixed(2) + " l S");
    return this;
  }
  kasten(x, y, b, h, grau) {
    this.teile.push(grau.toFixed(2) + " " + grau.toFixed(2) + " " + grau.toFixed(2) +
      " rg " + x.toFixed(2) + " " + y.toFixed(2) + " " + b.toFixed(2) + " " +
      h.toFixed(2) + " re f");
    return this;
  }
  inhalt() { return this.teile.join("\n"); }
}

function bauen(seiten) {
  // Objekt 1 Katalog, 2 Seitenbaum, 3+4 Schriften, danach je Seite zwei Objekte.
  const objekte = [];
  const seitenIds = seiten.map((_, i) => 5 + i * 2);
  objekte[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objekte[2] = "<< /Type /Pages /Count " + seiten.length + " /Kids [" +
    seitenIds.map((id) => id + " 0 R").join(" ") + "] >>";
  objekte[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objekte[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  seiten.forEach((s, i) => {
    const id = seitenIds[i];
    objekte[id] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + A4.b.toFixed(2) +
      " " + A4.h.toFixed(2) + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> " +
      "/Contents " + (id + 1) + " 0 R >>";
    objekte[id + 1] = { stream: s.inhalt() };
  });

  const stuecke = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let pos = stuecke[0].length;
  const offsets = [];
  for (let i = 1; i < objekte.length; i++) {
    const o = objekte[i];
    if (o === undefined) continue;
    offsets[i] = pos;
    let b;
    if (typeof o === "object" && o.stream !== undefined) {
      const inhalt = Buffer.from(o.stream, "latin1");
      b = Buffer.concat([
        Buffer.from(i + " 0 obj\n<< /Length " + inhalt.length + " >>\nstream\n", "latin1"),
        inhalt, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    } else {
      b = Buffer.from(i + " 0 obj\n" + o + "\nendobj\n", "latin1");
    }
    stuecke.push(b);
    pos += b.length;
  }
  const anzahl = objekte.length;
  let xref = "xref\n0 " + anzahl + "\n0000000000 65535 f \n";
  for (let i = 1; i < anzahl; i++) {
    xref += String(offsets[i] || 0).padStart(10, "0") + " 00000 n \n";
  }
  xref += "trailer\n<< /Size " + anzahl + " /Root 1 0 R >>\nstartxref\n" + pos + "\n%%EOF\n";
  stuecke.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(stuecke);
}

/* --------------------------- Der Stundenzettel ---------------------------- */

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
  "August", "September", "Oktober", "November", "Dezember"];

function monatsName(tag) {
  const [y, m] = tag.split("-").map(Number);
  return MONATE[m - 1] + " " + y;
}
function stunden(min) {
  const v = Math.max(0, Math.round(min));
  return Math.floor(v / 60) + ":" + String(v % 60).padStart(2, "0");
}

const RAND = 42;
const SPALTEN = [
  { k: "tag", t: "Tag", x: RAND, b: 108 },
  { k: "kommen", t: "Kommen", x: RAND + 112, b: 58, rechts: true },
  { k: "gehen", t: "Gehen", x: RAND + 174, b: 58, rechts: true },
  { k: "pause", t: "Pause", x: RAND + 236, b: 48, rechts: true },
  { k: "std", t: "Stunden", x: RAND + 296, b: 56, rechts: true },
  { k: "hinweis", t: "Hinweis", x: RAND + 360, b: 151 },
];

function kopf(seite, { firma, titel, unter, seiteNr, seiten }) {
  let y = A4.h - RAND;
  seite.text(RAND, y, firma || "Kingsley Zeit", { groesse: 15, fett: true });
  seite.text(A4.b - RAND, y, "Stundennachweis", { groesse: 10, grau: 0.45, rechts: true });
  y -= 20;
  seite.text(RAND, y, titel, { groesse: 12, fett: true });
  if (seiten > 1) {
    seite.text(A4.b - RAND, y, "Seite " + seiteNr + " von " + seiten,
      { groesse: 9, grau: 0.5, rechts: true });
  }
  y -= 14;
  if (unter) { seite.text(RAND, y, unter, { groesse: 9.5, grau: 0.42 }); y -= 12; }
  y -= 6;
  seite.linie(RAND, y, A4.b - RAND, y, { dicke: 1, grau: 0.2 });
  y -= 16;
  // Tabellenkopf
  for (const s of SPALTEN) {
    seite.text(s.rechts ? s.x + s.b : s.x, y, s.t,
      { groesse: 8.5, fett: true, grau: 0.35, rechts: !!s.rechts });
  }
  y -= 6;
  seite.linie(RAND, y, A4.b - RAND, y, { dicke: 0.5, grau: 0.7 });
  return y - 13;
}

function fuss(seite, { ort, summe, tage }) {
  let y = 108;
  seite.linie(RAND, y + 26, A4.b - RAND, y + 26, { dicke: 1, grau: 0.2 });
  seite.text(RAND, y + 8, "Summe " + tage + " Tage", { groesse: 10, fett: true });
  seite.text(SPALTEN[4].x + SPALTEN[4].b, y + 8, stunden(summe) + " h",
    { groesse: 12, fett: true, rechts: true });
  y = 62;
  seite.linie(RAND, y, RAND + 200, y, { dicke: 0.6, grau: 0.6 });
  seite.linie(A4.b - RAND - 200, y, A4.b - RAND, y, { dicke: 0.6, grau: 0.6 });
  seite.text(RAND, y - 11, "Datum, Unterschrift Mitarbeiter/in", { groesse: 8, grau: 0.45 });
  seite.text(A4.b - RAND, y - 11, "Datum, Unterschrift Arbeitgeber",
    { groesse: 8, grau: 0.45, rechts: true });
  seite.text(A4.b / 2, 34,
    "Erstellt mit Kingsley Zeit" + (ort ? " – " + ort : "") + ". Alle Zeiten in Ortszeit.",
    { groesse: 7.5, grau: 0.55, mitte: true });
}

/*
 * Baut den Zettel fuer EINEN Mitarbeiter. Erwartet die Zeilen bereits fertig
 * ausgerechnet - das Rechnen bleibt im Store, hier wird nur gezeichnet.
 */
function zettelSeiten(daten) {
  const proSeite = 34;
  const bloecke = [];
  for (let i = 0; i < daten.zeilen.length; i += proSeite) {
    bloecke.push(daten.zeilen.slice(i, i + proSeite));
  }
  if (!bloecke.length) bloecke.push([]);
  const seiten = [];
  bloecke.forEach((block, i) => {
    const s = new Seite();
    let y = kopf(s, { firma: daten.firma, titel: daten.name,
      unter: monatsName(daten.von) + (daten.ort ? "  ·  " + daten.ort : "") +
        (daten.zeitraum ? "  ·  " + daten.zeitraum : ""),
      seiteNr: i + 1, seiten: bloecke.length });
    let wechsel = 0;
    for (const z of block) {
      if (z.hell) s.kasten(RAND - 4, y - 4, A4.b - 2 * RAND + 8, 15, 0.965);
      const fett = !!z.fett;
      for (const sp of SPALTEN) {
        const wert = z[sp.k];
        if (wert === undefined || wert === null || wert === "") continue;
        const txt = kuerzen(wert, sp.b, sp.k === "hinweis" ? 8 : 9.2, fett);
        s.text(sp.rechts ? sp.x + sp.b : sp.x, y, txt, {
          groesse: sp.k === "hinweis" ? 8 : 9.2, fett,
          grau: sp.k === "hinweis" ? 0.45 : (z.grau || 0),
          rechts: !!sp.rechts });
      }
      y -= 15;
      wechsel++;
    }
    if (!block.length) {
      s.text(RAND, y, "Keine Zeiten in diesem Zeitraum.", { groesse: 9.5, grau: 0.5 });
    }
    if (i === bloecke.length - 1) fuss(s, { ort: daten.firma, summe: daten.summe, tage: daten.tage });
    seiten.push(s);
  });
  return seiten;
}

function stundenzettel(zettel) {
  const seiten = [];
  for (const z of zettel) seiten.push(...zettelSeiten(z));
  return bauen(seiten);
}

module.exports = { stundenzettel, winAnsi, breite, monatsName, stunden, Seite, bauen };
