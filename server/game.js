"use strict";

/*
 * Kingsley Systems – Spiel-Modul (Stufe 1)
 * =========================================
 * Ablauf: Dashboard startet eine Runde fuer einen Bildschirm -> Display
 * zeigt Banner + QR -> das ERSTE Handy, das den Link oeffnet, bekommt die
 * Runde -> Willkommen/Name/Selfie -> Handy wird Controller, Spiel laeuft
 * auf dem Display -> Game Over -> Video laeuft weiter.
 *
 * Sicherheit: Die Handy-Oberflaeche lebt auf einem EIGENEN Port (8788).
 * Nur dieser wird spaeter per "tailscale funnel 8788" oeffentlich gemacht -
 * Dashboard/Videos/Steuerung bleiben unerreichbar.
 * Selfies: nur im Arbeitsspeicher der laufenden Runde, nie auf Platte.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { WebSocketServer } = require("ws");

function code5() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

function createGame({ store, wss, screenIds, getLanBase, brandingDir, mainPort, getTestDelay }) {
  let session = null; // { code, screen, state, player, phone, startedAt, lastScore }

  // Nur fuer Tests: kuenstliche Verzoegerung pro Richtung auf dem Handy-Weg
  // (simuliert den Tailscale-Funnel). In Produktion immer 0.
  const testDelay = getTestDelay || (() => 0);
  function toPhone(ws, obj) {
    if (!ws || ws.readyState !== 1) return;
    const raw = JSON.stringify(obj);
    const d = testDelay();
    if (d > 0) setTimeout(() => { try { ws.send(raw); } catch (_) {} }, d);
    else { try { ws.send(raw); } catch (_) {} }
  }

  /* --- Spiel-Logo (z.B. das Restaurant-Logo der Aktion) ------------------- */
  // Liegt neben dem Boot-Logo im branding-Ordner, Dateiname spiellogo.<ext>.
  function logoFile() {
    if (!brandingDir) return null;
    try {
      for (const f of fs.readdirSync(brandingDir)) {
        if (/^spiellogo\./i.test(f)) return path.join(brandingDir, f);
      }
    } catch (_) {}
    return null;
  }
  // Absolute LAN-Adresse, unter der die DISPLAYS das Logo laden koennen.
  function logoUrlForDisplays() {
    const f = logoFile();
    if (!f) return null;
    return getLanBase() + ":" + (mainPort || 8787) + "/branding/" + path.basename(f) +
           "?v=" + Math.floor(fs.statSync(f).mtimeMs || 0);
  }

  function sendToScreen(screen, obj) {
    const raw = JSON.stringify(obj);
    for (const c of wss.clients) {
      if (c.readyState === 1 && c.role === "player" && String(c.slot) === String(screen)) {
        try { c.send(raw); } catch (_) {}
      }
    }
  }
  function tellPhone(obj) {
    if (session && session.phone) toPhone(session.phone, obj);
  }
  function publicBase() {
    const g = store.getState().game || {};
    return (g.publicBase || "").replace(/\/+$/, "") || (getLanBase() + ":8788");
  }
  // Spielmodus: "controller" = Spiel auf dem Display, Handy steuert.
  //             "phone"      = Spiel laeuft auf dem Handy, Display spiegelt.
  // Standard "phone": funktioniert bei jeder Internet-Latenz gleich gut.
  function gameMode() {
    return (store.getState().game || {}).mode === "controller" ? "controller" : "phone";
  }

  /* --- Gewinnstufen -------------------------------------------------------- */
  function activePrizes() {
    const g = store.getState().game || {};
    const arr = Array.isArray(g.prizes) ? g.prizes : [];
    const out = [];
    for (let i = 0; i < arr.length && i < 4; i++) {
      const p = arr[i];
      if (!p || !(Number(p.points) > 0) || !p.name) continue;
      out.push({ slot: i, points: Number(p.points), name: String(p.name) });
    }
    out.sort((a, b) => a.points - b.points);
    return out;
  }
  function prizeImgFile(slot) {
    if (!brandingDir) return null;
    try {
      for (const f of fs.readdirSync(brandingDir)) {
        if (new RegExp("^spielpreis" + slot + "\\.", "i").test(f)) {
          return path.join(brandingDir, f);
        }
      }
    } catch (_) {}
    return null;
  }
  // forPhone: Bild-Adressen relativ zum oeffentlichen Port (gehen durch den
  // Funnel); sonst absolute LAN-Adressen fuer die Displays.
  function prizesPayload(forPhone) {
    return activePrizes().map((p) => {
      const f = prizeImgFile(p.slot);
      let img = null;
      if (f) {
        img = forPhone
          ? "/prize/" + p.slot
          : getLanBase() + ":" + (mainPort || 8787) + "/branding/" + path.basename(f) +
            "?v=" + Math.floor(fs.statSync(f).mtimeMs || 0);
      }
      return { points: p.points, name: p.name, img };
    });
  }
  function prizeFor(score) {
    let won = null;
    for (const p of activePrizes()) if (score >= p.points) won = p;
    return won ? { name: won.name, points: won.points } : null;
  }

  /* ---------------- API fuer das Dashboard (laeuft auf Port 8787) -------- */
  const router = express.Router();
  router.use(express.json());

  router.post("/start", (req, res) => {
    const screen = String((req.body || {}).screen || (screenIds()[0] || "1"));
    if (session && session.state === "running") {
      return res.status(409).json({ error: "Es läuft bereits eine Runde." });
    }
    session = { code: code5(), screen, state: "invite", player: null, phone: null,
                startedAt: Date.now(), lastScore: null };
    const joinUrl = publicBase() + "/play/" + session.code;
    sendToScreen(screen, { type: "game-invite", code: session.code, joinUrl,
      logoUrl: logoUrlForDisplays(), prizes: prizesPayload(false) });
    res.json({ ok: true, code: session.code, joinUrl, screen });
  });

  router.post("/stop", (req, res) => {
    if (session) {
      sendToScreen(session.screen, { type: "game-end" });
      tellPhone({ type: "game-end" });
      session = null;
    }
    res.json({ ok: true });
  });

  router.post("/config", (req, res) => {
    const b = req.body || {};
    const patch = {};
    if (b.publicBase !== undefined) patch.publicBase = String(b.publicBase || "").trim();
    if (b.mode !== undefined) patch.mode = b.mode === "controller" ? "controller" : "phone";
    if (b.prizes !== undefined) patch.prizes = b.prizes;
    const g = store.setGame(patch);
    res.json({ ok: true, publicBase: g.publicBase, mode: gameMode(), prizes: g.prizes });
  });

  // Gewinn-Bilder je Stufe (0-3)
  const prizeUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try { fs.mkdirSync(brandingDir, { recursive: true }); } catch (_) {}
        cb(null, brandingDir);
      },
      filename: (req, file, cb) => {
        const slot = String(parseInt(req.params.slot, 10) || 0);
        try {
          for (const f of fs.readdirSync(brandingDir)) {
            if (new RegExp("^spielpreis" + slot + "\\.", "i").test(f)) {
              fs.unlinkSync(path.join(brandingDir, f));
            }
          }
        } catch (_) {}
        const ext = (path.extname(file.originalname) || ".png").toLowerCase();
        cb(null, "spielpreis" + slot + ext);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
  });
  router.post("/prize-img/:slot", prizeUpload.single("img"), (req, res) => {
    res.json({ ok: true, file: req.file ? req.file.filename : null });
  });
  router.post("/prize-img/:slot/delete", (req, res) => {
    const f = prizeImgFile(parseInt(req.params.slot, 10) || 0);
    if (f) { try { fs.unlinkSync(f); } catch (_) {} }
    res.json({ ok: true });
  });

  // Spiel-Logo hochladen (Dashboard). Ersetzt eine vorhandene Datei.
  const logoUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try { fs.mkdirSync(brandingDir, { recursive: true }); } catch (_) {}
        cb(null, brandingDir);
      },
      filename: (req, file, cb) => {
        try {
          for (const f of fs.readdirSync(brandingDir)) {
            if (/^spiellogo\./i.test(f)) fs.unlinkSync(path.join(brandingDir, f));
          }
        } catch (_) {}
        const ext = (path.extname(file.originalname) || ".png").toLowerCase();
        cb(null, "spiellogo" + ext);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
  });
  router.post("/logo", logoUpload.single("logo"), (req, res) => {
    if (!brandingDir) return res.status(500).json({ error: "kein Branding-Ordner" });
    res.json({ ok: true, file: req.file ? req.file.filename : null });
  });
  router.post("/logo/delete", (req, res) => {
    const f = logoFile();
    if (f) { try { fs.unlinkSync(f); } catch (_) {} }
    res.json({ ok: true });
  });

  router.get("/status", (req, res) => {
    res.json({
      active: !!session,
      state: session ? session.state : null,
      screen: session ? session.screen : null,
      code: session ? session.code : null,
      joinUrl: session ? publicBase() + "/play/" + session.code : null,
      player: session && session.player ? { name: session.player.name } : null,
      lastScore: session ? session.lastScore : null,
      publicBase: (store.getState().game || {}).publicBase || "",
      mode: gameMode(),
      hasLogo: !!logoFile(),
      prizeSlots: (function () {
        const g = store.getState().game || {};
        const arr = Array.isArray(g.prizes) ? g.prizes : [];
        const out = [];
        for (let i = 0; i < 4; i++) {
          out.push({ points: arr[i] ? arr[i].points : "", name: arr[i] ? arr[i].name : "",
                     hasImg: !!prizeImgFile(i) });
        }
        return out;
      })(),
    });
  });

  /* ---------------- Nachrichten vom Display (ueber Haupt-WS) ------------- */
  function onSocketMessage(ws, msg) {
    if (!session) return;
    if (msg.type === "game-over" && String(ws.slot) === String(session.screen)) {
      session.state = "over";
      const sc = Number(msg.score) || 0;
      session.lastScore = { score: sc, prize: prizeFor(sc),
                            name: session.player ? session.player.name : "" };
      tellPhone({ type: "game-over", score: sc, prize: prizeFor(sc) });
      // Nach 25s automatisch aufraeumen (Display kehrt selbst zum Video zurueck)
      setTimeout(() => { if (session && session.state === "over") session = null; }, 25000);
    }
  }

  /* ---------------- Oeffentliche Oberflaeche (Port 8788) ----------------- */
  const pub = express();
  pub.disable("x-powered-by");

  pub.get("/play/:code", (req, res) => {
    res.type("text/html; charset=utf-8").send(CONTROLLER_HTML);
  });
  // Spiel-Logo fuer die Handy-Seite (gleicher Host, geht auch durch den Funnel).
  pub.get("/logo", (req, res) => {
    const f = logoFile();
    if (!f) return res.status(404).end();
    res.sendFile(f);
  });
  // Gewinn-Bilder fuer die Handy-Seite
  pub.get("/prize/:slot", (req, res) => {
    const f = prizeImgFile(parseInt(req.params.slot, 10) || 0);
    if (!f) return res.status(404).end();
    res.sendFile(f);
  });
  pub.get("/", (req, res) => res.type("text/plain").send("Kingsley Systems"));

  const pubServer = http.createServer(pub);
  const pubWss = new WebSocketServer({ server: pubServer });

  function handleGamerMsg(ws, m) {
    if (m.type === "hello-gamer") {
      if (!session || session.state !== "invite" || m.code !== session.code) {
        toPhone(ws, { type: "too-late" });
        return;
      }
      // Der Erste gewinnt die Runde
      session.state = "claimed";
      session.phone = ws;
      session.mode = gameMode();
      ws.isGamer = true;
      toPhone(ws, { type: "claimed", mode: session.mode });
      sendToScreen(session.screen, { type: "game-claimed" });
    }
    else if (!ws.isGamer || !session || ws !== session.phone) { /* ignorieren */ }
    else if (m.type === "join") {
      session.player = {
        name: String(m.name || "SPIELER").slice(0, 12).toUpperCase(),
        img: (typeof m.img === "string" && m.img.length < 60000) ? m.img : "",
      };
      session.state = "running";
      sendToScreen(session.screen, { type: "game-start",
        player: session.player, mode: session.mode, prizes: prizesPayload(false) });
      toPhone(ws, { type: "started", mode: session.mode, prizes: prizesPayload(true) });
    }
    else if (m.type === "input") {
      // Nur im Controller-Modus relevant.
      if (session.mode !== "phone") {
        sendToScreen(session.screen, { type: "game-input",
          x: Math.max(0, Math.min(1, Number(m.x) || 0)), fire: !!m.fire });
      }
    }
    else if (m.type === "mirror") {
      // Handy-Modus: kompletter Spielstand vom Handy -> Display spiegelt.
      if (session.mode === "phone" && m.s) {
        sendToScreen(session.screen, { type: "game-mirror", s: m.s });
      }
    }
    else if (m.type === "over") {
      // Handy-Modus: das Spiel auf dem Handy ist vorbei.
      if (session.mode === "phone" && session.state === "running") {
        session.state = "over";
        const sc = Number(m.score) || 0;
        session.lastScore = { score: sc, prize: prizeFor(sc),
                              name: session.player ? session.player.name : "" };
        sendToScreen(session.screen, { type: "game-mirror-over",
          score: sc, prize: prizeFor(sc) });
        setTimeout(() => { if (session && session.state === "over") session = null; }, 25000);
      }
    }
    else if (m.type === "ping") {
      toPhone(ws, { type: "pong", t: m.t });
    }
  }

  pubWss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
      if (!m) return;
      const d = testDelay();
      if (d > 0) setTimeout(() => handleGamerMsg(ws, m), d);
      else handleGamerMsg(ws, m);
    });
    ws.on("close", () => {
      if (session && ws === session.phone && session.state !== "over") {
        // Spieler weg -> Runde beenden, Display zurueck zum Video
        sendToScreen(session.screen, { type: "game-end" });
        session = null;
      }
    });
  });

  function listenPublic(port) {
    pubServer.on("error", (err) => {
      console.error("[game] öffentlicher Port " + port + " nicht verfügbar:", err.message);
    });
    pubServer.listen(port, () => console.log("[game] öffentliche Oberfläche auf Port " + port));
  }

  return { router, onSocketMessage, listenPublic };
}

