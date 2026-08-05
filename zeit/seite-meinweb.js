"use strict";

/*
 * Kingsley Zeit – "Mein Plan" von ueberall
 * =========================================
 * Eigene Seite unter /mein, erreichbar auch von zu Hause (oeffentlicher
 * Port). Der Mitarbeiter tippt einmal seinen Code, sieht seine Schichten,
 * kann krankmelden/tauschen/sich auf offene Schichten melden und die
 * Mitteilungen einschalten.
 *
 * WICHTIG: Stempeln geht hier NICHT. Ansehen von ueberall ist gewollt
 * (sonst ergeben Mitteilungen aufs Handy keinen Sinn), Stempeln verlangt
 * weiterhin die Anwesenheit im Laden (NFC-Aufkleber bzw. iPad).
 *
 * Die eigentliche Plan-Oberflaeche kommt aus seite-mein.js - dieselbe wie
 * am Terminal. Diese Datei liefert nur die Huelle: Code-Eingabe, Merken
 * des Codes, Startbildschirm.
 */

const { MEIN_CSS, MEIN_JS } = require("./seite-mein");
const { TOKENS_CSS, THEMA_JS } = require("./design");

const MEINWEB_HTML = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#0B0D12" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F4F4F6" media="(prefers-color-scheme: light)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Mein Plan">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="icon" type="image/png" href="/icon.png">
<title>Mein Plan</title>
<style>
${TOKENS_CSS}
html,body{height:100%;-webkit-user-select:none;user-select:none;}
.wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;
 justify-content:center;padding:max(20px,env(safe-area-inset-top)) 20px
 max(20px,env(safe-area-inset-bottom));text-align:center;}
.firma{font-size:14px;letter-spacing:.22em;text-transform:uppercase;opacity:.6;}
.firma b{color:var(--o);}
.gross-t{font-size:26px;font-weight:800;margin:18px 0 8px;letter-spacing:-.02em;}
.unter-t{font-size:14px;color:var(--mut);line-height:1.6;max-width:340px;}
.startBtn{margin-top:26px;background:var(--o);border:0;color:#fff;border-radius:14px;
 padding:15px 34px;font-size:16px;font-weight:700;font-family:inherit;}
.startBtn:active{transform:scale(.98);}
.wink{margin-top:22px;font-size:12px;color:var(--mut);line-height:1.6;max-width:320px;}
.thema{position:fixed;top:max(14px,env(safe-area-inset-top));right:16px;
 background:var(--fl);border:1px solid var(--li);color:var(--mut);border-radius:9px;
 width:36px;height:36px;display:flex;align-items:center;justify-content:center;}

/* Bausteine der Nachfrage-Ebene (dieselben Klassen wie am Terminal) */
.over{position:fixed;inset:0;background:var(--bg);z-index:50;display:none;
 flex-direction:column;align-items:center;justify-content:center;padding:28px;
 text-align:center;}
.over.auf{display:flex;}
.gname{font-size:28px;font-weight:800;}
.gfrage{font-size:15px;color:var(--mut);margin-top:8px;line-height:1.5;}
.codefeld{font-size:38px;letter-spacing:.32em;font-weight:800;margin:22px 0 6px;
 min-height:48px;font-variant-numeric:tabular-nums;}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:300px;margin-top:10px;}
.pad button{background:var(--fl);border:1px solid var(--li);border-radius:16px;
 color:var(--txt);font-size:26px;font-weight:600;font-family:inherit;padding:18px 0;}
.fehler{color:var(--rot);font-size:15px;margin-top:14px;min-height:22px;}
.klein{margin-top:20px;background:none;border:none;color:var(--mut);font-size:16px;
 font-family:inherit;padding:12px 26px;}
${MEIN_CSS}
</style></head><body>
<div class="wrap">
 <div class="firma" id="firma">KINGSLEY<b>.</b></div>
 <div class="gross-t">Mein Plan</div>
 <div class="unter-t">Deine nächsten Schichten, von überall. Krankmelden,
  tauschen, offene Schichten übernehmen – und Mitteilungen aufs Handy.</div>
 <button class="startBtn" id="btnStart">Plan öffnen</button>
 <div class="wink"><b>Stempeln geht hier nicht.</b> Ein- und ausstempeln
  kannst du nur im Laden – am iPad oder nach dem Tipp auf den Aufkleber.</div>
</div>
<button class="thema" data-thema-knopf onclick="themaWechsel()"></button>

<div class="over" id="over"></div>
<div class="mein" id="mein"></div>

<script>
${THEMA_JS}
document.querySelectorAll("[data-thema-knopf]").forEach(themaKnopfMalen);
function $(i){return document.getElementById(i);}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
 return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function ini(n){var p=String(n||"").trim().split(/\\s+/);
 return ((p[0]||"?")[0]||"?").toUpperCase()+((p[1]||"")[0]||"").toUpperCase();}
function bildHtml(p){return p.photo?'<img src="/fotos/'+esc(p.photo)+'">':esc(ini(p.name));}

/* Eigenes Handy: der Code darf gemerkt werden ("Ich bin das nicht" loescht). */
var cfg={amHandy:true};
function gemerkt(){try{return localStorage.getItem("zeit-code")||"";}catch(e){return "";}}
function merken(c){try{localStorage.setItem("zeit-code",c);}catch(e){}}
function vergessen(){try{localStorage.removeItem("zeit-code");}catch(e){}}

var zurueckTimer=null;
function schliesse(){$("over").classList.remove("auf");clearTimeout(zurueckTimer);}
function laden(){}

fetch("/api/info").then(function(r){return r.json();}).then(function(i){
 if(i.firma)$("firma").innerHTML=esc(String(i.firma).toUpperCase())+'<b>.</b>';
}).catch(function(){});

${MEIN_JS}

$("btnStart").onclick=meinOeffnen;
// Wer schon mal drin war, landet direkt im Plan.
if(gemerkt())meinOeffnen();
</script></body></html>`;

module.exports = { MEINWEB_HTML };
