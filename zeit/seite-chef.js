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
 *   TEAM        – Mitarbeiter, Codes, Fotos, Standorte
 *   EINSTELLUNG – Firma, Anwesenheit, Pausen, Auto-Ausstempeln, NFC/Terminal
 */

const { PLAN_CSS, PLAN_JS } = require("./seite-plan");

const CHEF_HTML = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#05070c">
<title>Zeiten – Chef</title>
<style>
:root{--o:#EB5A21;--gruen:#2fbf5f;--rot:#e0483c;--gelb:#e8a33d;--bg:#05070c;
 --fl:#0d1320;--fl2:#111a2b;--li:#2a3550;--txt:#f0f4f8;--mut:#8b98b8;}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{margin:0;background:var(--bg);color:var(--txt);font-size:15px;
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;}
.kopf{position:sticky;top:0;z-index:20;background:rgba(5,7,12,.97);
 border-bottom:1px solid var(--li);padding:12px 16px;display:flex;
 align-items:center;justify-content:space-between;gap:10px;}
.marke{font-size:14px;letter-spacing:.2em;text-transform:uppercase;}
.marke b{color:var(--o);}
.tabs{display:flex;gap:6px;overflow-x:auto;padding:10px 16px;position:sticky;top:53px;
 background:var(--bg);z-index:19;border-bottom:1px solid var(--li);}
.tabs button{background:var(--fl);border:1px solid var(--li);color:var(--mut);
 border-radius:999px;padding:8px 15px;font-size:13.5px;font-weight:600;
 font-family:inherit;white-space:nowrap;position:relative;}
