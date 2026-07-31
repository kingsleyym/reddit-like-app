"use strict";

/*
 * Kingsley Invaders – Lokaler Test auf dem Mac
 * =============================================
 * Startet den Spiel-Server OHNE die Windows-App, damit du alles im
 * Browser + mit dem Handy im selben WLAN testen kannst.
 *
 *   Einmalig:  npm install        (im Repo-Ordner, falls noch nicht geschehen)
 *   Starten:   node spiel-test.js
 *
 * Dann:
 *   Mac-Browser:  http://localhost:8787/display/4   = das "Display"
 *   Handy:        QR scannen, der auf dem Display erscheint (gleiches WLAN)
 *
 * Auf der Display-Seite gibt es rechts oben ein Zahnrad:
 *   - Runde starten / beenden (kein Dashboard noetig)
 *   - Modus umschalten (Handy steuert <-> Spiel am Handy)
 *   - Grafiken per Drag & Drop tauschen (Schiff, Gegner, Bonus, Kugel)
 *     -> die bleiben im Browser gespeichert, bis du sie loeschst.
 *
 * Es wird NICHTS an der echten Anlage veraendert; die Einstellungen
 * landen in spiel-test-daten.json neben diesem Skript.
 */

const http = require("http");
const path = require("path");
const os = require("os");
const express = require("express");
const { WebSocketServer } = require("ws");
const { Store } = require("./server/store");
const { createGame } = require("./server/game");

const PORT = 8787;
const store = new Store(path.join(__dirname, "spiel-test-daten.json"));

function lanIp() {
  const ifaces = os.networkInterfaces();
  let lan = null;
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (i.family !== "IPv4" || i.internal) continue;
      const o = i.address.split(".").map(Number);
      const isTailscale = o[0] === 100 && o[1] >= 64 && o[1] <= 127;
      if (!isTailscale && !lan) lan = i.address;
    }
  }
  return lan || "localhost";
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const brandingDir = path.join(__dirname, "spiel-test-branding");
// Funnel-Simulation: kuenstliche Verzoegerung pro Richtung (nur im Test!)
let TEST_DELAY = 0;
const game = createGame({
  store, wss,
  screenIds: () => ["1", "2", "3", "4"],
  getLanBase: () => "http://" + lanIp(),
  brandingDir,
  mainPort: PORT,
  getTestDelay: () => TEST_DELAY,
});
app.use("/api/game", game.router);
app.post("/test/delay", express.json(), (req, res) => {
  TEST_DELAY = Math.max(0, Math.min(1000, Number((req.body || {}).ms) || 0));
  console.log("[test] simulierte Verzögerung: " + TEST_DELAY + " ms pro Richtung");
  res.json({ ok: true, ms: TEST_DELAY });
});
app.get("/test/delay", (req, res) => res.json({ ms: TEST_DELAY }));
app.use("/branding", express.static(brandingDir));
app.use("/app", express.static(path.join(__dirname, "tizen", "app")));

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!msg) return;
    if (msg.type === "hello") { ws.role = msg.role; ws.slot = msg.slot; }
    else if (typeof msg.type === "string" && msg.type.indexOf("game-") === 0) {
      game.onSocketMessage(ws, msg);
    }
  });
});

