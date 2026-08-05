"use strict";

/*
 * Kingsley Zeit – Chef-Bereich
 * =============================
 * Gebaut fuer den Fall "ein Jahr voller Schichten": Man sieht IMMER zuerst
 * eine Zusammenfassung (eine Zeile je Mitarbeiter), Details kommen erst auf
 * Klick und werden einzeln nachgeladen. Dadurch bleibt die Seite schnell,
 * egal wie viele Stempel im System sind.
 *
 *   JETZT       – wer ist gerade im Laden (Kacheln)
 *   ZEITEN      – Zeitraum waehlen, Zusammenfassung, Detail per Klick
 *   ZU PRÜFEN   – Arbeitsliste: offene Schichten, fehlende Stempel,
 *                 automatische Ausstempelungen, unplausibel lange Schichten
 *   SCHICHTPLAN – Wochenplan mit Ziehen & Ablegen (eigene Datei)
 *   TEAM        – Mitarbeiter, Codes, Fotos, Standorte
 *   EINSTELLUNG – nur das, was der Laden-Chef wirklich braucht.
 *                 Technik (Adressen, NFC, Fernzugang) liegt im
 *                 Entwickler-Bereich hinter einer eigenen PIN - nicht als
 *                 Sicherheitsmassnahme, sondern damit die Seite aufgeraeumt
 *                 bleibt und niemand aus Versehen etwas verstellt.
 *
 * Aufbau der Oberflaeche: am grossen Bildschirm eine feste Seitenleiste
 * links, am Handy eine Leiste unten - dieselben Reiter, derselbe Inhalt.
 * Hell/Dunkel kommt aus design.js und gilt fuer alle Seiten gleich.
 */

const { PLAN_CSS, PLAN_JS } = require("./seite-plan");
const { TOKENS_CSS, BASIS_CSS, THEMA_JS } = require("./design");

const CHEF_HTML = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0B0D12" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F4F4F6" media="(prefers-color-scheme: light)">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="icon" type="image/png" href="/icon.png">
<title>Zeiten – Chef</title>
<style>
${TOKENS_CSS}
${BASIS_CSS}

/* ------------------------------ Grundgeruest ----------------------------- */
.app{display:flex;min-height:100vh;}
.haupt{flex:1;min-width:0;}
.inhalt{padding:16px 16px 96px;max-width:1080px;margin:0 auto;}
.seitentitel{font-size:21px;font-weight:700;letter-spacing:-.02em;margin:4px 0 14px;
 display:flex;align-items:center;gap:10px;}
.seitentitel .rechts{margin-left:auto;display:flex;gap:8px;align-items:center;
 font-size:13px;font-weight:400;}

/* Seitenleiste (Tablet quer / Desktop) */
.seite{display:none;}
.marke{font-size:13px;letter-spacing:.18em;text-transform:uppercase;font-weight:650;
 padding:6px 12px 0;}
.marke b{color:var(--o);}
.nav{display:flex;flex-direction:column;gap:2px;margin-top:20px;}
.nav button{display:flex;align-items:center;gap:11px;background:none;border:0;
 color:var(--mut);padding:10px 12px;border-radius:10px;font-size:13.5px;
 font-weight:550;text-align:left;width:100%;}
.nav button:hover{background:var(--fl2);color:var(--txt);}
.nav button.on{background:var(--o-weich);color:var(--o);font-weight:650;}
.nav button svg{flex:0 0 auto;}
.nav .zahl{margin-left:auto;background:var(--rot);color:#fff;border-radius:999px;
 font-size:10px;padding:2px 7px;font-weight:700;}
.seitenfuss{margin-top:auto;display:flex;gap:8px;align-items:center;padding:0 4px;}
.seitenfuss .mini{flex:1;padding:8px 10px;text-align:center;}

/* Kopfzeile (Handy / Tablet hochkant) */
.kopfmobil{position:sticky;top:0;z-index:25;background:var(--bg);
 border-bottom:1px solid var(--li);display:flex;align-items:center;gap:10px;
 justify-content:space-between;padding:11px 16px;
 padding-top:max(11px,env(safe-area-inset-top));}
.kopfmobil .marke{padding:0;}

/* Leiste unten (Handy) */
.unten{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;
 background:var(--fl);border-top:1px solid var(--li);
 padding:6px 4px calc(6px + env(safe-area-inset-bottom));}
.unten button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
 background:none;border:0;color:var(--mut);font-size:9.5px;font-weight:600;
 padding:4px 0;position:relative;min-width:0;}
.unten button.on{color:var(--o);}
.unten .zahl{position:absolute;top:-3px;left:calc(50% + 4px);background:var(--rot);
 color:#fff;border-radius:999px;font-size:9px;padding:1px 5px;font-weight:700;}

@media(min-width:980px){
 .seite{display:flex;flex-direction:column;position:fixed;top:0;bottom:0;left:0;
  width:225px;background:var(--fl);border-right:1px solid var(--li);
  padding:20px 12px 18px;z-index:30;}
 .haupt{margin-left:225px;}
 .kopfmobil,.unten{display:none;}
 .inhalt{padding:26px 30px 60px;}
}

/* Kacheln "Jetzt" */
.kacheln{display:grid;grid-template-columns:repeat(auto-fill,minmax(142px,1fr));gap:10px;}
.kachel{background:var(--fl2);border:1px solid var(--li);border-radius:14px;
 padding:14px 10px;text-align:center;}
.kachel.da{border-color:var(--gruen);background:var(--gruen-weich);}
.kachel .ava{margin:0 auto 9px;width:52px;height:52px;font-size:17px;}
.kachel .nm{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;
 white-space:nowrap;}
.kachel .st{font-size:11.5px;color:var(--mut);margin-top:3px;}
.kachel.da .st{color:var(--gruen);font-weight:600;}

/* Zeiten-Detail */
.zeile .std{font-weight:700;color:var(--o);font-size:16.5px;text-align:right;
 font-variant-numeric:tabular-nums;flex:0 0 auto;}
.wochenkopf{display:flex;justify-content:space-between;align-items:center;
 padding:9px 12px;background:var(--fl2);border-radius:10px;margin:14px 0 7px;
 font-size:12px;color:var(--mut);letter-spacing:.04em;}
.wochenkopf b{color:var(--o);font-size:13.5px;}
.tagzeile{padding:8px 4px 4px;font-size:12px;color:var(--mut);
 display:flex;justify-content:space-between;}
.schicht{display:flex;align-items:center;gap:9px;padding:9px 11px;background:var(--fl2);
 border:1px solid var(--li);border-radius:10px;margin-bottom:5px;font-size:13.5px;
 flex-wrap:wrap;}
.schicht .z{font-variant-numeric:tabular-nums;}
.schicht .d{margin-left:auto;font-weight:650;font-variant-numeric:tabular-nums;}
.schicht.p-offen{border-color:var(--gruen);}
.schicht.p-auto,.schicht.p-lang{border-color:var(--gelb);}
.schicht.p-kein-start{border-color:var(--rot);}

/* Protokoll ("Letzte Änderungen") – Texte brechen sauber um, nichts laeuft
   mehr aus dem Rahmen. */
.log{max-height:420px;overflow-y:auto;overscroll-behavior:contain;}
.log .eintrag{padding:10px 2px;border-bottom:1px solid var(--li);min-width:0;}
.log .eintrag:last-child{border-bottom:none;}
.log .z{color:var(--mut);font-size:11px;font-variant-numeric:tabular-nums;}
.log .w{font-weight:600;font-size:13px;margin:2px 0 1px;overflow-wrap:anywhere;}
.log .d{color:var(--mut);font-size:12.5px;line-height:1.5;overflow-wrap:anywhere;
 word-break:break-word;}

/* Entwickler-Bereich: sichtbar abgesetzt, gestrichelter Rahmen */
.dev{border-style:dashed;border-color:var(--li2);}
.dev h2 .devtag{font-size:9.5px;font-weight:700;letter-spacing:.08em;color:var(--mut);
 border:1px solid var(--li2);border-radius:6px;padding:2px 6px;vertical-align:2px;
 margin-left:8px;text-transform:uppercase;}
.devauf{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;
 background:none;border:1px dashed var(--li2);color:var(--mut);border-radius:12px;
 padding:12px;font-size:12.5px;font-weight:550;margin:6px 0 20px;}
.devauf:hover{color:var(--txt);border-color:var(--mut);}

/* Anmeldung */
#login{position:fixed;inset:0;background:var(--bg);z-index:100;display:flex;
 align-items:center;justify-content:center;padding:24px;}