/* ======================= Handy-Controller (eine Seite) ===================== */
const CONTROLLER_HTML = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Kingsley – Mitspielen</title>
<style>
:root{--o:#EB5A21;}
html,body{margin:0;height:100%;background:#05070c;color:#dfe8f2;overflow:hidden;
 font-family:"Clash Display","Helvetica Neue",Arial,sans-serif;-webkit-user-select:none;user-select:none;
 -webkit-tap-highlight-color:transparent;}
.page{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
 justify-content:center;text-align:center;padding:24px;box-sizing:border-box;}
h1{font-size:30px;font-weight:600;letter-spacing:.3em;text-indent:.3em;margin:0 0 4px;}
h1 .o{color:var(--o);}
.sub{font-size:14px;opacity:.6;letter-spacing:.18em;margin-bottom:34px;}
input[type=text]{background:#0d1320;border:1px solid #2a3550;border-radius:12px;color:#fff;
 padding:14px;font-size:17px;font-family:inherit;text-align:center;width:230px;outline:none;letter-spacing:.06em;}
.foto{width:76px;height:76px;border-radius:50%;border:2px dashed #3a4966;background:#0d1320;
 color:#5c7096;font-size:30px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0 auto 16px;}
.foto img{width:100%;height:100%;object-fit:cover;}
.btn{margin-top:26px;padding:16px 60px;border:2px solid var(--o);border-radius:999px;color:#fff;
 background:rgba(235,90,33,.14);font-size:17px;font-weight:600;letter-spacing:.25em;text-indent:.25em;font-family:inherit;}
.consent{display:flex;gap:10px;align-items:flex-start;max-width:300px;margin:20px auto 0;
 font-size:11.5px;opacity:.55;text-align:left;line-height:1.6;}
.consent input{margin-top:2px;}
#pad{position:fixed;inset:0;background:radial-gradient(circle at 50% 78%,rgba(235,90,33,.12),transparent 55%),#05070c;display:none;}
#pad .top{position:absolute;top:0;left:0;right:0;padding:20px;display:flex;justify-content:space-between;
 font-size:15px;letter-spacing:.1em;}
#pad .top .o{color:var(--o);font-weight:700;}
#stick{position:absolute;width:110px;height:110px;border-radius:50%;border:2px solid var(--o);
 background:rgba(235,90,33,.18);transform:translate(-50%,-50%);pointer-events:none;display:none;
 box-shadow:0 0 30px rgba(235,90,33,.35);}
