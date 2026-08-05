"use strict";

/*
 * Kingsley Zeit – Design-System
 * ==============================
 * EINE Quelle fuer das Aussehen aller Seiten: Schrift, Farben (hell/dunkel),
 * Grundbausteine (Knoepfe, Felder, Karten, Schalter, Fenster).
 *
 * Die Schrift (Inter) liegt als Datei neben dem Programm und wird vom Server
 * selbst ausgeliefert - kein fremder Dienst, funktioniert auch ohne Internet.
 * Fehlt die Datei, springt die Systemschrift ein und nichts geht kaputt.
 *
 * Hell/Dunkel: Standard ist die Einstellung des Geraets. Ein Klick auf den
 * Umschalter legt die Wahl im Browser ab (localStorage "zeit-thema").
 */

/* Farbwerte als CSS-Variablen. Die Namen sind ueberall gleich - die Seiten
   kennen nur var(--bg), var(--fl) usw. und muessen nie wissen, ob gerade
   hell oder dunkel ist. */
const TOKENS_CSS = `
@font-face{font-family:"Inter";font-style:normal;font-weight:400 800;
 font-display:swap;src:url("/schrift.woff2") format("woff2");}
:root{
 --o:#EB5A21;--o-weich:rgba(235,90,33,.10);--o-rand:rgba(235,90,33,.35);
 --gruen:#1FA55C;--gruen-weich:rgba(31,165,92,.10);
 --rot:#D93B32;--rot-weich:rgba(217,59,50,.10);
 --gelb:#B7791F;--gelb-weich:rgba(183,121,31,.12);
 --bg:#F4F4F6;--fl:#FFFFFF;--fl2:#F1F2F4;--li:#E5E7EB;--li2:#D6D9DF;
 --txt:#141519;--mut:#6B7280;--schatten:0 1px 2px rgba(16,24,40,.05);
 --deck:rgba(20,21,25,.45);
}
:root[data-thema="dunkel"]{
 --o:#F0602A;--o-weich:rgba(240,96,42,.14);--o-rand:rgba(240,96,42,.45);
 --gruen:#34C071;--gruen-weich:rgba(52,192,113,.12);
 --rot:#F0554B;--rot-weich:rgba(240,85,75,.13);
 --gelb:#E3A343;--gelb-weich:rgba(227,163,67,.13);
 --bg:#0B0D12;--fl:#13161D;--fl2:#1A1E27;--li:#252A36;--li2:#323848;
 --txt:#EEF1F6;--mut:#8B94A6;--schatten:none;
 --deck:rgba(0,0,0,.6);
}
@media (prefers-color-scheme: dark){
 :root:not([data-thema]){
  --o:#F0602A;--o-weich:rgba(240,96,42,.14);--o-rand:rgba(240,96,42,.45);
  --gruen:#34C071;--gruen-weich:rgba(52,192,113,.12);
  --rot:#F0554B;--rot-weich:rgba(240,85,75,.13);
  --gelb:#E3A343;--gelb-weich:rgba(227,163,67,.13);
  --bg:#0B0D12;--fl:#13161D;--fl2:#1A1E27;--li:#252A36;--li2:#323848;
  --txt:#EEF1F6;--mut:#8B94A6;--schatten:none;
  --deck:rgba(0,0,0,.6);
 }
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{margin:0;background:var(--bg);color:var(--txt);font-size:15px;
 font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
 -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
button{font-family:inherit;cursor:pointer;}
input,select,textarea{font-family:inherit;}
`;

/* Kleines Skript, das VOR dem Zeichnen laeuft - sonst blitzt beim Laden kurz
   die falsche Farbe auf. */
