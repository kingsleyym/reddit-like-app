"use strict";

/*
 * Kingsley Zeit – Datenkern
 * ==========================
 * Bewusst ohne fremde Bibliotheken: laeuft mit blankem Node, auf jedem PC,
 * ohne npm install. Weniger Teile = weniger, was kaputtgehen kann.
 *
 * Wie man sich ausweist
 * ---------------------
 *   1. REGELFALL: am iPad im Laden das eigene Foto antippen.
 *   2. NOTFALL:   den persoenlichen Code eintippen (2 Buchstaben + 4 Ziffern,
 *                 z. B. AY1234). Funktioniert an jedem Geraet - deshalb ist
 *                 "Handy vergessen" nie ein Problem.
 *
 * Ausfallsicherheit
 * -----------------
 *   1. Jeder Stempel wird SOFORT an stempel.log angehaengt (reine Textdatei,
 *      wird nie umgeschrieben). Stromausfall mitten im Speichern schadet
 *      alten Stempeln also nicht.
 *   2. Der Gesamtzustand liegt als JSON vor, geschrieben ueber temporaere
 *      Datei + Umbenennen (atomar: entweder ganz alt oder ganz neu).
 *   3. Ist das JSON beschaedigt, werden die Stempel beim Start automatisch
 *      aus dem Log wiederhergestellt.
 *   4. Jede Korrektur landet im Aenderungsprotokoll - gesetzlich muss
 *      nachvollziehbar bleiben, wer wann was geaendert hat.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TZ = "Europe/Berlin";
const CODE_RE = /^[A-Z]{2}\d{4}$/;

/* ------------------------------- Helfer ---------------------------------- */

function nowMs() { return Date.now(); }
function newId(prefix) { return prefix + "_" + crypto.randomBytes(6).toString("hex"); }

function token() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += A[crypto.randomInt(A.length)];
  return s;
}

function hashCode(code, salt) {
  return crypto.scryptSync(String(code).toUpperCase(), salt, 32).toString("hex");
}
function makeSecret(code) {
  const salt = crypto.randomBytes(8).toString("hex");
  return { salt, hash: hashCode(code, salt) };
}
function checkSecret(rec, code) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const h = hashCode(code, rec.salt);
  const a = Buffer.from(h, "hex"), b = Buffer.from(rec.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/*
 * Passwoerter (Fernzugang) werden anders behandelt als Mitarbeiter-Codes:
 * Gross-/Kleinschreibung zaehlt, und es wird deutlich staerker gerechnet.
 * Ein Angreifer aus dem offenen Internet soll pro Versuch spuerbar bezahlen.
 */
function hashPass(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
    .toString("hex");
}
function makePass(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashPass(pw, salt), stark: true };
}
function checkPass(rec, pw) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const h = rec.stark ? hashPass(pw, rec.salt) : hashCode(pw, rec.salt);
  const a = Buffer.from(h, "hex"), b = Buffer.from(rec.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Geheime Adresse fuer den Fernzugang - lang genug, dass Raten aussichtslos ist.
function pfadToken() { return crypto.randomBytes(16).toString("base64url"); }

/*
 * Zeit immer in deutscher Ortszeit, egal wie der PC eingestellt ist.
 * Der Formatierer wird EINMAL gebaut und wiederverwendet - ihn pro Aufruf neu
 * zu erzeugen kostet bei Jahresauswertungen mit tausenden Stempeln spuerbar
 * Zeit. Zusaetzlich ein kleiner Zwischenspeicher, weil dieselben Zeitpunkte
 * bei einer Auswertung mehrfach umgerechnet werden.
 */
const FMT = new Intl.DateTimeFormat("de-DE", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const partsCache = new Map();
function parts(ts) {
  const hit = partsCache.get(ts);
  if (hit) return hit;
  const o = {};
  for (const p of FMT.formatToParts(new Date(ts))) o[p.type] = p.value;
  if (partsCache.size > 20000) partsCache.clear();
  partsCache.set(ts, o);
  return o;
}
function dayKey(ts) { const p = parts(ts); return p.year + "-" + p.month + "-" + p.day; }
function hhmm(ts) { const p = parts(ts); return p.hour + ":" + p.minute; }
function dayLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const wd = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][dt.getUTCDay()];
  return wd + " " + String(d).padStart(2, "0") + "." + String(m).padStart(2, "0") + ".";
}
function isoWeek(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return dt.getUTCFullYear() + "-KW" + String(week).padStart(2, "0");
}
function tsFrom(dayStr, timeStr) {
  const [y, m, d] = String(dayStr).split("-").map(Number);
  const [hh, mi] = String(timeStr).split(":").map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mi, 0);
  for (let i = 0; i < 3; i++) {
    const p = parts(guess);
    const got = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, 0);
    const want = Date.UTC(y, m - 1, d, hh, mi, 0);
    if (got === want) break;
    guess += want - got;
  }
  return guess;
}
function minutesBetween(a, b) { return Math.max(0, Math.round((b - a) / 60000)); }
function fmtHours(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h + ":" + String(m).padStart(2, "0");
}
/* Gesetzliche Pausen (ArbZG §4): ueber 6 h -> 30 min, ueber 9 h -> 45 min. */
function breakFor(min) {
  if (min > 9 * 60) return 45;
  if (min > 6 * 60) return 30;
  return 0;
}

const DEFAULTS = () => ({
  version: 2,
  config: {
    firma: "Shawarmery",
    chefPin: null,
    oeffentlicheAdresse: "",    // z. B. https://…ts.net:8443 (Tailscale-Funnel)
    requirePresence: true,      // Stempeln nur nach NFC-Tipp / am Terminal
    presenceMinutes: 10,
    oeffnungAktiv: false,       // Stempeln nur waehrend der Oeffnungszeiten
    oeffnungVon: "09:00",
    oeffnungBis: "23:00",
    oeffnungPuffer: 60,         // Minuten davor/danach, die trotzdem erlaubt sind
    autoBreak: false,
    terminalRequireCode: false, // am iPad zusaetzlich den Code abfragen?
    autoOutHours: 12,           // nach so vielen Stunden automatisch ausstempeln (0 = aus)
    autoOutTime: "",            // zusaetzlich taeglich zu dieser Uhrzeit (leer = aus)
    maxShiftHours: 14,          // laengere Schichten gelten als unplausibel
    // --- Chef von unterwegs (ueber das offene Internet) ---
    fernAktiv: false,           // aus, solange der Chef es nicht ausdruecklich einschaltet
    fernPfad: "",               // geheime Adresse: /f/<fernPfad>
    fernPass: null,             // eigenes, langes Passwort (NICHT die 4-stellige PIN)
    fernSeit: 0,                // wann eingeschaltet
    // --- Mitteilungen aufs Handy ---
    vapid: null,                // { pub, priv } - wird beim ersten Start erzeugt
    pushKontakt: "",            // mailto:… fuer den Push-Dienst (optional)
    meldeVergessen: true,       // "Ausstempeln vergessen" melden
    meldeNichtDa: true,         // "Nicht erschienen" melden
    nichtDaNach: 15,            // Minuten nach Schichtbeginn
    erinnerVorEnde: 15,         // Minuten vor Schichtende an den Mitarbeiter
    // --- Schichtplan ---
    planWochen: 4,              // so viele Wochen laufen Serien automatisch voraus
  },
  vorlagen: [],                // { id, locId, name, von, bis, pause, farbe }
  schichten: [],               // { id, empId|null, locId, tag, von, bis, vorlageId,
                               //   notiz, veroeffentlicht, serieId, abgesagt }
  serien: [],                  // { id, empId, locId, wochentage[], von, bis, vorlageId,
                               //   startTag, bisTag, aktiv }
  meldungen: [],               // { id, ts, empId, typ, schichtId, zielEmpId, text, status }
  abos: [],                    // Web-Push-Abos: { id, wer, endpoint, keys, geraet, ts }
  locations: [],
  employees: [],               // { id, name, code{salt,hash}, codeHint, locId, active, photo, lang }
  events: [],                  // { id, empId, type, ts, locId, method, note, auto, editedBy }
  audit: [],
});

