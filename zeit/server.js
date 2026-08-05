"use strict";

/*
 * Kingsley Zeit – Server
 * =======================
 * Absichtlich OHNE fremde Bibliotheken: laeuft mit blankem Node auf jedem
 * Rechner, kein "npm install", nichts was veralten kann. Eine Stempeluhr
 * muss jeden Tag funktionieren - je weniger Teile, desto besser.
 *
 * ZWEI PORTS - das ist wichtig fuer die Sicherheit:
 *
 *   8792  PRIVAT   alles, auch der Chef-Bereich.
 *                  Erreichbar im Laden-Netzwerk und ueber Tailscale.
 *                  Wird NIE ins offene Internet gestellt.
 *   8794  OEFFENTLICH  nur Stempeln. Genau dieser Port geht per Tailscale-
 *                  Funnel ins Internet, damit Handys und die iPads der
 *                  anderen Standorte ihn erreichen. Der Chef-Bereich
 *                  existiert auf diesem Port schlicht nicht - er ist also
 *                  nicht "nur passwortgeschuetzt", sondern gar nicht da.
 *
 * Seiten
 *   /                  Stempeln per persoenlichem Code
 *   /terminal/<CODE>   iPad im Laden dauerhaft freischalten (Regelfall)
 *   /s/<CODE>          NFC-Aufkleber: fester Link -> wechselnde Sitzung
 *   /chef              Chef-Bereich (nur auf dem privaten Port)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { ZeitStore, dayKey, hhmm, fmtHours, dayLabel } = require("./store");
const pushmod = require("./push");
const { stundenzettel } = require("./pdf");
const { STEMPEL_HTML } = require("./seite-stempel");
const { TERMINAL_HTML } = require("./seite-terminal");
const { CHEF_HTML } = require("./seite-chef");

/* ------------------------------- Hilfen ---------------------------------- */

function readBody(req, limit = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("zu gross")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (_) { resolve({}); }
    });
    req.on("error", reject);
  });
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function json(res, obj, code = 200) {
  const b = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8",
    "Content-Length": b.length, "Cache-Control": "no-store" });
  res.end(b);
}
function html(res, s) {
  const b = Buffer.from(s, "utf8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8",
    "Content-Length": b.length, "Cache-Control": "no-store" });
  res.end(b);
}
function redirect(res, to) {
  res.writeHead(302, { Location: to, "Cache-Control": "no-store" });
  res.end();
}

/* ------------------------- Helfer im Hintergrund -------------------------- */
/*
 * Der Service Worker laeuft im Browser weiter, auch wenn die Seite zu ist.
 * Nur er darf Mitteilungen anzeigen. Er bleibt bewusst winzig: entpacken,
 * anzeigen, beim Antippen die richtige Seite oeffnen. Sonst nichts - kein
 * Zwischenspeicher, nichts, was jemals veralten oder Aerger machen kann.
 */
const SW_JS = `/* Kingsley Zeit */
self.addEventListener("install", function(e){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function(e){
  var d = { titel: "Kingsley Zeit", text: "", url: "/terminal", tag: "zeit" };
  try { if (e.data) d = Object.assign(d, e.data.json()); }
  catch (_) { try { d.text = e.data.text(); } catch (_2) {} }
  e.waitUntil(self.registration.showNotification(d.titel, {
    body: d.text,
    icon: "/icon.png",
    badge: "/icon.png",
    tag: d.tag,
    renotify: true,
    requireInteraction: !!d.dringend,
    data: { url: d.url }
  }));
});

self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var ziel = (e.notification.data && e.notification.data.url) || "/terminal";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then(function(liste){
      for (var i = 0; i < liste.length; i++) {
        if (liste[i].url.indexOf(ziel) > -1 && "focus" in liste[i]) return liste[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(ziel);
    }));
});
`;

// Icon fuer den Home-Bildschirm und die Mitteilungen. Liegt als Datei neben
// dem Programm; fehlt sie, wird ein schlichter oranger Punkt gezeichnet,
// damit nichts kaputtgeht.
let ICON;
try { ICON = fs.readFileSync(path.join(__dirname, "icon.png")); }
catch (_) { ICON = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmM" +
  "IQAAAABJRU5ErkJggg==", "base64"); }

// Die Schrift der Oberflaeche (Inter). Selbst ausgeliefert, kein fremder
// Dienst - die App muss auch ohne Internet laufen.
let SCHRIFT = null;
try { SCHRIFT = fs.readFileSync(path.join(__dirname, "schrift.woff2")); } catch (_) {}

/* ---------------------------- Server bauen -------------------------------- */

