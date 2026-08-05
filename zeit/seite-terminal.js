"use strict";

/*
 * Kingsley Zeit – Kachel-Ansicht (iPad an der Wand UND Handy nach NFC-Tipp)
 * =========================================================================
 * Bewusst EINE Ansicht fuer beide Geraete: Wer sein Handy an den Aufkleber
 * haelt, sieht genau dasselbe wie auf dem iPad.
 * Der Regelfall zum Stempeln. Alle Mitarbeiter als grosse Foto-Kacheln;
 * jeder tippt sein eigenes Bild an - fertig. Mehrere Leute nacheinander am
 * selben Geraet, ohne An- und Abmelden.
 *
 * Wer schon drin ist, hat eine gruene Kachel mit Uhrzeit; wer draussen ist,
 * eine graue. Nach dem Tippen kommt eine grosse Bestaetigung und das
 * Terminal springt von allein zurueck.
 *
 * Optional (Einstellung): zusaetzlich den persoenlichen Code abfragen.
 *
 * Einmal einrichten: am iPad die Adresse .../terminal/<CODE> oeffnen und
 * zum Home-Bildschirm hinzufuegen. Dann laeuft es im Vollbild dauerhaft.
 */

const { MEIN_CSS, MEIN_JS } = require("./seite-mein");
const { TOKENS_CSS, THEMA_JS } = require("./design");

const TERMINAL_HTML = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#0B0D12" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F4F4F6" media="(prefers-color-scheme: light)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Stempeluhr">
<title>Stempeluhr – Terminal</title>
<style>
${TOKENS_CSS}
html,body{height:100%;overflow:hidden;-webkit-user-select:none;user-select:none;}
.wrap{position:fixed;inset:0;display:flex;flex-direction:column;
 padding:max(16px,env(safe-area-inset-top)) 20px max(16px,env(safe-area-inset-bottom));}
.kopf{display:flex;align-items:flex-end;justify-content:space-between;flex:0 0 auto;
 padding-bottom:14px;border-bottom:1px solid var(--li);}
.firma{font-size:17px;letter-spacing:.22em;text-transform:uppercase;opacity:.6;}
.firma b{color:var(--o);}
.uhr{text-align:right;}
.uhr .t{font-size:44px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;}
.uhr .d{font-size:13px;opacity:.45;letter-spacing:.14em;margin-top:4px;text-transform:uppercase;}
.gitter{flex:1 1 auto;overflow-y:auto;display:grid;gap:16px;padding:18px 2px;
 grid-template-columns:repeat(auto-fill,minmax(160px,1fr));align-content:start;}
.kachel{background:var(--fl);border:2px solid var(--li);border-radius:20px;
 padding:16px 10px 14px;text-align:center;position:relative;overflow:hidden;
 box-shadow:var(--schatten);}
.kachel:active{transform:scale(.97);}
.kachel.da{border-color:var(--gruen);background:var(--gruen-weich);}
.kachel .bild{width:92px;height:92px;border-radius:50%;margin:0 auto 11px;
 overflow:hidden;background:var(--fl2);border:3px solid var(--li2);
 display:flex;align-items:center;justify-content:center;font-size:32px;
 font-weight:800;color:var(--mut);}
.kachel.da .bild{border-color:var(--gruen);color:var(--gruen);}
.kachel .bild img{width:100%;height:100%;object-fit:cover;}
.kachel .nm{font-size:17px;font-weight:700;line-height:1.25;
 overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.kachel .st{font-size:12.5px;margin-top:5px;letter-spacing:.05em;opacity:.6;}
.kachel.da .st{color:var(--gruen);opacity:1;font-weight:600;}
.fuss{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;
 padding-top:12px;border-top:1px solid var(--li);font-size:12px;color:var(--mut);gap:8px;}
.fuss button{background:none;border:1px solid var(--li);color:var(--mut);border-radius:8px;
 padding:7px 13px;font-size:12px;font-family:inherit;}
/* Tages-Code: nur hier im Laden sichtbar - damit ist er der Beweis,
   dass jemand wirklich da war. */
#tagesCode{opacity:1;display:flex;align-items:center;gap:10px;}
#tagesCode .l{font-size:11px;letter-spacing:.18em;opacity:.5;text-transform:uppercase;}
#tagesCode .w{font-size:26px;font-weight:800;color:var(--o);letter-spacing:.22em;
 font-variant-numeric:tabular-nums;}