const THEMA_JS = `
(function(){
 try{var t=localStorage.getItem("zeit-thema");
  if(t==="hell"||t==="dunkel")document.documentElement.dataset.thema=t;
 }catch(e){}
})();
function themaIst(){
 var t=document.documentElement.dataset.thema;
 if(t)return t;
 return (window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)
  ?"dunkel":"hell";
}
function themaWechsel(){
 var neu=themaIst()==="dunkel"?"hell":"dunkel";
 document.documentElement.dataset.thema=neu;
 try{localStorage.setItem("zeit-thema",neu);}catch(e){}
 document.querySelectorAll("[data-thema-knopf]").forEach(themaKnopfMalen);
}
function themaKnopfMalen(b){
 var d=themaIst()==="dunkel";
 b.innerHTML=d
  ?'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
  :'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
 b.title=d?"Helles Design":"Dunkles Design";
}
`;

/* Grundbausteine - genug fuer Chef-Bereich UND Schichtplan. */
const BASIS_CSS = `
h2{font-size:16px;font-weight:650;margin:0 0 4px;letter-spacing:-.01em;}
h3{font-size:11px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;
 margin:22px 0 10px;font-weight:650;}
.karte{background:var(--fl);border:1px solid var(--li);border-radius:16px;
 padding:18px;margin-bottom:14px;box-shadow:var(--schatten);}
.karte .kopfzeile{display:flex;align-items:center;justify-content:space-between;
 gap:10px;margin-bottom:12px;}
.untertitel{font-size:12.5px;color:var(--mut);line-height:1.55;margin:2px 0 12px;}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;
 background:var(--o);border:1px solid transparent;color:#fff;border-radius:10px;
 padding:10px 16px;font-size:13.5px;font-weight:600;transition:filter .12s;}
.btn:hover{filter:brightness(1.06);}
.btn:active{transform:translateY(1px);}
.btn.g{background:var(--fl2);border-color:var(--li);color:var(--txt);}
.btn.g:hover{filter:none;border-color:var(--li2);}
.btn.rotly{background:var(--rot-weich);border-color:transparent;color:var(--rot);}
.btn.voll{display:flex;width:100%;margin-top:10px;}
.btn.klein{padding:7px 12px;font-size:12.5px;border-radius:9px;}
.mini{background:none;border:1px solid var(--li);color:var(--mut);border-radius:8px;
 padding:5px 10px;font-size:12px;font-weight:550;}
.mini:hover{color:var(--txt);border-color:var(--li2);}
input,select,textarea{background:var(--fl2);border:1px solid var(--li);border-radius:10px;
 color:var(--txt);padding:10px 12px;font-size:14.5px;width:100%;outline:none;
 transition:border-color .12s, box-shadow .12s;}
input:focus,select:focus,textarea:focus{border-color:var(--o);
 box-shadow:0 0 0 3px var(--o-weich);}
input::placeholder{color:var(--mut);opacity:.7;}
label{display:block;font-size:12px;color:var(--mut);margin:12px 0 5px;font-weight:550;}
.reihe{display:flex;gap:9px;align-items:center;}
.reihe>*{flex:1;}
.chips{display:flex;gap:6px;flex-wrap:wrap;}
.chip{background:var(--fl);border:1px solid var(--li);color:var(--mut);
 border-radius:999px;padding:7px 13px;font-size:12.5px;font-weight:600;}
.chip.on{border-color:var(--o);color:var(--o);background:var(--o-weich);}
.ava{width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--fl2);
 border:1.5px solid var(--li2);display:flex;align-items:center;justify-content:center;
 font-weight:700;color:var(--mut);flex:0 0 auto;font-size:14px;}
.ava.da{border-color:var(--gruen);color:var(--gruen);}
.ava img{width:100%;height:100%;object-fit:cover;}
.zeile{display:flex;align-items:center;gap:12px;padding:11px 12px;background:var(--fl);
 border:1px solid var(--li);border-radius:13px;margin-bottom:8px;cursor:pointer;
 transition:border-color .12s;}
.zeile:hover{border-color:var(--li2);}
.zeile .txt{flex:1;min-width:0;}
.zeile .nm{font-weight:600;display:flex;align-items:center;gap:7px;font-size:14.5px;}
.zeile .sub{font-size:12px;color:var(--mut);margin-top:2px;}
.pfeil{color:var(--mut);font-size:17px;flex:0 0 auto;}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.kpi>div{background:var(--fl2);border:1px solid var(--li);border-radius:13px;
 padding:13px 8px;text-align:center;}
.kpi .w{font-size:21px;font-weight:700;letter-spacing:-.02em;
 font-variant-numeric:tabular-nums;}
.kpi .l{font-size:10px;color:var(--mut);margin-top:4px;letter-spacing:.1em;
 text-transform:uppercase;font-weight:600;}
.tw{display:flex;align-items:center;justify-content:space-between;gap:12px;
 padding:11px 0;border-bottom:1px solid var(--li);}
.tw:last-of-type{border-bottom:none;}
.tw .t1{font-size:14px;font-weight:550;}
.tw .t2{font-size:12px;color:var(--mut);margin-top:2px;line-height:1.45;}
.schalter{position:relative;width:44px;height:26px;flex:0 0 auto;}
.schalter input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;}
.schalter .b{position:absolute;inset:0;background:var(--fl2);border:1px solid var(--li2);
 border-radius:999px;transition:.18s;pointer-events:none;}
.schalter .b:after{content:"";position:absolute;width:20px;height:20px;border-radius:50%;
 background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);top:2px;left:2px;transition:.18s;}
:root[data-thema="dunkel"] .schalter .b:after{background:var(--mut);}
@media (prefers-color-scheme: dark){:root:not([data-thema]) .schalter .b:after{background:var(--mut);}}
.schalter input:checked+.b{background:var(--o);border-color:var(--o);}
.schalter input:checked+.b:after{background:#fff;transform:translateX(18px);}
:root[data-thema="dunkel"] .schalter input:checked+.b:after{background:#fff;}
@media (prefers-color-scheme: dark){
 :root:not([data-thema]) .schalter input:checked+.b:after{background:#fff;}}
.code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;
 background:var(--fl2);border:1px solid var(--li);border-radius:9px;padding:10px;
 word-break:break-all;overflow-wrap:anywhere;color:var(--txt);line-height:1.5;}
.hint{font-size:12.5px;color:var(--mut);line-height:1.6;margin-top:10px;
 overflow-wrap:anywhere;}
.leer{color:var(--mut);text-align:center;padding:26px 12px;font-size:13.5px;}
.warn{background:var(--rot);color:#fff;font-size:10px;font-weight:700;border-radius:999px;
 padding:2px 7px;}
.tag-warn{font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;
 letter-spacing:.03em;white-space:nowrap;flex:0 0 auto;}
.tag-offen{background:var(--gruen-weich);color:var(--gruen);}
.tag-auto,.tag-lang{background:var(--gelb-weich);color:var(--gelb);}
.tag-kein-start{background:var(--rot-weich);color:var(--rot);}
.modal{position:fixed;inset:0;background:var(--deck);z-index:60;display:none;
 align-items:flex-end;justify-content:center;backdrop-filter:blur(3px);}
.modal.auf{display:flex;}
.mkarte{background:var(--fl);border:1px solid var(--li);border-radius:20px 20px 0 0;
 padding:20px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;
 overscroll-behavior:contain;}
@media(min-width:600px){.modal{align-items:center;padding:24px;}
 .mkarte{border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.35);}}
.toast{position:fixed;left:50%;bottom:82px;transform:translateX(-50%);background:var(--txt);
 color:var(--bg);border-radius:11px;padding:11px 20px;font-size:13.5px;font-weight:550;
 z-index:90;display:none;box-shadow:0 10px 34px rgba(0,0,0,.3);white-space:nowrap;}
@media(min-width:980px){.toast{bottom:28px;}}
.mitte{text-align:center;}
.thema-knopf{background:var(--fl2);border:1px solid var(--li);color:var(--mut);
 border-radius:9px;width:34px;height:34px;display:inline-flex;align-items:center;
 justify-content:center;flex:0 0 auto;}
.thema-knopf:hover{color:var(--txt);border-color:var(--li2);}
`;

module.exports = { TOKENS_CSS, BASIS_CSS, THEMA_JS };