#login .box{width:100%;max-width:340px;background:var(--fl);border:1px solid var(--li);
 border-radius:20px;padding:28px 24px;box-shadow:var(--schatten);text-align:center;}
#login input{text-align:center;font-size:20px;letter-spacing:.28em;}

${PLAN_CSS}
</style></head><body>

<div id="login"><div class="box">
 <div class="marke" style="padding:0">KINGSLEY<b>.</b> ZEITEN</div>
 <h2 style="margin:18px 0 16px;font-size:19px" id="loginTitel">Chef-PIN</h2>
 <input id="chefPin" type="password" inputmode="numeric" placeholder="••••">
 <div id="chefPin2Wrap" style="display:none">
  <label style="text-align:left">PIN wiederholen</label>
  <input id="chefPin2" type="password" inputmode="numeric">
 </div>
 <button class="btn voll" id="loginBtn">Anmelden</button>
 <div id="loginFehler" style="color:var(--rot);font-size:13px;margin-top:12px;min-height:18px"></div>
</div></div>

<div class="app">
 <aside class="seite">
  <div class="marke">KINGSLEY<b>.</b> ZEITEN</div>
  <nav class="nav" id="navSeite"></nav>
  <div class="seitenfuss">
   <button class="thema-knopf" data-thema-knopf onclick="themaWechsel()"></button>
   <button class="mini" id="abmelden">Abmelden</button>
  </div>
 </aside>

 <div class="haupt">
  <div class="kopfmobil">
   <div class="marke">KINGSLEY<b>.</b> ZEITEN</div>
   <div style="display:flex;gap:8px;align-items:center">
    <button class="thema-knopf" data-thema-knopf onclick="themaWechsel()"></button>
    <button class="mini" id="abmelden2">Abmelden</button>
   </div>
  </div>
  <div class="inhalt">
   <div id="locbar" style="display:none;margin-bottom:14px"><div class="chips" id="locChips"></div></div>
   <div id="tJetzt"></div>
   <div id="tZeiten" style="display:none"></div>
   <div id="tPruefen" style="display:none"></div>
   <div id="tPlan" style="display:none"></div>
   <div id="tTeam" style="display:none"></div>
   <div id="tSetup" style="display:none"></div>
  </div>
 </div>
</div>

<nav class="unten" id="navUnten"></nav>

<div class="modal" id="modal"><div class="mkarte" id="modalInhalt"></div></div>
<div class="toast" id="toast"></div>

<script>
${THEMA_JS}
document.querySelectorAll("[data-thema-knopf]").forEach(themaKnopfMalen);
function $(i){return document.getElementById(i);}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
 return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function toast(m){var t=$("toast");t.textContent=m;t.style.display="block";
 clearTimeout(t._t);t._t=setTimeout(function(){t.style.display="none";},2600);}
function api(p,b){return fetch(p,{method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify(b||{})}).then(function(r){return r.json();});}
function get(p){return fetch(p).then(function(r){return r.json();});}
function ini(n){var p=String(n||"").trim().split(/\\s+/);
 return ((p[0]||"?")[0]||"?").toUpperCase()+((p[1]||"")[0]||"").toUpperCase();}
function avaHtml(p,da){return '<div class="ava'+(da?" da":"")+'">'+
 (p.photo?'<img src="fotos/'+esc(p.photo)+'">':esc(ini(p.name)))+'</div>';}
function modal(html){$("modalInhalt").innerHTML=html;$("modal").classList.add("auf");}
function zu(){$("modal").classList.remove("auf");}
$("modal").onclick=function(e){if(e.target===$("modal"))zu();};
function std(m){return Math.floor(m/60)+":"+String(m%60).padStart(2,"0");}
function heute(){var d=new Date();return d.getFullYear()+"-"+
 String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function tagVor(n){var d=new Date();d.setDate(d.getDate()-n);return d.getFullYear()+"-"+
 String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function wocheStart(){var d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));
 return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+
  String(d.getDate()).padStart(2,"0");}