.tabs button.on{background:rgba(235,90,33,.16);border-color:var(--o);color:#fff;}
.tabs .zahl{background:var(--rot);color:#fff;border-radius:999px;font-size:10.5px;
 padding:1px 6px;margin-left:6px;font-weight:800;}
.inhalt{padding:16px;max-width:1000px;margin:0 auto;padding-bottom:60px;}
.karte{background:var(--fl);border:1px solid var(--li);border-radius:14px;
 padding:15px;margin-bottom:13px;}
h2{font-size:15px;margin:0 0 12px;}
h3{font-size:12px;color:var(--mut);letter-spacing:.16em;text-transform:uppercase;
 margin:16px 0 8px;font-weight:600;}
.btn{background:rgba(235,90,33,.16);border:1px solid var(--o);color:#fff;
 border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;font-family:inherit;}
.btn.g{background:var(--fl2);border-color:var(--li);color:var(--txt);}
.btn.voll{display:block;width:100%;margin-top:9px;}
input,select{background:var(--fl2);border:1px solid var(--li);border-radius:9px;
 color:#fff;padding:10px 11px;font-size:15px;font-family:inherit;width:100%;}
label{display:block;font-size:12px;color:var(--mut);margin:11px 0 5px;}
.reihe{display:flex;gap:9px;align-items:center;}
.reihe>*{flex:1;}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}
.chip{background:var(--fl2);border:1px solid var(--li);color:var(--mut);
 border-radius:999px;padding:7px 13px;font-size:12.5px;font-family:inherit;font-weight:600;}
.chip.on{border-color:var(--o);color:#fff;background:rgba(235,90,33,.14);}
.ava{width:42px;height:42px;border-radius:50%;overflow:hidden;background:var(--fl2);
 border:2px solid var(--li);display:flex;align-items:center;justify-content:center;
 font-weight:800;color:var(--mut);flex:0 0 auto;font-size:15px;}
.ava.da{border-color:var(--gruen);color:var(--gruen);}
.ava img{width:100%;height:100%;object-fit:cover;}
/* Live-Kacheln */
.kacheln{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:11px;}
.kachel{background:var(--fl2);border:1px solid var(--li);border-radius:14px;
 padding:13px 10px;text-align:center;}
.kachel.da{border-color:var(--gruen);background:rgba(47,191,95,.08);}
.kachel .ava{margin:0 auto 8px;width:54px;height:54px;font-size:18px;}
.kachel .nm{font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;
 white-space:nowrap;}
.kachel .st{font-size:11.5px;color:var(--mut);margin-top:4px;}
.kachel.da .st{color:var(--gruen);font-weight:600;}
/* Zusammenfassung */
.zeile{display:flex;align-items:center;gap:11px;padding:11px 12px;background:var(--fl2);
 border:1px solid var(--li);border-radius:12px;margin-bottom:8px;}
.zeile .txt{flex:1;min-width:0;}
.zeile .nm{font-weight:650;display:flex;align-items:center;gap:7px;}
.zeile .sub{font-size:12px;color:var(--mut);margin-top:3px;}
.zeile .std{font-weight:800;color:var(--o);font-size:17px;text-align:right;
 font-variant-numeric:tabular-nums;}
.warn{background:var(--rot);color:#fff;font-size:10px;font-weight:800;border-radius:999px;
 padding:2px 7px;}
.pfeil{color:var(--mut);font-size:18px;}
/* Detail */
.wochenkopf{display:flex;justify-content:space-between;align-items:center;
 padding:9px 12px;background:var(--fl2);border-radius:9px;margin:12px 0 7px;
 font-size:12.5px;color:var(--mut);letter-spacing:.06em;}
.wochenkopf b{color:var(--o);font-size:14px;}
.tagzeile{padding:7px 4px 3px;font-size:12px;color:var(--mut);
 display:flex;justify-content:space-between;}
.schicht{display:flex;align-items:center;gap:9px;padding:9px 10px;background:var(--fl2);
 border:1px solid transparent;border-radius:9px;margin-bottom:5px;font-size:14px;}
.schicht .z{font-variant-numeric:tabular-nums;}
.schicht .d{margin-left:auto;font-weight:700;}
.schicht.p-offen{border-color:var(--gruen);}
.schicht.p-auto{border-color:var(--gelb);}
.schicht.p-lang{border-color:var(--gelb);}
.schicht.p-kein-start{border-color:var(--rot);}
.mini{background:none;border:1px solid var(--li);color:var(--mut);border-radius:7px;
 padding:4px 9px;font-size:11.5px;font-family:inherit;}
.tag-warn{font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:999px;}
.tag-offen{background:rgba(47,191,95,.2);color:var(--gruen);}
.tag-auto,.tag-lang{background:rgba(232,163,61,.2);color:var(--gelb);}
.tag-kein-start{background:rgba(224,72,60,.2);color:var(--rot);}
.leer{color:var(--mut);text-align:center;padding:24px;font-size:14px;}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:60;display:none;
 align-items:flex-end;justify-content:center;}
.modal.auf{display:flex;}
.mkarte{background:#0b1119;border:1px solid var(--li);border-radius:18px 18px 0 0;
 padding:19px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;}
@media(min-width:560px){.modal{align-items:center;}.mkarte{border-radius:18px;}}
.tw{display:flex;align-items:center;justify-content:space-between;gap:10px;
 padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);}
.tw:last-child{border-bottom:none;}
.schalter{position:relative;width:48px;height:28px;flex:0 0 auto;}
.schalter input{position:absolute;opacity:0;width:100%;height:100%;margin:0;}
.schalter .b{position:absolute;inset:0;background:var(--fl2);border:1px solid var(--li);
 border-radius:999px;transition:.2s;}
.schalter .b:after{content:"";position:absolute;width:20px;height:20px;border-radius:50%;
 background:var(--mut);top:3px;left:3px;transition:.2s;}
.schalter input:checked+.b{background:rgba(235,90,33,.3);border-color:var(--o);}
.schalter input:checked+.b:after{background:var(--o);transform:translateX(20px);}
.code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;
 background:var(--fl2);border:1px solid var(--li);border-radius:8px;padding:9px;
 word-break:break-all;color:#9fd0ff;}
.hint{font-size:12.5px;color:var(--mut);line-height:1.6;margin-top:9px;}
.toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#111a2b;
 border:1px solid var(--o);border-radius:11px;padding:12px 20px;font-size:14px;z-index:80;
 display:none;box-shadow:0 8px 30px rgba(0,0,0,.5);}
.mitte{text-align:center;}
.gross{font-size:32px;font-weight:800;color:var(--o);}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:13px;}
.kpi div{background:var(--fl2);border-radius:10px;padding:11px 6px;text-align:center;}
.kpi .w{font-size:19px;font-weight:800;}
.kpi .l{font-size:10.5px;color:var(--mut);margin-top:3px;letter-spacing:.05em;}
#login{position:fixed;inset:0;background:var(--bg);z-index:100;display:flex;
 flex-direction:column;align-items:center;justify-content:center;padding:24px;}
