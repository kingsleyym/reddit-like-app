"use strict";

/**
 * SSSP-/Custom-App-Auslieferung für Samsung-Tizen-Signage-Displays.
 *
 * Das Display bekommt unter "Custom App" (bzw. "URL Launcher") eine
 * Basis-Adresse eingetragen, z. B.
 *
 *     http://192.168.1.50:8787/tizen/2
 *
 * und macht dann genau zwei Anfragen:
 *
 *     GET <basis>/sssp_config.xml      -> Manifest mit <ver>/<widgetname>
 *     GET <basis>/<widgetname>.wgt     -> das signierte App-Paket
 *
 * Ändert sich <ver>, installiert das Display beim nächsten Start neu.
 * <ver> wird hier automatisch aus Version + Prüfsumme der .wgt-Datei gebildet:
 * neue Datei in den Ordner legen genügt, es ist keine Handarbeit nötig.
 *
 * Zusätzlich merkt sich der Server, welcher Bildschirm über welche
 * Install-URL angefragt wurde. Das Widget fragt danach unter
 * /api/tizen/assign seine Bildschirm-Nummer ab – so reicht ein einziges
 * gebautes Paket für alle Displays.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const PENDING_TTL_MS = 6 * 60 * 60 * 1000; // Install-Absicht 6 h merken
const ONLINE_MS = 90 * 1000;               // als "online" gilt der letzte Ping

/* ------------------------------------------------------------- Hilfsmittel */

function normIp(raw) {
  let ip = String(raw || "").trim();
  if (ip.indexOf("::ffff:") === 0) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  return ip;
}

function clientIp(req) {
  return normIp((req.socket && req.socket.remoteAddress) || req.ip || "");
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function safeName(s) {
  return String(s || "").replace(/[^0-9A-Za-z._-]/g, "");
}

/* ------------------------------------------------------------ Widget-Datei */

const hashCache = new Map(); // fullPath -> { size, mtimeMs, hash }

function fileHash(file, stat) {
  const cached = hashCache.get(file);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.hash;
  const hash = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 12);
  hashCache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, hash });
  return hash;
}

function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) || {};
  } catch (_) {
    return {};
  }
}

function listWgt(dirs) {
  const out = [];
  for (const dir of dirs) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch (_) { continue; }
    for (const name of entries) {
      if (!/\.wgt$/i.test(name)) continue;
      const full = path.join(dir, name);
      let stat;
      try { stat = fs.statSync(full); } catch (_) { continue; }
      if (!stat.isFile()) continue;
      out.push({ dir, name, full, size: stat.size, mtimeMs: stat.mtimeMs, mtime: stat.mtime });
    }
    if (out.length) break; // erster Ordner mit Treffern gewinnt
  }
  return out;
}

/**
 * Sucht das passende Paket für einen Bildschirm.
 * Bevorzugt "MenuBoard<N>.wgt" (Einzelbau), sonst das universelle Paket.
 */
function pickWidget(dirs, screenIndex) {
  const files = listWgt(dirs);
  if (!files.length) return null;

  if (screenIndex > 0) {
    const exact = files.find((f) => {
      const m = /^(.*?)(\d+)\.wgt$/i.exec(f.name);
      return m && Number(m[2]) === screenIndex;
    });
    if (exact) return exact;
  }
  const universal = files.find((f) => !/\d\.wgt$/i.test(f.name));
  return universal || files[0];
}

function widgetInfo(dirs, screenIndex, fallbackVersion) {
  const file = pickWidget(dirs, screenIndex);
  if (!file) return null;

  const manifest = readManifest(file.dir);
  const base = manifest.version || fallbackVersion || "1.0.0";
  const stat = { size: file.size, mtimeMs: file.mtimeMs };
  const ver = base + "-" + fileHash(file.full, stat);

  return {
    full: file.full,
    dir: file.dir,
    fileName: file.name,
    widgetName: file.name.replace(/\.wgt$/i, ""),
    size: file.size,
    mtime: file.mtime,
    ver,
  };
}

/* ------------------------------------------------------------- Zuweisungen */

