"use strict";

/*
 * Kingsley Zeit – Stempeln am eigenen Handy (Notfall-Weg)
 * ========================================================
 * Der Regelfall ist das iPad im Laden (Foto antippen). Diese Seite ist der
 * Ersatzweg: persoenlicher Code eintippen (2 Buchstaben + 4 Ziffern, z. B.
 * AY1234) - funktioniert an jedem Geraet, also auch wenn das iPad belegt,
 * kaputt oder der eigene Akku leer ist.
 *
 * Die Tastatur passt sich an: erst Buchstaben, dann Ziffern. So braucht
 * niemand die Handy-Tastatur zu bedienen.
 */

const { TOKENS_CSS } = require("./design");

const STEMPEL_HTML = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#0B0D12" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F4F4F6" media="(prefers-color-scheme: light)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="icon" type="image/png" href="/icon.png">
<link rel="manifest" href="/app.webmanifest">
<title>Stempeluhr</title>
<style>
${TOKENS_CSS}
html,body{height:100%;overflow:hidden;-webkit-user-select:none;user-select:none;}
.wrap{position:fixed;inset:0;display:flex;flex-direction:column;
 padding:max(12px,env(safe-area-inset-top)) 15px max(12px,env(safe-area-inset-bottom));}
.top{display:flex;align-items:center;justify-content:space-between;flex:0 0 auto;}
.firma{font-size:13px;letter-spacing:.2em;text-transform:uppercase;opacity:.55;}
.firma b{color:var(--o);}
.lang{display:flex;gap:4px;}
.lang button{background:var(--fl);border:1px solid var(--li);color:var(--mut);
 border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;font-family:inherit;}
.lang button.on{border-color:var(--o);color:var(--o);background:var(--o-weich);}
.uhr{text-align:center;flex:0 0 auto;margin:4px 0 0;}
.uhr .t{font-size:44px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;}
.uhr .d{font-size:12px;opacity:.45;letter-spacing:.14em;margin-top:4px;text-transform:uppercase;}
.mid{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;min-height:0;}
.hinweis{text-align:center;font-size:14px;opacity:.6;margin-bottom:6px;}
.feld{text-align:center;font-size:34px;font-weight:800;letter-spacing:.3em;
 min-height:46px;font-variant-numeric:tabular-nums;margin-bottom:12px;}
.feld .leer{opacity:.22;}
.pad{display:grid;gap:8px;margin:0 auto;width:100%;max-width:360px;}
.key{background:var(--fl);border:1px solid var(--li);border-radius:12px;color:var(--txt);
 font-weight:600;font-family:inherit;display:flex;align-items:center;justify-content:center;
 box-shadow:var(--schatten);}