#padHint{position:absolute;bottom:12%;left:0;right:0;text-align:center;font-size:14px;opacity:.5;letter-spacing:.15em;}
.big{font-size:64px;font-weight:700;color:var(--o);margin:18px 0;}
.hidden{display:none!important;}
.blogo{max-width:130px;max-height:64px;object-fit:contain;margin-bottom:18px;display:none;}
#credit{position:fixed;left:0;right:0;bottom:10px;text-align:center;font-size:10px;
 letter-spacing:.18em;opacity:.32;pointer-events:none;z-index:50;}
</style></head><body>

<div class="page" id="pgWait"><img class="blogo"><h1>KINGSLEY<span class="o">.</span></h1>
 <div class="sub">VERBINDE …</div></div>

<div class="page hidden" id="pgLate"><h1>ZU SP<span class="o">Ä</span>T!</h1>
 <div class="sub">JEMAND WAR SCHNELLER</div>
 <div style="opacity:.5;font-size:14px">Beim nächsten Mal klappt’s – Augen aufs Display!</div></div>

<div class="page hidden" id="pgJoin"><img class="blogo"><h1>DU BIST<span class="o"> DRAN!</span></h1>
 <div class="sub">MACH DICH BEREIT</div>
 <div class="foto" id="foto">+</div>
 <input type="file" id="fotoInp" accept="image/*" capture="user" style="display:none">
 <input type="text" id="name" maxlength="12" placeholder="DEIN NAME">
 <label class="consent"><input type="checkbox" id="ok">
  Name & Foto erscheinen nur während dieser Runde auf dem Bildschirm im Laden und werden danach gelöscht.</label>
 <div class="btn" id="go">SPIELEN</div></div>