#login .box{width:100%;max-width:300px;text-align:center;}
${PLAN_CSS}
</style></head><body>

<div id="login"><div class="box">
 <div style="font-size:15px;letter-spacing:.24em;text-transform:uppercase;opacity:.6">
  KINGSLEY<span style="color:var(--o)">.</span> ZEITEN</div>
 <h2 style="margin:16px 0 20px;font-size:20px" id="loginTitel">Chef-PIN</h2>
 <input id="chefPin" type="password" inputmode="numeric" placeholder="PIN"
  style="text-align:center;font-size:22px;letter-spacing:.3em">
 <div id="chefPin2Wrap" style="display:none">
  <label>PIN wiederholen</label>
  <input id="chefPin2" type="password" inputmode="numeric"
   style="text-align:center;font-size:22px;letter-spacing:.3em">
 </div>
 <button class="btn voll" id="loginBtn">Anmelden</button>
 <div id="loginFehler" style="color:var(--rot);font-size:13px;margin-top:12px;min-height:18px"></div>
</div></div>

<div class="kopf">
 <div class="marke">KINGSLEY<b>.</b> ZEITEN</div>
 <button class="mini" id="abmelden">Abmelden</button>
</div>
<div id="locbar" style="display:none;padding:9px 16px 0;max-width:1000px;margin:0 auto">
 <div class="chips" id="locChips"></div>
</div>
<div class="tabs" id="tabs">
 <button data-t="jetzt" class="on">Jetzt</button>
 <button data-t="zeiten">Zeiten</button>
 <button data-t="pruefen">Zu prüfen<span class="zahl" id="badge" style="display:none">0</span></button>
 <button data-t="plan">Schichtplan<span class="zahl" id="badgePlan" style="display:none">0</span></button>
 <button data-t="team">Team</button>
 <button data-t="setup">Einstellungen</button>
</div>
<div class="inhalt">
 <div id="tJetzt"></div>
 <div id="tZeiten" style="display:none"></div>
 <div id="tPruefen" style="display:none"></div>
 <div id="tPlan" style="display:none"></div>
 <div id="tTeam" style="display:none"></div>
 <div id="tSetup" style="display:none"></div>
</div>

<div class="modal" id="modal"><div class="mkarte" id="modalInhalt"></div></div>
<div class="toast" id="toast"></div>

<script>
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
  $("chefPin").style.fontSize="17px";
  $("chefPin").style.textAlign="left";
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
$("abmelden").onclick=function(){api("api/chef/logout").then(function(){location.reload();});};

document.querySelectorAll(".tabs button").forEach(function(b){
 b.onclick=function(){
  tab=b.dataset.t;
  document.querySelectorAll(".tabs button").forEach(function(x){x.classList.remove("on");});
  b.classList.add("on");
  ["Jetzt","Zeiten","Pruefen","Plan","Team","Setup"].forEach(function(n){
   $("t"+n).style.display=(n.toLowerCase()===tab?"":"none");});
  if(tab==="plan"){planLaden();return;}
  zeichne();
 };
});