.key:active{background:var(--fl2);}
.key.ok{border-color:var(--o);background:var(--o);color:#fff;}
.person{text-align:center;}
.ava{width:96px;height:96px;border-radius:50%;margin:0 auto 12px;overflow:hidden;
 background:var(--fl);border:3px solid var(--o);display:flex;align-items:center;
 justify-content:center;font-size:36px;font-weight:800;color:var(--o);}
.ava img{width:100%;height:100%;object-fit:cover;}
.name{font-size:28px;font-weight:800;}
.status{font-size:15px;opacity:.66;margin-top:6px;}
.stunden{display:flex;gap:10px;justify-content:center;margin-top:14px;}
.stunden div{background:var(--fl);border:1px solid var(--li);border-radius:12px;
 padding:9px 16px;min-width:96px;box-shadow:var(--schatten);}
.stunden .w{font-size:20px;font-weight:800;color:var(--o);font-variant-numeric:tabular-nums;}
.stunden .l{font-size:10.5px;opacity:.5;letter-spacing:.1em;margin-top:2px;text-transform:uppercase;}
.gross{width:100%;max-width:420px;margin:24px auto 0;border-radius:20px;border:none;
 color:#fff;font-family:inherit;font-size:24px;font-weight:800;letter-spacing:.13em;
 padding:28px 0;display:flex;align-items:center;justify-content:center;gap:12px;}
.gross.rein{background:var(--gruen);box-shadow:0 10px 34px rgba(47,191,95,.34);}
.gross.raus{background:var(--rot);box-shadow:0 10px 34px rgba(224,72,60,.34);}
.gross:active{transform:scale(.98);}
.zurueck{display:block;margin:14px auto 0;background:none;border:none;color:var(--mut);
 font-size:14px;font-family:inherit;padding:10px 20px;}
.haken{width:112px;height:112px;border-radius:50%;margin:0 auto 18px;display:flex;
 align-items:center;justify-content:center;font-size:56px;color:#fff;}
.haken.rein{background:var(--gruen);} .haken.raus{background:var(--rot);}
.gross-txt{font-size:31px;font-weight:800;text-align:center;}
.zeit-txt{font-size:52px;font-weight:800;text-align:center;color:var(--o);
 font-variant-numeric:tabular-nums;margin:6px 0;}
.unter{text-align:center;font-size:16px;opacity:.66;line-height:1.5;}
.fehler{background:var(--rot-weich);border:1px solid var(--rot);border-radius:11px;
 padding:12px;text-align:center;font-size:14px;margin:0 auto 12px;max-width:420px;}
.sperre{text-align:center;padding:18px;}
.sperre .icon{font-size:56px;margin-bottom:12px;}
.hidden{display:none!important;}
.fuss{flex:0 0 auto;text-align:center;font-size:10px;opacity:.22;letter-spacing:.15em;
 padding-top:6px;}
</style></head><body>
<div class="wrap">
 <div class="top">
  <div class="firma" id="fFirma">KINGSLEY<b>.</b></div>
  <div class="lang"><button id="lDe" class="on">DE</button><button id="lEn">EN</button></div>
 </div>
 <div class="uhr"><div class="t" id="uhrT">--:--</div><div class="d" id="uhrD"></div></div>

 <div class="mid">
  <div id="vCode">
   <div class="hinweis" id="txtHinweis"></div>
   <div class="feld" id="feld"></div>
   <div id="fehlerBox"></div>
   <div class="pad" id="pad"></div>
  </div>

  <div id="vTag" class="hidden">
   <div class="hinweis" id="tagTitel" style="font-size:19px;font-weight:700;opacity:1"></div>
   <div class="hinweis" id="tagText"></div>
   <div class="feld" id="tagFeld"></div>
   <div id="tagFehler"></div>
   <div class="pad" id="tagPad"></div>
  </div>

  <div id="vPerson" class="hidden">
   <div class="person">
    <div class="ava" id="ava"></div>
    <div class="name" id="pName"></div>
    <div class="status" id="pStatus"></div>
    <div class="stunden" id="pStunden"></div>
   </div>
   <button class="gross" id="btnStamp"></button>
   <button class="zurueck" id="btnBack"></button>
  </div>

  <div id="vOk" class="hidden">
   <div class="haken" id="okHaken">✓</div>
   <div class="gross-txt" id="okName"></div>
   <div class="zeit-txt" id="okZeit"></div>
   <div class="unter" id="okText"></div>
  </div>

  <div id="vSperre" class="hidden">
   <div class="sperre">
    <div class="icon">📍</div>
    <div class="gross-txt" id="spTitel"></div>
    <div class="unter" id="spText" style="margin-top:12px"></div>
   </div>
  </div>
 </div>
 <div class="fuss">KINGSLEY SYSTEMS</div>
</div>

<script>
var T={
 de:{hinweis:"Dein Code – 2 Buchstaben, dann 4 Ziffern",ok:"OK",
  falsch:"Code unbekannt – nochmal versuchen",seit:"Eingestempelt seit",
  nichtDa:"Nicht eingestempelt",rein:"EINSTEMPELN",raus:"AUSSTEMPELN",
  zurueck:"← Abbrechen",willkommen:"Schöne Schicht!",tschuess:"Schönen Feierabend!",
  gearbeitet:"Heute gearbeitet:",sperreT:"Bitte am Eingang antippen",
  sperreX:"Halte dein Handy kurz an den Aufkleber am Eingang – oder nutze das iPad im Laden.",
  fehler:"Es hat nicht geklappt. Bitte nochmal versuchen.",
  tagT:"Tages-Code",tagX:"Die 4 Ziffern stehen groß auf dem iPad im Laden.",
  tagFalsch:"Falscher Tages-Code",zuOft:"Zu viele Versuche – kurz warten.",
  nichtIch:"Ich bin das nicht",heuteL:"Heute",wocheL:"Diese Woche"},
 en:{hinweis:"Your code – 2 letters, then 4 digits",ok:"OK",
  falsch:"Unknown code – please try again",seit:"Clocked in since",
  nichtDa:"Not clocked in",rein:"CLOCK IN",raus:"CLOCK OUT",
  zurueck:"← Cancel",willkommen:"Have a good shift!",tschuess:"Have a good evening!",
  gearbeitet:"Worked today:",sperreT:"Please tap at the entrance",
  sperreX:"Hold your phone to the sticker at the entrance – or use the iPad in the shop.",
  fehler:"That did not work. Please try again.",
  tagT:"Code of the day",tagX:"The 4 digits are shown on the iPad in the shop.",
  tagFalsch:"Wrong code of the day",zuOft:"Too many tries – please wait.",
  nichtIch:"Not me",heuteL:"Today",wocheL:"This week"}
};
var lang=localStorage.getItem("zeit-lang")||"de";
function t(k){return (T[lang]||T.de)[k];}
function $(i){return document.getElementById(i);}
var code="",person=null,tmr=null;

function uhr(){
 var d=new Date();
 $("uhrT").textContent=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
 var wd=(lang==="en"?["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  :["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"])[d.getDay()];
 $("uhrD").textContent=wd+" · "+String(d.getDate()).padStart(2,"0")+"."+
  String(d.getMonth()+1).padStart(2,"0")+"."+d.getFullYear();
}
setInterval(uhr,1000);uhr();

function setLang(l){
 lang=l;localStorage.setItem("zeit-lang",l);
 $("lDe").className=l==="de"?"on":"";$("lEn").className=l==="en"?"on":"";
 texte();uhr();
}
function texte(){
 $("txtHinweis").textContent=t("hinweis");
 $("btnBack").textContent=t("zurueck");
 $("spTitel").textContent=t("sperreT");
 $("spText").textContent=t("sperreX");
 malPad();feld();
 if(person)zeigePerson(person);
}
$("lDe").onclick=function(){setLang("de");};
$("lEn").onclick=function(){setLang("en");};

/* Tastatur passt sich an: erst Buchstaben, dann Ziffern */
function malPad(){
 var p=$("pad");p.innerHTML="";
 var buchst=code.length<2;
 var keys=buchst
  ?["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R",
    "S","T","U","V","W","X","Y","Z","⌫"]
  :["1","2","3","4","5","6","7","8","9","⌫","0","OK"];
 p.style.gridTemplateColumns=buchst?"repeat(6,1fr)":"repeat(3,1fr)";
 keys.forEach(function(k){
  var b=document.createElement("button");
  b.className="key"+(k==="OK"?" ok":"");
  b.textContent=k==="OK"?t("ok"):k;
  b.style.fontSize=buchst?"17px":"25px";
  b.style.padding=buchst?"13px 0":"16px 0";
  b.onclick=function(){tippe(k);};
  p.appendChild(b);
 });
}
function feld(){
 var s="";
 for(var i=0;i<6;i++)s+=(i<code.length?code[i]:'<span class="leer">·</span>');
 $("feld").innerHTML=s;
}
function tippe(k){
 if(navigator.vibrate)navigator.vibrate(8);
 $("fehlerBox").innerHTML="";
 if(k==="⌫"){code=code.slice(0,-1);feld();malPad();return;}
 if(k==="OK"){pruefe();return;}
 if(code.length>=6)return;
 code+=k;feld();malPad();
 if(code.length===6)setTimeout(pruefe,140);
}
function fehler(msg){
 $("fehlerBox").innerHTML='<div class="fehler">'+msg+'</div>';
 code="";feld();malPad();
 if(navigator.vibrate)navigator.vibrate([40,60,40]);
}
function zeige(id){
 ["vCode","vTag","vPerson","vOk","vSperre"].forEach(function(v){$(v).classList.add("hidden");});
 $(id).classList.remove("hidden");
}
function ini(n){var p=String(n||"").trim().split(/\\s+/);
 return ((p[0]||"?")[0]||"?").toUpperCase()+((p[1]||"")[0]||"").toUpperCase();}
function zeigePerson(p){
 person=p;
 $("ava").innerHTML=p.photo?('<img src="/fotos/'+p.photo+'">'):ini(p.name);
 $("pName").textContent=p.name;
 $("pStunden").innerHTML=(p.heute!=null)
  ?('<div><div class="w">'+p.heute+'</div><div class="l">'+t("heuteL")+'</div></div>'+
    '<div><div class="w">'+p.woche+'</div><div class="l">'+t("wocheL")+'</div></div>')
  :"";
 $("btnBack").textContent=gemerkt()?t("nichtIch"):t("zurueck");
 var b=$("btnStamp");
 if(p.in){$("pStatus").textContent=t("seit")+" "+p.since;
  b.className="gross raus";b.textContent="■  "+t("raus");}
 else{$("pStatus").textContent=t("nichtDa");
  b.className="gross rein";b.textContent="▶  "+t("rein");}
 zeige("vPerson");
 clearTimeout(tmr);tmr=setTimeout(reset,45000);
}
function reset(){
 vergessen();
 code="";person=null;feld();malPad();$("fehlerBox").innerHTML="";
 clearTimeout(tmr);zeige("vCode");
}
$("btnBack").onclick=reset;

function post(url,body){
 return fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body||{})}).then(function(r){return r.json();});
}
function pruefe(){
 if(code.length<6)return;
 var c=code;
 post("/api/code",{code:c}).then(function(r){
  if(r.sperre){zeige("vSperre");code="";feld();malPad();return;}
  if(!r.ok){fehler(t("falsch"));return;}
  r.code=c;merken(c);zeigePerson(r);
 }).catch(function(){fehler(t("fehler"));});
}
$("btnStamp").onclick=function(){
 if(!person)return;
 var b=$("btnStamp");b.disabled=true;
 post("/api/stempeln",{code:person.code}).then(function(r){
  b.disabled=false;
  if(r.sperre){zeige("vSperre");return;}
  if(!r.ok){fehler(r.fehler||t("fehler"));zeige("vCode");return;}
  $("okHaken").className="haken "+(r.type==="in"?"rein":"raus");
  $("okHaken").textContent=r.type==="in"?"▶":"■";
  $("okName").textContent=r.name;
  $("okZeit").textContent=r.zeit;
  $("okText").innerHTML=(r.type==="in"?t("willkommen")
   :(t("tschuess")+(r.heute?'<br><b>'+t("gearbeitet")+" "+r.heute+" h</b>":"")));
  zeige("vOk");
  if(navigator.vibrate)navigator.vibrate(r.type==="in"?[30,50,30]:[60]);
  clearTimeout(tmr);
  tmr=setTimeout(function(){
   var g=gemerkt();
   if(g)identifiziere(g); else reset();
  },6000);
 }).catch(function(){b.disabled=false;fehler(t("fehler"));});
};

/* ---------------- Code merken ---------------- */
/* Der persoenliche Code wird auf Wunsch im Browser gespeichert, damit ihn
   niemand jeden Tag neu tippen muss. "Ich bin das nicht" loescht ihn wieder. */
function gemerkt(){try{return localStorage.getItem("zeit-code")||"";}catch(e){return "";}}
function merken(c){try{localStorage.setItem("zeit-code",c);}catch(e){}}
function vergessen(){try{localStorage.removeItem("zeit-code");}catch(e){}}

/* ---------------- Tages-Code ---------------- */
var tagCode="";
function tagPad(){
 var p=$("tagPad");p.innerHTML="";
 p.style.gridTemplateColumns="repeat(3,1fr)";
 ["1","2","3","4","5","6","7","8","9","⌫","0","OK"].forEach(function(k){
  var b=document.createElement("button");
  b.className="key"+(k==="OK"?" ok":"");
  b.textContent=k==="OK"?t("ok"):k;
  b.style.fontSize="25px";b.style.padding="16px 0";
  b.onclick=function(){
   if(navigator.vibrate)navigator.vibrate(8);
   $("tagFehler").innerHTML="";
   if(k==="⌫")tagCode=tagCode.slice(0,-1);
   else if(k==="OK"){tagPruefe();return;}
   else if(tagCode.length<4)tagCode+=k;
   tagFeld();
   if(tagCode.length===4)setTimeout(tagPruefe,140);
  };
  p.appendChild(b);
 });
}
function tagFeld(){
 var s="";
 for(var i=0;i<4;i++)s+=(i<tagCode.length?tagCode[i]:'<span class="leer">·</span>');
 $("tagFeld").innerHTML=s;
}
function zeigeTag(){
 $("tagTitel").textContent=t("tagT");
 $("tagText").textContent=t("tagX");
 tagCode="";tagFeld();tagPad();zeige("vTag");
}
function tagPruefe(){
 if(tagCode.length<4)return;
 post("/api/tagescode",{code:tagCode}).then(function(r){
  if(r.ok){weiterNachTag();return;}
  $("tagFehler").innerHTML='<div class="fehler">'+
   (r.zuOft?t("zuOft"):t("tagFalsch"))+'</div>';
  tagCode="";tagFeld();
  if(navigator.vibrate)navigator.vibrate([40,60,40]);
 }).catch(function(){$("tagFehler").innerHTML='<div class="fehler">'+t("fehler")+'</div>';});
}
function weiterNachTag(){
 var g=gemerkt();
 if(g)identifiziere(g);
 else{code="";feld();malPad();zeige("vCode");}
}

/* ---------------- Start ---------------- */
function identifiziere(c){
 post("/api/code",{code:c}).then(function(r){
  if(r.sperre){zeige("vSperre");return;}
  if(!r.ok){vergessen();code="";feld();malPad();zeige("vCode");return;}
  r.code=c;merken(c);zeigePerson(r);
 }).catch(function(){});
}
fetch("/api/info").then(function(r){return r.json();}).then(function(i){
 if(i.firma)$("fFirma").innerHTML=String(i.firma).toUpperCase()+'<b>.</b>';
 if(i.sperre){zeige("vSperre");return;}
 if(i.tagNoetig){zeigeTag();return;}
 var g=gemerkt();
 if(g)identifiziere(g);
}).catch(function(){});
setLang(lang);feld();
</script></body></html>`;

module.exports = { STEMPEL_HTML };