function screenIdFor(store, param) {
  const screens = store.getState().screens || [];
  const raw = String(param == null ? "" : param).trim();
  if (!raw) return screens[0] || "1";
  if (screens.indexOf(raw) !== -1) return raw;
  if (/^\d+$/.test(raw)) {
    const idx = parseInt(raw, 10);
    if (idx >= 1 && idx <= screens.length) return screens[idx - 1];
  }
  return raw; // unbekannt: durchreichen, das Dashboard zeigt eine Warnung
}

function screenIndexFor(store, screenId) {
  const screens = store.getState().screens || [];
  const i = screens.indexOf(screenId);
  if (i !== -1) return i + 1;
  if (/^\d+$/.test(String(screenId))) return parseInt(screenId, 10);
  return 0;
}

function deviceKey(d) {
  return d.duid || d.mac || d.ip || "";
}

function findDevice(devices, q) {
  if (q.duid) {
    const byDuid = devices.find((d) => d.duid && d.duid === q.duid);
    if (byDuid) return byDuid;
  }
  if (q.mac) {
    const byMac = devices.find((d) => d.mac && d.mac === q.mac);
    if (byMac) return byMac;
  }
  if (!q.duid && !q.mac && q.ip) {
    return devices.find((d) => !d.duid && !d.mac && d.ip === q.ip) || null;
  }
  return null;
}

function firstFreeScreen(store, devices, selfKey) {
  const screens = store.getState().screens || [];
  const taken = {};
  for (const d of devices) {
    if (deviceKey(d) === selfKey) continue;
    if (d.screen) taken[d.screen] = true;
  }
  for (const s of screens) if (!taken[s]) return s;
  return screens[0] || "1";
}

/* -------------------------------------------------------------- Router */