/* -------------------------------- Store ---------------------------------- */

class ZeitStore {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, "zeit-daten.json");
    this.log = path.join(dataDir, "stempel.log");
    this.photoDir = path.join(dataDir, "fotos");
    fs.mkdirSync(this.photoDir, { recursive: true });
    this.state = DEFAULTS();
    this._load();
    this._ensureSetup();
  }

  _load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      const d = DEFAULTS();
      this.state = {
        ...d, ...parsed,
        config: { ...d.config, ...(parsed.config || {}) },
        locations: Array.isArray(parsed.locations) ? parsed.locations : [],
        employees: Array.isArray(parsed.employees) ? parsed.employees : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        audit: Array.isArray(parsed.audit) ? parsed.audit : [],
        // Aeltere Dateien kennen den Schichtplan noch nicht - dann leer starten.
        vorlagen: Array.isArray(parsed.vorlagen) ? parsed.vorlagen : [],
        schichten: Array.isArray(parsed.schichten) ? parsed.schichten : [],
        serien: Array.isArray(parsed.serien) ? parsed.serien : [],
        meldungen: Array.isArray(parsed.meldungen) ? parsed.meldungen : [],
        abos: Array.isArray(parsed.abos) ? parsed.abos : [],
      };
    } catch (err) {
      console.error("[zeit] Datendatei unlesbar, hole Stempel aus dem Log:", err.message);
      this._recoverFromLog();
    }
  }

  // Das Log ist eine Historie: derselbe Stempel kann mehrfach vorkommen
  // (Korrektur, Loeschung). Es gilt der LETZTE Eintrag je Id.
  _recoverFromLog() {
    this.state = DEFAULTS();
    try {
      const byId = new Map();
      for (const line of fs.readFileSync(this.log, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          if (e && e.id && e.empId && e.type && e.ts) byId.set(e.id, e);
        } catch (_) {}
      }
      for (const e of byId.values()) {
        if (e.geloescht) continue;
        const { korrektur, geloescht, by, ...clean } = e;
        this.state.events.push(clean);
      }
      this.state.events.sort((a, b) => a.ts - b.ts);
      console.error("[zeit] " + this.state.events.length + " Stempel gerettet.");
    } catch (_) {}
  }

  save() {
    this._invalidate();
    try {
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error("[zeit] Speichern fehlgeschlagen:", err.message);
    }
  }

  _appendLog(ev) {
    try { fs.appendFileSync(this.log, JSON.stringify(ev) + "\n"); } catch (_) {}
  }

  _audit(what, detail, by) {
    this.state.audit.push({ ts: nowMs(), what, detail, by: by || "system" });
    if (this.state.audit.length > 5000) this.state.audit.splice(0, 1000);
  }

  _ensureSetup() {
    let changed = false;
    if (!this.state.locations.length) {
      this.state.locations.push({ id: newId("loc"), name: "Laden 1", token: token() });
      changed = true;
    }
    for (const l of this.state.locations) if (!l.token) { l.token = token(); changed = true; }
    if (changed) this.save();
  }

  /* ---------------------------- Konfiguration ---------------------------- */

  isSetupDone() { return !!this.state.config.chefPin; }
  setChefPin(pin, by) {
    this.state.config.chefPin = makeSecret(String(pin));
    this._audit("chef-pin", "Chef-PIN geändert", by);
    this.save();
  }
  checkChefPin(pin) { return checkSecret(this.state.config.chefPin, String(pin)); }

  /* ------------------------ Chef von unterwegs --------------------------- */
  /*
   * Der Chef-Bereich soll auch aus dem offenen Internet erreichbar sein -
   * aber nicht so, wie man eine normale Seite erreicht. Zwei Schluessel:
   *   1. eine geheime Adresse (/f/<32 Zeichen>), die man einmal pro Geraet
   *      oeffnet. Wer sie nicht hat, bekommt schlicht "Nicht gefunden" -
   *      fuer Bots existiert der Chef-Bereich gar nicht.
   *   2. ein eigenes, langes Passwort. Die 4-stellige PIN gilt draussen NIE.
   */
  fernStatus() {
    const c = this.state.config;
    return {
      aktiv: !!c.fernAktiv && !!c.fernPfad && !!c.fernPass,
      pfad: c.fernPfad || "",
      hatPasswort: !!c.fernPass,
      seit: c.fernSeit || 0,
    };
  }
  // Einschalten geht nur zusammen mit einem Passwort - kein "aus Versehen offen".
  fernEinschalten(pw, by) {
    const p = String(pw || "");
    if (p.length < 10) return { ok: false, fehler: "Mindestens 10 Zeichen." };
    if (/^\d+$/.test(p)) return { ok: false, fehler: "Nicht nur Ziffern – bitte auch Buchstaben." };
    const c = this.state.config;
    c.fernPass = makePass(p);
    if (!c.fernPfad) c.fernPfad = pfadToken();
    c.fernAktiv = true;
    c.fernSeit = Date.now();
    this._audit("fern-an", "Fernzugang eingeschaltet", by);
    this.save();
    return { ok: true, ...this.fernStatus() };
  }
  fernAusschalten(by) {
    const c = this.state.config;
    c.fernAktiv = false;
    this._audit("fern-aus", "Fernzugang ausgeschaltet", by);
    this.save();
    return this.fernStatus();
  }
  // Notfall: Handy verloren / Link weitergegeben -> alte Adresse ist sofort tot.
  fernNeuerPfad(by) {
    const c = this.state.config;
    c.fernPfad = pfadToken();
    this._audit("fern-pfad", "Neue geheime Adresse vergeben", by);
    this.save();
    return this.fernStatus();
  }
  checkFernPass(pw) {
    const c = this.state.config;
    if (!c.fernAktiv || !c.fernPass) return false;
    return checkPass(c.fernPass, String(pw || ""));
  }

  setConfig(patch, by) {
    const c = this.state.config;
    const num = (v, lo, hi, def) => {
      const n = Number(v);
      return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
    };
    if (patch.firma !== undefined) c.firma = String(patch.firma).slice(0, 40);
    if (patch.oeffentlicheAdresse !== undefined) {
      c.oeffentlicheAdresse = String(patch.oeffentlicheAdresse || "").trim()
        .replace(/\/+$/, "").slice(0, 200);
    }
    if (patch.requirePresence !== undefined) c.requirePresence = !!patch.requirePresence;
    if (patch.autoBreak !== undefined) c.autoBreak = !!patch.autoBreak;
    if (patch.terminalRequireCode !== undefined) c.terminalRequireCode = !!patch.terminalRequireCode;
    if (patch.presenceMinutes !== undefined) c.presenceMinutes = num(patch.presenceMinutes, 1, 240, 10);
    if (patch.oeffnungAktiv !== undefined) c.oeffnungAktiv = !!patch.oeffnungAktiv;
    if (patch.oeffnungPuffer !== undefined) c.oeffnungPuffer = num(patch.oeffnungPuffer, 0, 240, 60);
    for (const k of ["oeffnungVon", "oeffnungBis"]) {
      if (patch[k] !== undefined) {
        const v = String(patch[k] || "").trim();
        if (/^\d{1,2}:\d{2}$/.test(v)) c[k] = v;
      }
    }
    if (patch.autoOutHours !== undefined) c.autoOutHours = num(patch.autoOutHours, 0, 24, 12);
    if (patch.maxShiftHours !== undefined) c.maxShiftHours = num(patch.maxShiftHours, 4, 24, 14);
    if (patch.autoOutTime !== undefined) {
      const t = String(patch.autoOutTime || "").trim();
      c.autoOutTime = /^\d{1,2}:\d{2}$/.test(t) ? t : "";
    }
    // Mitteilungen und Schichtplan
    if (patch.meldeVergessen !== undefined) c.meldeVergessen = !!patch.meldeVergessen;
    if (patch.meldeNichtDa !== undefined) c.meldeNichtDa = !!patch.meldeNichtDa;
    if (patch.nichtDaNach !== undefined) c.nichtDaNach = num(patch.nichtDaNach, 1, 180, 15);
    if (patch.planWochen !== undefined) c.planWochen = num(patch.planWochen, 1, 26, 4);
    if (patch.pushKontakt !== undefined) {
      const m = String(patch.pushKontakt || "").trim().slice(0, 120);
      c.pushKontakt = /^mailto:.+@.+\..+/.test(m) ? m : (m ? "mailto:" + m.replace(/^mailto:/, "") : "");
    }
    this._audit("einstellung", JSON.stringify(patch), by);
    this.save();
    return c;
  }

  /* ------------------------------ Standorte ------------------------------ */

  addLocation(name, by) {
    const loc = { id: newId("loc"), name: String(name).slice(0, 40) || "Standort", token: token() };
    this.state.locations.push(loc);
    this._audit("standort-neu", loc.name, by);
    this.save();
    return loc;
  }
  updateLocation(id, patch, by) {
    const l = this.state.locations.find((x) => x.id === id);
    if (!l) throw new Error("Standort nicht gefunden.");
    if (patch.name !== undefined) l.name = String(patch.name).slice(0, 40) || l.name;
    if (patch.oeffnungAktiv !== undefined) l.oeffnungAktiv = !!patch.oeffnungAktiv;
    for (const k of ["oeffnungVon", "oeffnungBis"]) {
      if (patch[k] !== undefined) {
        const v = String(patch[k] || "").trim();
        if (/^\d{1,2}:\d{2}$/.test(v)) l[k] = v;
      }
    }
    this._audit("standort", "geändert: " + l.name, by);
    this.save();
    return l;
  }

  removeLocation(id, by) {
    if (this.state.locations.length <= 1) throw new Error("Der letzte Standort kann nicht weg.");
    if (this.state.employees.some((e) => e.locId === id && e.active !== false)) {
      throw new Error("Diesem Standort sind noch Mitarbeiter zugeordnet.");
    }
    const l = this.location(id);
    this.state.locations = this.state.locations.filter((x) => x.id !== id);
    this._audit("standort-weg", l ? l.name : id, by);
    this.save();
    return true;
  }

  newLocationToken(id, by) {
    const l = this.state.locations.find((x) => x.id === id);
    if (!l) return null;
    l.token = token();
    this._audit("standort-code", l.name + ": neuer Code", by);
    this.save();
    return l;
  }
  locationByToken(t) {
    if (!t) return null;
    return this.state.locations.find((l) => l.token === String(t).toUpperCase()) || null;
  }
  location(id) { return this.state.locations.find((l) => l.id === id) || null; }

  /* -------------------------- Oeffnungszeiten ---------------------------- */
  /*
   * Optional: Stempeln nur waehrend der Ladenoeffnung (plus Puffer davor und
   * danach, damit Vorbereitung und Aufraeumen zaehlen). Zeiten ueber
   * Mitternacht - etwa 11:00 bis 02:00 - werden richtig behandelt.
   */
  darfStempeln(ts, locId) {
    const c = this.state.config;
    // Ein Standort darf eigene Zeiten haben - bei mehreren Laeden mit
    // unterschiedlichen Oeffnungszeiten ist das noetig.
    const loc = locId ? this.location(locId) : null;
    const eigene = loc && loc.oeffnungAktiv;
    const aktiv = eigene ? true : c.oeffnungAktiv;
    if (!aktiv) return { ok: true };
    const von0 = eigene ? loc.oeffnungVon : c.oeffnungVon;
    const bis0 = eigene ? loc.oeffnungBis : c.oeffnungBis;
    const p = parts(ts || nowMs());
    const jetzt = Number(p.hour) * 60 + Number(p.minute);
    const zuMin = (v) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ""));
      return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
    };
    const puffer = Number(c.oeffnungPuffer) || 0;
    let von = zuMin(von0) - puffer;
    let bis = zuMin(bis0) + puffer;
    const inFenster = (von <= bis)
      ? (jetzt >= von && jetzt <= bis)                    // normaler Tag
      : (jetzt >= von || jetzt <= bis);                   // ueber Mitternacht
    if (inFenster) return { ok: true };
    return { ok: false, von: von0, bis: bis0 };
  }

  /* ----------------------------- Mitarbeiter ----------------------------- */

  // Vorschlag: Initialen + 4 Ziffern, z. B. "AY1234" fuer Ahmet Yilmaz.
  suggestCode(name) {
    const w = String(name || "").trim().toUpperCase().split(/\s+/);
    let ini = ((w[0] || "X")[0] || "X") + ((w[1] || w[0] || "X")[0] || "X");
    ini = ini.replace(/[^A-Z]/g, "X");
    for (let i = 0; i < 60; i++) {
      const c = ini + String(crypto.randomInt(1000, 10000));
      if (!this.codeTaken(c)) return c;
    }
    return ini + String(crypto.randomInt(1000, 10000));
  }

  codeTaken(code, exceptId) {
    return this.state.employees.some(
      (e) => e.id !== exceptId && checkSecret(e.code, code));
  }

  addEmployee({ name, code, locId, lang }, by) {
    const c = String(code || "").toUpperCase().trim();
    if (!CODE_RE.test(c)) throw new Error("Code muss 2 Buchstaben + 4 Ziffern sein, z. B. AY1234.");
    if (this.codeTaken(c)) throw new Error("Dieser Code ist schon vergeben.");
    const emp = {
      id: newId("emp"),
      name: String(name).slice(0, 40) || "Mitarbeiter",
      code: makeSecret(c),
      codeHint: c.slice(0, 2) + "••••",     // fuer die Uebersicht des Chefs
      locId: locId || (this.state.locations[0] && this.state.locations[0].id),
      active: true, photo: null,
      lang: lang === "en" ? "en" : "de",
    };
    this.state.employees.push(emp);
    this._audit("mitarbeiter-neu", emp.name, by);
    this.save();
    return emp;
  }

  updateEmployee(id, patch, by) {
    const e = this.state.employees.find((x) => x.id === id);
    if (!e) throw new Error("Mitarbeiter nicht gefunden.");
    if (patch.name !== undefined) e.name = String(patch.name).slice(0, 40) || e.name;
    if (patch.locId !== undefined) e.locId = patch.locId;
    if (patch.active !== undefined) e.active = !!patch.active;
    if (patch.lang !== undefined) e.lang = patch.lang === "en" ? "en" : "de";
    if (patch.code) {
      const c = String(patch.code).toUpperCase().trim();
      if (!CODE_RE.test(c)) throw new Error("Code muss 2 Buchstaben + 4 Ziffern sein.");
      if (this.codeTaken(c, id)) throw new Error("Dieser Code ist schon vergeben.");
      e.code = makeSecret(c);
      e.codeHint = c.slice(0, 2) + "••••";
      this._audit("mitarbeiter-code", e.name, by);
    }
    this._audit("mitarbeiter", "geändert: " + e.name, by);
    this.save();
    return e;
  }

  setPhoto(id, dataUrl, by) {
    const e = this.state.employees.find((x) => x.id === id);
    if (!e) throw new Error("Mitarbeiter nicht gefunden.");
    const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!m) throw new Error("Bild nicht lesbar.");
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const file = e.id + "." + ext;
    fs.writeFileSync(path.join(this.photoDir, file), Buffer.from(m[2], "base64"));
    for (const f of fs.readdirSync(this.photoDir)) {
      if (f.startsWith(e.id + ".") && f !== file) {
        try { fs.unlinkSync(path.join(this.photoDir, f)); } catch (_) {}
      }
    }
    e.photo = file;
    this._audit("mitarbeiter-foto", e.name, by);
    this.save();
    return e;
  }

  employee(id) { return this.state.employees.find((e) => e.id === id) || null; }
  activeEmployees() { return this.state.employees.filter((e) => e.active !== false); }
  findByCode(code) {
    const c = String(code || "").toUpperCase().trim();
    if (!CODE_RE.test(c)) return null;
    return this.activeEmployees().find((e) => checkSecret(e.code, c)) || null;
  }
  checkEmployeeCode(id, code) {
    const e = this.employee(id);
    return !!e && checkSecret(e.code, String(code || "").toUpperCase().trim());
  }

  /* ------------------------------ Stempeln ------------------------------- */

  /*
   * Kleiner Index: Stempel nach Mitarbeiter vorsortiert. Ohne ihn muesste
   * jede Auswertung die komplette Ereignisliste durchgehen - bei einem Jahr
   * Betrieb sind das schnell zehntausende Eintraege. Der Index wird bei jeder
   * Aenderung verworfen und beim naechsten Zugriff neu gebaut.
   */
  _index() {
    if (this._idx) return this._idx;
    const m = new Map();
    for (const e of this.state.events) {
      let a = m.get(e.empId);
      if (!a) { a = []; m.set(e.empId, a); }
      a.push(e);
    }
    for (const a of m.values()) a.sort((x, y) => x.ts - y.ts);
    this._idx = m;
    return m;
  }
  _invalidate() { this._idx = null; }

  eventsOf(empId) {
    return this._index().get(empId) || [];
  }

  statusOf(empId) {
    const list = this.eventsOf(empId);
    const last = list[list.length - 1];
    if (!last || last.type === "out") return { in: false, since: null, lastTs: last ? last.ts : null };
    return { in: true, since: last.ts, lastTs: last.ts };
  }

  _pushEvent(ev) {
    this._appendLog(ev);
    this.state.events.push(ev);
    this._invalidate();
  }

  stamp(empId, { locId, method } = {}) {
    const emp = this.employee(empId);
    if (!emp || emp.active === false) throw new Error("Mitarbeiter nicht aktiv.");

    // Vergessenes Ausstempeln aufraeumen, bevor eine neue Schicht beginnt.
    this.autoCloseOpen(empId);

    const st = this.statusOf(empId);
    if (st.lastTs && nowMs() - st.lastTs < 60000) {
      const err = new Error("Gerade eben schon gestempelt.");
      err.code = "TOO_SOON";
      throw err;
    }
    const ev = {
      id: newId("ev"), empId, type: st.in ? "out" : "in", ts: nowMs(),
      locId: locId || emp.locId || null, method: method || "web", note: "",
    };
    this._pushEvent(ev);
    this.save();
    return { event: ev, wasIn: st.in, since: st.since };
  }

  /*
   * Automatisches Ausstempeln bei vergessenem Stempeln.
   * Wird regelmaessig vom Server aufgerufen und ausserdem bevor jemand neu
   * einstempelt. Der Eintrag ist als "automatisch" markiert und taucht beim
   * Chef unter "Zu prüfen" auf - es wird also nie still etwas erfunden.
   */
  autoCloseOpen(onlyEmpId) {
    const hrs = Number(this.state.config.autoOutHours) || 0;
    if (!hrs) return [];
    const grenze = hrs * 3600 * 1000;
    const erledigt = [];
    const liste = onlyEmpId ? [this.employee(onlyEmpId)].filter(Boolean) : this.state.employees;
    for (const emp of liste) {
      const st = this.statusOf(emp.id);
      if (!st.in) continue;
      if (nowMs() - st.since < grenze) continue;
      const ev = {
        id: newId("ev"), empId: emp.id, type: "out", ts: st.since + grenze,
        locId: emp.locId || null, method: "auto", auto: true,
        note: "Automatisch beendet nach " + hrs + " h – bitte prüfen",
      };
      this._pushEvent(ev);
      this._audit("auto-aus", emp.name + " nach " + hrs + " h automatisch ausgestempelt", "system");
      erledigt.push({ empId: emp.id, name: emp.name, ts: ev.ts });
    }
    if (erledigt.length) this.save();
    return erledigt;
  }

  /* -------------------- Korrekturen durch den Chef ----------------------- */

  addEvent({ empId, type, day, time, note }, by) {
    const emp = this.employee(empId);
    if (!emp) throw new Error("Mitarbeiter nicht gefunden.");
    if (type !== "in" && type !== "out") throw new Error("Richtung fehlt.");
    const ts = tsFrom(day, time);
    if (!isFinite(ts)) throw new Error("Zeit nicht lesbar.");
    const ev = { id: newId("ev"), empId, type, ts, locId: emp.locId || null,
                 method: "manuell", note: String(note || "").slice(0, 120), editedBy: by };
    this._pushEvent(ev);
    this._audit("nachtrag", emp.name + " " + (type === "in" ? "kommt" : "geht") +
      " " + day + " " + time, by);
    this.save();
    return ev;
  }

  editEvent(id, { day, time, type, note }, by) {
    const ev = this.state.events.find((e) => e.id === id);
    if (!ev) throw new Error("Eintrag nicht gefunden.");
    const vorher = { ts: ev.ts, type: ev.type };
    if (day && time) {
      const ts = tsFrom(day, time);
      if (isFinite(ts)) ev.ts = ts;
    }
    if (type === "in" || type === "out") ev.type = type;
    if (note !== undefined) ev.note = String(note).slice(0, 120);
    ev.editedBy = by;
    ev.auto = false;                       // geprueft und korrigiert
    this._invalidate();
    const emp = this.employee(ev.empId);
    this._audit("korrektur", (emp ? emp.name : ev.empId) + ": " +
      hhmm(vorher.ts) + " -> " + hhmm(ev.ts), by);
    this._appendLog({ ...ev, korrektur: true });
    this.save();
    return ev;
  }

  // "Passt so" – markiert einen automatischen Eintrag als geprueft.
  confirmEvent(id, by) {
    const ev = this.state.events.find((e) => e.id === id);
    if (!ev) return false;
    ev.auto = false;
    ev.note = (ev.note || "").replace(" – bitte prüfen", "") + " (geprüft)";
    this._audit("geprüft", (this.employee(ev.empId) || {}).name || ev.empId, by);
    this._appendLog({ ...ev, korrektur: true });
    this.save();
    return true;
  }

  deleteEvent(id, by) {
    const i = this.state.events.findIndex((e) => e.id === id);
    if (i === -1) return false;
    const ev = this.state.events[i];
    const emp = this.employee(ev.empId);
    this.state.events.splice(i, 1);
    this._invalidate();
    this._audit("gelöscht", (emp ? emp.name : ev.empId) + ": " +
      dayKey(ev.ts) + " " + hhmm(ev.ts), by);
    this._appendLog({ ...ev, geloescht: true, by });
    this.save();
    return true;
  }

  /* ------------------------- Auswertung / Berichte ----------------------- */

  shiftsOf(empId) {
    const list = this.eventsOf(empId);
    const out = [];
    let open = null;
    for (const ev of list) {
      if (ev.type === "in") {
        if (open) out.push({ start: open.ts, end: null, startId: open.id, endId: null,
                             offen: true, startEv: open });
        open = ev;
      } else {
        if (open) {
          out.push({ start: open.ts, end: ev.ts, startId: open.id, endId: ev.id,
                     auto: !!ev.auto, note: ev.note || open.note || "",
                     startEv: open, endEv: ev });
          open = null;
        } else {
          out.push({ start: null, end: ev.ts, startId: null, endId: ev.id,
                     fehlerhaft: true, endEv: ev });
        }
      }
    }
    if (open) out.push({ start: open.ts, end: null, startId: open.id, endId: null,
                         offen: true, startEv: open });
    return out;
  }

  // Ein Mitarbeiter, ein Zeitraum: Schichten nach Tagen und Wochen gruppiert.
  detail(empId, fromDay, toDay) {
    const emp = this.employee(empId);
    if (!emp) return null;
    const maxMin = (Number(this.state.config.maxShiftHours) || 14) * 60;
    const wochen = {};
    let sum = 0, probleme = 0;
    for (const s of this.shiftsOf(empId)) {
      const ref = s.start || s.end;
      if (!ref) continue;
      const k = dayKey(ref);
      if (k < fromDay || k > toDay) continue;
      let min = 0;
      if (s.start && s.end) min = minutesBetween(s.start, s.end);
      const brutto = min;
      if (this.state.config.autoBreak && min > 0) min = Math.max(0, min - breakFor(min));
      const problem = s.offen ? "offen" : s.fehlerhaft ? "kein-start"
        : s.auto ? "auto" : (brutto > maxMin ? "lang" : null);
      if (problem) probleme++;
      const wk = isoWeek(k);
      if (!wochen[wk]) wochen[wk] = { woche: wk, min: 0, tage: {} };
      if (!wochen[wk].tage[k]) wochen[wk].tage[k] = { day: k, label: dayLabel(k), min: 0, shifts: [] };
      wochen[wk].tage[k].min += min;
      wochen[wk].min += min;
      wochen[wk].tage[k].shifts.push({
        startId: s.startId, endId: s.endId,
        start: s.start ? hhmm(s.start) : null,
        end: s.end ? hhmm(s.end) : null,
        min, brutto, problem, note: s.note || "",
      });
      sum += min;
    }
    const wochenListe = Object.values(wochen)
      .map((w) => ({ ...w, hours: fmtHours(w.min),
        tage: Object.values(w.tage).sort((a, b) => b.day.localeCompare(a.day))
          .map((t) => ({ ...t, hours: fmtHours(t.min) })) }))
      .sort((a, b) => b.woche.localeCompare(a.woche));
    return {
      empId, name: emp.name, photo: emp.photo, codeHint: emp.codeHint,
      min: sum, hours: fmtHours(sum), probleme, wochen: wochenListe,
      status: this.statusOf(empId),
    };
  }

  // Uebersicht: EINE Zeile je Mitarbeiter. Details holt das Dashboard erst
  // beim Aufklappen - so bleibt die Seite auch nach einem Jahr schnell.
  summary(fromDay, toDay, { locId, nurAktive = true } = {}) {
    const maxMin = (Number(this.state.config.maxShiftHours) || 14) * 60;
    const rows = [];
    let sumAll = 0, problemeAll = 0;
    for (const emp of this.state.employees) {
      if (nurAktive && emp.active === false) continue;
      if (locId && emp.locId !== locId) continue;
      let sum = 0, probleme = 0, schichten = 0, tage = new Set();
      for (const s of this.shiftsOf(emp.id)) {
        const ref = s.start || s.end;
        if (!ref) continue;
        const k = dayKey(ref);
        if (k < fromDay || k > toDay) continue;
        schichten++;
        tage.add(k);
        let min = 0;
        if (s.start && s.end) min = minutesBetween(s.start, s.end);
        const brutto = min;
        if (this.state.config.autoBreak && min > 0) min = Math.max(0, min - breakFor(min));
        if (s.offen || s.fehlerhaft || s.auto || brutto > maxMin) probleme++;
        sum += min;
      }
      const loc = this.location(emp.locId);
      rows.push({
        empId: emp.id, name: emp.name, photo: emp.photo, codeHint: emp.codeHint,
        active: emp.active !== false, locName: loc ? loc.name : "", locId: emp.locId,
        min: sum, hours: fmtHours(sum), schichten, tage: tage.size, probleme,
        status: this.statusOf(emp.id),
      });
      sumAll += sum;
      problemeAll += probleme;
    }
    rows.sort((a, b) => b.min - a.min || a.name.localeCompare(b.name));
    return { from: fromDay, to: toDay, rows, min: sumAll, hours: fmtHours(sumAll),
             probleme: problemeAll, autoBreak: this.state.config.autoBreak };
  }

  // Alle auffaelligen Schichten im Zeitraum - die Arbeitsliste des Chefs.
  probleme(fromDay, toDay) {
    const maxMin = (Number(this.state.config.maxShiftHours) || 14) * 60;
    const out = [];
    for (const emp of this.state.employees) {
      for (const s of this.shiftsOf(emp.id)) {
        const ref = s.start || s.end;
        if (!ref) continue;
        const k = dayKey(ref);
        if (k < fromDay || k > toDay) continue;
        const brutto = (s.start && s.end) ? minutesBetween(s.start, s.end) : 0;
        let art = null;
        if (s.offen) art = "offen";
        else if (s.fehlerhaft) art = "kein-start";
        else if (s.auto) art = "auto";
        else if (brutto > maxMin) art = "lang";
        if (!art) continue;
        out.push({
          empId: emp.id, name: emp.name, photo: emp.photo,
          day: k, label: dayLabel(k),
          start: s.start ? hhmm(s.start) : null,
          end: s.end ? hhmm(s.end) : null,
          startId: s.startId, endId: s.endId,
          art, min: brutto, note: s.note || "",
        });
      }
    }
    out.sort((a, b) => b.day.localeCompare(a.day));
    return out;
  }

  // Selbstauskunft fuer den Mitarbeiter: was habe ich heute und diese Woche?
  selbst(empId) {
    const emp = this.employee(empId);
    if (!emp) return null;
    const heute = dayKey(nowMs());
    const d = new Date();
    const montag = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400000);
    const wocheAb = dayKey(montag.getTime());
    const dHeute = this.detail(empId, heute, heute);
    const dWoche = this.detail(empId, wocheAb, heute);
    const st = this.statusOf(empId);
    return {
      name: emp.name, photo: emp.photo,
      in: st.in, since: st.since ? hhmm(st.since) : null,
      heute: fmtHours(dHeute ? dHeute.min : 0),
      woche: fmtHours(dWoche ? dWoche.min : 0),
    };
  }

  live() {
    return this.activeEmployees().map((e) => {
      const st = this.statusOf(e.id);
      const loc = this.location(e.locId);
      return {
        empId: e.id, name: e.name, photo: e.photo,
        location: loc ? loc.name : "", locId: e.locId,
        in: st.in, since: st.since ? hhmm(st.since) : null,
        sinceMin: st.since ? minutesBetween(st.since, nowMs()) : 0,
      };
    });
  }

  exportCsv(fromDay, toDay) {
    const sum = this.summary(fromDay, toDay, { nurAktive: false });
    const lines = ["Mitarbeiter;Datum;Kommt;Geht;Stunden;Hinweis"];
    const artText = { offen: "noch eingestempelt", "kein-start": "Einstempeln fehlt",
                      auto: "automatisch beendet", lang: "ungewöhnlich lang" };
    for (const r of sum.rows) {
      const det = this.detail(r.empId, fromDay, toDay);
      for (const w of det.wochen) {
        for (const t of w.tage) {
          for (const s of t.shifts) {
            lines.push([r.name, t.label + " " + t.day, s.start || "", s.end || "",
              fmtHours(s.min).replace(":", ","), artText[s.problem] || ""].join(";"));
          }
        }
      }
      lines.push([r.name, "SUMME " + fromDay + " bis " + toDay, "", "",
        fmtHours(r.min).replace(":", ","), ""].join(";"));
      lines.push("");
    }
    return "﻿" + lines.join("\r\n");
  }

  /* ======================================================================
   *                            SCHICHTPLAN
   * ======================================================================
   * Bewusst ohne Zauberei: eine Serie ("jeden Mo/Mi/Fr Spaetschicht") legt
   * ECHTE Schichten an, statt sie beim Anzeigen jedes Mal auszurechnen.
   * Vorteil: eine einzelne Schicht laesst sich verschieben, kuerzen oder
   * loeschen, ohne dass die Serie kaputtgeht - genau das, was man beim
   * Planen dauernd braucht. Die Serie wird im Hintergrund immer wieder ein
   * paar Wochen weitergeschrieben.
   */

  /* --------------------------- Schichtvorlagen -------------------------- */
  vorlagen(locId) {
    return this.state.vorlagen.filter((v) => !locId || !v.locId || v.locId === locId);
  }
  vorlageSetzen(v, by) {
    const rein = {
      name: String(v.name || "Schicht").slice(0, 24),
      von: pruefZeit(v.von, "09:00"),
      bis: pruefZeit(v.bis, "17:00"),
      pause: Math.max(0, Math.min(240, Number(v.pause) || 0)),
      farbe: /^#[0-9a-fA-F]{6}$/.test(v.farbe || "") ? v.farbe : "#EB5A21",
      locId: v.locId || null,
    };
    let alt = v.id ? this.state.vorlagen.find((x) => x.id === v.id) : null;
    if (alt) Object.assign(alt, rein);
    else { alt = { id: newId("vor"), ...rein }; this.state.vorlagen.push(alt); }
    this._audit("vorlage", alt.name + " " + alt.von + "–" + alt.bis, by);
    this.save();
    return alt;
  }
  vorlageWeg(id, by) {
    const v = this.state.vorlagen.find((x) => x.id === id);
    this.state.vorlagen = this.state.vorlagen.filter((x) => x.id !== id);
    if (v) this._audit("vorlage-weg", v.name, by);
    this.save();
    return !!v;
  }

  /* ----------------------------- Schichten ------------------------------ */
  schicht(id) { return this.state.schichten.find((s) => s.id === id) || null; }

  // Anlegen ODER aendern - dieselbe Tuer fuer beides, das haelt die
  // Oberflaeche einfach (Ziehen, Tippen, Formular - alles landet hier).
  schichtSetzen(s, by) {
    const tag = pruefTag(s.tag);
    if (!tag) return { ok: false, fehler: "Datum unklar." };
    const vor = s.vorlageId ? this.state.vorlagen.find((v) => v.id === s.vorlageId) : null;
    const von = pruefZeit(s.von, vor ? vor.von : "09:00");
    const bis = pruefZeit(s.bis, vor ? vor.bis : "17:00");
    const emp = s.empId ? this.employee(s.empId) : null;
    if (s.empId && !emp) return { ok: false, fehler: "Mitarbeiter unbekannt." };

    const rein = {
      empId: emp ? emp.id : null,
      locId: s.locId || (emp ? emp.locId : null) || (this.state.locations[0] || {}).id || null,
      tag, von, bis,
      vorlageId: vor ? vor.id : null,
      pause: Math.max(0, Math.min(240, Number(s.pause) || (vor ? vor.pause : 0) || 0)),
      notiz: String(s.notiz || "").slice(0, 200),
      veroeffentlicht: !!s.veroeffentlicht,
    };
    let alt = s.id ? this.schicht(s.id) : null;
    if (alt) {
      // Eine bereits veroeffentlichte Schicht bleibt veroeffentlicht.
      rein.veroeffentlicht = alt.veroeffentlicht || rein.veroeffentlicht;
      const warBesetzt = alt.empId;
      Object.assign(alt, rein);
      this._audit("schicht", dayLabel(tag) + " " + von + "–" + bis + " " +
        (emp ? emp.name : "offen") + (warBesetzt && !emp ? " (freigegeben)" : ""), by);
    } else {
      alt = { id: newId("sch"), serieId: s.serieId || null, ...rein };
      this.state.schichten.push(alt);
      this._audit("schicht-neu", dayLabel(tag) + " " + von + "–" + bis + " " +
        (emp ? emp.name : "offen"), by);
    }
    this.save();
    return { ok: true, schicht: alt };
  }

  schichtWeg(id, by, ganzeSerie) {
    const s = this.schicht(id);
    if (!s) return { ok: false, fehler: "Schicht nicht gefunden." };
    if (ganzeSerie && s.serieId) {
      // Nur die Zukunft. Was schon war, bleibt als Beleg stehen.
      const abHeute = dayKey(nowMs());
      const weg = this.state.schichten.filter(
        (x) => x.serieId === s.serieId && x.tag >= abHeute);
      const ids = new Set(weg.map((x) => x.id));
      this.state.schichten = this.state.schichten.filter((x) => !ids.has(x.id));
      const serie = this.state.serien.find((x) => x.id === s.serieId);
      if (serie) serie.aktiv = false;
      this._audit("serie-weg", weg.length + " künftige Schichten entfernt", by);
      this.save();
      return { ok: true, anzahl: weg.length };
    }
    this.state.schichten = this.state.schichten.filter((x) => x.id !== id);
    this._audit("schicht-weg", dayLabel(s.tag) + " " + s.von + "–" + s.bis, by);
    this.save();
    return { ok: true, anzahl: 1 };
  }

  /* ------------------------------- Serien ------------------------------- */
  /*
   * wochentage: 1 = Montag … 7 = Sonntag.
   * Beim Anlegen werden sofort planWochen Wochen erzeugt; danach schreibt
   * serienFortschreiben() im Hintergrund weiter.
   */
  serieAnlegen({ empId, locId, wochentage, von, bis, pause, vorlageId, startTag, bisTag, notiz }, by) {
    const tage = (Array.isArray(wochentage) ? wochentage : [])
      .map(Number).filter((n) => n >= 1 && n <= 7);
    if (!tage.length) return { ok: false, fehler: "Bitte mindestens einen Wochentag." };
    const start = pruefTag(startTag) || dayKey(nowMs());
    const vor = vorlageId ? this.state.vorlagen.find((v) => v.id === vorlageId) : null;
    const serie = {
      id: newId("ser"), empId: empId || null,
      locId: locId || (this.employee(empId) || {}).locId || null,
      wochentage: tage,
      von: pruefZeit(von, vor ? vor.von : "09:00"),
      bis: pruefZeit(bis, vor ? vor.bis : "17:00"),
      pause: Math.max(0, Math.min(240, Number(pause) || (vor ? vor.pause : 0) || 0)),
      vorlageId: vor ? vor.id : null,
      notiz: String(notiz || "").slice(0, 200),
      startTag: start, bisTag: pruefTag(bisTag) || "", aktiv: true,
    };
    this.state.serien.push(serie);
    const n = this._serieBis(serie, this._planEnde());
    const e = this.employee(empId);
    this._audit("serie", (e ? e.name : "offen") + ": " +
      tage.map((d) => ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][d]).join("/") +
      " " + serie.von + "–" + serie.bis + " (" + n + " Schichten)", by);
    this.save();
    return { ok: true, serie, angelegt: n };
  }

  _planEnde() {
    const wochen = Math.max(1, Math.min(26, Number(this.state.config.planWochen) || 4));
    return dayKey(nowMs() + wochen * 7 * 86400000);
  }

  // Legt fehlende Termine der Serie bis einschliesslich bisTag an.
  // Vorhandene Tage werden NIE ueberschrieben - von Hand geaenderte
  // Schichten bleiben so, wie der Chef sie hingezogen hat.
  _serieBis(serie, bisTag) {
    if (!serie.aktiv) return 0;
    const ende = serie.bisTag && serie.bisTag < bisTag ? serie.bisTag : bisTag;
    const da = new Set(this.state.schichten
      .filter((s) => s.serieId === serie.id).map((s) => s.tag));
    let n = 0;
    let t = serie.startTag;
    const heute = dayKey(nowMs());
    if (t < heute) t = heute;
    let schutz = 0;
    while (t <= ende && schutz++ < 400) {
      const wd = wochentagVon(t);
      if (serie.wochentage.includes(wd) && !da.has(t)) {
        this.state.schichten.push({
          id: newId("sch"), serieId: serie.id, empId: serie.empId,
          locId: serie.locId, tag: t, von: serie.von, bis: serie.bis,
          pause: serie.pause, vorlageId: serie.vorlageId, notiz: serie.notiz,
          veroeffentlicht: false,
        });
        n++;
      }
      t = tagPlus(t, 1);
    }
    return n;
  }

  // Laeuft im Hintergrund mit. Sorgt dafuer, dass immer ein paar Wochen
  // Plan bereitstehen, ohne dass jemand daran denken muss.
  serienFortschreiben() {
    let n = 0;
    const ende = this._planEnde();
    for (const s of this.state.serien) n += this._serieBis(s, ende);
    if (n) this.save();
    return n;
  }

  /* ----------------------------- Ansichten ------------------------------ */
  // Das Wochenraster fuer den Planer.
  plan(vonTag, bisTag, locId) {
    const von = pruefTag(vonTag) || dayKey(nowMs());
    const bis = pruefTag(bisTag) || tagPlus(von, 6);
    const tage = [];
    for (let t = von, i = 0; t <= bis && i < 62; t = tagPlus(t, 1), i++) {
      tage.push({ tag: t, label: dayLabel(t), wd: wochentagVon(t) });
    }
    const schichten = this.state.schichten
      .filter((s) => s.tag >= von && s.tag <= bis)
      .filter((s) => !locId || s.locId === locId)
      .map((s) => this._schichtRaus(s))
      .sort((a, b) => (a.tag + a.von).localeCompare(b.tag + b.von));
    const leute = this.state.employees
      .filter((e) => e.active !== false)
      .filter((e) => !locId || e.locId === locId)
      .map((e) => ({ id: e.id, name: e.name, photo: e.photo, locId: e.locId,
        stunden: schichten.filter((s) => s.empId === e.id)
          .reduce((a, s) => a + s.minuten, 0) }));
    return {
      von, bis, tage, schichten, leute,
      vorlagen: this.vorlagen(locId),
      offen: schichten.filter((s) => !s.empId).length,
      unveroeffentlicht: schichten.filter((s) => !s.veroeffentlicht).length,
    };
  }

  _schichtRaus(s) {
    const emp = s.empId ? this.employee(s.empId) : null;
    return { ...s, name: emp ? emp.name : null, foto: emp ? emp.photo : null,
      minuten: Math.max(0, minutenZwischen(s.von, s.bis) - (s.pause || 0)),
      label: s.von + "–" + s.bis };
  }

  // Ein Klick: alles im Zeitraum sichtbar machen. Gibt zurueck, WEN es
  // betrifft - damit genau die Leute eine Mitteilung bekommen.
  veroeffentlichen(vonTag, bisTag, by) {
    const von = pruefTag(vonTag), bis = pruefTag(bisTag);
    if (!von || !bis) return { ok: false, fehler: "Zeitraum unklar." };
    const betroffen = new Map();
    let n = 0;
    for (const s of this.state.schichten) {
      if (s.tag < von || s.tag > bis || s.veroeffentlicht) continue;
      s.veroeffentlicht = true;
      n++;
      if (s.empId) betroffen.set(s.empId, (betroffen.get(s.empId) || 0) + 1);
    }
    if (n) {
      this._audit("plan-veröffentlicht", n + " Schichten " + von + " bis " + bis, by);
      this.save();
    }
    return { ok: true, anzahl: n,
      leute: [...betroffen].map(([empId, anzahl]) => ({ empId, anzahl })) };
  }

  // Was der Mitarbeiter am Handy sieht: nur veroeffentlichte Schichten.
  meineSchichten(empId, vonTag, bisTag) {
    const von = pruefTag(vonTag) || dayKey(nowMs());
    const bis = pruefTag(bisTag) || tagPlus(von, 27);
    return this.state.schichten
      .filter((s) => s.empId === empId && s.veroeffentlicht &&
        s.tag >= von && s.tag <= bis && !s.abgesagt)
      .sort((a, b) => (a.tag + a.von).localeCompare(b.tag + b.von))
      .map((s) => {
        const loc = this.location(s.locId);
        return { ...this._schichtRaus(s), ort: loc ? loc.name : "",
          offeneMeldung: this.state.meldungen.some(
            (m) => m.schichtId === s.id && m.status === "offen") };
      });
  }

  // Offene Schichten, auf die sich jemand melden koennte.
  offeneSchichten(locId, vonTag) {
    const von = pruefTag(vonTag) || dayKey(nowMs());
    return this.state.schichten
      .filter((s) => !s.empId && s.veroeffentlicht && s.tag >= von)
      .filter((s) => !locId || s.locId === locId)
      .sort((a, b) => (a.tag + a.von).localeCompare(b.tag + b.von))
      .map((s) => this._schichtRaus(s));
  }

  /* ------------------- Krankmeldung / Tausch / Bewerbung ---------------- */
  meldungAnlegen({ empId, typ, schichtId, zielEmpId, text }, by) {
    const emp = this.employee(empId);
    if (!emp) return { ok: false, fehler: "Unbekannt." };
    if (!["krank", "tausch", "bewerbung"].includes(typ))
      return { ok: false, fehler: "Unbekannte Meldung." };
    const s = schichtId ? this.schicht(schichtId) : null;
    if (typ !== "krank" && !s) return { ok: false, fehler: "Schicht nicht gefunden." };
    if (s && typ === "tausch" && s.empId !== empId)
      return { ok: false, fehler: "Das ist nicht deine Schicht." };
    // Nicht zweimal dasselbe melden.
    const doppelt = this.state.meldungen.find(
      (m) => m.status === "offen" && m.empId === empId && m.typ === typ &&
        m.schichtId === (schichtId || null));
    if (doppelt) return { ok: false, fehler: "Ist schon gemeldet.", meldung: doppelt };
    const m = {
      id: newId("mld"), ts: nowMs(), empId, typ,
      schichtId: schichtId || null, zielEmpId: zielEmpId || null,
      text: String(text || "").slice(0, 300), status: "offen",
    };
    this.state.meldungen.push(m);
    this._audit("meldung", emp.name + ": " + typText(typ) +
      (s ? " " + dayLabel(s.tag) + " " + s.von : ""), by || emp.name);
    this.save();
    return { ok: true, meldung: this._meldungRaus(m) };
  }

  _meldungRaus(m) {
    const emp = this.employee(m.empId);
    const s = m.schichtId ? this.schicht(m.schichtId) : null;
    const ziel = m.zielEmpId ? this.employee(m.zielEmpId) : null;
    return { ...m, name: emp ? emp.name : "?", foto: emp ? emp.photo : null,
      locId: emp ? emp.locId : null,
      zielName: ziel ? ziel.name : null,
      typText: typText(m.typ),
      schicht: s ? { ...this._schichtRaus(s), label2: dayLabel(s.tag) + " " + s.von + "–" + s.bis } : null };
  }

  offeneMeldungen() {
    return this.state.meldungen.filter((m) => m.status === "offen")
      .sort((a, b) => b.ts - a.ts).map((m) => this._meldungRaus(m));
  }

  /*
   * Der Chef entscheidet - und das System zieht die Folgen gleich mit:
   *   krank      + ja  -> Schicht wird frei (offen), alle sehen sie
   *   tausch     + ja  -> Schicht geht an den Wunschkollegen
   *   bewerbung  + ja  -> offene Schicht wird zugeteilt
   */
  meldungEntscheiden(id, ja, by) {
    const m = this.state.meldungen.find((x) => x.id === id);
    if (!m || m.status !== "offen") return { ok: false, fehler: "Nicht gefunden." };
    m.status = ja ? "ok" : "nein";
    m.erledigtTs = nowMs();
    m.erledigtVon = by || "chef";
    const s = m.schichtId ? this.schicht(m.schichtId) : null;
    let neuerEmp = null;
    if (ja && s) {
      if (m.typ === "krank") { s.empId = null; s.notiz = ("Krank: " + (this.employee(m.empId) || {}).name + ". " + (s.notiz || "")).slice(0, 200); }
      if (m.typ === "tausch" && m.zielEmpId) { s.empId = m.zielEmpId; neuerEmp = m.zielEmpId; }
      if (m.typ === "bewerbung") { s.empId = m.empId; neuerEmp = m.empId; }
    }
    this._audit("meldung-" + (ja ? "ok" : "nein"),
      (this.employee(m.empId) || {}).name + ": " + typText(m.typ), by);
    this.save();
    return { ok: true, meldung: this._meldungRaus(m), schicht: s ? this._schichtRaus(s) : null, neuerEmp };
  }

  /* --------------------------- Soll gegen Ist --------------------------- */
  // Wer haette da sein sollen und war es nicht - und umgekehrt.
  sollIst(vonTag, bisTag, locId) {
    const von = pruefTag(vonTag) || dayKey(nowMs());
    const bis = pruefTag(bisTag) || von;
    const raus = [];
    for (const emp of this.state.employees) {
      if (emp.active === false) continue;
      if (locId && emp.locId !== locId) continue;
      const geplant = this.state.schichten.filter(
        (s) => s.empId === emp.id && s.tag >= von && s.tag <= bis && !s.abgesagt);
      const det = this.detail(emp.id, von, bis);
      const istProTag = new Map();
      for (const w of det.wochen) for (const t of w.tage) {
        istProTag.set(t.day, (istProTag.get(t.day) || 0) +
          t.shifts.reduce((a, s) => a + (s.min || 0), 0));
      }
      const soll = geplant.reduce(
        (a, s) => a + Math.max(0, minutenZwischen(s.von, s.bis) - (s.pause || 0)), 0);
      const ist = det.min || 0;
      const tage = [];
      const alleTage = new Set([...geplant.map((s) => s.tag), ...istProTag.keys()]);
      for (const t of [...alleTage].sort()) {
        const sollT = geplant.filter((s) => s.tag === t)
          .reduce((a, s) => a + Math.max(0, minutenZwischen(s.von, s.bis) - (s.pause || 0)), 0);
        const istT = istProTag.get(t) || 0;
        tage.push({ tag: t, label: dayLabel(t), soll: sollT, ist: istT, diff: istT - sollT,
          nichtDa: sollT > 0 && istT === 0, ohnePlan: sollT === 0 && istT > 0 });
      }
      if (!soll && !ist) continue;
      raus.push({ empId: emp.id, name: emp.name, locId: emp.locId,
        soll, ist, diff: ist - soll, tage });
    }
    return raus.sort((a, b) => a.name.localeCompare(b.name));
  }

  /*
   * "Nicht erschienen": Schicht laeuft seit mindestens X Minuten, aber es
   * ist nicht gestempelt. Wird einmal je Schicht gemeldet - dafuer merkt
   * sich die Schicht selbst, dass sie schon dran war.
   */
  nichtErschienen(jetzt) {
    const c = this.state.config;
    if (!c.meldeNichtDa) return [];
    const ts = jetzt || nowMs();
    const heute = dayKey(ts);
    const jetztMin = zeitInMinuten(hhmm(ts));
    const raus = [];
    for (const s of this.state.schichten) {
      if (s.tag !== heute || !s.empId || !s.veroeffentlicht || s.abgesagt) continue;
      if (s.gemeldetNichtDa) continue;
      const start = zeitInMinuten(s.von);
      const grenze = start + (Number(c.nichtDaNach) || 15);
      if (jetztMin < grenze) continue;
      // Nach Schichtende nicht mehr nachtreten.
      if (jetztMin > zeitInMinuten(s.bis) && zeitInMinuten(s.bis) > start) continue;
      const st = this.statusOf(s.empId);
      // Hat die Person heute ueberhaupt schon gestempelt?
      const heuteGestempelt = this.eventsOf(s.empId).some(
        (e) => dayKey(e.ts) === heute && e.type === "in");
      if (st.in || heuteGestempelt) { s.gemeldetNichtDa = true; continue; }
      s.gemeldetNichtDa = true;
      const emp = this.employee(s.empId);
      raus.push({ schichtId: s.id, empId: s.empId, name: emp ? emp.name : "?",
        von: s.von, bis: s.bis, tag: s.tag, minutenSpaet: jetztMin - start });
    }
    if (raus.length) this.save();
    return raus;
  }

  /* -------------------------- Stundenzettel ----------------------------- */
  /*
   * Bereitet die Zeilen fuer den Ausdruck vor. Das Rechnen bleibt hier,
   * pdf.js zeichnet nur noch. So bleibt beides fuer sich pruefbar.
   */
  stundenzettelDaten(empIds, vonTag, bisTag) {
    const von = pruefTag(vonTag), bis = pruefTag(bisTag);
    const ids = (empIds && empIds.length ? empIds
      : this.activeEmployees().map((e) => e.id));
    const raus = [];
    for (const id of ids) {
      const emp = this.employee(id);
      if (!emp) continue;
      const det = this.detail(id, von, bis);
      const loc = this.location(emp.locId);
      const zeilen = [];
      let tage = 0;
      // detail() liefert absteigend - fuer Papier wollen wir aufsteigend.
      const wochen = det.wochen.slice().sort((a, b) => a.woche.localeCompare(b.woche));
      for (const w of wochen) {
        const wtage = w.tage.slice().sort((a, b) => a.day.localeCompare(b.day));
        for (const t of wtage) {
          if (!t.shifts.length) continue;
          tage++;
          t.shifts.forEach((s, i) => {
            const hinweise = [];
            if (s.problem === "offen") hinweise.push("noch offen");
            if (s.problem === "auto") hinweise.push("automatisch beendet");
            if (s.problem === "kein-start") hinweise.push("Kommen fehlt");
            if (s.problem === "lang") hinweise.push("ungewöhnlich lang");
            if (s.note) hinweise.push(s.note);
            zeilen.push({
              tag: i === 0 ? t.label : "",   // dayLabel() bringt Wochentag + Datum schon mit
              kommen: s.start || "–", gehen: s.end || "–",
              pause: s.brutto > s.min ? String(s.brutto - s.min) + " min" : "",
              std: stundenText(s.min),
              hinweis: hinweise.join(" · "),
              hell: i > 0,
              grau: s.problem ? 0.35 : 0,
            });
          });
          if (t.shifts.length > 1) {
            zeilen.push({ tag: "", std: stundenText(t.min), hinweis: "Tagessumme",
              fett: true, grau: 0.3 });
          }
        }
        if (wochen.length > 1) {
          zeilen.push({ tag: w.woche.replace("-KW", " · KW "), std: stundenText(w.min),
            hinweis: "Wochensumme", fett: true, hell: true });
        }
      }
      raus.push({
        empId: id, name: emp.name, firma: this.state.config.firma,
        ort: loc ? loc.name : "", von, bis,
        zeitraum: von.slice(8) + "." + von.slice(5, 7) + ". bis " +
          bis.slice(8) + "." + bis.slice(5, 7) + "." + bis.slice(0, 4),
        zeilen, summe: det.min, tage,
      });
    }
    return raus;
  }

  /* ------------------------- Push-Abos verwalten ------------------------ */
  aboSetzen({ wer, endpoint, keys, geraet }) {
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) return null;
    let a = this.state.abos.find((x) => x.endpoint === endpoint);
    if (a) { a.wer = wer; a.keys = keys; a.geraet = geraet || a.geraet; a.ts = nowMs(); }
    else {
      a = { id: newId("abo"), wer, endpoint, keys, geraet: geraet || "", ts: nowMs() };
      this.state.abos.push(a);
    }
    this.save();
    return a;
  }
  aboWeg(endpoint) {
    const vorher = this.state.abos.length;
    this.state.abos = this.state.abos.filter((a) => a.endpoint !== endpoint);
    if (this.state.abos.length !== vorher) this.save();
    return vorher - this.state.abos.length;
  }
  abosVon(wer) { return this.state.abos.filter((a) => a.wer === wer); }
}