<div id="pad">
 <div class="top"><div>HI <span class="o" id="padName"></span></div>
  <div><span id="ping">–</span> ms</div></div>
 <div id="stick"></div>
 <div id="padHint">FINGER ZIEHEN = FLIEGEN · HALTEN = DAUERFEUER<br>SCHAU AUFS DISPLAY!</div>
</div>

<!-- Handy-Modus: das Spiel laeuft komplett hier, das Display spiegelt. -->
<div id="pgGame" class="hidden" style="position:fixed;inset:0;background:#05070c;">
 <div id="gStage" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);overflow:hidden;">
  <canvas id="gCv"></canvas>
  <div id="gPrizeWrap" style="position:absolute;top:74px;left:14px;right:14px;display:none;pointer-events:none;"></div>
  <div id="gFlash" style="position:absolute;top:32%;left:0;right:0;text-align:center;font-size:26px;
    font-weight:700;letter-spacing:.2em;color:var(--o);opacity:0;transition:opacity .4s;
    pointer-events:none;text-shadow:0 0 18px rgba(235,90,33,.7);"></div>
  <div id="gHud" style="position:absolute;top:8px;left:10px;right:10px;display:flex;
    justify-content:space-between;align-items:flex-start;pointer-events:none;">
   <div style="display:flex;align-items:center;gap:8px;">
    <img id="gAva" style="width:34px;height:34px;border-radius:50%;border:2px solid var(--o);
      object-fit:cover;display:none;">
    <div><div id="gName" style="font-size:13px;font-weight:600;letter-spacing:.08em;opacity:.85;"></div>
     <div id="gScore" style="font-size:22px;font-weight:700;color:var(--o);">0</div>
     <div id="gCombo" style="font-size:12px;font-weight:600;color:#8cbeff;min-height:14px;"></div></div>
   </div>
   <div id="gLives" style="font-size:17px;color:var(--o);letter-spacing:.1em;">♥♥♥</div>
  </div>
 </div>
</div>

<div class="page hidden" id="pgOver"><img class="blogo"><h1>GAME<span class="o"> OVER</span></h1>
 <div class="big" id="finalScore">0</div>
 <div id="prizeBox" style="margin-bottom:14px"></div>
 <div style="opacity:.55;font-size:14px;letter-spacing:.1em">DEIN ERGEBNIS STEHT AUF DEM DISPLAY</div></div>

<div id="credit">developed by Luca Kingsley</div>

