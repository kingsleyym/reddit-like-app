"use strict";

/*
 * Kingsley Zeit – "Mein Plan" für Mitarbeiter
 * ===========================================
 * Wird in die Kachel-Ansicht eingesetzt und benutzt deren Helfer
 * ($, esc, bildHtml, gemerkt, merken, cfg, schliesse).
 *
 * Kein zweites Konto, kein zweites Passwort: Wer seinen Code kennt, sieht
 * seinen Plan. Genau wie beim Stempeln. Am eigenen Handy ist der Code
 * gemerkt - dann ist es ein einziger Fingertipp.
 *
 * Am iPad im Laden wird NICHTS gemerkt (siehe darfMerken()) und es koennen
 * dort auch keine Mitteilungen abonniert werden - sonst bekaeme das
 * Ladengeraet die Mitteilungen des Letzten, der es benutzt hat.
 */

const MEIN_CSS = `
/* Die Nachfrage-Ebene muss ÜBER "Mein Plan" liegen - sonst tippt man ins
   Leere, wenn man aus dem Plan heraus krankmeldet oder tauscht. */
.over{z-index:80}
.meinBtn{background:var(--o);border:1px solid var(--o);color:#fff;
 border-radius:9px;padding:7px 13px;font-size:13px;font-family:inherit;font-weight:600}
.mein{position:fixed;inset:0;background:var(--bg);z-index:70;display:none;
 flex-direction:column;padding:max(14px,env(safe-area-inset-top)) 16px
 max(14px,env(safe-area-inset-bottom));overflow-y:auto;-webkit-overflow-scrolling:touch}
.mein.auf{display:flex}
.mKopf{display:flex;align-items:center;gap:12px;flex:0 0 auto;padding-bottom:14px;
 border-bottom:1px solid var(--li)}
.mKopf .bild{width:52px;height:52px;border-radius:50%;overflow:hidden;background:var(--fl2);
 border:2px solid var(--li2);display:flex;align-items:center;justify-content:center;
 font-weight:800;color:var(--mut);flex:0 0 auto}
.mKopf .bild img{width:100%;height:100%;object-fit:cover}
.mKopf .nm{font-size:19px;font-weight:700}
.mKopf .st{font-size:12.5px;opacity:.55;margin-top:2px}
.mKopf .zu{margin-left:auto;background:none;border:1px solid var(--li);color:var(--txt);
 border-radius:9px;padding:8px 12px;font-size:13px;font-family:inherit}
.mBody{flex:1 1 auto;padding-top:14px}
.mH{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;opacity:.45;
 margin:18px 0 9px;font-weight:600}
.mH:first-child{margin-top:0}
.msum{display:flex;gap:9px;margin-bottom:4px}
.msum div{flex:1;background:var(--fl);border:1px solid var(--li);border-radius:13px;
 padding:11px 12px}
.msum .w{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.msum .l{font-size:11px;opacity:.5;letter-spacing:.09em;text-transform:uppercase;margin-top:2px}
.msch{display:flex;align-items:center;gap:11px;background:var(--fl);border:1px solid var(--li);
 border-radius:13px;padding:12px;margin-bottom:8px;width:100%;text-align:left;
 font-family:inherit;color:inherit;font-size:15px}
.msch .bal{width:4px;align-self:stretch;border-radius:3px;background:var(--o);flex:0 0 auto}
.msch .d1{font-weight:650;font-size:15px}
.msch .d2{font-size:12.5px;opacity:.55;margin-top:2px}
.msch .re{margin-left:auto;text-align:right;font-size:12.5px;opacity:.6;white-space:nowrap}
.msch.heute{border-color:var(--o)}
.msch.wartet{opacity:.55}
.mleer{opacity:.45;font-size:13.5px;padding:6px 2px 2px}
.mAkt{display:flex;gap:8px;margin-top:10px}
.mAkt button{flex:1;background:var(--fl);border:1px solid var(--li);color:var(--txt);
 border-radius:11px;padding:13px 8px;font-size:14px;font-family:inherit;font-weight:600}
.mAkt button.warn{border-color:var(--rot);color:var(--rot)}
.mZeile{display:flex;align-items:center;justify-content:space-between;gap:12px;
 background:var(--fl);border:1px solid var(--li);border-radius:13px;padding:13px}
.mZeile .t1{font-size:14.5px;font-weight:600}
.mZeile .t2{font-size:12px;opacity:.5;margin-top:3px;line-height:1.4}
.mSch{position:relative;width:50px;height:29px;flex:0 0 auto}
.mSch input{position:absolute;opacity:0;width:100%;height:100%;margin:0}
.mSch .b{position:absolute;inset:0;background:var(--fl2);border:1px solid var(--li2);
 border-radius:999px;transition:.2s}
.mSch .b:after{content:"";position:absolute;width:21px;height:21px;border-radius:50%;
 background:var(--mut);top:3px;left:3px;transition:.2s}
.mSch input:checked+.b{background:var(--o);border-color:var(--o)}
.mSch input:checked+.b:after{background:#fff;transform:translateX(21px)}
.mList{display:flex;flex-direction:column;gap:8px}
`;