function monatStart(){var d=new Date();
 return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-01";}

var daten=null,setupNoetig=false,tab="jetzt";
var von=wocheStart(),bis=heute(),zeitraum="woche",filterLoc="",nurAktive=true;
var devFrei=false;
try{devFrei=sessionStorage.getItem("zeit-dev")==="1";}catch(e){}

/* ------------------------------ Navigation ------------------------------- */
/* Dieselben Reiter zweimal gezeichnet: links als Leiste, unten als App-Leiste.
   Die Zahlen ("zu pruefen", offene Meldungen) haengen an data-badge. */
var ICO={
 jetzt:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
 zeiten:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
 pruefen:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
 plan:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
 team:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
 setup:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'
};
function icon(n,g){return '<svg width="'+(g||17)+'" height="'+(g||17)+
 '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '+
 'stroke-linecap="round" stroke-linejoin="round">'+ICO[n]+'</svg>';}
var TABS=[
 {id:"jetzt",name:"Jetzt",kurz:"Jetzt"},
 {id:"zeiten",name:"Zeiten",kurz:"Zeiten"},
 {id:"pruefen",name:"Zu prüfen",kurz:"Prüfen",badge:"pruefen"},
 {id:"plan",name:"Schichtplan",kurz:"Plan",badge:"plan"},
 {id:"team",name:"Team",kurz:"Team"},
 {id:"setup",name:"Einstellungen",kurz:"Mehr"}
];
function navZeichnen(){
 $("navSeite").innerHTML=TABS.map(function(t){
  return '<button data-t="'+t.id+'"'+(tab===t.id?' class="on"':'')+'>'+icon(t.id)+
   '<span>'+t.name+'</span>'+
   (t.badge?'<span class="zahl" data-badge="'+t.badge+'" style="display:none">0</span>':'')+
   '</button>';}).join("");
 $("navUnten").innerHTML=TABS.map(function(t){
  return '<button data-t="'+t.id+'"'+(tab===t.id?' class="on"':'')+'>'+icon(t.id,19)+
   '<span>'+t.kurz+'</span>'+
   (t.badge?'<span class="zahl" data-badge="'+t.badge+'" style="display:none">0</span>':'')+
   '</button>';}).join("");
 document.querySelectorAll("[data-t]").forEach(function(b){
  b.onclick=function(){tabWechsel(b.dataset.t);};});
 badgesZeichnen();
}
function tabWechsel(t){
 tab=t;
 document.querySelectorAll("[data-t]").forEach(function(x){
  x.classList.toggle("on",x.dataset.t===t);});
 ["Jetzt","Zeiten","Pruefen","Plan","Team","Setup"].forEach(function(n){
  $("t"+n).style.display=(n.toLowerCase()===t?"":"none");});
 window.scrollTo(0,0);
 if(t==="plan"){planLaden();return;}
 zeichne();
}
function badgesZeichnen(){
 if(!daten)return;
 var werte={pruefen:daten.probleme.length,
  plan:(window.planD&&planD.meldungen)?planD.meldungen.length:(daten.meldungenOffen||0)};
 document.querySelectorAll("[data-badge]").forEach(function(el){
  var n=werte[el.dataset.badge]||0;
  el.style.display=n?"":"none";el.textContent=n;});
}

/* ------------------------------ Anmeldung ------------------------------- */
var fernModus=false;
get("api/chef/status").then(function(s){
 setupNoetig=!s.eingerichtet;
 fernModus=!!s.fern;
 if(fernModus){
  /* Von unterwegs: langes Passwort statt PIN. Einrichten geht hier nicht. */
  setupNoetig=false;
  $("loginTitel").textContent="Chef-Passwort";
  $("chefPin").placeholder="Passwort";
  $("chefPin").removeAttribute("inputmode");
  $("chefPin").style.letterSpacing="normal";
  $("chefPin").style.fontSize="16px";
  if(s.wartenSek)$("loginFehler").textContent=
   "Gesperrt – noch "+Math.ceil(s.wartenSek/60)+" Min.";
 }else if(setupNoetig){
  $("loginTitel").textContent="Chef-PIN festlegen";
  $("chefPin2Wrap").style.display="block";$("loginBtn").textContent="Festlegen und starten";}
 if(s.angemeldet){$("login").style.display="none";laden();}
});
$("loginBtn").onclick=function(){
 var p=$("chefPin").value;
 if(setupNoetig){
  if(!/^\\d{4,8}$/.test(p)){$("loginFehler").textContent="4 bis 8 Ziffern bitte.";return;}
  if(p!==$("chefPin2").value){$("loginFehler").textContent="Die PINs sind nicht gleich.";return;}
  api("api/chef/setup",{pin:p}).then(function(r){
   if(r.ok){$("login").style.display="none";laden();}
   else $("loginFehler").textContent=r.fehler||"Fehler";});
  return;
 }
 api("api/chef/login",fernModus?{pass:p}:{pin:p}).then(function(r){
  if(r.ok){$("login").style.display="none";laden();return;}
  $("chefPin").value="";
  if(r.fehler){$("loginFehler").textContent=r.fehler;return;}
  var rest=r.versuche?(5-r.versuche):0;
  $("loginFehler").textContent=(fernModus?"Passwort":"PIN")+" falsch."+
   (rest>0&&rest<3?" Noch "+rest+" Versuche.":"");});
};
$("chefPin").addEventListener("keydown",function(e){if(e.key==="Enter")$("loginBtn").click();});
function abmelden(){api("api/chef/logout").then(function(){location.reload();});}
$("abmelden").onclick=abmelden;
$("abmelden2").onclick=abmelden;

function laden(){
 return get("api/chef/uebersicht?von="+von+"&bis="+bis+"&loc="+encodeURIComponent(filterLoc)+
     "&aktive="+(nurAktive?"1":"0"))
 .then(function(d){
  if(d.fehler==="auth"){location.reload();return;}
  daten=d;
  navZeichnen();
  zeichne();
 });
}
setInterval(function(){if(daten&&tab==="jetzt")laden();},20000);

function locFilter(){
 var bar=$("locbar");
 if(!daten||daten.locations.length<2){bar.style.display="none";return;}
 bar.style.display="block";
 var h='<button class="chip'+(filterLoc?"":" on")+'" data-loc="">Alle Läden</button>';
 daten.locations.forEach(function(l){
  h+='<button class="chip'+(filterLoc===l.id?" on":"")+'" data-loc="'+l.id+'">'+esc(l.name)+'</button>';});
 $("locChips").innerHTML=h;
 $("locChips").querySelectorAll("[data-loc]").forEach(function(b){
  b.onclick=function(){filterLoc=b.dataset.loc;laden();};});
}
function zeichne(){
 if(!daten)return;
 locFilter();
 badgesZeichnen();
 if(tab==="jetzt")zJetzt();
 else if(tab==="zeiten")zZeiten();
 else if(tab==="pruefen")zPruefen();
 else if(tab==="team")zTeam();
 else if(tab==="setup")zSetup();
}

/* -------------------------------- JETZT --------------------------------- */
function anLoc(p){
 if(!filterLoc)return true;
 return (p.locIds||[p.locId]).indexOf(filterLoc)>-1;
}
function zJetzt(){
 var alle=daten.live.filter(anLoc);
 var da=alle.filter(function(p){return p.in;});
 var weg=alle.filter(function(p){return !p.in;});
 var summe=da.reduce(function(a,p){return a+p.sinceMin;},0);
 var h='<div class="seitentitel">Jetzt</div>'+
  '<div class="karte"><div class="kpi">'+
  '<div><div class="w" style="color:var(--gruen)">'+da.length+'</div>'+
  '<div class="l">Eingestempelt</div></div>'+
  '<div><div class="w">'+weg.length+'</div><div class="l">Nicht da</div></div>'+
  '<div><div class="w" style="color:var(--o)">'+std(summe)+'</div>'+
  '<div class="l">Laufende Std.</div></div></div></div>';
 if(da.length){
  h+='<h3>Im Laden</h3><div class="kacheln">';
  da.forEach(function(p){
   h+='<div class="kachel da">'+avaHtml(p,true)+'<div class="nm">'+esc(p.name)+'</div>'+
    '<div class="st">seit '+esc(p.since)+' · '+std(p.sinceMin)+' h</div>'+
    (daten.locations.length>1&&p.location?'<div class="st" style="opacity:.55">'+
     esc(p.location)+'</div>':"")+'</div>';});
  h+='</div>';
 }
 h+='<h3>Nicht da</h3>';
 if(!weg.length)h+='<div class="karte"><div class="leer">Alle sind eingestempelt.</div></div>';
 else{h+='<div class="kacheln">';
  weg.forEach(function(p){
   h+='<div class="kachel">'+avaHtml(p,false)+'<div class="nm">'+esc(p.name)+'</div>'+
    '<div class="st">'+esc(p.location||"nicht da")+'</div></div>';});
  h+='</div>';}
 $("tJetzt").innerHTML=h;
}

/* -------------------------------- ZEITEN -------------------------------- */
function zZeiten(){
 var s=daten.summary;
 var h='<div class="seitentitel">Zeiten</div>'+
  '<div class="karte">'+
  '<div class="chips" style="margin-bottom:10px">'+
   chip("woche","Diese Woche")+chip("letzteWoche","Letzte Woche")+
   chip("monat","Dieser Monat")+chip("30","Letzte 30 Tage")+chip("frei","Zeitraum wählen")+
  '</div>'+
  (zeitraum==="frei"?'<div class="reihe" style="margin-bottom:12px">'+
   '<div><label style="margin-top:0">Von</label><input type="date" id="dVon" value="'+von+'"></div>'+
   '<div><label style="margin-top:0">Bis</label><input type="date" id="dBis" value="'+bis+'"></div></div>':"")+

  '<div class="kpi"><div><div class="w" style="color:var(--o)">'+esc(s.hours)+'</div>'+
   '<div class="l">Stunden gesamt</div></div>'+
   '<div><div class="w">'+s.rows.length+'</div><div class="l">Mitarbeiter</div></div>'+
   '<div><div class="w" style="color:'+(s.probleme?"var(--rot)":"var(--gruen)")+'">'+
   s.probleme+'</div><div class="l">Zu prüfen</div></div></div>'+
  '<div class="reihe" style="margin-top:12px">'+
   '<button class="btn" id="bNachtrag">+ Zeit nachtragen</button>'+
   '<a class="btn g" style="text-decoration:none" '+
    'href="api/chef/export.csv?von='+von+'&bis='+bis+'">CSV für Excel</a></div>'+
  '<a class="btn voll g" style="text-decoration:none" '+
   'target="_blank" href="api/chef/stundenzettel.pdf?von='+von+'&bis='+bis+
   (filterLoc?'&loc='+encodeURIComponent(filterLoc):'')+
   '">Stundenzettel als PDF (Steuerberater)</a>'+
  '<div class="hint">'+esc(von)+' bis '+esc(bis)+
  (s.autoBreak?" · Pausen automatisch abgezogen":"")+
  ' · Der Stundenzettel enthält je Mitarbeiter eine eigene Seite mit '+
  'Unterschriftszeile.</div></div>';

 if(!s.rows.length)h+='<div class="karte"><div class="leer">Keine Mitarbeiter im Filter.</div></div>';
 s.rows.forEach(function(m){
  h+='<div class="zeile" onclick="detail(\\''+m.empId+'\\')">'+avaHtml(m,m.status.in)+
   '<div class="txt"><div class="nm">'+esc(m.name)+
   (m.probleme?' <span class="warn">'+m.probleme+'</span>':"")+'</div>'+
   '<div class="sub">'+m.schichten+' Schichten · '+m.tage+' Tage'+
   (m.locName?" · "+esc(m.locName):"")+'</div></div>'+
   '<div class="std">'+esc(m.hours)+'</div><div class="pfeil">›</div></div>';
 });
 $("tZeiten").innerHTML=h;
 document.querySelectorAll("[data-zr]").forEach(function(b){
  b.onclick=function(){setZeitraum(b.dataset.zr);};});
 if($("dVon"))$("dVon").onchange=function(){von=this.value;laden();};
 if($("dBis"))$("dBis").onchange=function(){bis=this.value;laden();};
 $("bNachtrag").onclick=nachtrag;
}
function chip(id,text){
 return '<button class="chip'+(zeitraum===id?" on":"")+'" data-zr="'+id+'">'+text+'</button>';
}
function setZeitraum(z){
 zeitraum=z;
 if(z==="woche"){von=wocheStart();bis=heute();}
 else if(z==="letzteWoche"){
  var d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7)-7);
  var a=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+
   String(d.getDate()).padStart(2,"0");
  d.setDate(d.getDate()+6);
  von=a;bis=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+
   String(d.getDate()).padStart(2,"0");}
 else if(z==="monat"){von=monatStart();bis=heute();}
 else if(z==="30"){von=tagVor(30);bis=heute();}
 laden();
}

