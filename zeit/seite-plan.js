"use strict";

/*
 * Kingsley Zeit – Schichtplan
 * ===========================
 * Wird in die Chef-Seite eingesetzt (eigene Datei, damit beides ueberschaubar
 * bleibt) und benutzt deren Helfer: $, esc, api, get, modal, zu, toast.
 *
 * Zwei Bedienarten, EIN Datenmodell:
 *
 *   Am grossen Bildschirm  ein Wochenraster Leute x Tage. Schichten zieht man
 *                          mit der Maus dorthin, wo sie hingehoeren. Aus der
 *                          Leiste oben zieht man eine Vorlage in eine Zelle -
 *                          fertig ist die Schicht.
 *   Am Handy               Tag fuer Tag als Liste, alles mit dem Daumen. Kein
 *                          Ziehen noetig, aber moeglich (langes Antippen).
 *
 * Das Ziehen ist bewusst selbst gebaut (Pointer-Events) statt mit dem
 * HTML5-Drag: nur so funktioniert es mit Maus UND Finger gleich gut.
 */

const PLAN_CSS = `
#tPlan{padding-bottom:40px}
.pkopf{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.pnav{display:flex;align-items:center;gap:4px;background:var(--fl);border:1px solid var(--li);
 border-radius:11px;padding:3px}
.pnav button{background:none;border:0;color:var(--txt);font-size:17px;width:34px;height:32px;
 border-radius:8px;cursor:pointer}
.pnav button:hover{background:rgba(255,255,255,.07)}
.ptitel{font-weight:650;font-size:15px;min-width:150px;text-align:center}
.pspace{flex:1}
.pverBtn{background:var(--o);color:#111;border:0;border-radius:11px;padding:9px 15px;
 font-weight:700;font-size:13.5px;cursor:pointer}
.pverBtn[disabled]{background:var(--fl);color:var(--mut);border:1px solid var(--li);cursor:default}
.pinfo{font-size:12.5px;color:var(--mut);margin:-4px 0 12px}

/* ---- Vorlagenleiste ---- */
.vleiste{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:13px;
 background:var(--fl);border:1px solid var(--li);border-radius:13px;padding:9px}
.vchip{display:flex;align-items:center;gap:7px;background:var(--fl2);border:1px solid var(--li);
 border-radius:10px;padding:7px 11px;font-size:12.5px;cursor:grab;user-select:none;
 touch-action:none}
.vchip:active{cursor:grabbing}
.vpunkt{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.vzeit{color:var(--mut);font-size:11.5px}
.vneu{border-style:dashed;color:var(--mut);cursor:pointer}

/* ---- Wochenraster (grosser Bildschirm) ---- */
.pgitter{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px}
.pg{display:grid;grid-template-columns:142px repeat(7,minmax(100px,1fr));gap:5px;min-width:830px}
/* Der Plan darf breiter sein als der Rest der Seite - eine Woche soll ohne
   Schieben auf den Bildschirm passen. */
@media (min-width:1060px){
 #tPlan{width:calc(100vw - 40px);max-width:1280px;margin-left:50%;transform:translateX(-50%)}
}
.pgk{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;
 padding:0 0 5px 2px}
.pgk.heute{color:var(--o)}
.pgp{display:flex;align-items:center;gap:8px;padding:9px 8px;background:var(--fl);
 border:1px solid var(--li);border-radius:11px;min-height:52px}
.pgp .nm{font-size:13px;font-weight:600;line-height:1.15}
.pgp .st{font-size:11px;color:var(--mut)}
.zelle{background:var(--fl);border:1px solid var(--li);border-radius:11px;min-height:52px;
 padding:4px;display:flex;flex-direction:column;gap:4px}
.zelle.wend{background:rgba(255,255,255,.015)}
.zelle.ziel{outline:2px dashed var(--o);outline-offset:-2px;background:rgba(255,122,26,.09)}
.zelle .plus{opacity:0;font-size:17px;color:var(--mut);text-align:center;line-height:42px;
 cursor:pointer;border-radius:8px}
.zelle:hover .plus{opacity:.5}
.zelle .plus:hover{opacity:1;background:rgba(255,255,255,.05)}
.zoffen{background:rgba(255,122,26,.05);border-color:rgba(255,122,26,.25)}

.sch{border-radius:9px;padding:5px 7px 6px;font-size:12px;line-height:1.25;cursor:grab;
 user-select:none;touch-action:none;border-left:3px solid #EB5A21;background:var(--fl2);
 border-top:1px solid var(--li);border-right:1px solid var(--li);border-bottom:1px solid var(--li)}
.sch:active{cursor:grabbing}
.sch .z{font-weight:650}
.sch .n{color:var(--mut);font-size:11px;margin-top:1px;white-space:nowrap;overflow:hidden;
 text-overflow:ellipsis}
.sch.frei{border-left-color:var(--mut);border-style:dashed}
.sch.neu::after{content:"neu";float:right;font-size:9px;color:var(--o);font-weight:700;
 letter-spacing:.04em}
.sch.zieht{opacity:.35}
.geist{position:fixed;z-index:900;pointer-events:none;opacity:.92;
 box-shadow:0 12px 30px rgba(0,0,0,.5);transform:rotate(-1.5deg)}

/* ---- Tagesliste (Handy) ---- */
.pliste{display:none}
.ptag{background:var(--fl);border:1px solid var(--li);border-radius:14px;padding:12px;
 margin-bottom:10px}
.ptag h4{margin:0 0 9px;font-size:13.5px;display:flex;align-items:center;gap:8px}
.ptag h4 .b{margin-left:auto;font-size:11.5px;color:var(--mut);font-weight:500}
.ptag.heute{border-color:rgba(255,122,26,.45)}
.preihe{display:flex;align-items:center;gap:10px;padding:8px;border-radius:11px;
 background:var(--fl2);border:1px solid var(--li);margin-bottom:7px;cursor:pointer}
.preihe:last-child{margin-bottom:0}
.preihe .bal{width:4px;align-self:stretch;border-radius:3px;background:#EB5A21;flex:0 0 auto}
.preihe .nm{font-size:13.5px;font-weight:600}
.preihe .zt{font-size:12px;color:var(--mut)}
.preihe .re{margin-left:auto;text-align:right;font-size:12px;color:var(--mut)}
.pleer{color:var(--mut);font-size:12.5px;padding:4px 2px}
.pplus{width:100%;background:var(--fl2);border:1px dashed var(--li);color:var(--mut);
 border-radius:11px;padding:10px;font-size:13px;cursor:pointer;margin-top:3px}

/* ---- Meldungen ---- */
.mkarten{margin-top:18px}
.mkart{display:flex;align-items:center;gap:11px;background:var(--fl);border:1px solid var(--li);
 border-left:3px solid var(--o);border-radius:13px;padding:12px;margin-bottom:9px}
.mkart .txt{flex:1;min-width:0}
.mkart .t1{font-size:13.5px;font-weight:600}
.mkart .t2{font-size:12px;color:var(--mut);margin-top:2px}
.mkart .btns{display:flex;gap:6px}
.mini2{background:var(--fl2);border:1px solid var(--li);color:var(--txt);border-radius:9px;
 padding:7px 11px;font-size:12.5px;cursor:pointer}
.mini2.ja{background:var(--o);color:#111;border-color:var(--o);font-weight:650}

/* ---- Formular im Fenster ---- */
.frow{display:flex;gap:9px}
.frow>div{flex:1}
.tagpick{display:flex;gap:5px;flex-wrap:wrap;margin:4px 0 2px}
.tagpick button{flex:1;min-width:38px;background:var(--fl2);border:1px solid var(--li);
 color:var(--mut);border-radius:9px;padding:9px 0;font-size:12.5px;cursor:pointer}
.tagpick button.an{background:var(--o);color:#111;border-color:var(--o);font-weight:700}

@media (max-width:900px){
 .pgitter{display:none}
 .pliste{display:block}
 /* Am Handy steht die Woche in einer eigenen Zeile - sonst bricht sie um. */
 .ptitel{order:-1;width:100%;min-width:0;text-align:left;font-size:16px;white-space:nowrap}
 .pnav{flex:0 0 auto}
 .pverBtn{flex:1;padding:9px 10px;font-size:13px}
 .pkopf{gap:7px}
 .vleiste{padding:7px}
 .vchip{padding:6px 9px;font-size:12px}
}
`;