function laden(){
 get("api/chef/uebersicht?von="+von+"&bis="+bis+"&loc="+encodeURIComponent(filterLoc)+
     "&aktive="+(nurAktive?"1":"0"))
 .then(function(d){
  if(d.fehler==="auth"){location.reload();return;}
  daten=d;
  var n=d.probleme.length;
  $("badge").style.display=n?"":"none";$("badge").textContent=n;
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
 if(tab==="jetzt")zJetzt();
 else if(tab==="zeiten")zZeiten();
 else if(tab==="pruefen")zPruefen();
 else if(tab==="team")zTeam();
 else zSetup();
}

/* -------------------------------- JETZT --------------------------------- */
function zJetzt(){
 var alle=daten.live.filter(function(p){return !filterLoc||p.locId===filterLoc;});
 var da=alle.filter(function(p){return p.in;});
 var weg=alle.filter(function(p){return !p.in;});
 var summe=da.reduce(function(a,p){return a+p.sinceMin;},0);
 var h='<div class="karte"><h2>Gerade im Laden</h2>'+
  '<div class="kpi"><div><div class="w" style="color:var(--gruen)">'+da.length+'</div>'+
  '<div class="l">EINGESTEMPELT</div></div>'+
  '<div><div class="w">'+weg.length+'</div><div class="l">NICHT DA</div></div>'+
  '<div><div class="w" style="color:var(--o)">'+std(summe)+'</div>'+
  '<div class="l">LAUFENDE STD.</div></div></div></div>';
 if(da.length){
  h+='<div class="karte"><h3 style="margin-top:0">Im Laden</h3><div class="kacheln">';
  da.forEach(function(p){
   h+='<div class="kachel da">'+avaHtml(p,true)+'<div class="nm">'+esc(p.name)+'</div>'+
    '<div class="st">seit '+esc(p.since)+' · '+std(p.sinceMin)+' h</div>'+
    (daten.locations.length>1&&p.location?'<div class="st" style="opacity:.55">'+
     esc(p.location)+'</div>':"")+'</div>';});
  h+='</div></div>';
 }
 h+='<div class="karte"><h3 style="margin-top:0">Nicht da</h3>';
 if(!weg.length)h+='<div class="leer">Alle sind eingestempelt.</div>';
 else{h+='<div class="kacheln">';
  weg.forEach(function(p){
   h+='<div class="kachel">'+avaHtml(p,false)+'<div class="nm">'+esc(p.name)+'</div>'+
    '<div class="st">'+esc(p.location||"")+'</div></div>';});
  h+='</div>';}
 h+='</div>';
 $("tJetzt").innerHTML=h;
}

/* -------------------------------- ZEITEN -------------------------------- */
function zZeiten(){
 var s=daten.summary;
 var h='<div class="karte">'+
  '<div class="chips">'+
   chip("woche","Diese Woche")+chip("letzteWoche","Letzte Woche")+
   chip("monat","Dieser Monat")+chip("30","Letzte 30 Tage")+chip("frei","Zeitraum wählen")+
  '</div>'+
  (zeitraum==="frei"?'<div class="reihe" style="margin-bottom:10px">'+
   '<div><label>Von</label><input type="date" id="dVon" value="'+von+'"></div>'+
   '<div><label>Bis</label><input type="date" id="dBis" value="'+bis+'"></div></div>':"")+

  '<div class="kpi"><div><div class="w" style="color:var(--o)">'+esc(s.hours)+'</div>'+
   '<div class="l">STUNDEN GESAMT</div></div>'+
   '<div><div class="w">'+s.rows.length+'</div><div class="l">MITARBEITER</div></div>'+
   '<div><div class="w" style="color:'+(s.probleme?"var(--rot)":"var(--gruen)")+'">'+
   s.probleme+'</div><div class="l">ZU PRÜFEN</div></div></div>'+
  '<div class="reihe" style="margin-top:12px">'+
   '<button class="btn" id="bNachtrag">+ Zeit nachtragen</button>'+
   '<a class="btn g" style="text-align:center;text-decoration:none;padding:10px 16px" '+
    'href="api/chef/export.csv?von='+von+'&bis='+bis+'">CSV für Excel</a></div>'+
  '<a class="btn voll g" style="text-align:center;text-decoration:none;padding:10px 16px" '+
   'target="_blank" href="api/chef/stundenzettel.pdf?von='+von+'&bis='+bis+
   (filterLoc?'&loc='+encodeURIComponent(filterLoc):'')+
   '">Stundenzettel als PDF (für den Steuerberater)</a>'+
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
   avaHtml(d,d.status.in)+'<div><div style="font-size:19px;font-weight:800">'+esc(d.name)+'</div>'+
   '<div style="font-size:12px;color:var(--mut)">Code '+esc(d.codeHint||"")+
   ' · '+esc(von)+' bis '+esc(bis)+'</div></div>'+
   '<div style="margin-left:auto;font-size:22px;font-weight:800;color:var(--o)">'+
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
 var pr=daten.probleme.filter(function(p){return !filterLoc||p.locId===filterLoc;});
 var h='<div class="karte"><h2>Zu prüfen ('+pr.length+')</h2>'+
  '<div class="hint" style="margin-top:0">Hier sammelt sich alles, was nicht sauber '+
  'gestempelt wurde: vergessenes Ausstempeln, automatisch beendete Schichten, '+
  'fehlende Anfänge und ungewöhnlich lange Schichten. Erledigtes verschwindet von selbst.</div></div>';
 if(!pr.length){
  $("tPruefen").innerHTML=h+'<div class="karte"><div class="leer">'+
   'Alles sauber – nichts zu tun.</div></div>';return;}
 pr.forEach(function(p){
  h+='<div class="karte" style="padding:12px">'+
   '<div style="display:flex;align-items:center;gap:11px">'+avaHtml(p,false)+
   '<div style="flex:1;min-width:0"><div style="font-weight:650">'+esc(p.name)+'</div>'+
   '<div style="font-size:12px;color:var(--mut);margin-top:2px">'+esc(p.label)+' · '+
   (p.start?esc(p.start):"??:??")+' – '+(p.end?esc(p.end):"läuft")+'</div></div>'+
   '<span class="tag-warn tag-'+p.art+'">'+problemText(p.art)+'</span></div>'+
   (p.note?'<div class="hint">'+esc(p.note)+'</div>':"")+
   '<div class="reihe" style="margin-top:10px">'+
   '<button class="btn" onclick="bearbeite(\\''+p.empId+'\\',\\''+(p.startId||"")+
    '\\',\\''+(p.endId||"")+'\\',\\''+p.day+'\\',\\''+esc(p.name)+'\\',\\''+
    (p.start||"")+'\\',\\''+(p.end||"")+'\\')">Korrigieren</button>'+
   (p.art==="auto"?'<button class="btn g" onclick="passtSo(\\''+p.endId+'\\')">Passt so</button>':"")+
   '</div></div>';
 });
 $("tPruefen").innerHTML=h;
}
function passtSo(id){
 api("api/chef/eintrag-ok",{id:id}).then(function(){toast("Als geprüft markiert");laden();});
}

/* --------------------------------- TEAM --------------------------------- */
function zTeam(){
 var h='<div class="karte"><h2>Mitarbeiter</h2>'+
  '<div class="hint" style="margin-top:0">Jeder hat einen persönlichen Code aus '+
  '2 Buchstaben und 4 Ziffern (z. B. AY1234). Am iPad im Laden reicht das Antippen '+
  'des eigenen Fotos – der Code ist der Ersatzweg.</div></div><div class="karte">';
 daten.employees.forEach(function(e){
  h+='<div class="zeile" onclick="mitarbeiter(\\''+e.id+'\\')">'+avaHtml(e,false)+
   '<div class="txt"><div class="nm">'+esc(e.name)+
   (e.active?"":' <span style="color:var(--mut);font-size:12px">(inaktiv)</span>')+'</div>'+
   '<div class="sub">Code '+esc(e.codeHint||"–")+
   (e.locName?" · "+esc(e.locName):"")+'</div></div><div class="pfeil">›</div></div>';
 });
 if(!daten.employees.length)h+='<div class="leer">Noch niemand angelegt.</div>';
 h+='<button class="btn voll" onclick="mitarbeiter(null)">+ Mitarbeiter anlegen</button></div>';
 $("tTeam").innerHTML=h;
}
function mitarbeiter(id){
 var e=id?daten.employees.find(function(x){return x.id===id;}):null;
 var opts=daten.locations.map(function(l){
  return '<option value="'+l.id+'"'+(e&&e.locId===l.id?" selected":"")+'>'+
   esc(l.name)+'</option>';}).join("");
 modal('<h3 style="margin-top:0">'+(e?"Mitarbeiter bearbeiten":"Neuer Mitarbeiter")+'</h3>'+
  '<label>Name</label><input id="mName" value="'+(e?esc(e.name):"")+'">'+
  '<label>Persönlicher Code'+(e?" (leer lassen = unverändert)":"")+'</label>'+
  '<div class="reihe"><input id="mCode" placeholder="z. B. AY1234" maxlength="6" '+
   'style="text-transform:uppercase;letter-spacing:.14em">'+
   '<button class="btn g" style="flex:0 0 auto" id="mWuerfel">Vorschlag</button></div>'+
  '<label>Standort</label><select id="mLoc">'+opts+'</select>'+
  '<label>Foto (optional)</label><input type="file" id="mFoto" accept="image/*">'+
  (e?'<div class="tw" style="margin-top:12px"><div>Aktiv</div>'+
   '<label class="schalter"><input type="checkbox" id="mAktiv"'+(e.active?" checked":"")+
   '><span class="b"></span></label></div>':"")+
  '<button class="btn voll" id="mSave">Speichern</button>'+
  '<button class="btn voll g" onclick="zu()">Abbrechen</button>');
 $("mWuerfel").onclick=function(){
  api("api/chef/code-vorschlag",{name:$("mName").value}).then(function(r){
   $("mCode").value=r.code;});
 };
 if(!e)setTimeout(function(){$("mWuerfel").click();},50);
 $("mSave").onclick=function(){
  var body={name:$("mName").value,locId:$("mLoc").value};
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
 modal('<h3 style="margin-top:0">Zeit ändern – '+esc(name)+'</h3>'+
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
 modal('<h3 style="margin-top:0">Zeit nachtragen</h3>'+
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
function zSetup(){
 var c=daten.config;
 var h='<div class="karte"><h2>Allgemein</h2>'+
  '<label>Firmenname</label><input id="sFirma" value="'+esc(c.firma)+'">'+
  '<label>Öffentliche Adresse (Tailscale-Funnel, für Aufkleber und iPads)</label>'+
  '<input id="sAdr" placeholder="https://…ts.net:8443" value="'+esc(c.oeffentlicheAdresse||"")+'">'+
  '<div class="hint">Leer lassen, wenn alles im selben Netzwerk läuft. Für einen '+
  'zweiten Laden muss hier die öffentliche Adresse stehen, sonst finden dessen '+
  'iPad und Handys den Server nicht.</div>'+
  '<div class="tw" style="margin-top:14px"><div><div>Pausen automatisch abziehen</div>'+
  '<div style="font-size:12px;color:var(--mut);margin-top:3px">über 6 h: 30 min · über 9 h: 45 min</div></div>'+
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

 h+='<div class="karte"><h2>Stempeln im Laden</h2>'+
  '<div class="tw"><div><div>Nur im Laden stempeln</div>'+
  '<div style="font-size:12px;color:var(--mut);margin-top:3px">'+
  'Handys müssen vorher den Aufkleber berühren</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sPres"'+(c.requirePresence?" checked":"")+
  '><span class="b"></span></label></div>'+
  '<div class="tw"><div><div>Am iPad zusätzlich Code abfragen</div>'+
  '<div style="font-size:12px;color:var(--mut);margin-top:3px">'+
  'Sicherer, aber ein Schritt mehr</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sTerm"'+
  (c.terminalRequireCode?" checked":"")+'><span class="b"></span></label></div>'+
  '<label>Aufkleber gilt für (Minuten)</label>'+
  '<input id="sMin" type="number" min="1" max="240" value="'+c.presenceMinutes+'">'+
  '<button class="btn voll" id="sSave2">Speichern</button></div>'+

  '<div class="karte"><h2>Öffnungszeiten</h2>'+
  '<div class="tw"><div><div>Nur während der Öffnung stempeln</div>'+
  '<div style="font-size:12px;color:var(--mut);margin-top:3px">'+
  'Außerhalb wird das Stempeln abgelehnt</div></div>'+
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

 h+='<div class="karte"><h2>Standorte, iPads &amp; Aufkleber</h2>';
 daten.locations.forEach(function(l){
  h+='<div style="border:1px solid var(--li);border-radius:12px;padding:13px;margin-bottom:11px">'+
   '<div class="reihe"><input value="'+esc(l.name)+'" id="ln_'+l.id+'">'+
   '<button class="btn g" style="flex:0 0 auto" onclick="standortSpeichern(\\''+l.id+'\\')">Name speichern</button></div>'+
   '<div class="tw" style="margin-top:10px"><div><div>Eigene Öffnungszeiten</div>'+
   '<div style="font-size:12px;color:var(--mut);margin-top:3px">sonst gilt die allgemeine Einstellung</div></div>'+
   '<label class="schalter"><input type="checkbox" id="lo_'+l.id+'"'+(l.oeffnungAktiv?" checked":"")+
   '><span class="b"></span></label></div>'+
   '<div class="reihe"><div><label>Von</label><input type="time" id="lv_'+l.id+'" value="'+
   esc(l.oeffnungVon||"09:00")+'"></div><div><label>Bis</label><input type="time" id="lb_'+l.id+
   '" value="'+esc(l.oeffnungBis||"23:00")+'"></div></div>'+
   '<div style="font-size:12px;color:var(--mut);margin:11px 0 4px">'+
   'iPad in diesem Laden — einmal öffnen, <b>warten bis die Kacheln erscheinen</b>, '+
   'dann „Teilen → Zum Home-Bildschirm“:</div>'+
   '<div class="code">'+esc(daten.basis)+'/terminal/'+esc(l.token)+'</div>'+
   '<div style="font-size:12px;color:var(--mut);margin:9px 0 4px">NFC-Aufkleber am Eingang:</div>'+
   '<div class="code">'+esc(daten.basis)+'/s/'+esc(l.token)+'</div>'+
   '<div class="reihe" style="margin-top:9px">'+
   '<button class="btn g" onclick="qr(\\''+esc(l.token)+'\\',\\''+esc(l.name)+'\\')">QR zeigen</button>'+
   '<button class="btn g" onclick="neuerToken(\\''+l.id+'\\')">Sticker-Code neu vergeben</button>'+
   (daten.locations.length>1?'<button class="btn g" onclick="standortWeg(\\''+l.id+
     '\\')">Löschen</button>':"")+'</div></div>';
 });
 h+='<button class="btn voll g" onclick="neuerStandort()">+ Standort anlegen</button>'+
  '<div class="hint"><b>Der Sticker-Code ist fest</b> und ändert sich nie von '+
  'allein — nur die Adresse dahinter wechselt bei jedem Antippen automatisch. '+
  '„Sticker-Code neu vergeben“ ist der Notfall-Knopf, falls ein Code kursiert: '+
  'danach müssen alle Aufkleber dieses Ladens neu beschrieben werden. '+
  '<b>Das iPad läuft weiter</b> — seine Berechtigung steckt im Gerät, nicht in '+
  'der Adresse (nach dem Einrichten steht dort nur noch …/terminal).</div></div>';

 /* ---- Mitteilungen aufs Handy ---- */
 h+='<div class="karte"><h2>Mitteilungen aufs Handy</h2>'+
  '<div class="tw"><div><div>Dieses Gerät benachrichtigen</div>'+
  '<div style="font-size:12px;color:var(--mut);margin-top:3px" id="pushT">'+
  'Ohne fremden Dienst, direkt vom Laden-PC.</div></div>'+
  '<label class="schalter"><input type="checkbox" id="pushAn"><span class="b"></span></label></div>'+
  '<div class="tw"><div><div>Ausstempeln vergessen</div>'+
  '<div style="font-size:12px;color:var(--mut);margin-top:3px">'+
  'sobald jemand automatisch ausgestempelt wurde</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sMVerg"'+
  (c.meldeVergessen?" checked":"")+'><span class="b"></span></label></div>'+
  '<div class="tw"><div><div>Nicht erschienen</div>'+
  '<div style="font-size:12px;color:var(--mut);margin-top:3px">'+
  'geplante Schicht läuft, aber niemand hat gestempelt</div></div>'+
  '<label class="schalter"><input type="checkbox" id="sMNicht"'+
  (c.meldeNichtDa?" checked":"")+'><span class="b"></span></label></div>'+
  '<label>Melden nach (Minuten Verspätung)</label>'+
  '<input id="sNichtNach" type="number" min="1" max="180" value="'+(c.nichtDaNach||15)+'">'+
  '<label>Schichtplan vorausplanen (Wochen)</label>'+
  '<input id="sPlanW" type="number" min="1" max="26" value="'+(c.planWochen||4)+'">'+
  '<div class="hint">Serien laufen so viele Wochen automatisch voraus.</div>'+
  '<button class="btn voll" id="sSave4">Speichern</button>';
 if(daten.abos&&daten.abos.length){
  h+='<h3>Angemeldete Geräte</h3>';
  daten.abos.forEach(function(a){
   h+='<div style="font-size:12.5px;color:var(--mut);padding:5px 0;'+
    'border-bottom:1px solid rgba(255,255,255,.05)"><b style="color:var(--txt)">'+
    esc(a.name)+'</b> · '+esc(a.geraet||"Gerät")+' · '+esc(a.dienst)+'</div>';});
 }
 h+='<div class="hint"><b>Auf dem iPhone</b> geht das nur, wenn diese Seite über '+
  '„Teilen → Zum Home-Bildschirm“ abgelegt und von dort geöffnet wird – so will '+
  'es Apple. Auf Android läuft es sofort. Die Mitarbeiter schalten es unter '+
  '„Mein Plan“ auf ihrem eigenen Handy ein.</div></div>';

 /* ---- Chef von unterwegs (offenes Internet) ---- */
 var f=daten.fern||{};
 h+='<div class="karte"><h2>Chef von unterwegs</h2>';
 if(daten.fernModus){
  h+='<div class="hint">Du bist gerade von unterwegs angemeldet. Diese '+
   'Einstellung lässt sich nur im Laden oder über Tailscale ändern – '+
   'sonst könnte jemand, der einmal drin ist, sich selbst dauerhaft '+
   'einen Zugang bauen.</div>';
  if(f.aktiv)h+='<div class="code">'+esc(f.adresse||"")+'</div>';
 }else{
  h+='<div class="tw"><div><div>Dashboard aus dem Internet erreichbar</div>'+
   '<div style="font-size:12px;color:var(--mut);margin-top:3px">'+
   'ohne Tailscale, von jedem Handy</div></div>'+
   '<label class="schalter"><input type="checkbox" id="fAn"'+(f.aktiv?" checked":"")+
   '><span class="b"></span></label></div>';
  if(f.aktiv){
   h+='<div style="font-size:12px;color:var(--mut);margin:11px 0 4px">'+
    'Deine geheime Adresse – <b>einmal pro Gerät</b> öffnen, danach reicht '+
    'das Lesezeichen:</div><div class="code">'+esc(f.adresse||"")+'</div>'+
    '<div class="reihe" style="margin-top:9px">'+
    '<button class="btn g" id="fQr">QR zeigen</button>'+
    '<button class="btn g" id="fNeu">Neue geheime Adresse</button></div>'+
    '<label style="margin-top:14px">Passwort ändern (min. 10 Zeichen)</label>'+
    '<input id="fPw" type="password" autocomplete="new-password">'+
    '<button class="btn voll g" id="fPwSave">Passwort ändern</button>';
   var fv=(f.fehlversuche||[]).filter(function(x){return x.n>=3;});
   if(fv.length){
    h+='<div style="margin-top:14px;font-size:12.5px;color:var(--rot)">'+
     '<b>Fehlversuche:</b></div>';
    fv.slice(0,5).forEach(function(x){
     h+='<div style="font-size:12px;color:var(--mut);padding:3px 0">'+esc(x.ip)+
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

 h+='<div class="karte"><h2>Chef-PIN ändern</h2>'+
  '<label>Neue PIN (4–8 Ziffern)</label><input id="nPin" type="password" inputmode="numeric">'+
  '<button class="btn voll g" id="nPinSave">PIN ändern</button></div>';

 h+='<div class="karte"><h2>Letzte Änderungen</h2>';
 if(!daten.audit.length)h+='<div class="leer">Noch keine Änderungen.</div>';
 daten.audit.slice().reverse().slice(0,25).forEach(function(a){
  h+='<div style="font-size:12.5px;color:var(--mut);padding:6px 0;'+
   'border-bottom:1px solid rgba(255,255,255,.05)">'+esc(a.zeit)+' · '+
   '<b style="color:var(--txt)">'+esc(a.what)+'</b> · '+esc(a.detail)+'</div>';});
 h+='<div class="hint">Korrekturen werden dauerhaft protokolliert – so bleibt '+
  'nachvollziehbar, wer wann etwas geändert hat.</div></div>';

 $("tSetup").innerHTML=h;
 var speichern=function(){
  api("api/chef/config",{firma:$("sFirma").value,oeffentlicheAdresse:$("sAdr").value,autoBreak:$("sBreak").checked,
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

 /* ---- Chef von unterwegs ---- */
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
  modal('<h3 style="margin-top:0">Chef von unterwegs</h3>'+
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
 modal('<h3 style="margin-top:0">'+esc(name)+'</h3>'+
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