/* Detail eines Mitarbeiters – wird einzeln nachgeladen */
function detail(empId){
 modal('<div class="leer">Lade …</div>');
 get("api/chef/detail?emp="+empId+"&von="+von+"&bis="+bis).then(function(d){
  if(d.fehler){zu();toast("Fehler");return;}
  var h='<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">'+
   avaHtml(d,d.status.in)+'<div style="min-width:0"><div style="font-size:18px;font-weight:700">'+esc(d.name)+'</div>'+
   '<div style="font-size:12px;color:var(--mut)">Code '+esc(d.codeHint||"")+
   ' · '+esc(von)+' bis '+esc(bis)+'</div></div>'+
   '<div style="margin-left:auto;font-size:20px;font-weight:700;color:var(--o);flex:0 0 auto">'+
   esc(d.hours)+' h</div></div>';
  if(!d.wochen.length)h+='<div class="leer">Keine Zeiten in diesem Zeitraum.</div>';
  d.wochen.forEach(function(w){
   h+='<div class="wochenkopf"><span>'+esc(w.woche.replace("-KW"," · KW "))+'</span>'+
    '<b>'+esc(w.hours)+' h</b></div>';
   w.tage.forEach(function(t){
    h+='<div class="tagzeile"><span>'+esc(t.label)+'</span><span>'+esc(t.hours)+' h</span></div>';
    t.shifts.forEach(function(s){
     h+='<div class="schicht'+(s.problem?" p-"+s.problem:"")+'">'+
      '<span class="z">'+(s.start?esc(s.start):'<span style="color:var(--rot)">??:??</span>')+
      ' – '+(s.end?esc(s.end):'<span style="color:var(--gruen)">läuft</span>')+'</span>'+
      (s.problem?'<span class="tag-warn tag-'+s.problem+'">'+problemText(s.problem)+'</span>':"")+
      '<span class="d">'+esc(std(s.min))+'</span>'+
      '<button class="mini" onclick="bearbeite(\\''+d.empId+'\\',\\''+(s.startId||"")+
       '\\',\\''+(s.endId||"")+'\\',\\''+t.day+'\\',\\''+esc(d.name)+'\\',\\''+
       (s.start||"")+'\\',\\''+(s.end||"")+'\\')">ändern</button></div>';
    });
   });
  });
  h+='<button class="btn voll g" onclick="zu()">Schließen</button>';
  modal(h);
 });
}
function problemText(p){
 return {offen:"LÄUFT","kein-start":"START FEHLT",auto:"AUTOMATISCH",lang:"SEHR LANG"}[p]||p;
}

/* ------------------------------ ZU PRÜFEN ------------------------------- */
function zPruefen(){
 var pr=daten.probleme.filter(anLoc);
 var h='<div class="seitentitel">Zu prüfen'+
  (pr.length?' <span class="warn" style="font-size:12px;padding:3px 9px">'+pr.length+'</span>':'')+
  '</div>'+
  '<div class="untertitel">Alles, was nicht sauber gestempelt wurde: vergessenes '+
  'Ausstempeln, automatisch beendete Schichten, fehlende Anfänge, ungewöhnlich '+
  'lange Schichten. Erledigtes verschwindet von selbst.</div>';
 if(!pr.length){
  $("tPruefen").innerHTML=h+'<div class="karte"><div class="leer">'+
   'Alles sauber – nichts zu tun.</div></div>';return;}
 pr.forEach(function(p){
  h+='<div class="karte" style="padding:14px">'+
   '<div style="display:flex;align-items:center;gap:11px">'+avaHtml(p,false)+
   '<div style="flex:1;min-width:0"><div style="font-weight:600">'+esc(p.name)+'</div>'+
   '<div style="font-size:12px;color:var(--mut);margin-top:2px">'+esc(p.label)+' · '+
   (p.start?esc(p.start):"??:??")+' – '+(p.end?esc(p.end):"läuft")+'</div></div>'+
   '<span class="tag-warn tag-'+p.art+'">'+problemText(p.art)+'</span></div>'+
   (p.note?'<div class="hint">'+esc(p.note)+'</div>':"")+
   '<div class="reihe" style="margin-top:12px">'+
   '<button class="btn klein" onclick="bearbeite(\\''+p.empId+'\\',\\''+(p.startId||"")+
    '\\',\\''+(p.endId||"")+'\\',\\''+p.day+'\\',\\''+esc(p.name)+'\\',\\''+
    (p.start||"")+'\\',\\''+(p.end||"")+'\\')">Korrigieren</button>'+
   (p.art==="auto"?'<button class="btn klein g" onclick="passtSo(\\''+p.endId+'\\')">Passt so</button>':"")+
   '</div></div>';
 });
 $("tPruefen").innerHTML=h;
}
function passtSo(id){
 api("api/chef/eintrag-ok",{id:id}).then(function(){toast("Als geprüft markiert");laden();});
}

/* --------------------------------- TEAM --------------------------------- */
function zTeam(){
 var h='<div class="seitentitel">Team'+
  '<div class="rechts"><button class="btn klein" onclick="mitarbeiter(null)">+ Mitarbeiter</button></div>'+
  '</div>'+
  '<div class="untertitel">Jeder hat einen persönlichen Code aus 2 Buchstaben und '+
  '4 Ziffern (z. B. AY1234). Am iPad im Laden reicht das Antippen des eigenen '+
  'Fotos – der Code ist der Ersatzweg.</div>';
 daten.employees.forEach(function(e){
  h+='<div class="zeile" onclick="mitarbeiter(\\''+e.id+'\\')">'+avaHtml(e,false)+
   '<div class="txt"><div class="nm">'+esc(e.name)+
   (e.active?"":' <span style="color:var(--mut);font-size:12px;font-weight:400">(inaktiv)</span>')+'</div>'+
   '<div class="sub">Code '+esc(e.codeHint||"–")+
   (e.locName?" · "+esc(e.locName):"")+'</div></div><div class="pfeil">›</div></div>';
 });
 if(!daten.employees.length)h+='<div class="karte"><div class="leer">Noch niemand angelegt.</div></div>';
 $("tTeam").innerHTML=h;
}
function mitarbeiter(id){
 var e=id?daten.employees.find(function(x){return x.id===id;}):null;
 var opts=daten.locations.map(function(l){
  return '<option value="'+l.id+'"'+(e&&e.locId===l.id?" selected":"")+'>'+
   esc(l.name)+'</option>';}).join("");
 /* Bei mehreren Laeden: Heimatstandort plus "auch einsetzbar in ...". Die
    Person erscheint dann auf den iPads und im Plan aller gewaehlten Laeden. */
 var auch=(e&&e.auchLocIds?e.auchLocIds.slice():[]);
 var auchHtml="";
 if(daten.locations.length>1){
  auchHtml='<label>Auch einsetzbar in</label><div class="chips" id="mAuch"></div>'+
   '<div class="hint" style="margin-top:6px">Erscheint dann auch auf dem iPad '+
   'und im Schichtplan dieser Läden.</div>';
 }
 modal('<h2>'+(e?"Mitarbeiter bearbeiten":"Neuer Mitarbeiter")+'</h2>'+
  '<label>Name</label><input id="mName" value="'+(e?esc(e.name):"")+'">'+
  '<label>Persönlicher Code'+(e?" (leer lassen = unverändert)":"")+'</label>'+
  '<div class="reihe"><input id="mCode" placeholder="z. B. AY1234" maxlength="6" '+
   'style="text-transform:uppercase;letter-spacing:.14em">'+
   '<button class="btn g" style="flex:0 0 auto" id="mWuerfel">Vorschlag</button></div>'+
  '<label>'+(daten.locations.length>1?"Heimatstandort":"Standort")+'</label>'+
  '<select id="mLoc">'+opts+'</select>'+
  auchHtml+
  '<label>Foto (optional)</label><input type="file" id="mFoto" accept="image/*">'+
  (e?'<div class="tw" style="margin-top:12px"><div class="t1">Aktiv</div>'+
   '<label class="schalter"><input type="checkbox" id="mAktiv"'+(e.active?" checked":"")+
   '><span class="b"></span></label></div>':"")+
  '<button class="btn voll" id="mSave">Speichern</button>'+
  '<button class="btn voll g" onclick="zu()">Abbrechen</button>');
 /* Chips fuer die weiteren Standorte - der Heimatstandort ist nie waehlbar */
 function auchMalen(){
  if(!$("mAuch"))return;
  var heim=$("mLoc").value;
  auch=auch.filter(function(x){return x!==heim;});
  $("mAuch").innerHTML=daten.locations
   .filter(function(l){return l.id!==heim;})
   .map(function(l){return '<button type="button" class="chip'+
    (auch.indexOf(l.id)>-1?" on":"")+'" data-auch="'+l.id+'">'+esc(l.name)+'</button>';})
   .join("");
  $("mAuch").querySelectorAll("[data-auch]").forEach(function(b){
   b.onclick=function(){
    var i=auch.indexOf(b.dataset.auch);
    if(i>-1)auch.splice(i,1);else auch.push(b.dataset.auch);
    auchMalen();};});
 }
 auchMalen();
 if($("mAuch"))$("mLoc").onchange=auchMalen;
 $("mWuerfel").onclick=function(){
  api("api/chef/code-vorschlag",{name:$("mName").value}).then(function(r){
   $("mCode").value=r.code;});
 };
 if(!e)setTimeout(function(){$("mWuerfel").click();},50);
 $("mSave").onclick=function(){
  var body={name:$("mName").value,locId:$("mLoc").value,auchLocIds:auch};
  var c=$("mCode").value.toUpperCase().trim();
  if(c)body.code=c;
  if(e){body.id=e.id;body.active=$("mAktiv").checked;}
  var f=$("mFoto").files[0];
  var weiter=function(){
   api("api/chef/mitarbeiter",body).then(function(r){
    if(!r.ok){toast(r.fehler||"Fehler");return;}
    zu();toast(c?("Gespeichert · Code "+c):"Gespeichert");laden();});
  };
  if(f){
   var rd=new FileReader();
   rd.onload=function(){
    var im=new Image();
    im.onload=function(){
     var cv=document.createElement("canvas"),s=Math.min(im.width,im.height);
     cv.width=cv.height=240;
     cv.getContext("2d").drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,240,240);
     body.foto=cv.toDataURL("image/jpeg",.85);weiter();};
    im.src=rd.result;};
   rd.readAsDataURL(f);
  }else weiter();
 };
}