const MEIN_JS = `
/* ------------------------------ Mein Plan -------------------------------- */
var meinD=null, meinCode="";

function meinOeffnen(){
 var g=gemerkt();
 if(g)meinLaden(g);
 else meinCodeAbfrage();
}

function meinCodeAbfrage(fehler){
 var code="";
 function bau(){
  $("over").innerHTML=
   '<div class="gname" style="font-size:26px">Mein Plan</div>'+
   '<div class="gfrage">Bitte deinen Code eingeben</div>'+
   '<div class="codefeld" id="cFeld">'+(code||"······")+'</div>'+
   '<div class="fehler" id="cFehler">'+(fehler||"")+'</div>'+
   '<div class="pad" id="cPad"></div>'+
   '<button class="klein" id="oNein">Abbrechen</button>';
  $("over").classList.add("auf");
  $("oNein").onclick=schliesse;
  malPad();
 }
 function malPad(){
  var pad=$("cPad");pad.innerHTML="";
  var buchst=code.length<2;
  var tasten=buchst
   ?"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").concat(["⌫"])
   :["1","2","3","4","5","6","7","8","9","⌫","0","OK"];
  pad.style.gridTemplateColumns=buchst?"repeat(6,1fr)":"repeat(3,1fr)";
  pad.style.width=buchst?"360px":"300px";
  tasten.forEach(function(k){
   var b=document.createElement("button");
   b.textContent=k;
   if(buchst){b.style.fontSize="19px";b.style.padding="13px 0";}
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
 function los(){ schliesse(); meinLaden(code); }
 bau();
 clearTimeout(zurueckTimer);zurueckTimer=setTimeout(schliesse,45000);
}

function meinLaden(code){
 return fetch("/api/mein",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({code:code})}).then(function(r){return r.json();}).then(function(d){
  if(!d.ok){ vergessen(); meinCodeAbfrage("Code stimmt nicht"); return; }
  meinCode=code; merken(code); meinD=d; meinZeichnen();
  $("mein").classList.add("auf");
 });
}

function meinZu(){ $("mein").classList.remove("auf"); meinCode=""; laden(); }

function meinZeichnen(){
 var d=meinD;
 var h='<div class="mKopf"><div class="bild">'+bildHtml(d)+'</div>'+
  '<div><div class="nm">'+esc(d.name)+'</div><div class="st">'+
  (d.in?("eingestempelt seit "+esc(d.since)):"nicht eingestempelt")+'</div></div>'+
  '<button class="zu" id="mZu">Fertig</button></div><div class="mBody">';

 h+='<div class="msum"><div><div class="w">'+esc(d.heute||"0:00")+'</div>'+
  '<div class="l">heute</div></div><div><div class="w">'+esc(d.woche||"0:00")+'</div>'+
  '<div class="l">diese Woche</div></div></div>';

 /* eigene Schichten */
 h+='<div class="mH">Meine nächsten Schichten</div>';
 if(!d.schichten.length)h+='<div class="mleer">Für die nächsten vier Wochen ist '+
  'noch nichts eingetragen.</div>';
 h+='<div class="mList">';
 d.schichten.forEach(function(s){
  h+='<button class="msch'+(s.tag===meinHeute()?" heute":"")+(s.offeneMeldung?" wartet":"")+
   '" data-s="'+s.id+'"><div class="bal"></div><div>'+
   '<div class="d1">'+esc(meinTagText(s.tag))+'</div>'+
   '<div class="d2">'+s.von+'–'+s.bis+(s.pause?' · '+s.pause+' min Pause':'')+
   (s.ort?' · '+esc(s.ort):'')+(s.notiz?' · '+esc(s.notiz):'')+'</div></div>'+
   '<div class="re">'+meinStd(s.minuten)+' h'+
   (s.offeneMeldung?'<div style="color:var(--o);font-size:11px">wartet auf Chef</div>':'')+
   '</div></button>';
 });
 h+='</div>';

 /* offene Schichten */
 if(d.offene&&d.offene.length){
  h+='<div class="mH">Frei – wer mag?</div><div class="mList">';
  d.offene.forEach(function(s){
   h+='<button class="msch" data-o="'+s.id+'"><div class="bal" style="background:#8b98b8"></div>'+
    '<div><div class="d1">'+esc(meinTagText(s.tag))+'</div>'+
    '<div class="d2">'+s.von+'–'+s.bis+(s.notiz?' · '+esc(s.notiz):'')+'</div></div>'+
    '<div class="re">'+meinStd(s.minuten)+' h</div></button>';
  });
  h+='</div>';
 }

 /* Mitteilungen - nur am eigenen Handy */
 if(cfg.amHandy&&"Notification" in window&&"serviceWorker" in navigator){
  h+='<div class="mH">Mitteilungen</div>'+
   '<div class="mZeile"><div><div class="t1">Aufs Handy erinnern</div>'+
   '<div class="t2" id="mPushT">Neuer Schichtplan, Erinnerung ans Ausstempeln, '+
   'Antwort vom Chef.</div></div>'+
   '<label class="mSch"><input type="checkbox" id="mPush"><span class="b"></span></label></div>';
 }

 h+='<div style="height:26px"></div></div>';
 $("mein").innerHTML=h;

 $("mZu").onclick=meinZu;
 $("mein").querySelectorAll("[data-s]").forEach(function(b){
  b.onclick=function(){meinSchicht(b.dataset.s);};});
 $("mein").querySelectorAll("[data-o]").forEach(function(b){
  b.onclick=function(){meinUebernehmen(b.dataset.o);};});
 if($("mPush"))meinPushVorbereiten();
}

function meinHeute(){
 var d=new Date();
 return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+
  String(d.getDate()).padStart(2,"0");
}
function meinStd(m){return Math.floor(m/60)+":"+String(m%60).padStart(2,"0");}
function meinTagText(tag){
 var p=tag.split("-").map(Number);
 var dt=new Date(p[0],p[1]-1,p[2]);
 var wd=["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"][dt.getDay()];
 var heute=meinHeute();
 var morgen=new Date();morgen.setDate(morgen.getDate()+1);
 var mk=morgen.getFullYear()+"-"+String(morgen.getMonth()+1).padStart(2,"0")+"-"+
  String(morgen.getDate()).padStart(2,"0");
 var vorn=tag===heute?"Heute":tag===mk?"Morgen":wd;
 return vorn+", "+String(p[2]).padStart(2,"0")+"."+String(p[1]).padStart(2,"0")+".";
}

/* ------------------------ Krankmelden / Tauschen ------------------------- */
function meinSchicht(id){
 var s=meinD.schichten.filter(function(x){return x.id===id;})[0];
 if(!s)return;
 if(s.offeneMeldung){
  meinHinweis("Schon gemeldet","Der Chef hat es auf dem Tisch. Du bekommst Bescheid, "+
   "sobald er entschieden hat.");
  return;
 }
 $("over").innerHTML=
  '<div class="gname" style="font-size:24px">'+esc(meinTagText(s.tag))+'</div>'+
  '<div class="gfrage">'+s.von+'–'+s.bis+(s.ort?' · '+esc(s.ort):'')+'</div>'+
  '<div class="mAkt" style="width:100%;max-width:420px">'+
  '<button class="warn" id="oKrank">Kann nicht<br><span style="font-weight:400;opacity:.7;'+
  'font-size:12px">krank / verhindert</span></button>'+
  '<button id="oTausch">Tauschen<br><span style="font-weight:400;opacity:.7;'+
  'font-size:12px">Kollegen fragen</span></button></div>'+
  '<button class="klein" id="oNein">Zurück</button>';
 $("over").classList.add("auf");
 $("oNein").onclick=schliesse;
 $("oKrank").onclick=function(){meinMeldung("krank",s,null);};
 $("oTausch").onclick=function(){meinTauschWahl(s);};
 clearTimeout(zurueckTimer);zurueckTimer=setTimeout(schliesse,45000);
}

function meinTauschWahl(s){
 var h='<div class="gname" style="font-size:23px">Wer soll übernehmen?</div>'+
  '<div class="gfrage">'+esc(meinTagText(s.tag))+' · '+s.von+'–'+s.bis+'</div>'+
  '<div class="mList" style="width:100%;max-width:420px;margin-top:6px">';
 if(!meinD.kollegen.length)h+='<div class="mleer">Keine Kollegen an diesem Standort.</div>';
 meinD.kollegen.forEach(function(k){
  h+='<button class="msch" data-k="'+k.id+'"><div class="bal"></div>'+
   '<div><div class="d1">'+esc(k.name)+'</div></div></button>';
 });
 h+='</div><button class="klein" id="oNein">Zurück</button>';
 $("over").innerHTML=h;
 $("oNein").onclick=function(){meinSchicht(s.id);};
 $("over").querySelectorAll("[data-k]").forEach(function(b){
  b.onclick=function(){meinMeldung("tausch",s,b.dataset.k);};});
 clearTimeout(zurueckTimer);zurueckTimer=setTimeout(schliesse,45000);
}

function meinMeldung(typ,s,zielId){
 fetch("/api/meldung",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({code:meinCode,typ:typ,schichtId:s.id,zielEmpId:zielId})})
  .then(function(r){return r.json();}).then(function(r){
   if(!r.ok){meinHinweis("Ging nicht",r.fehler||"Bitte später nochmal.");return;}
   meinHinweis(typ==="krank"?"Ist gemeldet":"Anfrage ist raus",
    "Der Chef bekommt es sofort aufs Handy. Bis er zustimmt, bleibt die Schicht bei dir.");
   meinLaden(meinCode);
  });
}

function meinUebernehmen(id){
 var s=meinD.offene.filter(function(x){return x.id===id;})[0];
 if(!s)return;
 fetch("/api/meldung",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({code:meinCode,typ:"bewerbung",schichtId:id})})
  .then(function(r){return r.json();}).then(function(r){
   if(!r.ok){meinHinweis("Ging nicht",r.fehler||"Bitte später nochmal.");return;}
   meinHinweis("Gemeldet","Der Chef teilt dir die Schicht zu, wenn es passt.");
   meinLaden(meinCode);
  });
}

function meinHinweis(titel,text){
 $("over").innerHTML='<div class="gname" style="font-size:26px">'+esc(titel)+'</div>'+
  '<div class="gfrage" style="max-width:420px;line-height:1.5">'+esc(text)+'</div>'+
  '<button class="klein" id="oNein">OK</button>';
 $("over").classList.add("auf");
 $("oNein").onclick=schliesse;
 clearTimeout(zurueckTimer);zurueckTimer=setTimeout(schliesse,8000);
}

/* --------------------------- Mitteilungen -------------------------------- */
/*
 * Der Browser bringt alles mit - kein fremder Dienst. Auf dem iPhone geht es
 * nur, wenn die Seite ueber "Teilen -> Zum Home-Bildschirm" abgelegt wurde;
 * das steht dann auch so da, statt dass einfach nichts passiert.
 */
function meinPushVorbereiten(){
 var sch=$("mPush"), txt=$("mPushT");
 var amHome=window.matchMedia("(display-mode: standalone)").matches||
  window.navigator.standalone===true;
 var iOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
 if(iOS&&!amHome){
  sch.disabled=true;
  txt.innerHTML='Dafür diese Seite einmal über <b>Teilen &rarr; Zum Home-Bildschirm</b> '+
   'ablegen und von dort öffnen. Danach kommen die Mitteilungen an.';
  return;
 }
 navigator.serviceWorker.register("/sw.js").then(function(reg){
  return reg.pushManager.getSubscription().then(function(vorhanden){
   sch.checked=!!vorhanden&&Notification.permission==="granted";
   sch.onchange=function(){
    if(sch.checked)meinPushAn(reg,sch,txt);
    else meinPushAus(reg,sch,txt);
   };
  });
 }).catch(function(e){
  sch.disabled=true; txt.textContent="Auf diesem Gerät nicht möglich.";
 });
}

function meinPushAn(reg,sch,txt){
 txt.textContent="Einen Moment …";
 Notification.requestPermission().then(function(erlaubt){
  if(erlaubt!=="granted"){
   sch.checked=false;
   txt.innerHTML='Dein Browser blockiert Mitteilungen. In den Einstellungen '+
    'für diese Seite wieder erlauben.';
   return;
  }
  fetch("/api/push/schluessel").then(function(r){return r.json();}).then(function(k){
   return reg.pushManager.subscribe({userVisibleOnly:true,
    applicationServerKey:meinB64(k.pub)});
  }).then(function(abo){
   return fetch("/api/push/an",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({code:meinCode,abo:abo,geraet:navigator.platform||""})})
    .then(function(r){return r.json();});
  }).then(function(r){
   if(!r.ok){sch.checked=false;txt.textContent=r.fehler||"Hat nicht geklappt.";return;}
   txt.textContent="Ist an. Du bekommst Bescheid, wenn sich etwas ändert.";
   fetch("/api/push/probe",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({code:meinCode})});
  }).catch(function(){ sch.checked=false; txt.textContent="Hat nicht geklappt."; });
 });
}

function meinPushAus(reg,sch,txt){
 reg.pushManager.getSubscription().then(function(abo){
  if(!abo)return;
  fetch("/api/push/aus",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({endpoint:abo.endpoint})});
  return abo.unsubscribe();
 }).then(function(){ txt.textContent="Aus. Du bekommst keine Mitteilungen mehr."; });
}

// Der Schluessel muss dem Browser als Bytes gegeben werden, nicht als Text.
function meinB64(s){
 var b=(s+"=".repeat((4-s.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");
 var roh=atob(b), arr=new Uint8Array(roh.length);
 for(var i=0;i<roh.length;i++)arr[i]=roh.charCodeAt(i);
 return arr;
}
`;

module.exports = { MEIN_CSS, MEIN_JS };
