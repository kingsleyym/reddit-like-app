"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const multer = require("multer");
const { WebSocketServer } = require("ws");
const { createTizenRoutes, ONLINE_MS } = require("./tizen");

const SLOTS = ["left", "middle", "right"];

function startServer(opts) {
  const {
    store,
    mediaDir,
    port = 8787,
    onSchedule,
    onPower,
    onDisplayMapping,
    getDisplays,
    onMaintenance,
    onAutostart,
    onOpenFolder,
    onScreens,
    rendererDir: rendererDirOpt,
    assetsDir: assetsDirOpt,
    tizenDir: tizenDirOpt,
    version = "",
  } = opts;

  const screenIds = () => store.getState().screens;

  fs.mkdirSync(mediaDir, { recursive: true });

  const app = express();
  app.use(express.json());

  // Where the UI files live. Overridable so a single-exe build can serve them
  // from a real (materialized) folder instead of the packed snapshot.
  const rendererDir = rendererDirOpt || path.join(__dirname, "..", "renderer");
  const assetsDir = assetsDirOpt || path.join(__dirname, "..", "assets");

  app.use("/media", express.static(mediaDir));
  app.use("/static", express.static(rendererDir));
  app.use("/assets", express.static(assetsDir));

  // Never cache the UI pages, so a freshly updated app always shows the new
  // dashboard/player instead of a stale cached version in the browser.
  function noCache(res) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  app.get("/player", (req, res) => { noCache(res); res.sendFile(path.join(rendererDir, "player.html")); });
  app.get(["/", "/dashboard"], (req, res) => { noCache(res); res.sendFile(path.join(rendererDir, "dashboard.html")); });

  // --- Samsung-Tizen-Displays (SSSP "Custom App") --------------------------
  // Wo die signierten .wgt-Pakete liegen: Datenordner zuerst, dann das Repo.
  const tizenDirs = [...new Set([
    process.env.MENUBOARD_TIZEN_DIR,
    tizenDirOpt,
    path.join(mediaDir, "..", "tizen"),
    path.join(__dirname, "..", "tizen", "dist"),
  ].filter(Boolean).map((d) => path.resolve(d)))];

  // Manche Firmwares hängen einen zusätzlichen Schrägstrich an die
  // Install-Adresse ("…/tizen/2//sssp_config.xml"). Doppelte Schrägstriche
  // deshalb einebnen, bevor geroutet wird.
  app.use((req, res, next) => {
    if (req.url.indexOf("//") !== -1 && /^\/(tizen|api\/tizen)\b/i.test(req.url)) {
      req.url = req.url.replace(/\/{2,}/g, "/");
    }
    next();
  });

  const tizen = createTizenRoutes({ store, tizenDirs, version, onChange: () => broadcastState() });
  app.use("/tizen", tizen.installRouter);
  app.use("/api/tizen", tizen.apiRouter);
  // Manche Geräte fragen die Datei direkt im Wurzelverzeichnis ab.
  app.get("/sssp_config.xml", (req, res) => res.redirect(302, "/tizen/sssp_config.xml"));

  // --- Upload --------------------------------------------------------------
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, mediaDir),
    filename: (req, file, cb) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const ext = path.extname(file.originalname) || ".mp4";
      cb(null, id + ext);
    },
  });
  const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

  app.post("/api/upload", upload.single("video"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "keine Datei empfangen" });
    const video = {
      id: path.parse(req.file.filename).name,
      file: req.file.filename,
      name: req.file.originalname.replace(/\.[^.]+$/, ""),
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
    };
    store.addVideo(video);
    broadcastState();
    res.json({ ok: true, video });
  });

  // --- Tizen-Paket per Browser austauschen (Fernwartung) -------------------
  // Damit laesst sich die signierte .wgt aus der Ferne einspielen - ueber
  // Tailscale genuegt der Browser, kein Remote-Desktop und kein Dateizugriff
  // auf den Server-PC. Zielordner ist derselbe, in dem der Server ohnehin
  // nach Paketen sucht.
  const wgtDir = path.join(mediaDir, "..", "tizen");

  const wgtUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try { fs.mkdirSync(wgtDir, { recursive: true }); } catch (_) {}
        cb(null, wgtDir);
      },
      // Nur den reinen Dateinamen uebernehmen - keine Pfadanteile aus dem
      // Browser, sonst koennte man damit aus dem Ordner ausbrechen.
      filename: (req, file, cb) => {
        const base = path.basename(String(file.originalname || "MenuBoard.wgt"));
        cb(null, base.replace(/[^A-Za-z0-9._-]/g, "_"));
      },
    }),
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!/\.wgt$/i.test(file.originalname || "")) {
        return cb(new Error("Nur .wgt-Dateien"));
      }
      cb(null, true);
    },
  });

  app.post("/api/tizen/upload", (req, res) => {
    wgtUpload.single("wgt")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "keine Datei empfangen" });
      broadcastState();
      res.json({ ok: true, file: req.file.filename, size: req.file.size, dir: wgtDir });
    });
  });

  // Kleine Seite zum Hochladen. Bewusst ausserhalb von /tizen/<N>, damit sie
  // nicht mit den Install-Adressen der Displays kollidiert.
  app.get("/tizen-upload", (req, res) => {
    let vorhanden = [];
    try {
      vorhanden = fs.readdirSync(wgtDir)
        .filter((f) => /\.wgt$/i.test(f))
        .map((f) => {
          const st = fs.statSync(path.join(wgtDir, f));
          return f + " — " + st.size + " Bytes — " + st.mtime.toLocaleString("de-DE");
        });
    } catch (_) {}

    noCache(res);
    res.type("text/html; charset=utf-8").send(
      '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>MenuBoard — Tizen-Paket</title><style>" +
      "body{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:6vh 5vw;line-height:1.6}" +
      "h1{font-size:1.4rem;margin:0 0 1.5rem}h2{font-size:1rem;opacity:.7;margin:2rem 0 .6rem;font-weight:600}" +
      "code{background:#161b22;padding:.15rem .4rem;border-radius:4px;font-size:.9em}" +
      "ul{padding-left:1.2rem}li{margin:.3rem 0;font-size:.92rem}" +
      "form{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:1.4rem;margin:1rem 0}" +
      "input[type=file]{width:100%;margin-bottom:1rem;color:#e6edf3}" +
      "button{background:#238636;color:#fff;border:0;border-radius:7px;padding:.7rem 1.5rem;font-size:1rem;cursor:pointer}" +
      "button:hover{background:#2ea043}.hint{opacity:.6;font-size:.85rem;margin-top:1rem}" +
      "</style></head><body>" +
      "<h1>MenuBoard — Tizen-Paket austauschen</h1>" +
      '<form method="post" action="/api/tizen/upload" enctype="multipart/form-data">' +
      '<input type="file" name="wgt" accept=".wgt" required>' +
      "<button type=\"submit\">Hochladen</button>" +
      '<div class="hint">Die Datei ersetzt das bisherige Paket. Danach die Displays ' +
      "aus- und wieder einschalten — sie installieren beim Booten von allein neu.</div>" +
      "</form>" +
      "<h2>Aktuell im Ordner</h2>" +
      (vorhanden.length ? "<ul><li>" + vorhanden.join("</li><li>") + "</li></ul>"
                        : "<p>Noch kein Paket vorhanden.</p>") +
      "<h2>Ordner</h2><p><code>" + wgtDir + "</code></p>" +
      "<h2>Install-Adressen</h2><p>Siehe <code>/tizen</code></p>" +
      "</body></html>"
    );
  });

  // --- State ---------------------------------------------------------------
  app.get("/api/state", (req, res) => res.json(publicState()));

  // --- Scene editing: set a slot's PLAYLIST --------------------------------
  app.post("/api/scene/playlist", (req, res) => {
    const { scene, slot, playlist } = req.body || {};
    try {
      store.setScenePlaylist(scene, slot, playlist || []);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    broadcastState();
    if (scene === store.getState().liveScene) broadcastLive();
    res.json({ ok: true });
  });

  // --- Switch which scene is live (Tag <-> Abend) --------------------------
  app.post("/api/scene/live", (req, res) => {
    const { scene } = req.body || {};
    try {
      store.setLiveScene(scene);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    broadcastState();
    broadcastLive();
    res.json({ ok: true, liveScene: store.getState().liveScene });
  });

  // --- Configure the list of screens (e.g. 4 for the Samsung setup) --------
  app.post("/api/screens", (req, res) => {
    const ids = (req.body && req.body.screens) || [];
    const screens = store.setScreens(ids);
    if (onScreens) {
      try {
        onScreens(screens);
      } catch (_) {}
    }
    broadcastState();
    broadcastLive();
    res.json({ ok: true, screens });
  });

  // --- Automatic day/night switching by time ------------------------------
  app.post("/api/autoswitch", (req, res) => {
    const cfg = store.setAutoSwitch(req.body || {});
    broadcastState();
    res.json({ ok: true, autoSwitch: cfg });
  });

  // --- Video management ----------------------------------------------------
  app.post("/api/video/rename", (req, res) => {
    const { id, name } = req.body || {};
    store.renameVideo(id, name);
    broadcastState();
    res.json({ ok: true });
  });

  app.post("/api/video/delete", (req, res) => {
    const { id } = req.body || {};
    const removed = store.removeVideo(id);
    if (removed) fs.unlink(path.join(mediaDir, removed.file), () => {});
    broadcastState();
    broadcastLive();
    res.json({ ok: true });
  });

  // --- Power schedule ------------------------------------------------------
  app.post("/api/schedule", async (req, res) => {
    const schedule = store.setSchedule(req.body || {});
    let applyResult = { applied: false };
    if (onSchedule) {
      try {
        applyResult = await onSchedule(schedule);
      } catch (err) {
        applyResult = { applied: false, error: err.message };
      }
    }
    broadcastState();
    res.json({ ok: true, schedule, applyResult });
  });

  app.post("/api/power", async (req, res) => {
    const { action } = req.body || {};
    if (!onPower) return res.status(400).json({ error: "nicht verfuegbar" });
    try {
      res.json({ ok: true, result: await onPower(action) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Displays ------------------------------------------------------------
  app.get("/api/displays", (req, res) => res.json({ displays: getDisplays ? getDisplays() : [] }));
  app.post("/api/displays", (req, res) => {
    store.setDisplayMapping(req.body || {});
    if (onDisplayMapping) onDisplayMapping(store.getState().displayMapping);
    res.json({ ok: true, displayMapping: store.getState().displayMapping });
  });

  // --- Maintenance mode (stop the kiosk players so you can use the PC) -----
  app.post("/api/maintenance", async (req, res) => {
    const enabled = !!(req.body && req.body.enabled);
    store.setMaintenance(enabled);
    if (onMaintenance) {
      try {
        await onMaintenance(enabled);
      } catch (_) {}
    }
    broadcastState();
    res.json({ ok: true, maintenance: enabled });
  });

  // --- Autostart with Windows ---------------------------------------------
  app.post("/api/autostart", (req, res) => {
    const enabled = !!(req.body && req.body.enabled);
    store.setAutostart(enabled);
    if (onAutostart) onAutostart(enabled);
    broadcastState();
    res.json({ ok: true, autostart: enabled });
  });

  // --- Open the media folder on the PC ------------------------------------
  app.post("/api/open-folder", (req, res) => {
    if (onOpenFolder) onOpenFolder();
    res.json({ ok: true });
  });

  // --- Access URLs (how to reach the dashboard from phone/home) ------------
  app.get("/api/access", (req, res) => res.json({ urls: accessUrls() }));

  // --- HTTP + WebSocket ----------------------------------------------------
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // Which video each screen is currently showing (reported by the players).
  const nowPlaying = {};

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }
      if (!msg) return;
      if (msg.type === "hello") {
        ws.role = msg.role;
        ws.slot = msg.slot;
        broadcastStatus();
      } else if (msg.type === "playing" && screenIds().indexOf(msg.slot) !== -1) {
        nowPlaying[msg.slot] = msg.videoId || null;
        broadcastStatus();
      }
    });
    ws.on("close", () => {
      if (ws.role === "player" && ws.slot) nowPlaying[ws.slot] = null;
      broadcastStatus();
    });
    ws.send(JSON.stringify({ type: "state", state: publicState() }));
    ws.send(JSON.stringify({ type: "live", screens: livePlaylists() }));
    ws.send(JSON.stringify({ type: "status", players: connectedStatus(), playing: nowPlaying }));
  });

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) if (client.readyState === 1) client.send(data);
  }
  function broadcastState() {
    broadcast({ type: "state", state: publicState() });
  }
  function broadcastLive() {
    broadcast({ type: "live", screens: livePlaylists() });
  }
  function broadcastStatus() {
    broadcast({ type: "status", players: connectedStatus(), playing: nowPlaying });
  }

  function connectedStatus() {
    const players = {};
    for (const id of screenIds()) players[id] = false;
    for (const c of wss.clients) {
      if (c.readyState === 1 && c.role === "player" && c.slot in players) players[c.slot] = true;
    }
    return players;
  }

  function urlOf(id) {
    const v = store.getState().videos.find((x) => x.id === id);
    return v ? "/media/" + v.file : null;
  }

  // Resolve a stored playlist ([{videoId, repeat}]) to what the player needs
  // ([{videoId, url, repeat}]), dropping entries whose video was deleted.
  function resolvePlaylist(list) {
    return (list || [])
      .map((e) => {
        const url = urlOf(e.videoId);
        return url ? { videoId: e.videoId, url, repeat: Math.max(1, e.repeat || 1) } : null;
      })
      .filter(Boolean);
  }

  function livePlaylists() {
    const s = store.getState();
    const sc = s.scenes[s.liveScene];
    const out = {};
    for (const id of s.screens) out[id] = resolvePlaylist(sc[id]);
    return out;
  }

  function publicState() {
    const s = store.getState();
    return {
      videos: s.videos,
      screens: s.screens,
      scenes: s.scenes,
      liveScene: s.liveScene,
      autoSwitch: s.autoSwitch,
      schedule: s.schedule,
      displayMapping: s.displayMapping,
      autostart: s.autostart,
      maintenance: s.maintenance,
      paths: { media: mediaDir, config: store.dataFile },
      version: version,
      live: livePlaylists(),
      tizen: tizenState(),
    };
  }

  // Zustand der Samsung-Displays fuer das Dashboard.
  function tizenState() {
    const t = store.getTizen();
    const now = Date.now();
    let widget = null;
    try { widget = tizen.widgetInfo(0); } catch (_) {}
    return {
      epoch: t.epoch,
      dirs: tizenDirs,
      widget: widget
        ? { name: widget.fileName, ver: widget.ver, size: widget.size, mtime: widget.mtime }
        : null,
      devices: (t.devices || []).map((d) => ({
        id: d.duid || d.mac || d.ip,
        duid: d.duid,
        mac: d.mac,
        ip: d.ip,
        model: d.model,
        screen: d.screen,
        appVersion: d.appVersion,
        lastSeen: d.lastSeen,
        online: now - (d.lastSeen || 0) < ONLINE_MS,
      })),
    };
  }

  function accessUrls() {
    const urls = [];
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const i of list || []) {
        if (i.family !== "IPv4" || i.internal) continue;
        const ip = i.address;
        const o = ip.split(".").map(Number);
        const isTailscale = o[0] === 100 && o[1] >= 64 && o[1] <= 127;
        urls.push({
          label: isTailscale ? "Von zu Hause (Tailscale)" : "Im Lokal (WLAN/LAN)",
          url: `http://${ip}:${port}`,
          tailscale: isTailscale,
        });
      }
    }
    // Tailscale first, then LAN.
    urls.sort((a, b) => (b.tailscale ? 1 : 0) - (a.tailscale ? 1 : 0));
    urls.push({ label: "Am PC selbst", url: `http://localhost:${port}` });
    return urls;
  }

  // This is a local appliance server. Disable the request/socket timeouts so
  // large 4K video uploads over a slow home/Tailscale link are never aborted
  // mid-transfer (Node's default requestTimeout of 5 min cut off big files).
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log("[server] listening on http://0.0.0.0:" + port);
      resolve({ app, server, wss, port, broadcast, broadcastState, broadcastLive });
    });
  });
}

module.exports = { startServer, SLOTS };