/* Overlay: Bestaetigung + Code */
.over{position:fixed;inset:0;background:var(--bg);z-index:50;display:none;
 flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center;}
.over.auf{display:flex;}
.gbild{width:150px;height:150px;border-radius:50%;overflow:hidden;margin-bottom:20px;
 border:5px solid var(--o);display:flex;align-items:center;justify-content:center;
 font-size:54px;font-weight:800;color:var(--o);background:var(--fl2);}
.gbild img{width:100%;height:100%;object-fit:cover;}
.gname{font-size:38px;font-weight:800;letter-spacing:.02em;}
.gfrage{font-size:19px;opacity:.65;margin-top:9px;}
.knopf{margin-top:30px;border:none;border-radius:22px;color:#fff;font-family:inherit;
 font-size:27px;font-weight:800;letter-spacing:.14em;padding:32px 60px;min-width:320px;}
.knopf.rein{background:var(--gruen);box-shadow:0 12px 40px rgba(47,191,95,.35);}
.knopf.raus{background:var(--rot);box-shadow:0 12px 40px rgba(224,72,60,.35);}
.klein{margin-top:20px;background:none;border:none;color:var(--mut);font-size:16px;
 font-family:inherit;padding:12px 26px;}
.haken{width:150px;height:150px;border-radius:50%;display:flex;align-items:center;
 justify-content:center;font-size:74px;margin-bottom:22px;}
.haken.rein{background:var(--gruen);} .haken.raus{background:var(--rot);}
.gzeit{font-size:66px;font-weight:800;color:var(--o);font-variant-numeric:tabular-nums;
 margin:6px 0 10px;}
.ghinweis{font-size:19px;opacity:.7;}
.codefeld{font-size:38px;letter-spacing:.32em;font-weight:800;margin:22px 0 6px;
 min-height:48px;font-variant-numeric:tabular-nums;}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:300px;margin-top:10px;}
.pad button{background:var(--fl);border:1px solid var(--li);border-radius:16px;color:var(--txt);
 font-size:26px;font-weight:600;font-family:inherit;padding:18px 0;}
.fehler{color:var(--rot);font-size:16px;margin-top:14px;min-height:22px;}
.leer{grid-column:1/-1;text-align:center;padding:60px 20px;opacity:.5;font-size:16px;}
/* Schmale Handys: Kopfzeile untereinander statt nebeneinander */
@media (max-width:560px){
 .kopf{flex-direction:column;align-items:stretch;gap:6px;padding-bottom:11px;}
 .uhr{text-align:center;}
 .uhr .t{font-size:38px;}
 .gitter{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;padding:14px 0;}
 .kachel .bild{width:74px;height:74px;font-size:26px;}
 .kachel .nm{font-size:15px;}
 .fuss{font-size:11px;gap:8px;}
 .gbild{width:120px;height:120px;font-size:44px;margin-bottom:14px;}
 .gname{font-size:29px;}
 .knopf{font-size:22px;padding:26px 34px;min-width:0;width:100%;}
 .pad button{padding:14px 0;font-size:22px;}
}
${MEIN_CSS}
</style></head><body>
<div class="wrap">
 <div class="kopf">
  <div class="firma" id="firma">KINGSLEY<b>.</b></div>
  <div class="uhr"><div class="t" id="uhrT">--:--</div><div class="d" id="uhrD"></div></div>
 </div>
 <div class="gitter" id="gitter"></div>
 <div class="fuss">
  <div id="zaehler"></div>
  <div id="tagesCode"></div>
  <div><button id="btnThema" data-thema-knopf></button>
      <button id="btnCode">Code eingeben</button>
      <button class="meinBtn" id="btnMein">Mein Plan</button></div>
 </div>