/* ------------------------------ KORREKTUR ------------------------------- */
function bearbeite(empId,startId,endId,day,name,start,end){
 modal('<h2>Zeit ändern – '+esc(name)+'</h2>'+
  '<div style="font-size:13px;color:var(--mut);margin-bottom:4px">'+esc(day)+'</div>'+
  (startId?'<label>Kommt</label><div class="reihe">'+
   '<input type="time" id="eStart" value="'+esc(start)+'">'+
   '<button class="btn g" style="flex:0 0 auto" onclick="loesche(\\''+startId+
   '\\')">löschen</button></div>'
   :'<div class="hint" style="color:var(--rot)">Für diese Schicht fehlt das Einstempeln – '+
    'unten nachtragen.</div><label>Kommt nachtragen</label><input type="time" id="eNeuStart">')+
  (endId?'<label>Geht</label><div class="reihe">'+
   '<input type="time" id="eEnd" value="'+esc(end)+'">'+
   '<button class="btn g" style="flex:0 0 auto" onclick="loesche(\\''+endId+
   '\\')">löschen</button></div>'
   :'<div class="hint" style="color:var(--gruen)">Noch eingestempelt.</div>'+
    '<label>Geht nachtragen</label><input type="time" id="eNeuEnd">')+
  '<label>Notiz (warum geändert?)</label>'+
  '<input id="eNote" placeholder="z. B. Ausstempeln vergessen">'+
  '<button class="btn voll" id="eSave">Speichern</button>'+
  '<button class="btn voll g" onclick="zu()">Abbrechen</button>');
 $("eSave").onclick=function(){
  var jobs=[],note=$("eNote").value;
  if(startId&&$("eStart"))jobs.push(api("api/chef/eintrag-aendern",
   {id:startId,day:day,time:$("eStart").value,note:note}));
  if(endId&&$("eEnd"))jobs.push(api("api/chef/eintrag-aendern",
   {id:endId,day:day,time:$("eEnd").value,note:note}));
  if(!startId&&$("eNeuStart")&&$("eNeuStart").value)
   jobs.push(api("api/chef/eintrag-neu",{empId:empId,day:day,
    inTime:$("eNeuStart").value,note:note}));
  if(!endId&&$("eNeuEnd")&&$("eNeuEnd").value)
   jobs.push(api("api/chef/eintrag-neu",{empId:empId,day:day,
    outTime:$("eNeuEnd").value,note:note}));
  Promise.all(jobs).then(function(){zu();toast("Gespeichert");laden();});
 };
}
function loesche(id){
 if(!confirm("Diesen Stempel wirklich löschen?"))return;
 api("api/chef/eintrag-loeschen",{id:id}).then(function(){zu();toast("Gelöscht");laden();});
}
function nachtrag(){
 var opts=daten.employees.filter(function(e){return e.active;})
  .map(function(e){return '<option value="'+e.id+'">'+esc(e.name)+'</option>';}).join("");
 modal('<h2>Zeit nachtragen</h2>'+
  '<label>Mitarbeiter</label><select id="nEmp">'+opts+'</select>'+
  '<label>Tag</label><input type="date" id="nDay" value="'+heute()+'">'+
  '<div class="reihe"><div><label>Kommt</label><input type="time" id="nIn" value="10:00"></div>'+
  '<div><label>Geht</label><input type="time" id="nOut" value="18:00"></div></div>'+
  '<label>Notiz</label><input id="nNote" placeholder="z. B. Stempeln vergessen">'+
  '<button class="btn voll" id="nSave">Eintragen</button>'+
  '<button class="btn voll g" onclick="zu()">Abbrechen</button>');
 $("nSave").onclick=function(){
  api("api/chef/eintrag-neu",{empId:$("nEmp").value,day:$("nDay").value,
   inTime:$("nIn").value,outTime:$("nOut").value,note:$("nNote").value})
  .then(function(r){
   if(!r.ok){toast(r.fehler||"Fehler");return;}
   zu();toast("Eingetragen");laden();});
 };
}

/* ----------------------------- EINSTELLUNGEN ---------------------------- */
/*
 * Zwei Ebenen:
 *   1. Was der Laden-Chef braucht: Firma, Öffnungszeiten, Stempel-Regeln,
 *      Standorte (Name + Zeiten), Mitteilungen, PIN, Protokoll.
 *   2. Entwickler-Bereich (eigene PIN): Adressen, NFC-Aufkleber, QR-Codes,
 *      Fernzugang, angemeldete Geräte. Kein Sicherheits-, ein Ordnungsding:
 *      der Chef soll damit gar nicht erst in Berührung kommen.
 */