<script>
var code=(location.pathname.match(/\\/play\\/([A-Z0-9]+)/i)||[])[1]||"";
var proto=location.protocol==="https:"?"wss://":"ws://";
var ws=new WebSocket(proto+location.host);
var img="",mode="controller",prizes=[];
function prizeShow(score,srvPrize){
  var won=null,i;
  for(i=0;i<prizes.length;i++)if(score>=prizes[i].points)won=prizes[i];
  if(!won&&srvPrize){won=srvPrize;
    for(i=0;i<prizes.length;i++)if(prizes[i].name===srvPrize.name)won=prizes[i];}
  var el=document.getElementById("prizeBox");if(!el)return;
  if(won){el.innerHTML='<div style="border:2px solid var(--o);border-radius:14px;padding:12px 24px;'+
    'display:inline-block;background:rgba(235,90,33,.12);">'+
    '<div style="font-size:11px;letter-spacing:.3em;opacity:.7;">GEWONNEN</div>'+
    (won.img?'<img src="'+won.img+'" style="width:54px;height:54px;border-radius:50%;object-fit:cover;'+
      'display:block;margin:6px auto 4px;" onerror="this.style.display=\\'none\\'">':'')+
    '<div style="font-size:21px;font-weight:700;color:var(--o);">'+won.name.toUpperCase()+'</div>'+
    '<div style="font-size:12px;opacity:.6;margin-top:3px;">Zeig diesen Bildschirm an der Theke!</div></div>';}
  else if(prizes.length){el.innerHTML='<div style="font-size:13px;opacity:.6;">Knapp daneben – ab '+
    prizes[0].points+' Punkten gibt’s '+prizes[0].name+'!</div>';}
  else el.innerHTML="";
}
function show(id){["pgWait","pgLate","pgJoin","pgOver","pgGame"].forEach(function(p){
  document.getElementById(p).classList.add("hidden");});
  document.getElementById("pad").style.display="none";
  if(id==="pad")document.getElementById("pad").style.display="block";
  else document.getElementById(id).classList.remove("hidden");}
ws.onopen=function(){ws.send(JSON.stringify({type:"hello-gamer",code:code.toUpperCase()}));};
ws.onclose=function(){document.querySelector("#pgWait .sub").textContent="VERBINDUNG WEG – NEU LADEN";show("pgWait");};
ws.onmessage=function(ev){var m;try{m=JSON.parse(ev.data);}catch(e){return;}
  if(m.type==="claimed"){mode=m.mode||"controller";show("pgJoin");}
  else if(m.type==="too-late")show("pgLate");
  else if(m.type==="started"){
    mode=m.mode||mode;prizes=m.prizes||[];
    if(mode==="phone"){show("pgGame");gameStart();}
    else{show("pad");
      document.getElementById("padName").textContent=(document.getElementById("name").value||"SPIELER").toUpperCase();}
    startPing();}
  else if(m.type==="pong"){document.getElementById("ping").textContent=Date.now()-m.t;}
  else if(m.type==="game-over"){document.getElementById("finalScore").textContent=m.score;
    prizeShow(Number(m.score)||0,m.prize||null);show("pgOver");}
  else if(m.type==="game-end"){
    if(GP.run){GP.run=false;document.getElementById("finalScore").textContent=GP.score;
      prizeShow(GP.score,null);show("pgOver");}
    else if(document.getElementById("pad").style.display==="block"){
      // Runde wurde vom Personal beendet - freundlich verabschieden
      document.querySelector("#pgLate h1").innerHTML='RUNDE<span class="o"> VORBEI</span>';
      document.querySelector("#pgLate .sub").textContent="DANKE FÜRS MITSPIELEN";
      show("pgLate");}
    else show("pgLate");}
};
/* Restaurant-/Aktions-Logo laden, falls hinterlegt */
(function(){var probe=new Image();
  probe.onload=function(){document.querySelectorAll(".blogo").forEach(function(el){
    el.src="/logo";el.style.display="block";});};
  probe.src="/logo";})();
document.getElementById("foto").addEventListener("click",function(){document.getElementById("fotoInp").click();});
document.getElementById("fotoInp").addEventListener("change",function(e){
  var f=e.target.files[0];if(!f)return;var im=new Image();
  im.onload=function(){var c=document.createElement("canvas");c.width=c.height=96;
    var g=c.getContext("2d"),s=Math.min(im.width,im.height);
    g.drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,96,96);
    img=c.toDataURL("image/jpeg",.65);
    document.getElementById("foto").innerHTML='<img src="'+img+'">';};
  im.src=URL.createObjectURL(f);});
document.getElementById("go").addEventListener("click",function(){
  if(!document.getElementById("ok").checked){alert("Bitte kurz zustimmen – sonst können wir Name/Foto nicht zeigen.");return;}
  ws.send(JSON.stringify({type:"join",name:document.getElementById("name").value,img:img}));});
/* Steuerung: x-Position (0..1) + Feuer solange Finger unten */
var lastSent=0,fire=false,x=.5,stick=document.getElementById("stick");
function sendInput(){var now=Date.now();if(now-lastSent<33)return;lastSent=now;
  if(ws.readyState===1)ws.send(JSON.stringify({type:"input",x:x,fire:fire}));}
function onTouch(e){var t=e.touches?e.touches[0]:e;
  x=Math.max(0,Math.min(1,t.clientX/innerWidth));fire=true;
  stick.style.display="block";stick.style.left=t.clientX+"px";stick.style.top=t.clientY+"px";
  sendInput();e.preventDefault();}