/* ------------------- Die "Display"-Seite fuer den Browser ----------------- */
const DISPLAY_HTML = (screen) => `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kingsley – Display ${screen} (Test)</title>
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden;
 font-family:Arial,Helvetica,sans-serif;color:#dfe8f2;}
/* Platzhalter fuers Video: bewegter Verlauf, damit man Pause/Weiter sieht */
#fakevideo{position:fixed;inset:0;background:linear-gradient(130deg,#3d1f0e,#0e2438,#3d1f0e,#132c14);
 background-size:400% 400%;animation:vg 9s ease infinite;display:flex;
 align-items:center;justify-content:center;font-size:3vh;letter-spacing:.4em;
 text-indent:.4em;color:rgba(255,255,255,.5);}
#fakevideo.paused{animation-play-state:paused;filter:brightness(.25) grayscale(1);}
@keyframes vg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
/* Zahnrad + Panel */
#gear{position:fixed;top:12px;right:12px;z-index:99;width:42px;height:42px;border-radius:50%;
 background:rgba(5,7,12,.85);border:1px solid #2a3550;color:#8b98b8;font-size:22px;
 display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;}
#panel{position:fixed;top:62px;right:12px;z-index:99;width:280px;background:rgba(5,7,12,.94);
 border:1px solid #2a3550;border-radius:14px;padding:14px;display:none;font-size:13px;}
#panel.open{display:block;}
#panel h4{margin:12px 0 6px;font-size:11px;letter-spacing:.2em;color:#8b98b8;font-weight:600;}
#panel h4:first-child{margin-top:0;}
.tbtn{display:block;width:100%;box-sizing:border-box;margin-bottom:6px;padding:9px;border-radius:9px;
 border:1px solid #EB5A21;background:rgba(235,90,33,.15);color:#fff;font-size:13px;cursor:pointer;}
.tbtn.ghost{border-color:#2a3550;background:#0d1320;}
select{width:100%;background:#0d1320;border:1px solid #2a3550;border-radius:8px;color:#fff;padding:8px;}
.drop{border:1px dashed #3a4966;border-radius:9px;padding:7px 9px;margin-bottom:5px;display:flex;
 align-items:center;gap:8px;cursor:pointer;background:#0d1320;}
.drop img{width:26px;height:26px;object-fit:contain;background:#05070c;border-radius:5px;}
.drop .x{margin-left:auto;color:#5c7096;cursor:pointer;padding:0 4px;}
.drop.drag{border-color:#EB5A21;}
#stat{color:#8b98b8;line-height:1.5;min-height:32px;white-space:pre-wrap;word-break:break-all;}
</style></head><body>
<div id="fakevideo">VIDEO LÄUFT</div>
<div id="gear">⚙</div>
<div id="panel">
 <h4>RUNDE</h4>
 <button class="tbtn" id="btnStart">Runde starten (QR zeigen)</button>
 <button class="tbtn ghost" id="btnStop">Runde beenden</button>
 <h4>MODUS</h4>
 <select id="selMode">
  <option value="phone">Spiel am Handy, Display spiegelt (empfohlen)</option>
  <option value="controller">Handy steuert, Spiel am Display</option>
 </select>
 <h4>GEWINNE (Punkte + Name + Bild)</h4>
 <div id="pzRows"></div>
 <button class="tbtn ghost" id="pzSave">Gewinne speichern</button>
 <h4>SCHWIERIGKEIT</h4>
 <select id="selDiff">
  <option value="leicht">Leicht</option>
  <option value="normal" selected>Normal</option>
  <option value="schwer">Schwer</option>
 </select>
 <h4>FUNNEL-SIMULATION (Verzögerung je Richtung)</h4>
 <select id="selDelay">
  <option value="0">aus (WLAN pur)</option>
  <option value="30">30 ms (sehr gute Verbindung)</option>
  <option value="60">60 ms (Funnel optimistisch)</option>
  <option value="100">100 ms (Funnel realistisch)</option>
  <option value="150">150 ms (Funnel schlechter Tag)</option>
  <option value="250">250 ms (schlechtes Netz)</option>
 </select>
 <h4>GRAFIKEN (Drag &amp; Drop oder Klick)</h4>
 <div class="drop" data-k="ship"><img><span>Schiff / Schütze</span><span class="x">✕</span></div>
 <div class="drop" data-k="enemy"><img><span>Gegner leicht</span><span class="x">✕</span></div>
 <div class="drop" data-k="enemy2"><img><span>Gegner schwer</span><span class="x">✕</span></div>
 <div class="drop" data-k="bonus"><img><span>Bonus-Ziel</span><span class="x">✕</span></div>
 <div class="drop" data-k="bullet"><img><span>Kugel (Shawarma!)</span><span class="x">✕</span></div>
 <input type="file" id="skinFile" accept="image/*" style="display:none">
 <h4>AKTIONS-LOGO (Banner + Handy)</h4>
 <div class="drop" id="logoDrop"><img id="logoPrev"><span>Logo hochladen</span><span class="x" id="logoDel">✕</span></div>
 <input type="file" id="logoFile" accept="image/*" style="display:none">
 <h4>STATUS</h4>
 <div id="stat">–</div>
</div>
<script>
// MB_NATIVE-Ersatz: was auf dem echten Display nativeplayer.js macht,
// macht hier dieses Snippet (WebSocket + Video-Platzhalter).
(function(){
  var SCREEN=${JSON.stringify(String(screen))};
  var ws=null;
  window.MB_NATIVE={
    send:function(o){o=o||{};if(!o.slot)o.slot=SCREEN;
      if(ws&&ws.readyState===1)ws.send(JSON.stringify(o));},
    gamePause:function(){document.getElementById("fakevideo").className="paused";},
    gameResume:function(){document.getElementById("fakevideo").className="";}
  };
  function connect(){
    ws=new WebSocket("ws://"+location.host);
    ws.onopen=function(){ws.send(JSON.stringify({type:"hello",role:"player",slot:SCREEN}));};
    ws.onmessage=function(ev){var m;try{m=JSON.parse(ev.data);}catch(e){return;}
      if(m.type&&m.type.indexOf("game-")===0&&window.MB_GAME)MB_GAME.onMessage(m);};
    ws.onclose=function(){setTimeout(connect,1500);};
  }
  connect();

  /* Panel */
  var gear=document.getElementById("gear"),panel=document.getElementById("panel");
  gear.onclick=function(){panel.className=panel.className?"":"open";};
  function api(p,b){return fetch(p,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(b||{})}).then(function(r){return r.json();});}
  document.getElementById("btnStart").onclick=function(){
    api("/api/game/start",{screen:SCREEN}).then(refresh);};
  document.getElementById("btnStop").onclick=function(){
    api("/api/game/stop",{}).then(refresh);};
  document.getElementById("selMode").onchange=function(e){
    api("/api/game/config",{mode:e.target.value});};
  document.getElementById("selDelay").onchange=function(e){
    api("/test/delay",{ms:Number(e.target.value)});};
  document.getElementById("selDiff").onchange=function(e){
    api("/api/game/config",{difficulty:e.target.value});};
  fetch("/test/delay").then(function(r){return r.json();}).then(function(d){
    document.getElementById("selDelay").value=String(d.ms||0);}).catch(function(){});
  function refresh(){
    fetch("/api/game/status").then(function(r){return r.json();}).then(function(s){
      var sel=document.getElementById("selMode");
      if(document.activeElement!==sel)sel.value=s.mode||"controller";
      var t=s.active?("Runde: "+s.state+(s.joinUrl?"\\n"+s.joinUrl:"")):"Keine Runde aktiv";
      if(!s.active&&s.lastScore)t="Letzte Runde: "+(s.lastScore.name||"?")+" – "+s.lastScore.score+" Punkte";
      document.getElementById("stat").textContent=t;
    }).catch(function(){});}
  setInterval(refresh,2500);refresh();

  /* Grafiken: Drag&Drop -> data-URL -> MB_GAME.setSkin + localStorage */
  var KEY="ks-test-skins";
  var saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||"{}");}catch(e){}
  function apply(){if(window.MB_GAME)MB_GAME.setSkin({
    ship:saved.ship||null,enemy:saved.enemy||null,enemy2:saved.enemy2||null,
    bonus:saved.bonus||null,bullet:saved.bullet||null});
    document.querySelectorAll(".drop").forEach(function(d){
      var im=d.querySelector("img");im.src=saved[d.dataset.k]||"";
      im.style.visibility=saved[d.dataset.k]?"visible":"hidden";});}
  function store(){try{localStorage.setItem(KEY,JSON.stringify(saved));}catch(e){
    alert("Bild zu groß zum Speichern – wird nur bis zum Neuladen benutzt.");}}
  function readFile(f,k){
    if(!f||f.type.indexOf("image")!==0)return;
    // 1) An den Server (wie das echte Dashboard) - gilt ab naechster Runde,
    //    auch fuers Handy.
    var fd=new FormData();fd.append("img",f);
    fetch("/api/game/skin/"+k,{method:"POST",body:fd});
    // 2) Lokal sofort anwenden (Live-Vorschau mitten im Spiel)
    var rd=new FileReader();
    rd.onload=function(){
      var im=new Image();
      im.onload=function(){
        var c=document.createElement("canvas"),m=Math.min(128/im.width,128/im.height,1);
        c.width=Math.round(im.width*m);c.height=Math.round(im.height*m);
        c.getContext("2d").drawImage(im,0,0,c.width,c.height);
        saved[k]=c.toDataURL("image/png");store();apply();};
      im.src=rd.result;};
    rd.readAsDataURL(f);}
  var fileInp=document.getElementById("skinFile"),fileKey=null;
  fileInp.onchange=function(e){readFile(e.target.files[0],fileKey);fileInp.value="";};
  document.querySelectorAll(".drop").forEach(function(d){
    var k=d.dataset.k;
    d.addEventListener("click",function(e){
      if(e.target.className==="x"){delete saved[k];store();apply();
        fetch("/api/game/skin/"+k+"/delete",{method:"POST",
          headers:{"Content-Type":"application/json"},body:"{}"});return;}
      fileKey=k;fileInp.click();});
    ["dragenter","dragover"].forEach(function(ev){d.addEventListener(ev,function(e){
      e.preventDefault();d.classList.add("drag");});});
    ["dragleave","drop"].forEach(function(ev){d.addEventListener(ev,function(e){
      e.preventDefault();d.classList.remove("drag");});});
    d.addEventListener("drop",function(e){readFile(e.dataTransfer.files[0],k);});});
  /* Gewinne: gleiche API wie das echte Dashboard */
  function buildPz(slots){
    var w=document.getElementById("pzRows");w.innerHTML="";
    for(var i=0;i<4;i++){(function(i){
      var s=(slots&&slots[i])||{points:"",name:"",hasImg:false};
      var r=document.createElement("div");
      r.style.cssText="display:flex;gap:5px;margin-bottom:5px;align-items:center;";
      r.innerHTML='<input type="number" placeholder="Pkt" value="'+s.points+'" class="pzp" '+
        'style="width:56px;background:#0d1320;border:1px solid #2a3550;border-radius:7px;color:#fff;padding:7px;">'+
        '<input type="text" placeholder="Gewinn" maxlength="24" value="'+String(s.name||"").replace(/"/g,"&quot;")+'" class="pzn" '+
        'style="flex:1;min-width:0;background:#0d1320;border:1px solid #2a3550;border-radius:7px;color:#fff;padding:7px;">'+
        '<button class="tbtn ghost" style="width:auto;margin:0;padding:7px 9px;">'+(s.hasImg?"Bild ✓":"Bild")+'</button>'+
        '<input type="file" accept="image/*" style="display:none">';
      var btn=r.querySelector("button"),file=r.querySelector("input[type=file]");
      btn.onclick=function(){file.click();};
      file.onchange=function(e){var f=e.target.files[0];if(!f)return;
        var fd=new FormData();fd.append("img",f);
        fetch("/api/game/prize-img/"+i,{method:"POST",body:fd}).then(function(res){
          if(res.ok)btn.textContent="Bild ✓";});};
      w.appendChild(r);})(i);}
  }
  document.getElementById("pzSave").onclick=function(){
    var rows=[].slice.call(document.getElementById("pzRows").children);
    api("/api/game/config",{prizes:rows.map(function(r){return{
      points:Number(r.querySelector(".pzp").value)||0,
      name:r.querySelector(".pzn").value.trim()};})});};
  fetch("/api/game/status").then(function(r){return r.json();}).then(function(s){
    buildPz(s.prizeSlots);}).catch(function(){buildPz(null);});

  /* Aktions-Logo: geht an den Server (wie spaeter im Dashboard) */
  var logoDrop=document.getElementById("logoDrop"),logoFileInp=document.getElementById("logoFile");
  function upLogo(f){
    if(!f||f.type.indexOf("image")!==0)return;
    var fd=new FormData();fd.append("logo",f);
    fetch("/api/game/logo",{method:"POST",body:fd}).then(function(){logoRefresh();});}
  function logoRefresh(){
    var im=document.getElementById("logoPrev");
    im.src="/branding/spiellogo.png?"+Date.now();
    im.onerror=function(){im.src="/branding/spiellogo.jpg?"+Date.now();
      im.onerror=function(){im.style.visibility="hidden";};};
    im.onload=function(){im.style.visibility="visible";};}
  logoDrop.addEventListener("click",function(e){
    if(e.target.id==="logoDel"){
      fetch("/api/game/logo/delete",{method:"POST",headers:{"Content-Type":"application/json"},
        body:"{}"}).then(logoRefresh);return;}
    logoFileInp.click();});
  logoFileInp.onchange=function(e){upLogo(e.target.files[0]);logoFileInp.value="";};
  ["dragenter","dragover"].forEach(function(ev){logoDrop.addEventListener(ev,function(e){
    e.preventDefault();logoDrop.classList.add("drag");});});
  ["dragleave","drop"].forEach(function(ev){logoDrop.addEventListener(ev,function(e){
    e.preventDefault();logoDrop.classList.remove("drag");});});
  logoDrop.addEventListener("drop",function(e){upLogo(e.dataTransfer.files[0]);});
  logoRefresh();

  // Skins anwenden, sobald game.js geladen ist
  var t=setInterval(function(){if(window.MB_GAME){apply();clearInterval(t);}},200);
})();
</script>
<script src="/app/game.js"></script>
</body></html>`;

app.get("/display/:n", (req, res) => {
  res.type("text/html; charset=utf-8").send(DISPLAY_HTML(req.params.n));
});
app.get("/", (req, res) => res.redirect("/display/4"));

game.listenPublic(8788);
server.listen(PORT, () => {
  const ip = lanIp();
  console.log("");
  console.log("  Kingsley Invaders – Testmodus");
  console.log("  ==============================");
  console.log("  Display (Mac-Browser):  http://localhost:" + PORT + "/display/4");
  console.log("  Handy (gleiches WLAN):  scannt den QR auf dem Display");
  console.log("                          (läuft über http://" + ip + ":8788)");
  console.log("");
  console.log("  Zahnrad oben rechts: Runde starten, Modus umschalten,");
  console.log("  Grafiken per Drag & Drop testen.  Beenden: Ctrl+C");
  console.log("");
});