function zSetup(){
 var c=daten.config;
 var h='<div class="seitentitel">Einstellungen</div>';

 h+='<div class="karte"><h2>Laden</h2>'+
  '<label>Firmenname</label><input id="sFirma" value="'+esc(c.firma)+'">'+
  '<div class="tw" style="margin-top:14px"><div><div class="t1">Pausen automatisch abziehen</div>'+
  '<div class="t2">über 6 h: 30 min · über 9 h: 45 min</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sBreak"'+(c.autoBreak?" checked":"")+
  '><span class="b"></span></label></div>'+
  '<label>Automatisch ausstempeln nach (Stunden, 0 = aus)</label>'+
  '<input id="sAuto" type="number" min="0" max="24" value="'+c.autoOutHours+'">'+
  '<div class="hint">Wer das Ausstempeln vergisst, wird nach dieser Zeit automatisch '+
  'ausgestempelt. Der Eintrag landet unter „Zu prüfen“ – es wird also nie still '+
  'etwas erfunden.</div>'+
  '<label>Schichten länger als (Stunden) als auffällig melden</label>'+
  '<input id="sMax" type="number" min="4" max="24" value="'+c.maxShiftHours+'">'+
  '<button class="btn voll" id="sSave">Speichern</button></div>';

 h+='<div class="karte"><h2>Öffnungszeiten</h2>'+
  '<div class="tw"><div><div class="t1">Nur während der Öffnung stempeln</div>'+
  '<div class="t2">Außerhalb wird das Stempeln abgelehnt</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sOef"'+(c.oeffnungAktiv?" checked":"")+
  '><span class="b"></span></label></div>'+
  '<div class="reihe"><div><label>Von</label>'+
  '<input type="time" id="sVon" value="'+esc(c.oeffnungVon)+'"></div>'+
  '<div><label>Bis</label><input type="time" id="sBis" value="'+esc(c.oeffnungBis)+'"></div></div>'+
  '<label>Puffer davor und danach (Minuten)</label>'+
  '<input id="sPuf" type="number" min="0" max="240" value="'+c.oeffnungPuffer+'">'+
  '<div class="hint">Für Vorbereitung und Aufräumen. Zeiten über Mitternacht '+
  '(z. B. 11:00 bis 02:00) werden richtig erkannt.</div>'+
  '<button class="btn voll" id="sSave3">Speichern</button></div>';

 h+='<div class="karte"><h2>Stempeln im Laden</h2>'+
  '<div class="tw"><div><div class="t1">Nur im Laden stempeln</div>'+
  '<div class="t2">Handys müssen vorher den Aufkleber am Eingang berühren</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sPres"'+(c.requirePresence?" checked":"")+
  '><span class="b"></span></label></div>'+
  '<div class="tw"><div><div class="t1">Am iPad zusätzlich Code abfragen</div>'+
  '<div class="t2">Sicherer, aber ein Schritt mehr</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sTerm"'+
  (c.terminalRequireCode?" checked":"")+'><span class="b"></span></label></div>'+
  '<label>Aufkleber gilt für (Minuten)</label>'+
  '<input id="sMin" type="number" min="1" max="240" value="'+c.presenceMinutes+'">'+
  '<button class="btn voll" id="sSave2">Speichern</button></div>';

 /* ---- Standorte: nur Name + Öffnungszeiten. Adressen liegen beim Entwickler. ---- */
 h+='<div class="karte"><h2>Standorte</h2>'+
  '<div class="untertitel">Je Laden ein Standort. Das iPad und die Aufkleber des '+
  'Standorts richtet der Entwickler ein – hier geht es nur um Name und Zeiten.</div>';
 daten.locations.forEach(function(l){
  h+='<div style="border:1px solid var(--li);border-radius:13px;padding:14px;margin-bottom:11px">'+
   '<div class="reihe"><input value="'+esc(l.name)+'" id="ln_'+l.id+'">'+
   '<button class="btn g" style="flex:0 0 auto" onclick="standortSpeichern(\\''+l.id+'\\')">Speichern</button></div>'+
   '<div class="tw" style="margin-top:8px"><div><div class="t1">Eigene Öffnungszeiten</div>'+
   '<div class="t2">sonst gilt die allgemeine Einstellung</div></div>'+
   '<label class="schalter"><input type="checkbox" id="lo_'+l.id+'"'+(l.oeffnungAktiv?" checked":"")+
   '><span class="b"></span></label></div>'+
   '<div class="reihe"><div><label style="margin-top:4px">Von</label><input type="time" id="lv_'+l.id+'" value="'+
   esc(l.oeffnungVon||"09:00")+'"></div><div><label style="margin-top:4px">Bis</label><input type="time" id="lb_'+l.id+
   '" value="'+esc(l.oeffnungBis||"23:00")+'"></div></div>'+
   (daten.locations.length>1?'<button class="btn klein rotly" style="margin-top:10px" '+
    'onclick="standortWeg(\\''+l.id+'\\')">Standort löschen</button>':"")+
   '</div>';
 });
 h+='<button class="btn voll g" onclick="neuerStandort()">+ Standort anlegen</button></div>';

 /* ---- Mitteilungen ---- */
 h+='<div class="karte"><h2>Mitteilungen aufs Handy</h2>'+
  '<div class="tw"><div><div class="t1">Dieses Gerät benachrichtigen</div>'+
  '<div class="t2" id="pushT">Ohne fremden Dienst, direkt vom Laden-PC.</div></div>'+
  '<label class="schalter"><input type="checkbox" id="pushAn"><span class="b"></span></label></div>'+
  '<div class="tw"><div><div class="t1">Ausstempeln vergessen</div>'+
  '<div class="t2">sobald jemand automatisch ausgestempelt wurde</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sMVerg"'+
  (c.meldeVergessen?" checked":"")+'><span class="b"></span></label></div>'+
  '<div class="tw"><div><div class="t1">Nicht erschienen</div>'+
  '<div class="t2">geplante Schicht läuft, aber niemand hat gestempelt</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sMNicht"'+
  (c.meldeNichtDa?" checked":"")+'><span class="b"></span></label></div>'+
  '<label>Melden nach (Minuten Verspätung)</label>'+
  '<input id="sNichtNach" type="number" min="1" max="180" value="'+(c.nichtDaNach||15)+'">'+
  '<label>Schichtplan vorausplanen (Wochen)</label>'+
  '<input id="sPlanW" type="number" min="1" max="26" value="'+(c.planWochen||4)+'">'+
  '<div class="hint">Serien laufen so viele Wochen automatisch voraus. '+
  '<b>Auf dem iPhone</b> kommen Mitteilungen nur an, wenn diese Seite über '+
  '„Teilen → Zum Home-Bildschirm“ abgelegt und von dort geöffnet wird. '+
  'Die Mitarbeiter schalten es unter „Mein Plan“ auf ihrem eigenen Handy ein.</div>'+
  '<button class="btn voll" id="sSave4">Speichern</button></div>';

 h+='<div class="karte"><h2>Chef-PIN ändern</h2>'+
  '<label>Neue PIN (4–8 Ziffern)</label><input id="nPin" type="password" inputmode="numeric">'+
  '<button class="btn voll g" id="nPinSave">PIN ändern</button></div>';

 /* ---- Protokoll ---- */
 h+='<div class="karte"><h2>Protokoll</h2>'+
  '<div class="untertitel">Jede Korrektur wird dauerhaft festgehalten – so bleibt '+
  'nachvollziehbar, wer wann was geändert hat.</div><div class="log">';
 if(!daten.audit.length)h+='<div class="leer">Noch keine Änderungen.</div>';
 daten.audit.slice().reverse().forEach(function(a){
  h+='<div class="eintrag"><div class="z">'+esc(a.zeit)+'</div>'+
   '<div class="w">'+esc(a.what)+'</div>'+
   '<div class="d">'+esc(a.detail)+'</div></div>';});
 h+='</div></div>';

 /* ---- Entwickler-Bereich ---- */
 if(!devFrei){
  h+='<button class="devauf" id="devAuf">'+
   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'+
   'Entwickler-Einstellungen</button>';
 }else{
  h+=zDev(c);
 }

 $("tSetup").innerHTML=h;

 var speichern=function(){
  api("api/chef/config",{firma:$("sFirma").value,autoBreak:$("sBreak").checked,
   autoOutHours:Number($("sAuto").value),maxShiftHours:Number($("sMax").value),
   requirePresence:$("sPres").checked,terminalRequireCode:$("sTerm").checked,
   oeffnungAktiv:$("sOef").checked,oeffnungVon:$("sVon").value,
   oeffnungBis:$("sBis").value,oeffnungPuffer:Number($("sPuf").value),
   presenceMinutes:Number($("sMin").value)}).then(function(){toast("Gespeichert");laden();});
 };
 $("sSave").onclick=speichern;$("sSave2").onclick=speichern;$("sSave3").onclick=speichern;
 $("sSave4").onclick=function(){
  api("api/chef/config",{meldeVergessen:$("sMVerg").checked,meldeNichtDa:$("sMNicht").checked,
   nichtDaNach:Number($("sNichtNach").value),planWochen:Number($("sPlanW").value)})
   .then(function(){toast("Gespeichert");laden();});
 };
 chefPushVorbereiten();
 $("nPinSave").onclick=function(){
  var p=$("nPin").value;
  if(!/^\\d{4,8}$/.test(p)){toast("4 bis 8 Ziffern bitte");return;}
  api("api/chef/chefpin",{pin:p}).then(function(){toast("Chef-PIN geändert");$("nPin").value="";});
 };
 if($("devAuf"))$("devAuf").onclick=devFrage;
 if(devFrei)devBinden();
}

