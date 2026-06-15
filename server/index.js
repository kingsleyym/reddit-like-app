"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { WebSocketServer } = require("ws");

/**
 * Starts the embedded web server. Everything (player pages, dashboard,
 * uploads, live updates) is served from here. The Electron main process
 * loads the player pages from this server and the staff open the dashboard
 * from a phone/laptop on the same network (or via Tailscale from home).
 *
 * @param {object} opts
 * @param {import('./store').Store} opts.store
 * @param {string} opts.mediaDir   absolute path where videos are stored
 * @param {number} opts.port
 * @param {(schedule:object)=>Promise<any>} [opts.onSchedule]  apply power schedule (Windows)
 * @param {(action:string)=>Promise<any>} [opts.onPower]       run power action now (sleep/restart)
 * @param {(mapping:object)=>void} [opts.onDisplayMapping]     re-apply display mapping
 * @param {()=>any} [opts.getDisplays]                          list physical displays
 */
function startServer(opts) {
  const {
    store,
    mediaDir,
    port = 8787,
    onSchedule,
    onPower,
    onDisplayMapping,
    getDisplays,
  } = opts;

  fs.mkdirSync(mediaDir, { recursive: true });

  const app = express();
  app.use(express.json());

  const rendererDir = path.join(__dirname, "..", "renderer");

  // --- Static assets -------------------------------------------------------
  app.use("/media", express.static(mediaDir));
  app.use("/static", express.static(rendererDir));

  // --- Player pages (one per screen) --------------------------------------
  app.get("/player", (req, res) => {
    res.sendFile(path.join(rendererDir, "player.html"));
  });

  // --- Dashboard -----------------------------------------------------------
  app.get(["/", "/dashboard"], (req, res) => {
    res.sendFile(path.join(rendererDir, "dashboard.html"));
  });

  // --- Upload --------------------------------------------------------------
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, mediaDir),
    filename: (req, file, cb) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const ext = path.extname(file.originalname) || ".mp4";
      cb(null, id + ext);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB safety ceiling
  });

  app.post("/api/upload", upload.single("video"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "keine Datei empfangen" });
    }
    const video = {
      id: path.parse(req.file.filename).name,
      file: req.file.filename,
      name: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
    };
    store.addVideo(video);
    broadcast({ type: "state", state: publicState() });
    res.json({ ok: true, video });
  });

  // --- State ---------------------------------------------------------------
  app.get("/api/state", (req, res) => {
    res.json(publicState());
  });

  // --- Assign a video to a screen -----------------------------------------
  app.post("/api/assign", (req, res) => {
    const { slot, videoId } = req.body || {};
    try {
      store.assign(slot, videoId || null);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const video = store.getState().videos.find((v) => v.id === videoId);
    broadcast({
      type: "assign",
      slot,
      videoUrl: video ? "/media/" + video.file : null,
    });
    broadcast({ type: "state", state: publicState() });
    res.json({ ok: true });
  });

  // --- Delete a video ------------------------------------------------------
  app.post("/api/video/delete", (req, res) => {
    const { id } = req.body || {};
    const removed = store.removeVideo(id);
    if (removed) {
      const filePath = path.join(mediaDir, removed.file);
      fs.unlink(filePath, () => {});
    }
    // Tell every player to re-read its assignment (some may now be empty).
    for (const slot of ["left", "middle", "right"]) {
      const vid = store.getState().screens[slot];
      const video = store.getState().videos.find((v) => v.id === vid);
      broadcast({
        type: "assign",
        slot,
        videoUrl: video ? "/media/" + video.file : null,
      });
    }
    broadcast({ type: "state", state: publicState() });
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
    broadcast({ type: "state", state: publicState() });
    res.json({ ok: true, schedule, applyResult });
  });

  // --- Immediate power action (sleep now / restart players) ----------------
  app.post("/api/power", async (req, res) => {
    const { action } = req.body || {};
    if (!onPower) return res.status(400).json({ error: "nicht verfuegbar" });
    try {
      const result = await onPower(action);
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Display mapping -----------------------------------------------------
  app.get("/api/displays", (req, res) => {
    res.json({ displays: getDisplays ? getDisplays() : [] });
  });

  app.post("/api/displays", (req, res) => {
    const mapping = req.body || {};
    store.setDisplayMapping(mapping);
    if (onDisplayMapping) onDisplayMapping(store.getState().displayMapping);
    res.json({ ok: true, displayMapping: store.getState().displayMapping });
  });

  // --- HTTP + WebSocket ----------------------------------------------------
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    // Send current state immediately so a player can render right away.
    ws.send(JSON.stringify({ type: "state", state: publicState() }));
  });

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(data);
    }
  }

  function publicState() {
    const s = store.getState();
    const videoUrl = (id) => {
      const v = s.videos.find((x) => x.id === id);
      return v ? "/media/" + v.file : null;
    };
    return {
      screens: {
        left: { videoId: s.screens.left, videoUrl: videoUrl(s.screens.left) },
        middle: { videoId: s.screens.middle, videoUrl: videoUrl(s.screens.middle) },
        right: { videoId: s.screens.right, videoUrl: videoUrl(s.screens.right) },
      },
      schedule: s.schedule,
      displayMapping: s.displayMapping,
      videos: s.videos,
    };
  }

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log("[server] listening on http://0.0.0.0:" + port);
      resolve({ app, server, wss, port, broadcast });
    });
  });
}

module.exports = { startServer };