var pad=document.getElementById("pad");
pad.addEventListener("touchstart",onTouch,{passive:false});
pad.addEventListener("touchmove",onTouch,{passive:false});
pad.addEventListener("touchend",function(){fire=false;stick.style.display="none";sendInput();});
pad.addEventListener("mousedown",onTouch);
pad.addEventListener("mousemove",function(e){if(e.buttons===1)onTouch(e);});
pad.addEventListener("mouseup",function(){fire=false;stick.style.display="none";sendInput();});
setInterval(sendInput,90); /* Herzschlag, damit fire-Status frisch bleibt */
function startPing(){setInterval(function(){
  if(ws.readyState===1)ws.send(JSON.stringify({type:"ping",t:Date.now()}));},1500);}

/* ================= Handy-Modus: das komplette Spiel (540x960 logisch) ===== */
/* Gleiche Logik wie auf dem Display; die Koordinaten gehen 1:1 als
   Spiegelbild ans Display raus. */
var GW=540,GH=960,GP={run:false},gcv=null,gcx=null,gstars=[],lastMirror=0;
function gFit(){
  var st=document.getElementById("gStage");
  var s=Math.min(innerWidth/GW,innerHeight/GH);
  st.style.width=Math.round(GW*s)+"px";st.style.height=Math.round(GH*s)+"px";
  if(gcv){gcv.style.width="100%";gcv.style.height="100%";}
}
addEventListener("resize",gFit);
function gReset(){
  GP={run:true,score:0,lives:3,px:GW/2,t:0,wave:0,waveAt:Date.now(),shake:0,
    bullets:[],ebullets:[],foes:[],parts:[],pows:[],
    lastFire:0,lastSpawn:0,combo:0,comboAt:0,mult:1,
    rapidUntil:0,spreadUntil:0,shield:false,touchX:null,nid:0};
}
function gEl(id){return document.getElementById(id);}
function gBoom(x,y,col,n){for(var i=0;i<n;i++)GP.parts.push({x:x,y:y,
  vx:(Math.random()-.5)*8,vy:(Math.random()-.5)*8,l:1,col:col});}
function gCombo(){var now=Date.now();
  GP.combo=(now-GP.comboAt<2000)?GP.combo+1:1;GP.comboAt=now;
  GP.mult=Math.min(5,1+Math.floor(GP.combo/4));
  gEl("gCombo").textContent=GP.mult>1?("COMBO x"+GP.mult):"";}
function gSpawn(){
  var r=Math.random(),type=r<.66?"a":(r<.92?"b":"bonus");
  var sp=2.2+GP.wave*.55+GP.score/1400;
  GP.foes.push({id:++GP.nid,x:40+Math.random()*(GW-80),y:-40,type:type,
    v:(type==="b"?1.6:1)*sp,w:type==="bonus"?54:44,
    drift:(Math.random()-.5)*(2+GP.wave*.4),hp:type==="bonus"?2:1,
    canShoot:type==="b"&&GP.wave>=2});}
function gDrop(x,y){if(Math.random()>.14)return;
  GP.pows.push({id:++GP.nid,x:x,y:y,k:["S","R","H"][Math.floor(Math.random()*3)],v:2.4});}
function gHit(){
  if(GP.shield){GP.shield=false;GP.shake=10;return;}
  GP.lives--;GP.shake=18;
  gEl("gLives").textContent="♥♥♥♥♥".slice(0,Math.max(0,GP.lives))||"–";
  if(GP.lives<=0)gOver();}
function gOver(){
  GP.run=false;
  if(ws.readyState===1)ws.send(JSON.stringify({type:"over",score:GP.score}));
  setTimeout(function(){gEl("finalScore").textContent=GP.score;
    prizeShow(GP.score,null);show("pgOver");},1200);}
/* Gewinn-Leiste im Handy-Spiel */
var gPrizeEls=null,gPrizeReached=0;
function gBuildPrizes(){
  var w=gEl("gPrizeWrap");w.innerHTML="";gPrizeEls=null;gPrizeReached=0;
  if(!prizes.length){w.style.display="none";return;}
  w.style.display="block";
  var max=prizes[prizes.length-1].points;
  var bar=document.createElement("div");
  bar.style.cssText="height:7px;background:rgba(255,255,255,.09);border-radius:6px;overflow:hidden;";
  var fill=document.createElement("div");
  fill.style.cssText="height:100%;width:0%;background:linear-gradient(90deg,var(--o),#ffb37a);"+
    "border-radius:6px;transition:width .4s;";
  bar.appendChild(fill);w.appendChild(bar);
  var marks=[];
  for(var i=0;i<prizes.length;i++){
    var pct=Math.max(4,Math.min(96,prizes[i].points/max*100));
    var m=document.createElement("div");
    m.style.cssText="position:absolute;top:-27px;left:"+pct+"%;transform:translateX(-50%);text-align:center;";
    var box=document.createElement("div");
    box.style.cssText="width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,.35);"+
      "background:#0d1320;overflow:hidden;margin:0 auto;display:flex;align-items:center;justify-content:center;";
    if(prizes[i].img){var im=document.createElement("img");
      im.style.cssText="width:100%;height:100%;object-fit:cover;";im.src=prizes[i].img;box.appendChild(im);}
    else{box.innerHTML='<span style="font-size:11px;font-weight:700;color:#8b98b8;">'+
      prizes[i].name.charAt(0).toUpperCase()+'</span>';}
    m.appendChild(box);w.appendChild(m);marks.push(box);}
  gPrizeEls={fill:fill,marks:marks,max:max};}