</div>

<div class="over" id="over"></div>
<div class="mein" id="mein"></div>

<script>
${THEMA_JS}
function $(i){return document.getElementById(i);}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
 return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function ini(n){var p=String(n||"").trim().split(/\\s+/);
 return ((p[0]||"?")[0]||"?").toUpperCase()+((p[1]||"")[0]||"").toUpperCase();}
function bildHtml(p){return p.photo?'<img src="/fotos/'+esc(p.photo)+'">':esc(ini(p.name));}

var leute=[],cfg={},zurueckTimer=null;

/*
 * Code merken - NUR am privaten Handy!
 * ------------------------------------
 * Das iPad im Laden ist ein GETEILTES Geraet. Wuerde es sich den Code merken,
 * haette es den des zuletzt Tippenden gespeichert und wuerde ihn fuer alle
 * anderen weiterverwenden - ein Mitarbeiter koennte also fuer einen Kollegen
 * stempeln. Deshalb entscheidet nicht die Adresse, sondern die vom SERVER
 * vergebene Rolle (cfg.amHandy): Nur ein Handy nach NFC-Tipp darf merken.
 */
function darfMerken(){return cfg.amHandy===true;}
function gemerkt(){
 if(!darfMerken())return "";
 try{return localStorage.getItem("zeit-code")||"";}catch(e){return "";}}
function merken(c){
 if(!darfMerken())return;
 try{localStorage.setItem("zeit-code",c);}catch(e){}}
function vergessen(){try{localStorage.removeItem("zeit-code");}catch(e){}}

function uhr(){
 var d=new Date();
 $("uhrT").textContent=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
 var wd=["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"][d.getDay()];
 $("uhrD").textContent=wd+" · "+String(d.getDate()).padStart(2,"0")+"."+
  String(d.getMonth()+1).padStart(2,"0")+"."+d.getFullYear();
}
setInterval(uhr,1000);uhr();

function laden(){
 fetch("/api/terminal/liste").then(function(r){return r.json();}).then(function(d){
  if(d.fehler){document.body.innerHTML='<div style="padding:40px;text-align:center">'+
   '<div style="font-size:54px">📍</div>'+
   '<h2>Bitte am Eingang antippen</h2>'+
   '<div style="opacity:.6;line-height:1.6">Halte dein Handy kurz an den NFC-Aufkleber '+
   'im Laden – dann öffnet sich diese Seite von selbst.</div></div>';return;}
  leute=d.leute;cfg=d.config||{};
  // Sicherheitsnetz: Wurde dieses Geraet zum Laden-Terminal gemacht, fliegt
  // ein evtl. frueher gemerkter Code sofort raus.
  if(!darfMerken())vergessen();
  if(cfg.firma)$("firma").innerHTML=esc(String(cfg.firma).toUpperCase())+'<b>.</b>';
  $("tagesCode").innerHTML=cfg.zu
   ?('<span class="l" style="color:var(--rot)">Geschlossen · '+esc(cfg.zu.von)+
     '–'+esc(cfg.zu.bis)+'</span>'):"";
  zeichne();
 }).catch(function(){});
}
function zeichne(){
 var g=$("gitter");g.innerHTML="";
 if(!leute.length){g.innerHTML='<div class="leer">Noch keine Mitarbeiter angelegt.</div>';return;}
 leute.forEach(function(p){
  var d=document.createElement("div");
  d.className="kachel"+(p.in?" da":"");
  d.innerHTML='<div class="bild">'+bildHtml(p)+'</div>'+
   '<div class="nm">'+esc(p.name)+'</div>'+
   '<div class="st">'+(p.in?("seit "+esc(p.since)):"nicht da")+'</div>';
  d.onclick=function(){frage(p);};
  g.appendChild(d);
 });
 var da=leute.filter(function(p){return p.in;}).length;
 $("zaehler").textContent=da+" von "+leute.length+" im Laden";
}
setInterval(laden,25000);