/* ------------------------- Entwickler-Bereich --------------------------- */
function devFrage(){
 modal('<h2>Entwickler-Einstellungen</h2>'+
  '<div class="untertitel">Adressen, Aufkleber, Fernzugang – nichts für den '+
  'Alltag. Bitte die Entwickler-PIN eingeben.</div>'+
  '<input id="devPin" type="password" inputmode="numeric" '+
  'style="text-align:center;font-size:20px;letter-spacing:.28em" placeholder="••••">'+
  '<div id="devFehler" style="color:var(--rot);font-size:13px;margin-top:8px;min-height:16px"></div>'+
  '<button class="btn voll" id="devLos">Öffnen</button>'+
  '<button class="btn voll g" onclick="zu()">Abbrechen</button>');
 var los=function(){
  api("api/chef/dev-pin",{pin:$("devPin").value}).then(function(r){
   if(!r.ok){$("devFehler").textContent="PIN stimmt nicht.";$("devPin").value="";return;}
   devFrei=true;
   try{sessionStorage.setItem("zeit-dev","1");}catch(e){}
   zu();zSetup();
   toast("Entwickler-Bereich sichtbar");
  });
 };
 $("devLos").onclick=los;
 $("devPin").addEventListener("keydown",function(e){if(e.key==="Enter")los();});
 setTimeout(function(){$("devPin").focus();},60);
}
function zDev(c){
 var h='<h3 style="margin-top:26px">Entwickler</h3>';

 h+='<div class="karte dev"><h2>Öffentliche Adresse<span class="devtag">Dev</span></h2>'+
  '<div class="untertitel">Tailscale-Funnel-Adresse für Aufkleber und iPads. '+
  'Leer lassen, wenn alles im selben Netzwerk läuft. Für einen zweiten Laden '+
  'muss sie gesetzt sein, sonst finden dessen Geräte den Server nicht.</div>'+
  '<input id="sAdr" placeholder="https://…ts.net:8443" value="'+esc(c.oeffentlicheAdresse||"")+'">'+
  '<button class="btn voll" id="devAdrSave">Speichern</button></div>';

 h+='<div class="karte dev"><h2>Adressen &amp; Aufkleber<span class="devtag">Dev</span></h2>';
 daten.locations.forEach(function(l){
  h+='<div style="border:1px solid var(--li);border-radius:13px;padding:14px;margin-bottom:11px">'+
   '<div style="font-weight:650;margin-bottom:8px">'+esc(l.name)+'</div>'+
   '<div class="hint" style="margin:0 0 4px">iPad in diesem Laden – einmal öffnen, '+
   '<b>warten bis die Kacheln erscheinen</b>, dann „Teilen → Zum Home-Bildschirm“:</div>'+
   '<div class="code">'+esc(daten.basis)+'/terminal/'+esc(l.token)+'</div>'+
   '<div class="hint" style="margin:8px 0 4px">NFC-Aufkleber am Eingang:</div>'+
   '<div class="code">'+esc(daten.basis)+'/s/'+esc(l.token)+'</div>'+
   '<div class="reihe" style="margin-top:10px">'+
   '<button class="btn klein g" onclick="qr(\\''+esc(l.token)+'\\',\\''+esc(l.name)+'\\')">QR zeigen</button>'+
   '<button class="btn klein g" onclick="neuerToken(\\''+l.id+'\\')">Sticker-Code neu</button>'+
   '</div></div>';
 });
 h+='<div class="hint"><b>Der Sticker-Code ist fest</b> und ändert sich nie von '+
  'allein — nur die Adresse dahinter wechselt bei jedem Antippen automatisch. '+
  '„Sticker-Code neu“ ist der Notfall-Knopf, falls ein Code kursiert: danach '+
  'müssen alle Aufkleber dieses Ladens neu beschrieben werden. <b>Das iPad läuft '+
  'weiter</b> — seine Berechtigung steckt im Gerät, nicht in der Adresse.</div></div>';

 /* ---- Chef von unterwegs (offenes Internet) ---- */
 var f=daten.fern||{};
 h+='<div class="karte dev"><h2>Chef von unterwegs<span class="devtag">Dev</span></h2>';
 if(daten.fernModus){
  h+='<div class="hint">Du bist gerade von unterwegs angemeldet. Diese '+
   'Einstellung lässt sich nur im Laden oder über Tailscale ändern – '+
   'sonst könnte jemand, der einmal drin ist, sich selbst dauerhaft '+
   'einen Zugang bauen.</div>';
  if(f.aktiv)h+='<div class="code">'+esc(f.adresse||"")+'</div>';
 }else{
  h+='<div class="tw"><div><div class="t1">Dashboard aus dem Internet erreichbar</div>'+
   '<div class="t2">ohne Tailscale, von jedem Handy</div></div>'+
   '<label class="schalter"><input type="checkbox" id="fAn"'+(f.aktiv?" checked":"")+
   '><span class="b"></span></label></div>';
  if(f.aktiv){
   h+='<div class="hint" style="margin:10px 0 4px">Deine geheime Adresse – '+
    '<b>einmal pro Gerät</b> öffnen, danach reicht das Lesezeichen:</div>'+
    '<div class="code">'+esc(f.adresse||"")+'</div>'+
    '<div class="reihe" style="margin-top:10px">'+
    '<button class="btn klein g" id="fQr">QR zeigen</button>'+
    '<button class="btn klein g" id="fNeu">Neue geheime Adresse</button></div>'+
    '<label style="margin-top:14px">Passwort ändern (min. 10 Zeichen)</label>'+
    '<input id="fPw" type="password" autocomplete="new-password">'+
    '<button class="btn voll g" id="fPwSave">Passwort ändern</button>';
   var fv=(f.fehlversuche||[]).filter(function(x){return x.n>=3;});
   if(fv.length){
    h+='<div style="margin-top:14px;font-size:12.5px;color:var(--rot)">'+
     '<b>Fehlversuche:</b></div>';
    fv.slice(0,5).forEach(function(x){
     h+='<div style="font-size:12px;color:var(--mut);padding:3px 0;overflow-wrap:anywhere">'+esc(x.ip)+
      ' · '+x.n+'× · '+new Date(x.letzte).toLocaleString("de-DE")+
      (x.gesperrtBis?' · <b style="color:var(--rot)">gesperrt</b>':'')+'</div>';});
   }
  }else{
   h+='<label style="margin-top:12px">Passwort festlegen (min. 10 Zeichen, '+
    'nicht nur Ziffern)</label>'+
    '<input id="fPw" type="password" autocomplete="new-password" '+
    'placeholder="z. B. Doener-Freitag-2026">'+
    '<button class="btn voll" id="fPwSave">Einschalten</button>';
  }
  h+='<div class="hint"><b>Zwei Schlösser, nicht eins.</b> Wer die geheime '+
   'Adresse nicht kennt, bekommt vom Server nur „Nicht gefunden“ – für '+
   'Bots im Internet existiert das Dashboard gar nicht. Erst danach kommt '+
   'das Passwort. Die 4-stellige Chef-PIN gilt draußen <b>nie</b>. '+
   'Nach 5 Fehlversuchen wird die Gegenstelle gesperrt, die Sperre '+
   'verdoppelt sich. Von unterwegs wirst du nach 3 Stunden automatisch '+
   'abgemeldet.</div>';
 }
 h+='</div>';

 /* ---- Angemeldete Geraete ---- */
 h+='<div class="karte dev"><h2>Angemeldete Geräte<span class="devtag">Dev</span></h2>';
 if(daten.abos&&daten.abos.length){
  daten.abos.forEach(function(a){
   h+='<div style="font-size:12.5px;color:var(--mut);padding:6px 0;'+
    'border-bottom:1px solid var(--li);overflow-wrap:anywhere"><b style="color:var(--txt)">'+
    esc(a.name)+'</b> · '+esc(a.geraet||"Gerät")+' · '+esc(a.dienst)+'</div>';});
 }else h+='<div class="leer">Noch kein Gerät für Mitteilungen angemeldet.</div>';
 h+='</div>';

 h+='<div class="karte dev"><h2>Entwickler-PIN<span class="devtag">Dev</span></h2>'+
  '<label>Neue Entwickler-PIN (4–8 Ziffern)</label>'+
  '<input id="devPinNeu" type="password" inputmode="numeric">'+
  '<button class="btn voll g" id="devPinSave">Ändern</button></div>';

 h+='<button class="devauf" id="devZu">Entwickler-Bereich ausblenden</button>';
 return h;
}
function devBinden(){
 $("devZu").onclick=function(){
  devFrei=false;
  try{sessionStorage.removeItem("zeit-dev");}catch(e){}
  zSetup();
 };
 $("devAdrSave").onclick=function(){
  api("api/chef/config",{oeffentlicheAdresse:$("sAdr").value})
   .then(function(){toast("Gespeichert");laden();});
 };
 $("devPinSave").onclick=function(){
  var p=$("devPinNeu").value;
  if(!/^\\d{4,8}$/.test(p)){toast("4 bis 8 Ziffern bitte");return;}
  api("api/chef/dev-pin-neu",{pin:p}).then(function(r){
   if(!r.ok){toast(r.fehler||"Fehler");return;}
   toast("Entwickler-PIN geändert");$("devPinNeu").value="";});
 };
 if($("fPwSave"))$("fPwSave").onclick=function(){
  var p=$("fPw").value||"";
  if(p.length<10){toast("Mindestens 10 Zeichen");return;}
  if(/^[0-9]+$/.test(p)){toast("Bitte auch Buchstaben");return;}
  api("api/chef/fern",{passwort:p}).then(function(r){
   if(!r.ok){toast(r.fehler||"Fehler");return;}
   toast("Fernzugang aktiv");laden();});
 };
 if($("fAn"))$("fAn").onchange=function(){
  if($("fAn").checked){
   $("fAn").checked=false;
   toast("Bitte unten ein Passwort festlegen");
   if($("fPw"))$("fPw").focus();
   return;
  }
  if(!confirm("Fernzugang ausschalten?\\n\\n"+
   "Das Dashboard ist danach nur noch im Laden und über Tailscale erreichbar.")){
   $("fAn").checked=true;return;}
  api("api/chef/fern",{aus:true}).then(function(){toast("Fernzugang aus");laden();});
 };
 if($("fNeu"))$("fNeu").onclick=function(){
  if(!confirm("Neue geheime Adresse vergeben?\\n\\n"+
   "• Alle Geräte müssen die neue Adresse einmal öffnen\\n"+
   "• Das Passwort bleibt gleich\\n\\n"+
   "Richtig, wenn ein Handy verloren ging."))return;
  api("api/chef/fern",{neuerPfad:true}).then(function(){toast("Neue Adresse");laden();});
 };
 if($("fQr"))$("fQr").onclick=function(){
  var u=(daten.fern||{}).adresse||"";
  modal('<h2>Chef von unterwegs</h2>'+
   '<div class="mitte">'+
   '<div style="background:#fff;padding:13px;border-radius:14px;display:inline-block">'+
   '<img src="https://api.qrserver.com/v1/create-qr-code/?size=460x460&margin=1&data='+
   encodeURIComponent(u)+'" style="width:220px;height:220px;display:block"></div>'+
   '<div class="code" style="margin-top:12px">'+esc(u)+'</div>'+
   '<div class="hint">Einmal mit dem eigenen Handy scannen, dann Lesezeichen '+
   'setzen. <b>Nicht weitergeben</b> – dieser Link ist der erste Schlüssel.</div></div>'+
   '<button class="btn voll g" onclick="zu()">Schließen</button>');
 };
}