function gUpdatePrizes(score){
  if(!gPrizeEls)return;
  gPrizeEls.fill.style.width=Math.min(100,score/gPrizeEls.max*100)+"%";
  var n=0,i;
  for(i=0;i<prizes.length;i++)if(score>=prizes[i].points)n=i+1;
  if(n>gPrizeReached){
    for(var j=gPrizeReached;j<n;j++){
      gPrizeEls.marks[j].style.borderColor="#EB5A21";
      gPrizeEls.marks[j].style.boxShadow="0 0 10px rgba(235,90,33,.9)";
      var fl=gEl("gFlash");fl.textContent=prizes[j].name.toUpperCase()+" GESICHERT!";
      fl.style.opacity="1";
      (function(){clearTimeout(fl._t);fl._t=setTimeout(function(){fl.style.opacity="0";},1300);})();}
    gPrizeReached=n;}}
function gDrawShip(x,y){
  var c=gcx;
  if(GP.shield){c.save();c.strokeStyle="rgba(140,190,255,.8)";c.lineWidth=2;
    c.shadowColor="#8cbeff";c.shadowBlur=16;
    c.beginPath();c.arc(x,y,42,0,7);c.stroke();c.restore();}
  c.save();c.translate(x,y);
  c.strokeStyle="#dfe8f2";c.lineWidth=2.5;c.shadowColor="#8cbeff";c.shadowBlur=14;
  c.beginPath();c.moveTo(0,-30);c.lineTo(24,22);c.lineTo(10,14);c.lineTo(0,22);
  c.lineTo(-10,14);c.lineTo(-24,22);c.closePath();c.stroke();
  c.shadowColor="#EB5A21";c.strokeStyle="#EB5A21";
  c.beginPath();c.moveTo(-6,26);c.lineTo(0,38+Math.random()*6);c.lineTo(6,26);c.stroke();
  c.restore();}
function gDrawFoe(f){
  var c=gcx;
  c.save();c.translate(f.x,f.y);c.rotate(Math.sin(GP.t/18+f.x)*0.18);
  if(f.type==="bonus"){c.strokeStyle="#EB5A21";c.shadowColor="#EB5A21";}
  else{c.strokeStyle=f.type==="b"?"#9fd0ff":"#6f9fdf";c.shadowColor="#6f9fdf";}
  c.lineWidth=2.5;c.shadowBlur=12;var r=f.w/2;
  c.beginPath();
  for(var i=0;i<8;i++){var a=i/8*Math.PI*2,rr=(i%2?r*.55:r);
    c[i?"lineTo":"moveTo"](Math.cos(a)*rr,Math.sin(a)*rr);}
  c.closePath();c.stroke();
  c.beginPath();c.arc(0,0,r*.22,0,7);c.stroke();c.restore();}
function gDrawPow(p){
  var c=gcx;c.save();c.translate(p.x,p.y);
  var col=p.k==="H"?"#8cbeff":"#EB5A21";
  c.strokeStyle=col;c.shadowColor=col;c.shadowBlur=14;c.lineWidth=2;
  c.beginPath();c.arc(0,0,16,0,7);c.stroke();
  c.fillStyle=col;c.font="700 16px Arial";
  c.textAlign="center";c.textBaseline="middle";c.fillText(p.k,0,1);c.restore();}
function gSendMirror(){
  // 20x pro Sekunde; jedes Objekt traegt eine ID, damit das Display
  // zwischen zwei Zustaenden weich interpolieren kann.
  var now=Date.now();if(now-lastMirror<50||ws.readyState!==1)return;lastMirror=now;
  var r1=function(v){return Math.round(v);};
  ws.send(JSON.stringify({type:"mirror",s:{
    px:r1(GP.px),sc:GP.score,lv:GP.lives,sh:GP.shield?1:0,t:GP.t,m:GP.mult,
    f:GP.foes.map(function(f){return[f.id,r1(f.x),r1(f.y),f.type,f.w];}),
    b:GP.bullets.map(function(b){return[b.id,r1(b.x),r1(b.y)];}),
    e:GP.ebullets.map(function(b){return[b.id,r1(b.x),r1(b.y)];}),
    p:GP.pows.map(function(p){return[p.id,r1(p.x),r1(p.y),p.k];})
  }}));}