/* --------------------------- Nachfrage + Code --------------------------- */
function schliesse(){$("over").classList.remove("auf");clearTimeout(zurueckTimer);}
function frage(p){
 var raus=p.in;
 $("over").innerHTML=
  '<div class="gbild">'+bildHtml(p)+'</div>'+
  '<div class="gname">'+esc(p.name)+'</div>'+
  '<div class="gfrage">'+(raus?("Eingestempelt seit "+esc(p.since)+" Uhr"):"Nicht eingestempelt")+'</div>'+
  '<button class="knopf '+(raus?"raus":"rein")+'" id="oJa">'+(raus?"AUSSTEMPELN":"EINSTEMPELN")+'</button>'+
  '<button class="klein" id="oNein">Abbrechen</button>';
 $("over").classList.add("auf");
 $("oNein").onclick=schliesse;
 $("oJa").onclick=function(){
  if(!cfg.codeNoetig){stempeln(p,null);return;}
  var g=gemerkt();
  if(g)stempeln(p,g);            // gemerkter Code: nichts zu tippen
  else codeAbfrage(p);
 };
 if(cfg.amHandy&&gemerkt()){
  // Am eigenen Handy mit gemerktem Code: Hinweis, wie man ihn wieder loswird
  var w=document.createElement("button");
  w.className="klein";w.textContent="Ich bin das nicht";
  w.onclick=function(){vergessen();schliesse();};
  $("over").appendChild(w);
 }
 clearTimeout(zurueckTimer);zurueckTimer=setTimeout(schliesse,20000);
}
function codeAbfrage(p,fehlerText){
 var code="";
 function bau(){
  $("over").innerHTML=
   '<div class="gbild">'+bildHtml(p)+'</div>'+
   '<div class="gname" style="font-size:26px">'+esc(p.name)+'</div>'+
   '<div class="gfrage">Bitte deinen Code eingeben</div>'+
   '<div class="codefeld" id="cFeld">'+(code||"······")+'</div>'+
   '<div class="pad" id="cPad"></div>'+
   '<div class="fehler" id="cFehler">'+(fehlerText||"")+'</div>'+
   '<button class="klein" id="cAb">Abbrechen</button>';
  $("cAb").onclick=schliesse;
  malPad();
 }
 function malPad(){
  var pad=$("cPad");pad.innerHTML="";
  var keys=code.length<2
   ?["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R",
     "S","T","U","V","W","X","Y","Z","⌫"]
   :["1","2","3","4","5","6","7","8","9","⌫","0","OK"];
  pad.style.gridTemplateColumns=code.length<2?"repeat(6,1fr)":"repeat(3,1fr)";
  pad.style.width=code.length<2?"360px":"300px";
  keys.forEach(function(k){
   var b=document.createElement("button");
   b.textContent=k;
   if(code.length<2)b.style.fontSize="19px",b.style.padding="13px 0";
   b.onclick=function(){
    if(navigator.vibrate)navigator.vibrate(8);
    if(k==="⌫")code=code.slice(0,-1);
    else if(k==="OK"){stempeln(p,code);return;}
    else if(code.length<6)code+=k;
    $("cFeld").textContent=code||"······";
    malPad();
    if(code.length===6)setTimeout(function(){stempeln(p,code);},150);
   };
   pad.appendChild(b);
  });
 }
 bau();
 clearTimeout(zurueckTimer);zurueckTimer=setTimeout(schliesse,45000);
}
function stempeln(p,code){
 fetch("/api/terminal/stempeln",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({empId:p.empId,code:code})}).then(function(r){return r.json();})
 .then(function(r){
  if(!r.ok){
   if(r.codeFalsch){vergessen();codeAbfrage(p,"Code stimmt nicht");return;}
   codeAbfrage&&schliesse();
   alertBox(r.fehler||"Hat nicht geklappt");return;
  }
  if(code)merken(code);
  $("over").innerHTML=
   '<div class="haken '+(r.type==="in"?"rein":"raus")+'">'+(r.type==="in"?"▶":"■")+'</div>'+
   '<div class="gname">'+esc(r.name)+'</div>'+
   '<div class="gzeit">'+esc(r.zeit)+'</div>'+
   '<div class="ghinweis">'+(r.type==="in"?"Schöne Schicht!":
     ("Schönen Feierabend!"+(r.heute?"<br><b>Heute: "+esc(r.heute)+" h</b>":"")))+'</div>';
  $("over").classList.add("auf");
  if(navigator.vibrate)navigator.vibrate(r.type==="in"?[30,50,30]:[60]);
  clearTimeout(zurueckTimer);zurueckTimer=setTimeout(function(){schliesse();laden();},4500);
  laden();
 }).catch(function(){alertBox("Keine Verbindung zum Server");});
}
function alertBox(msg){
 $("over").innerHTML='<div style="font-size:60px;margin-bottom:16px">⚠️</div>'+
  '<div class="gname" style="font-size:24px">'+esc(msg)+'</div>'+
  '<button class="klein" id="aOk">OK</button>';
 $("over").classList.add("auf");
 $("aOk").onclick=schliesse;
 clearTimeout(zurueckTimer);zurueckTimer=setTimeout(schliesse,5000);
}