function createTizenRoutes(opts) {
  const { store, tizenDirs, version, onChange } = opts;
  const changed = () => { try { if (onChange) onChange(); } catch (_) {} };
  const dirs = tizenDirs.filter(Boolean);

  const installRouter = express.Router();
  const apiRouter = express.Router();

  /* --- Manifest ---------------------------------------------------------- */

  function sendSsspConfig(req, res, screenParam) {
    const screenId = screenIdFor(store, screenParam);
    const idx = screenIndexFor(store, screenId);
    const info = widgetInfo(dirs, idx, version);

    // Install-Absicht merken: dieses Gerät (IP) will diesen Bildschirm.
    store.setTizenPending(clientIp(req), screenId);

    if (!info) {
      res.status(404).type("text/plain; charset=utf-8").send(
        "Kein .wgt-Paket gefunden.\r\n" +
        "Erwartet in: " + dirs.join(" oder ") + "\r\n" +
        "Bitte zuerst 'node tizen/build.js' ausfuehren.\r\n"
      );
      return;
    }

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\r\n' +
      "<widget>\r\n" +
      "\t<ver>" + escapeHtml(info.ver) + "</ver>\r\n" +
      "\t<size>" + info.size + "</size>\r\n" +
      "\t<widgetname>" + escapeHtml(info.widgetName) + "</widgetname>\r\n" +
      "\t<webtype>tizen</webtype>\r\n" +
      "</widget>\r\n";

    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.type("text/xml; charset=utf-8");
    res.send(xml);
  }

  /* --- Paket ------------------------------------------------------------- */

  function sendWidget(req, res, screenParam, fileParam) {
    const screenId = screenIdFor(store, screenParam);
    const idx = screenIndexFor(store, screenId);
    const requested = safeName(fileParam);

    let info = null;
    if (requested) {
      const direct = listWgt(dirs).find((f) => f.name.toLowerCase() === requested.toLowerCase());
      if (direct) info = { full: direct.full, fileName: direct.name, size: direct.size };
    }
    if (!info) info = widgetInfo(dirs, idx, version);
    if (!info) { res.status(404).type("text/plain").send("Kein .wgt-Paket gefunden."); return; }

    store.setTizenPending(clientIp(req), screenId);

    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Content-Type", "application/octet-stream");
    res.set("Content-Length", String(info.size));
    res.set("Content-Disposition", 'attachment; filename="' + info.fileName + '"');
    fs.createReadStream(info.full).on("error", () => { try { res.end(); } catch (_) {} }).pipe(res);
  }

  /* --- Info-Seite -------------------------------------------------------- */

  function infoPage(req, res, screenParam) {
    const st = store.getState();
    const screens = st.screens || [];
    const host = req.headers.host || "";
    const t = store.getTizen();
    const now = Date.now();

    const rows = screens.map((s, i) => {
      const info = widgetInfo(dirs, i + 1, version);
      const dev = (t.devices || []).find((d) => d.screen === s);
      const online = dev && now - (dev.lastSeen || 0) < ONLINE_MS;
      return (
        "<tr><td><b>" + escapeHtml(s) + "</b></td>" +
        "<td><code>http://" + escapeHtml(host) + "/tizen/" + encodeURIComponent(s) + "</code></td>" +
        "<td>" + (info ? escapeHtml(info.widgetName) + ".wgt" : "<i>fehlt</i>") + "</td>" +
        "<td>" + (info ? escapeHtml(info.ver) : "–") + "</td>" +
        "<td>" + (dev ? (online ? "🟢 online" : "⚪ zuletzt " + new Date(dev.lastSeen || 0).toLocaleString("de-DE")) : "–") + "</td>" +
        "</tr>"
      );
    }).join("");

    const any = widgetInfo(dirs, 0, version);
    const warn = any ? "" :
      '<p class="warn">Es liegt noch kein <code>.wgt</code>-Paket in <code>' +
      escapeHtml(dirs.join("</code> oder <code>")) +
      '</code>. Bitte zuerst <code>node tizen/build.js</code> ausführen.</p>';

    res.set("Cache-Control", "no-store");
    res.type("text/html; charset=utf-8").send(
      "<!DOCTYPE html><html lang=de><head><meta charset=utf-8>" +
      "<meta name=viewport content='width=device-width,initial-scale=1'>" +
      "<title>MenuBoard – Samsung-Displays</title><style>" +
      "body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0e14;color:#e6e9ef;margin:0;padding:24px}" +
      "h1{font-size:20px;margin:0 0 4px}p{color:#9aa4b8;line-height:1.6}" +
      "table{border-collapse:collapse;width:100%;margin:18px 0;font-size:14px}" +
      "th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #1c2333;vertical-align:top}" +
      "th{color:#8ab4ff;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em}" +
      "code{background:#131a28;padding:2px 6px;border-radius:5px;font-size:13px;word-break:break-all}" +
      ".warn{background:#2a1a1a;border:1px solid #5a2a2a;padding:12px 14px;border-radius:8px;color:#ffb4b4}" +
      "ol{color:#9aa4b8;line-height:1.9}" +
      "</style></head><body>" +
      "<h1>MenuBoard – Installation auf Samsung-Displays</h1>" +
      "<p>Diese Adressen im Display unter <b>Menü → Custom App</b> (bzw. <b>URL Launcher</b>) eintragen. " +
      "Es ist die <i>Ordner-Adresse</i>, nicht die Adresse einer Datei.</p>" +
      warn +
      "<table><thead><tr><th>Bildschirm</th><th>Install-Adresse</th><th>Paket</th><th>Version (ver)</th><th>Gerät</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table>" +
      "<p>Prüfen lässt sich das direkt im Browser: <code>http://" + escapeHtml(host) + "/tizen/" +
      escapeHtml(screens[0] || "1") + "/sssp_config.xml</code> muss XML liefern.</p>" +
      "<ol><li>Paket bauen: <code>node tizen/build.js --server http://" + escapeHtml(host) + " --profile MenuBoard</code></li>" +
      "<li>Display: Menü → Custom App → Adresse aus der Tabelle eintragen</li>" +
      "<li>Display neu starten – die App startet automatisch</li></ol>" +
      "</body></html>"
    );
  }

  /* --- Routen ------------------------------------------------------------ */

  const isWgt = (s) => /\.wgt$/i.test(String(s || ""));

  installRouter.get("/", (req, res) => infoPage(req, res, null));
  installRouter.get("/sssp_config.xml", (req, res) => sendSsspConfig(req, res, null));

  installRouter.get("/:screen/sssp_config.xml", (req, res) => sendSsspConfig(req, res, req.params.screen));

  installRouter.get("/:screen/:file", (req, res, next) => {
    if (!isWgt(req.params.file)) return next();
    sendWidget(req, res, req.params.screen, req.params.file);
  });

  // Basis-Adresse ohne Bildschirm: "/tizen/MenuBoard.wgt" bzw. "/tizen/2".
  installRouter.get("/:screen", (req, res) => {
    if (isWgt(req.params.screen)) return sendWidget(req, res, null, req.params.screen);
    infoPage(req, res, req.params.screen);
  });

  /* --- API für Widget und Dashboard -------------------------------------- */

  apiRouter.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  apiRouter.get("/ping", (req, res) => res.json({ ok: true, ts: Date.now(), version }));

  // Das Widget meldet sich hier und bekommt seine Bildschirm-Nummer.
  apiRouter.get("/assign", (req, res) => {
    const q = req.query || {};
    const ip = clientIp(req);
    const t = store.getTizen();
    const devices = t.devices || [];

    const ident = {
      duid: String(q.duid || "").slice(0, 128),
      mac: String(q.mac || "").slice(0, 64),
      ip: normIp(q.ip || "") || ip,
      model: String(q.model || "").slice(0, 64),
    };

    const dev = findDevice(devices, ident);
    const pending = (t.pending || {})[ip];
    const hint = q.hint ? screenIdFor(store, q.hint) : null;
    const manual = String(q.manual || "") === "1";

    let screen = null;
    let source = "auto";
    let clearLocal = false;

    if (pending && Date.now() - (pending.at || 0) < PENDING_TTL_MS) {
      screen = pending.screen;
      source = "install";
      clearLocal = true;               // Install-URL schlägt lokale Einstellung
      store.clearTizenPending(ip);
    } else if (manual && hint) {
      screen = hint;
      source = "manual";
    } else if (dev && dev.screen) {
      screen = dev.screen;
      source = "stored";
    } else if (hint && (store.getState().screens || []).indexOf(hint) !== -1) {
      screen = hint;
      source = "hint";
    }

    if (!screen) screen = firstFreeScreen(store, devices, deviceKey(ident));

    store.upsertTizenDevice({
      duid: ident.duid,
      mac: ident.mac,
      ip: ident.ip,
      model: ident.model,
      screen,
      appVersion: String(q.v || "").slice(0, 40),
      lastSeen: Date.now(),
    });

    res.json({
      ok: true,
      screen,
      source,
      clearLocal,
      epoch: store.getTizen().epoch,
      screens: store.getState().screens,
      serverVersion: version,
      branding: store.getState().branding || null,
      ts: Date.now(),
    });
  });

  apiRouter.get("/devices", (req, res) => {
    const t = store.getTizen();
    const now = Date.now();
    res.json({
      ok: true,
      epoch: t.epoch,
      devices: (t.devices || []).map((d) => ({ ...d, online: now - (d.lastSeen || 0) < ONLINE_MS })),
      pending: t.pending || {},
      widget: (() => {
        const info = widgetInfo(dirs, 0, version);
        return info ? { name: info.fileName, ver: info.ver, size: info.size, mtime: info.mtime } : null;
      })(),
      dirs,
    });
  });

  // Dashboard: Bildschirm eines Displays umhängen.
  apiRouter.post("/assign", express.json(), (req, res) => {
    const { id, screen } = req.body || {};
    if (!id) return res.status(400).json({ error: "id fehlt" });
    const ok = store.setTizenDeviceScreen(String(id), screenIdFor(store, screen));
    if (!ok) return res.status(404).json({ error: "Gerät unbekannt" });
    store.bumpTizenEpoch();
    changed();
    res.json({ ok: true, devices: store.getTizen().devices });
  });

  // Dashboard: alle Displays neu laden lassen.
  apiRouter.post("/reload", (req, res) => {
    const epoch = store.bumpTizenEpoch();
    changed();
    res.json({ ok: true, epoch });
  });

  apiRouter.post("/forget", express.json(), (req, res) => {
    const { id } = req.body || {};
    store.removeTizenDevice(String(id || ""));
    changed();
    res.json({ ok: true, devices: store.getTizen().devices });
  });

  return { installRouter, apiRouter, widgetInfo: (idx) => widgetInfo(dirs, idx || 0, version), dirs };
}

module.exports = { createTizenRoutes, ONLINE_MS };