/* --------------------------- kleine Helfer -------------------------------- */

function pruefTag(t) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(t || "")) ? String(t) : null;
}
function pruefZeit(t, ersatz) {
  const s = String(t || "");
  if (!/^\d{1,2}:\d{2}$/.test(s)) return ersatz;
  const [h, m] = s.split(":").map(Number);
  if (h > 23 || m > 59) return ersatz;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function zeitInMinuten(t) {
  const [h, m] = String(t || "0:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
// Ueber Mitternacht (22:00–02:00) wird richtig gerechnet.
function minutenZwischen(von, bis) {
  const a = zeitInMinuten(von), b = zeitInMinuten(bis);
  return b >= a ? b - a : b + 24 * 60 - a;
}
function tagPlus(tag, n) {
  const [y, m, d] = tag.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function wochentagVon(tag) {   // 1 = Montag … 7 = Sonntag
  const [y, m, d] = tag.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}
function stundenText(min) {
  const v = Math.max(0, Math.round(min || 0));
  return Math.floor(v / 60) + ":" + String(v % 60).padStart(2, "0");
}
function typText(t) {
  return t === "krank" ? "Krankmeldung" : t === "tausch" ? "Tauschanfrage"
    : t === "bewerbung" ? "Meldung auf offene Schicht" : t;
}

module.exports = { ZeitStore, dayKey, hhmm, dayLabel, isoWeek, tsFrom, tagPlus,
                   wochentagVon, minutenZwischen: minutenZwischen,
                   fmtHours, minutesBetween, TZ, CODE_RE };