/* Notfall-Weg: nur den Code eintippen, ohne Kachel */
$("btnCode").onclick=function(){
 var code="";
 function bau(){
  $("over").innerHTML='<div class="gname" style="font-size:26px">Persönlicher Code</div>'+
   '<div class="gfrage">2 Buchstaben und 4 Ziffern</div>'+
   '<div class="codefeld" id="cFeld">'+(code||"······")+'</div>'+
   '<div class="pad" id="cPad"></div>'+
   '<div class="fehler" id="cFehler"></div>'+
   '<button class="klein" id="cAb">Abbrechen</button>';
  $("cAb").onclick=schliesse;
  malPad();
 }
 function malPad(){
  var pad=$("cPad");pad.innerHTML="";
  var keys=code.length<2
   ?["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R",
     "S","T","U","V","W","X","Y","Z","⌫"]
   :["1","2","3","4","5","6","7","8","9","⌫","0","OK"];
  pad.style.gridTemplateColumns=code.length<2?"repeat(6,1fr)":"repeat(3,1fr)";
  pad.style.width=code.length<2?"360px":"300px";
  keys.forEach(function(k){
   var b=document.createElement("button");b.textContent=k;
   if(code.length<2)b.style.fontSize="19px",b.style.padding="13px 0";
   b.onclick=function(){
    if(k==="⌫")code=code.slice(0,-1);
    else if(k==="OK"){los();return;}
    else if(code.length<6)code+=k;
    $("cFeld").textContent=code||"······";malPad();
    if(code.length===6)setTimeout(los,150);
   };
   pad.appendChild(b);
  });
 }
 function los(){
  fetch("/api/code",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({code:code})}).then(function(r){return r.json();}).then(function(r){
   if(!r.ok){code="";bau();$("cFehler").textContent="Code unbekannt";return;}
   frage({empId:r.id,name:r.name,photo:r.photo,in:r.in,since:r.since,code:code});
  });
 }
 bau();
 clearTimeout(zurueckTimer);zurueckTimer=setTimeout(schliesse,45000);
};

${MEIN_JS}

$("btnMein").onclick=meinOeffnen;
$("btnThema").onclick=themaWechsel;
themaKnopfMalen($("btnThema"));
laden();
</script></body></html>`;

module.exports = { TERMINAL_HTML };