/* ------------------------ Mitteilungen für den Chef ---------------------- */
/*
 * Nichts als der Browser: er meldet sich beim Push-Dienst seines Herstellers
 * an, wir bekommen eine Adresse und verschicken darüber verschlüsselt.
 */
function chefPushVorbereiten(){
 var sch=$("pushAn"), txt=$("pushT");
 if(!sch)return;
 if(!("Notification" in window)||!("serviceWorker" in navigator)||!("PushManager" in window)){
  sch.disabled=true; txt.textContent="Dieser Browser kann keine Mitteilungen.";return;}
 var amHome=window.matchMedia("(display-mode: standalone)").matches||
  window.navigator.standalone===true;
 if(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!amHome){
  sch.disabled=true;
  txt.innerHTML='Diese Seite einmal über <b>Teilen &rarr; Zum Home-Bildschirm</b> '+
   'ablegen und von dort öffnen – dann geht es auch auf dem iPhone.';
  return;}
 navigator.serviceWorker.register("/sw.js").then(function(reg){
  return reg.pushManager.getSubscription().then(function(vorhanden){
   sch.checked=!!vorhanden&&Notification.permission==="granted";
   if(sch.checked)txt.textContent="Ist an. Eine Testmeldung schickt der Knopf unten.";
   sch.onchange=function(){
    if(!sch.checked){
     reg.pushManager.getSubscription().then(function(a){
      if(!a)return;
      api("api/push/aus",{endpoint:a.endpoint});
      a.unsubscribe();
      txt.textContent="Aus.";});
     return;
    }
    txt.textContent="Einen Moment …";
    Notification.requestPermission().then(function(e){
     if(e!=="granted"){sch.checked=false;
      txt.textContent="Der Browser blockiert Mitteilungen für diese Seite.";return;}
     get("api/push/schluessel").then(function(k){
      return reg.pushManager.subscribe({userVisibleOnly:true,
       applicationServerKey:chefB64(k.pub)});
     }).then(function(abo){
      return api("api/push/an",{wer:"chef",abo:abo,geraet:navigator.platform||""});
     }).then(function(r){
      if(!r.ok){sch.checked=false;txt.textContent=r.fehler||"Hat nicht geklappt.";return;}
      txt.textContent="Ist an – gleich kommt eine Testmeldung.";
      api("api/push/probe",{wer:"chef"});
      laden();
     }).catch(function(){sch.checked=false;txt.textContent="Hat nicht geklappt.";});
    });
   };
  });
 }).catch(function(){sch.disabled=true;txt.textContent="Auf diesem Gerät nicht möglich.";});
}
function chefB64(s){
 var b=(s+"=".repeat((4-s.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");
 var roh=atob(b),arr=new Uint8Array(roh.length);
 for(var i=0;i<roh.length;i++)arr[i]=roh.charCodeAt(i);
 return arr;
}

function qr(tok,name){
 var url=daten.basis+"/terminal/"+tok;
 var url2=daten.basis+"/z/"+tok;
 modal('<h2>'+esc(name)+'</h2>'+
  '<div class="mitte"><div style="font-size:12px;color:var(--mut);margin-bottom:8px">'+
  'NFC / QR für den Eingang</div>'+
  '<div style="background:#fff;padding:13px;border-radius:14px;display:inline-block">'+
  '<img src="https://api.qrserver.com/v1/create-qr-code/?size=460x460&margin=1&data='+
  encodeURIComponent(url2)+'" style="width:220px;height:220px;display:block"></div>'+
  '<div class="code" style="margin-top:12px">'+esc(url2)+'</div>'+
  '<div class="hint">iPad-Adresse: '+esc(url)+'</div></div>'+
  '<button class="btn voll g" onclick="zu()">Schließen</button>');
}
function standortSpeichern(id){
 api("api/chef/standort-aendern",{id:id,name:$("ln_"+id).value,
  oeffnungAktiv:$("lo_"+id).checked,oeffnungVon:$("lv_"+id).value,
  oeffnungBis:$("lb_"+id).value}).then(function(r){
   if(!r.ok){toast(r.fehler||"Fehler");return;}
   toast("Standort gespeichert");laden();});
}
function standortWeg(id){
 if(!confirm("Diesen Standort löschen?"))return;
 api("api/chef/standort-weg",{id:id}).then(function(r){
  if(!r.ok){toast(r.fehler||"Fehler");return;}
  toast("Standort gelöscht");laden();});
}
function neuerToken(id){
 if(!confirm("Sticker-Code neu vergeben?\\n\\n"+
  "• Alle NFC-Aufkleber dieses Ladens müssen danach NEU beschrieben werden\\n"+
  "• Das iPad läuft normal weiter\\n\\n"+
  "Nur nötig, wenn ein Code in falsche Hände geraten ist."))return;
 api("api/chef/standort-token",{id:id}).then(function(){toast("Neuer Code");laden();});
}
function neuerStandort(){
 var n=prompt("Name des Standorts?");
 if(!n)return;
 api("api/chef/standort-neu",{name:n}).then(function(){toast("Standort angelegt");laden();});
}
${PLAN_JS}
</script></body></html>`;

module.exports = { CHEF_HTML };