function createZeitServer({ dataDir, port = 8792, publicPort = 8794 }) {
  const store = new ZeitStore(dataDir);

  if (!store.state.config.secret) {
    store.state.config.secret = crypto.randomBytes(24).toString("hex");
    store.save();
  }
  const SECRET = store.state.config.secret;

  // Schluesselpaar fuer die Mitteilungen. Wird EINMAL erzeugt und bleibt -
  // aendert man es, muessen sich alle Geraete neu anmelden.
  if (!store.state.config.vapid || !store.state.config.vapid.pub) {
    store.state.config.vapid = pushmod.neuesSchluesselpaar();
    store.save();
  }
  const VAPID = store.state.config.vapid;

  /* ------------------------ Mitteilungen schicken ------------------------ */
  /*
   * wer: "chef" oder eine Mitarbeiter-Id. Abos, die der Push-Dienst als
   * "gibt es nicht mehr" meldet, werden gleich aufgeraeumt - sonst sammelt
   * sich ueber die Jahre Muell an.
   */
  async function melden(wer, titel, text, extra = {}) {
    const abos = store.abosVon(wer);
    if (!abos.length) return { verschickt: 0 };
    const nachricht = JSON.stringify({
      titel, text, url: extra.url || "/chef", tag: extra.tag || "zeit",
      dringend: extra.dringend !== false,
    });
    let ok = 0;
    for (const abo of abos) {
      const r = await pushmod.senden(VAPID, abo, nachricht, {
        kontakt: store.state.config.pushKontakt || undefined,
        dringend: extra.dringend !== false,
      });
      if (r.ok) ok++;
      else if (r.weg) { store.aboWeg(abo.endpoint); console.log("[zeit] Abo abgemeldet (Gerät weg)"); }
      else console.log("[zeit] Mitteilung fehlgeschlagen:", r.status || r.fehler);
    }
    return { verschickt: ok, von: abos.length };
  }

  const sign = (v) =>
    crypto.createHmac("sha256", SECRET).update(v).digest("hex").slice(0, 24);
  function makeOrt(locId, minutes, terminal) {
    const base = locId + "." + (Date.now() + minutes * 60000) + "." + (terminal ? "T" : "H");
    return base + "." + sign(base);
  }
  function readOrt(val) {
    if (!val) return null;
    const p = String(val).split(".");
    if (p.length !== 4) return null;
    const base = p[0] + "." + p[1] + "." + p[2];
    if (sign(base) !== p[3]) return null;
    if (Number(p[1]) < Date.now()) return null;
    return { locId: p[0], terminal: p[2] === "T" };
  }

  /*
   * NFC-Aufkleber: fester Link, wechselnde Sitzung
   * ---------------------------------------------
   * Auf dem Aufkleber steht eine unveraenderliche Adresse (/s/<CODE>) - anders
   * geht es mit einfachen NFC-Stickern nicht. Beim Antippen erzeugt der Server
   * eine FRISCHE, kurzlebige Sitzung und leitet auf /t/<zufall> weiter.
   *
   * Was das bringt:
   *   - Der Link, den der Mitarbeiter im Browser sieht, ist jedes Mal anders
   *     und verfaellt nach wenigen Minuten. Man kann ihn also nicht
   *     "aufheben" und spaeter wiederverwenden.
   *   - Die Sitzung wird an das erste Geraet gebunden, das sie oeffnet.
   *     Weiterschicken an einen Kollegen bringt nichts.
   *
   * Was das NICHT bringt (ehrlich):
   *   - Wer sich die feste Aufkleber-Adresse notiert, kann sie auch von zu
   *     Hause oeffnen und bekommt dann ebenfalls eine frische Sitzung.
   *     Dagegen hilft nur der TAGES-CODE, der ausschliesslich im Laden
   *     angezeigt wird. Deshalb ist er zuschaltbar.
   */
  const tapSessions = new Map();   // id -> { locId, erstellt, geraet }
  function neueTapSession(locId) {
    const id = crypto.randomBytes(9).toString("base64url");
    tapSessions.set(id, { locId, erstellt: Date.now(), geraet: null });
    // aufraeumen, damit die Liste nicht waechst
    if (tapSessions.size > 500) {
      const grenze = Date.now() - 30 * 60000;
      for (const [k, v] of tapSessions) if (v.erstellt < grenze) tapSessions.delete(k);
    }
    return id;
  }
  function tapSessionOeffnen(id, geraeteId) {
    const s = tapSessions.get(id);
    if (!s) return null;
    const maxAlter = Math.max(5, store.state.config.presenceMinutes) * 60000;
    if (Date.now() - s.erstellt > maxAlter) { tapSessions.delete(id); return null; }
    if (s.geraet && s.geraet !== geraeteId) return null;   // schon von jemand anderem geoeffnet
    s.geraet = geraeteId;
    return s;
  }

  const chefSessions = new Map();      // id -> { exp, fern }
  function newChefSession(fern) {
    const id = crypto.randomBytes(18).toString("hex");
    // Von unterwegs kuerzer: ein vergessenes Handy im Cafe soll nicht 12 h
    // lang offen sein.
    const dauer = fern ? 3 * 3600 * 1000 : 12 * 3600 * 1000;
    chefSessions.set(id, { exp: Date.now() + dauer, fern: !!fern });
    if (chefSessions.size > 200) {
      for (const [k, v] of chefSessions) if (v.exp < Date.now()) chefSessions.delete(k);
    }
    return id;
  }
  function isChef(req, oeffentlich) {
    const c = cookies(req).zeit_chef;
    if (!c) return false;
    const s = chefSessions.get(c);
    if (!s || s.exp < Date.now()) { chefSessions.delete(c); return false; }
    // Eine Anmeldung mit der 4-stelligen PIN (privat/Tailscale) gilt draussen
    // NICHT. Wer von unterwegs rein will, braucht das lange Passwort.
    if (oeffentlich && !s.fern) return false;
    return true;
  }

  /* ---------------------- Chef von unterwegs ----------------------------- */
  /*
   * Zwei Schluessel, beide noetig:
   *   1. geheime Adresse /f/<32 Zeichen>  -> setzt ein Geraete-Merkmal
   *   2. langes Passwort                  -> die eigentliche Anmeldung
   * Ohne (1) antwortet der oeffentliche Port auf /chef mit 404. Fuer jeden
   * Scanner im Internet existiert der Chef-Bereich damit gar nicht.
   */
  function makeFern() {
    const base = "F." + (Date.now() + 90 * 24 * 3600 * 1000);
    return base + "." + sign(base + "." + (store.state.config.fernPfad || ""));
  }
  function fernOk(req) {
    const v = cookies(req).zeit_fern;
    if (!v) return false;
    const p = String(v).split(".");
    if (p.length !== 3) return false;
    // An den Pfad gebunden: neuer geheimer Link -> alle alten Geraete fliegen raus.
    if (sign(p[0] + "." + p[1] + "." + (store.state.config.fernPfad || "")) !== p[2]) return false;
    return Number(p[1]) > Date.now();
  }

  // Fehlversuche bremsen. Aus dem Internet darf niemand durchprobieren.
  const fehlversuche = new Map();     // ip -> { n, bis }
  function ipVon(req) {
    const f = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return f || (req.socket && req.socket.remoteAddress) || "?";
  }
  function gesperrt(req) {
    const e = fehlversuche.get(ipVon(req));
    if (!e || !e.bis) return 0;
    if (e.bis < Date.now()) { fehlversuche.delete(ipVon(req)); return 0; }
    return Math.ceil((e.bis - Date.now()) / 1000);
  }
  function fehlschlag(req) {
    const ip = ipVon(req);
    const e = fehlversuche.get(ip) || { n: 0, bis: 0 };
    e.n++;
    e.letzte = Date.now();
    // 5 Versuche frei, danach wird gewartet - und die Wartezeit verdoppelt sich.
    if (e.n >= 5) e.bis = Date.now() + Math.min(60, Math.pow(2, e.n - 5)) * 60000;
    fehlversuche.set(ip, e);
    if (fehlversuche.size > 500) {
      const alt = Date.now() - 24 * 3600 * 1000;
      for (const [k, v] of fehlversuche) if ((v.letzte || 0) < alt) fehlversuche.delete(k);
    }
    return e;
  }
  function erfolg(req) { fehlversuche.delete(ipVon(req)); }
  function fehlversuchListe() {
    const out = [];
    for (const [ip, v] of fehlversuche) {
      if (!v.letzte) continue;
      out.push({ ip, n: v.n, letzte: v.letzte, gesperrtBis: v.bis > Date.now() ? v.bis : 0 });
    }
    return out.sort((a, b) => b.letzte - a.letzte).slice(0, 20);
  }

  function ort(req) {
    const v = readOrt(cookies(req).zeit_ort);
    if (v) return { ok: true, locId: v.locId, terminal: v.terminal };
    if (!store.state.config.requirePresence) return { ok: true, locId: null, terminal: false };
    return { ok: false, locId: null, terminal: false };
  }

  // Adresse, die auf die NFC-Aufkleber und ins iPad kommt. Ist eine
  // oeffentliche Adresse hinterlegt (Tailscale-Funnel), gilt die - sonst
  // die Adresse, ueber die der Chef gerade selbst draufschaut.
  function baseUrl(req) {
    const fest = (store.state.config.oeffentlicheAdresse || "").trim();
    if (fest) return fest;
    const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    let host = req.headers.host || ("localhost:" + port);
    // Der Chef schaut auf dem privaten Port - die Aufkleber muessen aber auf
    // den oeffentlichen zeigen.
    host = host.replace(new RegExp(":" + port + "$"), ":" + publicPort);
    return proto + "://" + host;
  }

  // Die geheime Adresse fuer "Chef von unterwegs". Nur ueber die oeffentliche
  // Adresse sinnvoll - im Laden-Netz braucht der Chef sie nicht.
  function fernAdresse(req) {
    const f = store.fernStatus();
    if (!f.pfad) return "";
    return baseUrl(req).replace(/\/+$/, "") + "/f/" + f.pfad;
  }

  // Freundliche Rueckmeldung beim Ausstempeln: was wurde heute gearbeitet?
  function heuteStunden(empId, ts) {
    const k = dayKey(ts);
    const d = store.detail(empId, k, k);
    return d && d.min ? fmtHours(d.min) : null;
  }

  /* -------------------- Automatisches Ausstempeln ----------------------- */
  // Alle 5 Minuten pruefen. Ausserdem beim naechsten Einstempeln (im Store).
  const autoTimer = setInterval(() => {
    try {
      const erledigt = store.autoCloseOpen();
      for (const e of erledigt) {
        console.log("[zeit] " + e.name + " automatisch ausgestempelt (" + hhmm(e.ts) + ")");
        if (store.state.config.meldeVergessen) {
          melden("chef", "Ausstempeln vergessen",
            e.name + " wurde automatisch um " + hhmm(e.ts) + " ausgestempelt. " +
            "Bitte unter „Zu prüfen“ nachtragen.",
            { url: "/chef#pruefen", tag: "vergessen" });
          melden(e.empId, "Du wurdest automatisch ausgestempelt",
            "Um " + hhmm(e.ts) + ". Sag kurz Bescheid, falls das nicht stimmt.",
            { tag: "vergessen", dringend: false });
        }
      }
      // Zusaetzlich zur festen Uhrzeit, falls eingestellt
      const t = store.state.config.autoOutTime;
      if (t) {
        const jetzt = hhmm(Date.now());
        if (jetzt === t) {
          for (const emp of store.activeEmployees()) {
            const st = store.statusOf(emp.id);
            if (st.in) {
              store.addEvent({ empId: emp.id, type: "out", day: dayKey(Date.now()),
                time: t, note: "Automatisch zum Tagesende – bitte prüfen" }, "system");
            }
          }
        }
      }
    } catch (err) {
      console.error("[zeit] Auto-Ausstempeln:", err.message);
    }
  }, 5 * 60 * 1000);
  if (autoTimer.unref) autoTimer.unref();

  /* --------------------- Nicht erschienen + Erinnerung ------------------- */
  /*
   * Jede Minute nachschauen. Der Store merkt sich pro Schicht, dass schon
   * gemeldet wurde - es klingelt also genau einmal, nicht im Minutentakt.
   */
  const planTimer = setInterval(() => {
    try {
      for (const f of store.nichtErschienen()) {
        console.log("[zeit] nicht erschienen: " + f.name + " (" + f.von + ")");
        melden("chef", "Nicht erschienen",
          f.name + " sollte um " + f.von + " anfangen und hat noch nicht gestempelt (" +
          f.minutenSpaet + " Min.).", { url: "/chef", tag: "nichtda-" + f.schichtId });
        melden(f.empId, "Schicht läuft seit " + f.von,
          "Du bist noch nicht eingestempelt. Alles in Ordnung?",
          { tag: "nichtda-" + f.schichtId });
      }
    } catch (err) {
      console.error("[zeit] Schicht-Prüfung:", err.message);
    }
  }, 60 * 1000);
  if (planTimer.unref) planTimer.unref();

  // Serien ein paar Wochen voraushalten - stuendlich reicht dicke.
  const serienTimer = setInterval(() => {
    try {
      const n = store.serienFortschreiben();
      if (n) console.log("[zeit] " + n + " Schichten aus Serien vorausgeplant.");
    } catch (err) { console.error("[zeit] Serien:", err.message); }
  }, 3600 * 1000);
  if (serienTimer.unref) serienTimer.unref();
  try { store.serienFortschreiben(); } catch (_) {}

  /* ------------------------------ Routen --------------------------------- */

  async function behandle(req, res, oeffentlich) {
    let url;
    try { url = new URL(req.url, "http://x"); } catch (_) { res.writeHead(400); return res.end(); }
    const p = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method || "GET";

    try {
      /* --- iPad dauerhaft freischalten --- */
      if (method === "GET" && p.startsWith("/terminal/")) {
        const loc = store.locationByToken(decodeURIComponent(p.slice(10)));
        if (!loc) return html(res, fehlerSeite("Dieser Code ist unbekannt.",
          "Bitte im Chef-Bereich nachsehen."));
        res.setHeader("Set-Cookie", "zeit_ort=" +
          encodeURIComponent(makeOrt(loc.id, 365 * 24 * 60, true)) +
          "; Path=/; Max-Age=" + (365 * 24 * 3600) + "; SameSite=Lax");
        // Auf /terminal weiterleiten: dort loesen die relativen Adressen der
        // Seite (api/…, fotos/…) korrekt auf die Wurzel auf.
        return redirect(res, "../terminal");
      }
      if (method === "GET" && p === "/terminal") {
        const o = ort(req);
        if (!o.ok) return html(res, fehlerSeite("Bitte am Eingang antippen",
          "Halte dein Handy kurz an den NFC-Aufkleber im Laden – dann öffnet sich " +
          "diese Seite von selbst. (Für das iPad einmalig die Terminal-Adresse " +
          "aus dem Chef-Bereich öffnen.)"));
        return html(res, TERMINAL_HTML);
      }

      /* --- NFC-Aufkleber: fester Link -> frische Sitzung -> wechselnde Adresse --- */
      if (method === "GET" && (p.startsWith("/s/") || p.startsWith("/z/"))) {
        const loc = store.locationByToken(decodeURIComponent(p.slice(3)));
        if (!loc) return html(res, fehlerSeite("Dieser Aufkleber ist unbekannt.",
          "Bitte beim Chef melden."));
        const sid = neueTapSession(loc.id);
        return redirect(res, "../t/" + sid);
      }

      /* --- Die wechselnde Adresse: einmalig, kurzlebig, geraetegebunden --- */
      if (method === "GET" && p.startsWith("/t/")) {
        const sid = decodeURIComponent(p.slice(3));
        const ck = cookies(req);
        let geraet = ck.zeit_geraet;
        if (!geraet) geraet = crypto.randomBytes(9).toString("hex");
        const s = tapSessionOeffnen(sid, geraet);
        if (!s) return html(res, fehlerSeite("Dieser Link ist abgelaufen.",
          "Bitte das Handy noch einmal an den Aufkleber halten."));
        res.setHeader("Set-Cookie", [
          "zeit_geraet=" + geraet + "; Path=/; Max-Age=" + (365 * 24 * 3600) + "; SameSite=Lax",
          "zeit_ort=" + encodeURIComponent(makeOrt(s.locId, store.state.config.presenceMinutes, false)) +
            "; Path=/; Max-Age=" + (store.state.config.presenceMinutes * 60) + "; SameSite=Lax",
        ]);
        // Am Handy erscheint genau dieselbe Ansicht wie auf dem iPad.
        return html(res, TERMINAL_HTML);
      }

      /* --- Chef von unterwegs: geheime Adresse einmal pro Geraet oeffnen --- */
      if (method === "GET" && p.startsWith("/f/")) {
        const f = store.fernStatus();
        const gegeben = decodeURIComponent(p.slice(3));
        // Zeitgleicher Vergleich, damit man sich den Pfad nicht "ertasten" kann.
        const a = Buffer.from(gegeben), b = Buffer.from(f.pfad || "-");
        const passt = f.aktiv && a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!passt) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("Nicht gefunden");
        }
        res.setHeader("Set-Cookie", "zeit_fern=" + encodeURIComponent(makeFern()) +
          "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (90 * 24 * 3600));
        return redirect(res, "../chef");
      }

      // Browser fragen automatisch danach - sauber mit "nichts da" beantworten.
      if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }

      /* --- Mitteilungen: der kleine Helfer im Hintergrund --- */
      // MUSS an der Wurzel liegen, sonst gilt er nicht fuer die ganze Seite.
      if (method === "GET" && p === "/sw.js") {
        const b = Buffer.from(SW_JS, "utf8");
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8",
          "Content-Length": b.length, "Service-Worker-Allowed": "/",
          "Cache-Control": "no-cache" });
        return res.end(b);
      }
      if (method === "GET" && p === "/app.webmanifest") {
        return json(res, {
          name: store.state.config.firma + " Zeit",
          short_name: store.state.config.firma || "Zeit",
          start_url: "/terminal", scope: "/", display: "standalone",
          background_color: "#0B0D12", theme_color: "#0B0D12",
          icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
        });
      }
      if (method === "GET" && p === "/icon.png") {
        res.writeHead(200, { "Content-Type": "image/png",
          "Content-Length": ICON.length, "Cache-Control": "public, max-age=86400" });
        return res.end(ICON);
      }

      /* --- Die Schrift (Inter) liegt als Datei neben dem Programm. Fehlt
             sie, nimmt der Browser die Systemschrift - nichts geht kaputt. --- */
      if (method === "GET" && p === "/schrift.woff2") {
        if (!SCHRIFT) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": "font/woff2",
          "Content-Length": SCHRIFT.length, "Cache-Control": "public, max-age=604800" });
        return res.end(SCHRIFT);
      }

      /* --- Seiten --- */
      if (method === "GET" && (p === "/" || p === "/index.html")) return html(res, STEMPEL_HTML);
      if (method === "GET" && p === "/chef") {
        if (oeffentlich && !(store.fernStatus().aktiv && fernOk(req))) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("Nicht gefunden");
        }
        return html(res, CHEF_HTML);
      }

      /* --- Fotos --- */
      if (method === "GET" && p.startsWith("/fotos/")) {
        const file = path.join(store.photoDir, path.basename(decodeURIComponent(p.slice(7))));
        if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
        const ext = path.extname(file).toLowerCase();
        const typ = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        const buf = fs.readFileSync(file);
        res.writeHead(200, { "Content-Type": typ, "Content-Length": buf.length,
          "Cache-Control": "public, max-age=300" });
        return res.end(buf);
      }

      /* ------------------------ Stempel-API ----------------------------- */

      if (method === "GET" && p === "/api/info") {
        const o = ort(req);
        return json(res, { firma: store.state.config.firma, sperre: !o.ok });
      }

      // Terminal: Liste aller Mitarbeiter mit Status
      /*
       * Dieselbe Kachel-Ansicht fuer iPad UND Handy.
       * - iPad (dauerhaft freigeschaltet): Code nur, wenn der Chef es will.
       * - Handy (nach NFC-Tipp): Code immer - das Handy ist ja privat, und der
       *   Code wird im Browser gemerkt, muss also nur einmal getippt werden.
       */
      if (method === "GET" && p === "/api/terminal/liste") {
        const o = ort(req);
        if (!o.ok) return json(res, { fehler: "kein-zugang" });
        const leute = store.live().filter((x) => !o.locId || x.locId === o.locId);
        const auf = store.darfStempeln(null, o.locId);
        return json(res, { leute, config: {
          firma: store.state.config.firma,
          codeNoetig: !o.terminal || !!store.state.config.terminalRequireCode,
          amHandy: !o.terminal,
          zu: auf.ok ? null : { von: auf.von, bis: auf.bis } } });
      }

      if (method === "POST" && p === "/api/terminal/stempeln") {
        const o = ort(req);
        if (!o.ok) return json(res, { ok: false, fehler: "Kein Zugang – bitte Aufkleber antippen" });
        const auf = store.darfStempeln(null, o.locId);
        if (!auf.ok) return json(res, { ok: false,
          fehler: "Außerhalb der Öffnungszeiten (" + auf.von + "–" + auf.bis + ")" });
        const b = await readBody(req);
        const emp = store.employee(b.empId);
        if (!emp || emp.active === false) return json(res, { ok: false, fehler: "Unbekannt" });
        const codeNoetig = !o.terminal || !!store.state.config.terminalRequireCode;
        if (codeNoetig && !store.checkEmployeeCode(emp.id, b.code)) {
          return json(res, { ok: false, codeFalsch: true });
        }
        return stempelAntwort(res, emp, o.locId, o.terminal ? "terminal" : "handy");
      }

      // Handy: Code pruefen
      if (method === "POST" && p === "/api/code") {
        const o = ort(req);
        if (!o.ok) return json(res, { sperre: true });
        const b = await readBody(req);
        const emp = store.findByCode(b.code);
        if (!emp) return json(res, { ok: false });
        const st = store.statusOf(emp.id);
        const selbst = store.selbst(emp.id) || {};
        return json(res, { ok: true, id: emp.id, name: emp.name, photo: emp.photo,
          in: st.in, since: st.since ? hhmm(st.since) : null,
          heute: selbst.heute, woche: selbst.woche });
      }

      // Handy: stempeln
      if (method === "POST" && p === "/api/stempeln") {
        const o = ort(req);
        if (!o.ok) return json(res, { sperre: true });
        const auf = store.darfStempeln(null, o.locId);
        if (!auf.ok) return json(res, { ok: false,
          fehler: "Außerhalb der Öffnungszeiten (" + auf.von + "–" + auf.bis + ")" });
        const b = await readBody(req);
        const emp = store.findByCode(b.code);
        if (!emp) return json(res, { ok: false, fehler: "Code unbekannt" });
        return stempelAntwort(res, emp, o.locId, o.terminal ? "terminal" : "handy");
      }

      /* ------------------- Mitteilungen an- und abmelden ---------------- */

      if (method === "GET" && p === "/api/push/schluessel") {
        return json(res, { pub: VAPID.pub });
      }
      if (method === "POST" && p === "/api/push/an") {
        const b = await readBody(req);
        const sub = b.abo || {};
        if (!sub.endpoint || !sub.keys) return json(res, { ok: false, fehler: "Abo unvollständig." });
        let wer = null;
        if (b.wer === "chef") {
          if (!isChef(req, oeffentlich)) return json(res, { ok: false, fehler: "Nicht angemeldet." });
          wer = "chef";
        } else {
          // Mitarbeiter: nur mit dem eigenen Code - sonst koennte man sich
          // die Mitteilungen eines Kollegen aufs Handy holen.
          const emp = store.findByCode(b.code);
          if (!emp) return json(res, { ok: false, fehler: "Code stimmt nicht." });
          wer = emp.id;
        }
        store.aboSetzen({ wer, endpoint: sub.endpoint, keys: sub.keys,
          geraet: String(b.geraet || "").slice(0, 60) });
        return json(res, { ok: true, wer });
      }
      if (method === "POST" && p === "/api/push/aus") {
        const b = await readBody(req);
        store.aboWeg(b.endpoint);
        return json(res, { ok: true });
      }
      if (method === "POST" && p === "/api/push/probe") {
        const b = await readBody(req);
        let wer = null;
        if (b.wer === "chef") {
          if (!isChef(req, oeffentlich)) return json(res, { ok: false });
          wer = "chef";
        } else {
          const emp = store.findByCode(b.code);
          if (!emp) return json(res, { ok: false, fehler: "Code stimmt nicht." });
          wer = emp.id;
        }
        const r = await melden(wer, "Test von Kingsley Zeit",
          "Wenn du das liest, kommen die Mitteilungen an.", { dringend: false });
        return json(res, { ok: r.verschickt > 0, ...r });
      }

      /* -------------------- Mitarbeiter: mein Plan ---------------------- */
      // Laeuft ueber denselben Weg wie das Stempeln: Aufkleber/Terminal +
      // eigener Code. Kein zusaetzliches Konto, kein zusaetzliches Passwort.
      if (method === "POST" && p === "/api/mein") {
        const o = ort(req);
        if (!o.ok) return json(res, { sperre: true });
        const b = await readBody(req);
        const emp = store.findByCode(b.code);
        if (!emp) return json(res, { ok: false, fehler: "Code stimmt nicht." });
        const heute = dayKey(Date.now());
        const bis = dayKey(Date.now() + 28 * 86400000);
        const st = store.statusOf(emp.id);
        const selbst = store.selbst(emp.id) || {};
        return json(res, {
          ok: true, id: emp.id, name: emp.name, photo: emp.photo,
          in: st.in, since: st.since ? hhmm(st.since) : null,
          heute: selbst.heute, woche: selbst.woche,
          schichten: store.meineSchichten(emp.id, heute, bis),
          offene: store.offeneSchichten(emp.locId, heute).slice(0, 20),
          kollegen: store.activeEmployees()
            .filter((e) => e.id !== emp.id && e.locId === emp.locId)
            .map((e) => ({ id: e.id, name: e.name, photo: e.photo })),
          meldungen: store.state.meldungen.filter((m) => m.empId === emp.id)
            .sort((a, b2) => b2.ts - a.ts).slice(0, 10)
            .map((m) => ({ id: m.id, typ: m.typ, status: m.status, schichtId: m.schichtId })),
        });
      }
      if (method === "POST" && p === "/api/meldung") {
        const o = ort(req);
        if (!o.ok) return json(res, { sperre: true });
        const b = await readBody(req);
        const emp = store.findByCode(b.code);
        if (!emp) return json(res, { ok: false, fehler: "Code stimmt nicht." });
        const r = store.meldungAnlegen({ empId: emp.id, typ: b.typ,
          schichtId: b.schichtId, zielEmpId: b.zielEmpId, text: b.text }, emp.name);
        if (r.ok) {
          const s = r.meldung.schicht;
          melden("chef", r.meldung.typText,
            emp.name + (s ? ": " + s.label2 : "") + (b.text ? " – " + String(b.text).slice(0, 80) : ""),
            { url: "/chef#plan", tag: "meldung" });
        }
        return json(res, r);
      }

      function stempelAntwort(res2, emp, locId, method2) {
        let r;
        try {
          r = store.stamp(emp.id, { locId: locId || emp.locId, method: method2 });
        } catch (e) {
          if (e.code === "TOO_SOON") {
            return json(res2, { ok: false, fehler: "Gerade eben schon gestempelt." });
          }
          return json(res2, { ok: false, fehler: e.message });
        }
        const heute = r.event.type === "out" ? heuteStunden(emp.id, r.event.ts) : null;
        return json(res2, { ok: true, type: r.event.type, name: emp.name,
          zeit: hhmm(r.event.ts), heute });
      }

      /* --------------------------- Chef-API ----------------------------- */

      /*
       * Auf dem oeffentlichen Port gibt es den Chef-Bereich normalerweise
       * nicht - er antwortet mit 404, ist fuer Scanner also unsichtbar.
       * Ausnahme: der Chef hat den Fernzugang eingeschaltet UND dieses Geraet
       * hat die geheime Adresse /f/<...> schon einmal geoeffnet.
       */
      if (oeffentlich && p.startsWith("/api/chef") &&
          !(store.fernStatus().aktiv && fernOk(req))) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Nicht gefunden");
      }

      if (method === "GET" && p === "/api/chef/status") {
        return json(res, { eingerichtet: store.isSetupDone(),
          angemeldet: isChef(req, oeffentlich),
          fern: !!oeffentlich, wartenSek: gesperrt(req) });
      }
      if (method === "POST" && p === "/api/chef/setup") {
        const b = await readBody(req);
        // Erst-Einrichtung nur im Laden/Tailscale, nie aus dem offenen Internet.
        if (oeffentlich) return json(res, { ok: false, fehler: "Nur im Laden möglich." });
        if (store.isSetupDone()) return json(res, { ok: false, fehler: "Schon eingerichtet." });
        if (!/^\d{4,8}$/.test(String(b.pin || "")))
          return json(res, { ok: false, fehler: "4 bis 8 Ziffern." });
        store.setChefPin(b.pin, "setup");
        res.setHeader("Set-Cookie", "zeit_chef=" + newChefSession(false) +
          "; Path=/; HttpOnly; SameSite=Lax");
        return json(res, { ok: true });
      }
      if (method === "POST" && p === "/api/chef/login") {
        const warte = gesperrt(req);
        if (warte) {
          return json(res, { ok: false, wartenSek: warte,
            fehler: "Zu viele Fehlversuche. Bitte " + Math.ceil(warte / 60) + " Min. warten." });
        }
        const b = await readBody(req);
        // Von unterwegs zaehlt NUR das lange Passwort - die kurze PIN nie.
        const gut = oeffentlich
          ? store.checkFernPass(String(b.pass || b.pin || ""))
          : store.checkChefPin(String(b.pin || ""));
        if (!gut) {
          const e = fehlschlag(req);
          await new Promise((r) => setTimeout(r, 600));
          return json(res, { ok: false, versuche: e.n,
            wartenSek: e.bis > Date.now() ? Math.ceil((e.bis - Date.now()) / 1000) : 0 });
        }
        erfolg(req);
        res.setHeader("Set-Cookie", "zeit_chef=" + newChefSession(oeffentlich) +
          "; Path=/; HttpOnly; SameSite=Lax");
        return json(res, { ok: true });
      }
      if (method === "POST" && p === "/api/chef/logout") {
        const c = cookies(req).zeit_chef;
        if (c) chefSessions.delete(c);
        res.setHeader("Set-Cookie", "zeit_chef=; Path=/; Max-Age=0");
        return json(res, { ok: true });
      }

      if (p.startsWith("/api/chef/") && !isChef(req, oeffentlich))
        return json(res, { fehler: "auth" }, 401);

      /* --------------------- Fernzugang verwalten ------------------------ */
      if (method === "GET" && p === "/api/chef/fern") {
        const f = store.fernStatus();
        return json(res, { ...f, adresse: f.aktiv ? fernAdresse(req) : "",
          fehlversuche: fehlversuchListe() });
      }
      if (method === "POST" && p === "/api/chef/fern") {
        // Ein- und Ausschalten nur vom sicheren Weg aus (Laden/Tailscale).
        if (oeffentlich) return json(res, { ok: false,
          fehler: "Diese Einstellung geht nur im Laden oder über Tailscale." });
        const b = await readBody(req);
        if (b.aus) return json(res, { ok: true, ...store.fernAusschalten("chef") });
        if (b.neuerPfad) {
          const f = store.fernNeuerPfad("chef");
          return json(res, { ok: true, ...f, adresse: f.aktiv ? fernAdresse(req) : "" });
        }
        const r = store.fernEinschalten(b.passwort, "chef");
        if (!r.ok) return json(res, r);
        return json(res, { ...r, adresse: fernAdresse(req) });
      }

      if (method === "GET" && p === "/api/chef/uebersicht") {
        const von = url.searchParams.get("von") || dayKey(Date.now());
        const bis = url.searchParams.get("bis") || dayKey(Date.now());
        const locId = url.searchParams.get("loc") || "";
        const nurAktive = url.searchParams.get("aktive") !== "0";
        const locName = {};
        for (const l of store.state.locations) locName[l.id] = l.name;
        // Nur das, was die Oberflaeche wirklich braucht. Der HMAC-Schluessel
        // und die Passwort-Hashes verlassen den Server nie.
        const c0 = store.state.config;
        const fern = store.fernStatus();
        return json(res, {
          basis: baseUrl(req),
          fernModus: !!oeffentlich,
          fern: { aktiv: fern.aktiv, hatPasswort: fern.hatPasswort,
            adresse: fern.aktiv ? fernAdresse(req) : "",
            fehlversuche: fehlversuchListe() },
          config: {
            firma: c0.firma, oeffentlicheAdresse: c0.oeffentlicheAdresse,
            requirePresence: c0.requirePresence, presenceMinutes: c0.presenceMinutes,
            oeffnungAktiv: c0.oeffnungAktiv, oeffnungVon: c0.oeffnungVon,
            oeffnungBis: c0.oeffnungBis, oeffnungPuffer: c0.oeffnungPuffer,
            autoBreak: c0.autoBreak, terminalRequireCode: c0.terminalRequireCode,
            autoOutHours: c0.autoOutHours, autoOutTime: c0.autoOutTime,
            maxShiftHours: c0.maxShiftHours,
          },
          locations: store.state.locations.map((l) => ({
            id: l.id, name: l.name, token: l.token, oeffnungAktiv: l.oeffnungAktiv,
            oeffnungVon: l.oeffnungVon, oeffnungBis: l.oeffnungBis,
          })),
          employees: store.state.employees.map((e) => ({
            id: e.id, name: e.name, active: e.active !== false, photo: e.photo,
            locId: e.locId, locName: locName[e.locId] || "", codeHint: e.codeHint || "",
          })),
          live: store.live(),
          meldungenOffen: store.offeneMeldungen().length,
          summary: store.summary(von, bis, { locId: locId || null, nurAktive }),
          probleme: store.probleme(von, bis).map((x) => {
            const e = store.employee(x.empId);
            return { ...x, locId: e ? e.locId : null };
          }),
          abos: store.state.abos.map((a) => ({
            wer: a.wer, geraet: a.geraet,
            name: a.wer === "chef" ? "Chef" : (store.employee(a.wer) || {}).name || "?",
            dienst: (a.endpoint.match(/^https?:\/\/([^/]+)/) || [])[1] || "",
          })),
          audit: store.state.audit.slice(-40).map((a) => ({
            zeit: new Date(a.ts).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
            what: a.what, detail: a.detail, by: a.by,
          })),
        });
      }

      if (method === "GET" && p === "/api/chef/detail") {
        const emp = url.searchParams.get("emp");
        const von = url.searchParams.get("von") || dayKey(Date.now());
        const bis = url.searchParams.get("bis") || dayKey(Date.now());
        const d = store.detail(emp, von, bis);
        if (!d) return json(res, { fehler: "unbekannt" });
        return json(res, d);
      }

      if (method === "POST" && p === "/api/chef/config") {
        store.setConfig(await readBody(req), "chef");
        return json(res, { ok: true });
      }
      /* --------------------- Entwickler-Bereich -------------------------- */
      /*
       * Kein Sicherheits-, ein Ordnungsding: Die Technik-Einstellungen
       * (Adressen, Aufkleber, Fernzugang) sind in der Oberflaeche hinter
       * einer eigenen PIN versteckt, damit der Laden-Chef sie nicht sieht
       * und nichts verstellt. Standard-PIN: 1337 (im Bereich aenderbar).
       */
      if (method === "POST" && p === "/api/chef/dev-pin") {
        const b = await readBody(req);
        const soll = String(store.state.config.devPin || "1337");
        return json(res, { ok: String(b.pin || "") === soll });
      }
      if (method === "POST" && p === "/api/chef/dev-pin-neu") {
        const b = await readBody(req);
        if (!/^\d{4,8}$/.test(String(b.pin || "")))
          return json(res, { ok: false, fehler: "4 bis 8 Ziffern." });
        store.state.config.devPin = String(b.pin);
        store.save();
        return json(res, { ok: true });
      }

      if (method === "POST" && p === "/api/chef/chefpin") {
        const b = await readBody(req);
        if (!/^\d{4,8}$/.test(String(b.pin || "")))
          return json(res, { ok: false, fehler: "4 bis 8 Ziffern." });
        store.setChefPin(b.pin, "chef");
        return json(res, { ok: true });
      }
      if (method === "POST" && p === "/api/chef/code-vorschlag") {
        const b = await readBody(req);
        return json(res, { code: store.suggestCode(b.name || "") });
      }
      if (method === "POST" && p === "/api/chef/mitarbeiter") {
        const b = await readBody(req);
        try {
          const emp = b.id ? store.updateEmployee(b.id, b, "chef") : store.addEmployee(b, "chef");
          if (b.foto) store.setPhoto(emp.id, b.foto, "chef");
          return json(res, { ok: true, id: emp.id });
        } catch (e) { return json(res, { ok: false, fehler: e.message }); }
      }
      if (method === "POST" && p === "/api/chef/eintrag-neu") {
        const b = await readBody(req);
        try {
          if (b.inTime) store.addEvent({ empId: b.empId, type: "in", day: b.day,
            time: b.inTime, note: b.note }, "chef");
          if (b.outTime) store.addEvent({ empId: b.empId, type: "out", day: b.day,
            time: b.outTime, note: b.note }, "chef");
          return json(res, { ok: true });
        } catch (e) { return json(res, { ok: false, fehler: e.message }); }
      }
      if (method === "POST" && p === "/api/chef/eintrag-aendern") {
        const b = await readBody(req);
        try { store.editEvent(b.id, b, "chef"); return json(res, { ok: true }); }
        catch (e) { return json(res, { ok: false, fehler: e.message }); }
      }
      if (method === "POST" && p === "/api/chef/eintrag-ok") {
        const b = await readBody(req);
        store.confirmEvent(b.id, "chef");
        return json(res, { ok: true });
      }
      if (method === "POST" && p === "/api/chef/eintrag-loeschen") {
        const b = await readBody(req);
        store.deleteEvent(b.id, "chef");
        return json(res, { ok: true });
      }
      if (method === "POST" && p === "/api/chef/standort-neu") {
        const b = await readBody(req);
        store.addLocation(b.name, "chef");
        return json(res, { ok: true });
      }
      if (method === "POST" && p === "/api/chef/standort-aendern") {
        const b = await readBody(req);
        try { store.updateLocation(b.id, b, "chef"); return json(res, { ok: true }); }
        catch (e) { return json(res, { ok: false, fehler: e.message }); }
      }
      if (method === "POST" && p === "/api/chef/standort-weg") {
        const b = await readBody(req);
        try { store.removeLocation(b.id, "chef"); return json(res, { ok: true }); }
        catch (e) { return json(res, { ok: false, fehler: e.message }); }
      }
      if (method === "POST" && p === "/api/chef/standort-token") {
        const b = await readBody(req);
        store.newLocationToken(b.id, "chef");
        return json(res, { ok: true });
      }
      /* ========================= SCHICHTPLAN ========================== */

      if (method === "GET" && p === "/api/chef/plan") {
        const von = url.searchParams.get("von") || dayKey(Date.now());
        const bis = url.searchParams.get("bis") || dayKey(Date.now() + 6 * 86400000);
        const locId = url.searchParams.get("loc") || "";
        const d = store.plan(von, bis, locId || null);
        return json(res, { ...d, meldungen: store.offeneMeldungen(),
          alleLeute: store.activeEmployees().map((e) => ({ id: e.id, name: e.name,
            photo: e.photo, locId: e.locId })) });
      }
      if (method === "POST" && p === "/api/chef/schicht") {
        const b = await readBody(req);
        return json(res, store.schichtSetzen(b, "chef"));
      }
      if (method === "POST" && p === "/api/chef/schicht-weg") {
        const b = await readBody(req);
        return json(res, store.schichtWeg(b.id, "chef", !!b.serie));
      }
      if (method === "POST" && p === "/api/chef/serie") {
        const b = await readBody(req);
        return json(res, store.serieAnlegen(b, "chef"));
      }
      if (method === "POST" && p === "/api/chef/vorlage") {
        const b = await readBody(req);
        return json(res, { ok: true, vorlage: store.vorlageSetzen(b, "chef") });
      }
      if (method === "POST" && p === "/api/chef/vorlage-weg") {
        const b = await readBody(req);
        return json(res, { ok: store.vorlageWeg(b.id, "chef") });
      }
      if (method === "POST" && p === "/api/chef/veroeffentlichen") {
        const b = await readBody(req);
        const r = store.veroeffentlichen(b.von, b.bis, "chef");
        if (r.ok && r.anzahl) {
          for (const l of r.leute) {
            const naechste = store.meineSchichten(l.empId, b.von, b.bis)[0];
            melden(l.empId, "Neuer Schichtplan",
              l.anzahl + (l.anzahl === 1 ? " Schicht" : " Schichten") + " für dich" +
              (naechste ? " – nächste: " + dayLabel(naechste.tag) + " " + naechste.von : "") + ".",
              { url: "/terminal", tag: "plan", dringend: false });
          }
        }
        return json(res, r);
      }
      if (method === "POST" && p === "/api/chef/meldung") {
        const b = await readBody(req);
        const r = store.meldungEntscheiden(b.id, !!b.ja, "chef");
        if (r.ok) {
          const m = r.meldung;
          melden(m.empId, b.ja ? "Erledigt: " + m.typText : "Abgelehnt: " + m.typText,
            (m.schicht ? m.schicht.label2 + " – " : "") +
            (b.ja ? "Der Chef hat zugestimmt." : "Bitte kurz Rücksprache halten."),
            { url: "/terminal", tag: "meldung" });
          if (b.ja && r.neuerEmp && r.neuerEmp !== m.empId) {
            melden(r.neuerEmp, "Neue Schicht für dich",
              (r.schicht ? dayLabel(r.schicht.tag) + " " + r.schicht.von + "–" + r.schicht.bis : ""),
              { url: "/terminal", tag: "plan" });
          }
        }
        return json(res, r);
      }
      if (method === "GET" && p === "/api/chef/sollist") {
        const von = url.searchParams.get("von") || dayKey(Date.now());
        const bis = url.searchParams.get("bis") || von;
        const locId = url.searchParams.get("loc") || "";
        return json(res, { zeilen: store.sollIst(von, bis, locId || null) });
      }
      if (method === "GET" && p === "/api/chef/stundenzettel.pdf") {
        const von = url.searchParams.get("von") || dayKey(Date.now());
        const bis = url.searchParams.get("bis") || von;
        const wer = (url.searchParams.get("emp") || "").split(",").filter(Boolean);
        const locId = url.searchParams.get("loc") || "";
        let ids = wer;
        if (!ids.length) {
          ids = store.activeEmployees()
            .filter((e) => !locId || e.locId === locId).map((e) => e.id);
        }
        const daten = store.stundenzettelDaten(ids, von, bis);
        const buf = stundenzettel(daten);
        res.writeHead(200, { "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="stundenzettel_' + von + "_" + bis + '.pdf"',
          "Content-Length": buf.length, "Cache-Control": "no-store" });
        return res.end(buf);
      }
      if (method === "GET" && p === "/api/chef/abos") {
        return json(res, { abos: store.state.abos.map((a) => ({
          id: a.id, wer: a.wer, geraet: a.geraet, ts: a.ts,
          name: a.wer === "chef" ? "Chef" : (store.employee(a.wer) || {}).name || "?",
          dienst: (a.endpoint.match(/^https?:\/\/([^/]+)/) || [])[1] || "" })) });
      }

      if (method === "GET" && p === "/api/chef/export.csv") {
        const von = url.searchParams.get("von") || dayKey(Date.now());
        const bis = url.searchParams.get("bis") || dayKey(Date.now());
        const csv = Buffer.from(store.exportCsv(von, bis), "utf8");
        res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="zeiten_' + von + "_bis_" + bis + '.csv"',
          "Content-Length": csv.length });
        return res.end(csv);
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Nicht gefunden");
    } catch (err) {
      console.error("[zeit] Fehler bei " + p + ":", err && err.message);
      try { json(res, { ok: false, fehler: "Serverfehler" }, 500); } catch (_) {}
    }
  }

  const server = http.createServer((req, res) => behandle(req, res, false));
  const publicServer = http.createServer((req, res) => behandle(req, res, true));

  function fehlerSeite(titel, text) {
    return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Stempeluhr</title><style>' +
      '@font-face{font-family:"Inter";font-weight:400 800;src:url("/schrift.woff2") format("woff2")}' +
      'body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
      'background:#F4F4F6;color:#141519;text-align:center;padding:24px;' +
      'font-family:"Inter",-apple-system,"Segoe UI",Arial,sans-serif}' +
      '@media (prefers-color-scheme:dark){body{background:#0B0D12;color:#EEF1F6}}' +
      '</style></head><body><div>' +
      '<div style="font-size:52px">⚠️</div><h2 style="font-weight:800">' + titel + '</h2>' +
      '<p style="opacity:.6;line-height:1.6">' + text + '</p>' +
      '<a href="/" style="color:#EB5A21;font-weight:600">Zur Stempeluhr</a></div></body></html>';
  }

  server.requestTimeout = 0;
  publicServer.requestTimeout = 0;
  return { server, publicServer, store, port };
}

module.exports = { createZeitServer };