function gLoop(){
  if(!gcx)return;
  requestAnimationFrame(gLoop);
  var c=gcx;
  c.fillStyle="#05070c";c.fillRect(0,0,GW,GH);GP.t++;
  c.fillStyle="rgba(160,200,255,.5)";
  gstars.forEach(function(s){s.y+=s.v*(GP.run?1+GP.wave*.15:1);if(s.y>GH)s.y=0;c.fillRect(s.x,s.y,s.s,s.s);});
  if(GP.shake>0){c.save();c.translate((Math.random()-.5)*GP.shake,(Math.random()-.5)*GP.shake);GP.shake*=.9;}
  var now=Date.now();
  if(GP.run){
    if(now-GP.waveAt>18000){GP.wave++;GP.waveAt=now;}
    if(GP.touchX!==null)GP.px+=(GP.touchX-GP.px)*.3;
    GP.px=Math.max(30,Math.min(GW-30,GP.px));
    var fireMs=(now<GP.rapidUntil?110:220);
    if(GP.touchX!==null&&now-GP.lastFire>fireMs){
      GP.lastFire=now;
      GP.bullets.push({id:++GP.nid,x:GP.px,y:GH-110,vx:0});
      if(now<GP.spreadUntil){GP.bullets.push({id:++GP.nid,x:GP.px,y:GH-110,vx:-3.4});
        GP.bullets.push({id:++GP.nid,x:GP.px,y:GH-110,vx:3.4});}}
    var rate=Math.max(240,820-GP.wave*90-GP.score/6);
    if(now-GP.lastSpawn>rate){GP.lastSpawn=now;gSpawn();}
    GP.foes.forEach(function(f){f.y+=f.v;f.x+=f.drift;
      if(f.x<25||f.x>GW-25)f.drift*=-1;
      if(f.canShoot&&Math.random()<.006)
        GP.ebullets.push({id:++GP.nid,x:f.x,y:f.y+20,v:5+GP.wave*.5});});
    GP.bullets.forEach(function(b){b.y-=16;b.x+=b.vx;});
    GP.bullets=GP.bullets.filter(function(b){
      for(var i=0;i<GP.foes.length;i++){var f=GP.foes[i];
        if(Math.abs(b.x-f.x)<f.w/2+4&&Math.abs(b.y-f.y)<f.w/2+8){
          f.hp--;
          if(f.hp<=0){gCombo();
            GP.score+=(f.type==="bonus"?50:(f.type==="b"?20:10))*GP.mult;
            gBoom(f.x,f.y,f.type==="bonus"?"#EB5A21":"#8cbeff",f.type==="bonus"?26:14);
            gDrop(f.x,f.y);GP.foes.splice(i,1);
          }else gBoom(b.x,b.y,"#EB5A21",5);
          return false;}}
      return b.y>-20&&b.x>-10&&b.x<GW+10;});
    GP.ebullets.forEach(function(b){b.y+=b.v;});
    GP.ebullets=GP.ebullets.filter(function(b){
      if(b.y>GH-110&&b.y<GH-60&&Math.abs(b.x-GP.px)<26){gHit();return false;}
      return b.y<GH+20;});
    GP.pows.forEach(function(p){p.y+=p.v;});
    GP.pows=GP.pows.filter(function(p){
      if(p.y>GH-130&&Math.abs(p.x-GP.px)<34){
        if(p.k==="S")GP.spreadUntil=now+8000;
        if(p.k==="R")GP.rapidUntil=now+8000;
        if(p.k==="H")GP.shield=true;
        return false;}
      return p.y<GH+20;});
    GP.foes=GP.foes.filter(function(f){
      if(f.y>GH-70&&Math.abs(f.x-GP.px)<f.w/2+26){gHit();gBoom(GP.px,GH-90,"#EB5A21",30);return false;}
      if(f.y>GH+40){if(f.type!=="bonus")gHit();return false;}
      return true;});
    if(now-GP.comboAt>2000&&GP.mult>1){GP.mult=1;GP.combo=0;gEl("gCombo").textContent="";}
    gEl("gScore").textContent=GP.score;
    gUpdatePrizes(GP.score);
    gSendMirror();
  }
  GP.foes.forEach(gDrawFoe);
  GP.pows.forEach(gDrawPow);
  c.fillStyle="#ffd9c4";
  GP.bullets.forEach(function(b){c.save();c.shadowColor="#EB5A21";c.shadowBlur=10;
    c.fillRect(b.x-2,b.y-14,4,14);c.restore();});
  c.fillStyle="#ff8c8c";
  GP.ebullets.forEach(function(b){c.save();c.shadowColor="#ff5c5c";c.shadowBlur=8;
    c.fillRect(b.x-2,b.y,4,12);c.restore();});
  if(GP.run)gDrawShip(GP.px,GH-90);
  GP.parts.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.l-=.03;
    c.globalAlpha=Math.max(0,p.l);c.fillStyle=p.col;c.fillRect(p.x,p.y,3,3);c.globalAlpha=1;});
  GP.parts=GP.parts.filter(function(p){return p.l>0;});
  if(GP.shake>0)c.restore();
}
function gTouchPos(e){
  var r=gcv.getBoundingClientRect();var t=e.touches?e.touches[0]:e;
  return (t.clientX-r.left)/r.width*GW;}
function gameStart(){
  gcv=gEl("gCv");gcv.width=GW;gcv.height=GH;gcx=gcv.getContext("2d");
  gFit();
  if(!gstars.length)for(var i=0;i<70;i++)gstars.push({x:Math.random()*GW,y:Math.random()*GH,
    s:Math.random()*1.6+.4,v:Math.random()*.8+.3});
  var nm=(gEl("name").value||"SPIELER").toUpperCase();
  gEl("gName").textContent=nm;
  if(img){gEl("gAva").src=img;gEl("gAva").style.display="block";}
  gEl("gLives").textContent="♥♥♥";gEl("gScore").textContent="0";
  gBuildPrizes();
  var stg=gEl("gStage");
  ["touchstart","touchmove"].forEach(function(ev){
    stg.addEventListener(ev,function(e){GP.touchX=gTouchPos(e);e.preventDefault();},{passive:false});});
  ["touchend","touchcancel"].forEach(function(ev){
    stg.addEventListener(ev,function(){GP.touchX=null;});});
  stg.addEventListener("mousedown",function(e){GP.touchX=gTouchPos(e);});
  stg.addEventListener("mousemove",function(e){if(e.buttons===1)GP.touchX=gTouchPos(e);});
  stg.addEventListener("mouseup",function(){GP.touchX=null;});
  gReset();
  gLoop();
}
</script></body></html>`;

module.exports = { createGame };