const PLAN_JS = `
/* --------------------------- Schichtplan -------------------------------- */
var planD=null, pVon=montagVon(new Date()), pOff=0;

function montagVon(d){
 var x=new Date(d); x.setDate(x.getDate()-((x.getDay()+6)%7));
 return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+
  String(x.getDate()).padStart(2,"0");
}
function tPlus(tag,n){
 var p=tag.split("-").map(Number);
 var d=new Date(Date.UTC(p[0],p[1]-1,p[2])); d.setUTCDate(d.getUTCDate()+n);
 return d.toISOString().slice(0,10);
}
function kwVon(tag){
 var p=tag.split("-").map(Number);
 var d=new Date(Date.UTC(p[0],p[1]-1,p[2]));
 d.setUTCDate(d.getUTCDate()+3-((d.getUTCDay()+6)%7));
 var e=new Date(Date.UTC(d.getUTCFullYear(),0,4));
 return 1+Math.round(((d-e)/86400000-3+((e.getUTCDay()+6)%7))/7);
}
function kurzTag(t){return t.slice(8)+"."+t.slice(5,7)+".";}

function planLaden(){
 var bis=tPlus(pVon,6);
 var q="api/chef/plan?von="+pVon+"&bis="+bis+(filterLoc?"&loc="+filterLoc:"");
 return get(q).then(function(d){ planD=d; planZeichnen(); });
}

function planZeichnen(){
 if(!planD)return;
 var d=planD, bis=tPlus(pVon,6), heute=heuteTag();
 var h='<div class="pkopf">'+
  '<div class="pnav"><button id="pPrev">&lsaquo;</button>'+
  '<button id="pHeute" style="width:auto;padding:0 11px;font-size:12.5px">Heute</button>'+
  '<button id="pNext">&rsaquo;</button></div>'+
  '<div class="ptitel">KW '+kwVon(pVon)+' &middot; '+kurzTag(pVon)+'–'+kurzTag(bis)+'</div>'+
  '<div class="pspace"></div>'+
  '<button class="pverBtn" id="pVer"'+(d.unveroeffentlicht?"":" disabled")+'>'+
  (d.unveroeffentlicht?"Veröffentlichen ("+d.unveroeffentlicht+")":"Alles veröffentlicht")+
  '</button></div>';

 h+='<div class="pinfo">'+d.schichten.length+' Schichten'+
  (d.offen?' &middot; <b style="color:var(--o)">'+d.offen+' unbesetzt</b>':'')+
  (d.unveroeffentlicht?' &middot; '+d.unveroeffentlicht+' noch nicht sichtbar für die Mitarbeiter':
   ' &middot; alle sichtbar')+'</div>';

 /* Vorlagenleiste */
 h+='<div class="vleiste" id="vleiste">';
 d.vorlagen.forEach(function(v){
  h+='<div class="vchip" data-vor="'+v.id+'" title="In eine Zelle ziehen">'+
   '<span class="vpunkt" style="background:'+esc(v.farbe)+'"></span>'+
   '<span>'+esc(v.name)+'</span><span class="vzeit">'+v.von+'–'+v.bis+'</span></div>';
 });
 h+='<div class="vchip vneu" id="vNeu">+ Schichtart</div>';
 if(!d.vorlagen.length)h+='<span style="font-size:12px;color:var(--mut);margin-left:4px">'+
  'Lege deine Standardschichten an – danach genügt Ziehen.</span>';
 h+='</div>';

 /* Raster */
 h+='<div class="pgitter"><div class="pg">';
 h+='<div class="pgk"></div>';
 d.tage.forEach(function(t){
  h+='<div class="pgk'+(t.tag===heute?" heute":"")+'">'+esc(t.label)+'</div>';
 });
 // Zeile "unbesetzt"
 h+='<div class="pgp" style="background:rgba(255,122,26,.05)">'+
  '<div><div class="nm">Unbesetzt</div><div class="st">zieh jemanden drauf</div></div></div>';
 d.tage.forEach(function(t){
  h+='<div class="zelle zoffen" data-tag="'+t.tag+'" data-emp="">'+
   schichtenIn(null,t.tag)+'<div class="plus" data-neu="'+t.tag+'" data-nemp="">+</div></div>';
 });
 d.leute.forEach(function(p){
  h+='<div class="pgp">'+avaHtml(p,false)+'<div><div class="nm">'+esc(p.name)+'</div>'+
   '<div class="st">'+std(p.stunden)+' h geplant</div></div></div>';
  d.tage.forEach(function(t){
   h+='<div class="zelle'+(t.wd>5?" wend":"")+'" data-tag="'+t.tag+'" data-emp="'+p.id+'">'+
    schichtenIn(p.id,t.tag)+
    '<div class="plus" data-neu="'+t.tag+'" data-nemp="'+p.id+'">+</div></div>';
  });
 });
 h+='</div></div>';

 /* Tagesliste fürs Handy */
 h+='<div class="pliste">';
 d.tage.forEach(function(t){
  var liste=d.schichten.filter(function(s){return s.tag===t.tag;});
  h+='<div class="ptag'+(t.tag===heute?" heute":"")+'"><h4>'+esc(t.label)+
   (t.tag===heute?' <span style="color:var(--o);font-size:11px">heute</span>':'')+
   '<span class="b">'+liste.length+(liste.length===1?" Schicht":" Schichten")+'</span></h4>';
  if(!liste.length)h+='<div class="pleer">Niemand eingeteilt.</div>';
  liste.forEach(function(s){
   var far=farbeVon(s);
   h+='<div class="preihe" data-sch="'+s.id+'">'+
    '<div class="bal" style="background:'+esc(far)+'"></div>'+
    '<div style="min-width:0"><div class="nm">'+esc(s.name||"Unbesetzt")+'</div>'+
    '<div class="zt">'+s.von+'–'+s.bis+(s.pause?' · '+s.pause+' min Pause':'')+'</div></div>'+
    '<div class="re">'+std(s.minuten)+' h'+
    (s.veroeffentlicht?'':'<div style="color:var(--o);font-size:10.5px">nicht sichtbar</div>')+
    '</div></div>';
  });
  h+='<button class="pplus" data-neu="'+t.tag+'" data-nemp="">+ Schicht am '+
   esc(t.label)+'</button></div>';
 });
 h+='</div>';

 /* Offene Meldungen */
 if(d.meldungen&&d.meldungen.length){
  h+='<div class="mkarten"><h2 style="font-size:15px;margin:0 0 10px">Zu entscheiden</h2>';
  d.meldungen.forEach(function(m){
   h+='<div class="mkart">'+avaHtml({name:m.name,photo:m.foto},false)+
    '<div class="txt"><div class="t1">'+esc(m.name)+' &middot; '+esc(m.typText)+'</div>'+
    '<div class="t2">'+(m.schicht?esc(m.schicht.label2):"ohne Schicht")+
    (m.zielName?' &rarr; '+esc(m.zielName):'')+
    (m.text?' &middot; '+esc(m.text):'')+'</div></div>'+
    '<div class="btns"><button class="mini2 ja" data-mja="'+m.id+'">Passt</button>'+
    '<button class="mini2" data-mnein="'+m.id+'">Nein</button></div></div>';
  });
  h+='</div>';
 }

 $("tPlan").innerHTML=h;
 planBinden();
}

function farbeVon(s){
 if(!s.empId)return "#7b8494";
 var v=planD.vorlagen.filter(function(x){return x.id===s.vorlageId;})[0];
 return v?v.farbe:"#EB5A21";
}
function schichtenIn(empId,tag){
 var liste=planD.schichten.filter(function(s){
  return s.tag===tag && (empId?s.empId===empId:!s.empId);});
 return liste.map(function(s){
  return '<div class="sch'+(s.empId?"":" frei")+(s.veroeffentlicht?"":" neu")+
   '" data-sch="'+s.id+'" style="border-left-color:'+esc(farbeVon(s))+'">'+
   '<div class="z">'+s.von+'–'+s.bis+'</div>'+
   '<div class="n">'+std(s.minuten)+' h'+(s.notiz?' · '+esc(s.notiz):'')+'</div></div>';
 }).join("");
}
function heuteTag(){
 var d=new Date();
 return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+
  String(d.getDate()).padStart(2,"0");
}

/* ------------------------- Bedienung verdrahten ------------------------- */
function planBinden(){
 $("pPrev").onclick=function(){pVon=tPlus(pVon,-7);planLaden();};
 $("pNext").onclick=function(){pVon=tPlus(pVon,7);planLaden();};
 $("pHeute").onclick=function(){pVon=montagVon(new Date());planLaden();};
 $("pVer").onclick=veroeffentlichen;
 $("vNeu").onclick=function(){vorlageFenster(null);};

 document.querySelectorAll("#tPlan [data-neu]").forEach(function(b){
  b.onclick=function(e){e.stopPropagation();
   schichtFenster(null,{tag:b.dataset.neu,empId:b.dataset.nemp||""});};
 });
 document.querySelectorAll("#tPlan [data-mja]").forEach(function(b){
  b.onclick=function(){meldung(b.dataset.mja,true);};});
 document.querySelectorAll("#tPlan [data-mnein]").forEach(function(b){
  b.onclick=function(){meldung(b.dataset.mnein,false);};});
 document.querySelectorAll("#tPlan .preihe").forEach(function(r){
  r.onclick=function(){schichtFenster(r.dataset.sch);};});
 document.querySelectorAll("#tPlan .vchip[data-vor]").forEach(function(c){
  c.ondblclick=function(){vorlageFenster(c.dataset.vor);};
  ziehbar(c,{typ:"vorlage",id:c.dataset.vor});});
 document.querySelectorAll("#tPlan .pg .sch").forEach(function(c){
  ziehbar(c,{typ:"schicht",id:c.dataset.sch});});
}

/* ---------------------------- Ziehen & Ablegen --------------------------- */
/*
 * Selbst gebaut, damit Maus und Finger gleich funktionieren. Ein Zug beginnt
 * erst nach 6 Pixeln Bewegung (Maus) bzw. nach langem Antippen (Finger) -
 * so bleibt ein normaler Klick ein Klick und die Seite laesst sich scrollen.
 */
var zug=null;
function ziehbar(el,quelle){
 el.addEventListener("pointerdown",function(e){
  if(e.button!==undefined&&e.button!==0)return;
  var start={x:e.clientX,y:e.clientY},los=false,halten=null;
  var beruehrung=e.pointerType==="touch";
  if(beruehrung)halten=setTimeout(function(){starten();},260);

  function starten(){
   if(los)return; los=true;
   if(halten){clearTimeout(halten);halten=null;}
   var r=el.getBoundingClientRect();
   var g=el.cloneNode(true);
   g.className=el.className+" geist";
   g.style.width=r.width+"px"; g.style.left=r.left+"px"; g.style.top=r.top+"px";
   document.body.appendChild(g);
   el.classList.add("zieht");
   zug={quelle:quelle,geist:g,dx:e.clientX-r.left,dy:e.clientY-r.top,ziel:null};
   if(navigator.vibrate)navigator.vibrate(8);
  }
  function bewegen(ev){
   if(!los){
    if(Math.abs(ev.clientX-start.x)+Math.abs(ev.clientY-start.y)<6)return;
    if(beruehrung){if(halten){clearTimeout(halten);halten=null;}return;}
    starten();
   }
   ev.preventDefault();
   zug.geist.style.left=(ev.clientX-zug.dx)+"px";
   zug.geist.style.top=(ev.clientY-zug.dy)+"px";
   var unter=document.elementFromPoint(ev.clientX,ev.clientY);
   var z=unter?unter.closest(".zelle"):null;
   if(z!==zug.ziel){
    if(zug.ziel)zug.ziel.classList.remove("ziel");
    zug.ziel=z; if(z)z.classList.add("ziel");
   }
  }
  function loslassen(ev){
   document.removeEventListener("pointermove",bewegen);
   document.removeEventListener("pointerup",loslassen);
   document.removeEventListener("pointercancel",loslassen);
   if(halten){clearTimeout(halten);halten=null;}
   if(!los){
    // war doch nur ein Klick
    if(quelle.typ==="schicht")schichtFenster(quelle.id);
    return;
   }
   var ziel=zug.ziel;
   if(zug.ziel)zug.ziel.classList.remove("ziel");
   zug.geist.remove(); el.classList.remove("zieht"); zug=null;
   if(!ziel)return;
   ablegen(quelle,ziel.dataset.tag,ziel.dataset.emp||null);
  }
  document.addEventListener("pointermove",bewegen,{passive:false});
  document.addEventListener("pointerup",loslassen);
  document.addEventListener("pointercancel",loslassen);
 });
}

function ablegen(quelle,tag,empId){
 if(quelle.typ==="vorlage"){
  api("api/chef/schicht",{tag:tag,empId:empId||null,vorlageId:quelle.id,
   locId:filterLoc||null}).then(function(r){
   if(!r.ok){toast(r.fehler||"Ging nicht");return;}
   toast("Schicht angelegt");planLaden();});
  return;
 }
 var s=planD.schichten.filter(function(x){return x.id===quelle.id;})[0];
 if(!s)return;
 if(s.tag===tag&&(s.empId||"")===(empId||"")){return;}
 api("api/chef/schicht",{id:s.id,tag:tag,empId:empId||null,von:s.von,bis:s.bis,
  pause:s.pause,notiz:s.notiz,vorlageId:s.vorlageId,locId:s.locId}).then(function(r){
  if(!r.ok){toast(r.fehler||"Ging nicht");return;}
  planLaden();});
}

/* ----------------------------- Schicht-Fenster --------------------------- */
function schichtFenster(id,vorgabe){
 var s=id?planD.schichten.filter(function(x){return x.id===id;})[0]:null;
 var v=vorgabe||{};
 var tag=s?s.tag:(v.tag||pVon);
 var empId=s?(s.empId||""):(v.empId||"");
 var von=s?s.von:"09:00", bis=s?s.bis:"17:00", pause=s?s.pause:0;
 var leute=planD.alleLeute.filter(function(p){return !filterLoc||p.locId===filterLoc;});
 var h='<h3 style="margin-top:0">'+(s?"Schicht ändern":"Neue Schicht")+'</h3>';
 h+='<label>Wer</label><select id="fEmp"><option value="">– unbesetzt (offene Schicht) –</option>';
 leute.forEach(function(p){h+='<option value="'+p.id+'"'+(p.id===empId?" selected":"")+
  '>'+esc(p.name)+'</option>';});
 h+='</select>';
 if(planD.vorlagen.length){
  h+='<label>Schichtart übernehmen</label><select id="fVor">'+
   '<option value="">– eigene Zeiten –</option>';
  planD.vorlagen.forEach(function(x){h+='<option value="'+x.id+'"'+
   (s&&s.vorlageId===x.id?" selected":"")+'>'+esc(x.name)+' ('+x.von+'–'+x.bis+')</option>';});
  h+='</select>';
 }
 h+='<label>Tag</label><input type="date" id="fTag" value="'+tag+'">';
 h+='<div class="frow"><div><label>Von</label><input type="time" id="fVon" value="'+von+'"></div>'+
  '<div><label>Bis</label><input type="time" id="fBis" value="'+bis+'"></div>'+
  '<div><label>Pause</label><input type="number" id="fPause" min="0" max="240" value="'+pause+'"></div></div>';
 h+='<label>Notiz (sieht der Mitarbeiter)</label>'+
  '<input id="fNotiz" maxlength="200" value="'+esc(s?s.notiz:"")+'" placeholder="z. B. Lieferung annehmen">';
 if(!s){
  h+='<div class="tw" style="margin-top:12px"><div><div>Jede Woche wiederholen</div>'+
   '<div style="font-size:12px;color:var(--mut);margin-top:3px">läuft automatisch weiter</div></div>'+
   '<label class="schalter"><input type="checkbox" id="fWdh"><span class="b"></span></label></div>'+
   '<div id="fWdhBox" style="display:none"><label>An diesen Tagen</label>'+
   '<div class="tagpick" id="fTage"></div></div>';
 }
 h+='<div class="reihe" style="margin-top:14px">'+
  '<button class="btn" id="fSave">'+(s?"Speichern":"Anlegen")+'</button>'+
  '<button class="btn g" onclick="zu()">Abbrechen</button></div>';
 if(s){
  h+='<button class="btn voll g" id="fWeg" style="margin-top:8px;color:var(--rot)">Schicht löschen</button>';
  if(s.serieId)h+='<button class="btn voll g" id="fSerieWeg" style="margin-top:6px;color:var(--rot)">'+
   'Ganze Serie ab heute löschen</button>';
 }
 modal(h);

 if($("fVor"))$("fVor").onchange=function(){
  var x=planD.vorlagen.filter(function(y){return y.id===$("fVor").value;})[0];
  if(x){$("fVon").value=x.von;$("fBis").value=x.bis;$("fPause").value=x.pause;}
 };
 if($("fWdh")){
  var gewaehlt={};
  gewaehlt[wdVon(tag)]=true;
  var mal=["Mo","Di","Mi","Do","Fr","Sa","So"];
  var zeichneTage=function(){
   $("fTage").innerHTML=mal.map(function(n,i){
    return '<button type="button" data-wd="'+(i+1)+'"'+
     (gewaehlt[i+1]?' class="an"':'')+'>'+n+'</button>';}).join("");
   $("fTage").querySelectorAll("button").forEach(function(b){
    b.onclick=function(){var k=b.dataset.wd;
     if(gewaehlt[k])delete gewaehlt[k];else gewaehlt[k]=true;zeichneTage();};});
  };
  zeichneTage();
  $("fWdh").onchange=function(){
   $("fWdhBox").style.display=$("fWdh").checked?"block":"none";};
  $("fTag").onchange=function(){
   if(!$("fWdh").checked){gewaehlt={};gewaehlt[wdVon($("fTag").value)]=true;zeichneTage();}};
  window._planTage=function(){return Object.keys(gewaehlt).map(Number);};
 }

 $("fSave").onclick=function(){
  var b={empId:$("fEmp").value||null,tag:$("fTag").value,von:$("fVon").value,
   bis:$("fBis").value,pause:Number($("fPause").value)||0,notiz:$("fNotiz").value,
   vorlageId:($("fVor")?$("fVor").value:"")||null,locId:filterLoc||null};
  if(s)b.id=s.id;
  if(!s&&$("fWdh")&&$("fWdh").checked){
   api("api/chef/serie",{empId:b.empId,locId:b.locId,wochentage:window._planTage(),
    von:b.von,bis:b.bis,pause:b.pause,vorlageId:b.vorlageId,notiz:b.notiz,
    startTag:b.tag}).then(function(r){
    if(!r.ok){toast(r.fehler||"Ging nicht");return;}
    zu();toast(r.angelegt+" Schichten angelegt");planLaden();});
   return;
  }
  api("api/chef/schicht",b).then(function(r){
   if(!r.ok){toast(r.fehler||"Ging nicht");return;}
   zu();toast(s?"Gespeichert":"Angelegt");planLaden();});
 };
 if($("fWeg"))$("fWeg").onclick=function(){
  api("api/chef/schicht-weg",{id:s.id}).then(function(){zu();toast("Gelöscht");planLaden();});};
 if($("fSerieWeg"))$("fSerieWeg").onclick=function(){
  if(!confirm("Alle künftigen Schichten dieser Serie löschen?"))return;
  api("api/chef/schicht-weg",{id:s.id,serie:true}).then(function(r){
   zu();toast(r.anzahl+" Schichten gelöscht");planLaden();});};
}
function wdVon(tag){
 var p=tag.split("-").map(Number);
 return ((new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay()+6)%7)+1;
}

/* ---------------------------- Schichtarten ------------------------------- */
function vorlageFenster(id){
 var v=id?planD.vorlagen.filter(function(x){return x.id===id;})[0]:null;
 var farben=["#EB5A21","#3b82f6","#22c55e","#a855f7","#ef4444","#eab308","#14b8a6"];
 var h='<h3 style="margin-top:0">'+(v?"Schichtart ändern":"Neue Schichtart")+'</h3>'+
  '<label>Name</label><input id="wName" maxlength="24" value="'+esc(v?v.name:"")+
  '" placeholder="Früh, Spät, Wochenende …">'+
  '<div class="frow"><div><label>Von</label><input type="time" id="wVon" value="'+
  (v?v.von:"09:00")+'"></div><div><label>Bis</label><input type="time" id="wBis" value="'+
  (v?v.bis:"17:00")+'"></div><div><label>Pause</label><input type="number" id="wPause" '+
  'min="0" max="240" value="'+(v?v.pause:30)+'"></div></div>'+
  '<label>Farbe</label><div class="tagpick" id="wFarben">';
 farben.forEach(function(f){
  h+='<button type="button" data-f="'+f+'" style="background:'+f+
   ';border-color:'+f+';height:34px'+((v&&v.farbe===f)||(!v&&f==="#EB5A21")?
   ';outline:2px solid #fff;outline-offset:2px':'')+'"></button>';});
 h+='</div><div class="reihe" style="margin-top:14px">'+
  '<button class="btn" id="wSave">Speichern</button>'+
  '<button class="btn g" onclick="zu()">Abbrechen</button></div>';
 if(v)h+='<button class="btn voll g" id="wWeg" style="margin-top:8px;color:var(--rot)">Löschen</button>';
 h+='<div class="hint">Schichtarten sind deine Standardschichten. Am Rechner ziehst '+
  'du sie einfach in den Plan, am Handy wählst du sie aus.</div>';
 modal(h);
 var gewaehlt=v?v.farbe:"#EB5A21";
 $("wFarben").querySelectorAll("button").forEach(function(b){
  b.onclick=function(){
   gewaehlt=b.dataset.f;
   $("wFarben").querySelectorAll("button").forEach(function(x){x.style.outline="none";});
   b.style.outline="2px solid #fff";b.style.outlineOffset="2px";};});
 $("wSave").onclick=function(){
  if(!$("wName").value.trim()){toast("Name fehlt");return;}
  api("api/chef/vorlage",{id:v?v.id:null,name:$("wName").value,von:$("wVon").value,
   bis:$("wBis").value,pause:Number($("wPause").value)||0,farbe:gewaehlt,
   locId:filterLoc||null}).then(function(){zu();toast("Gespeichert");planLaden();});};
 if($("wWeg"))$("wWeg").onclick=function(){
  api("api/chef/vorlage-weg",{id:v.id}).then(function(){zu();toast("Gelöscht");planLaden();});};
}

/* --------------------------- Veröffentlichen ----------------------------- */
function veroeffentlichen(){
 var bis=tPlus(pVon,6);
 if(!confirm("Diese Woche für alle sichtbar machen?\\n\\n"+
  planD.unveroeffentlicht+" Schichten werden veröffentlicht.\\n"+
  "Betroffene Mitarbeiter bekommen eine Mitteilung aufs Handy."))return;
 api("api/chef/veroeffentlichen",{von:pVon,bis:bis}).then(function(r){
  if(!r.ok){toast(r.fehler||"Ging nicht");return;}
  toast(r.anzahl+" Schichten sind jetzt sichtbar");planLaden();});
}
function meldung(id,ja){
 api("api/chef/meldung",{id:id,ja:ja}).then(function(r){
  if(!r.ok){toast(r.fehler||"Ging nicht");return;}
  toast(ja?"Erledigt":"Abgelehnt");planLaden();laden();});
}
`;

module.exports = { PLAN_CSS, PLAN_JS };
