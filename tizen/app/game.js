/*
 * Kingsley Invaders – Anzeige-Seite (Stufe 1)
 * ============================================
 * Laeuft im Signage-Widget. Das Handy ist der Controller; die Eingaben
 * kommen als "game-input"-Nachrichten ueber den Haupt-WebSocket herein
 * (nativeplayer.js reicht alle "game-*"-Nachrichten an MB_GAME weiter).
 *
 * Ablauf:
 *   game-invite  -> Banner + QR ueber dem laufenden Video (Video laeuft weiter)
 *   game-claimed -> "Verbunden, mach dich bereit"
 *   game-start   -> Video anhalten, Countdown, Spiel laeuft
 *   game-input   -> Zielposition (0..1) + Feuer
 *   game-over    -> Ergebnis melden + anzeigen, danach Video weiter
 *   game-end     -> sofort aufraeumen, Video weiter
 */
(function (global) {
  "use strict";

  var ORANGE = "#EB5A21";
  var W = 540, H = 960;              // interne Spielaufloesung (9:16)

  var layer = null, stage = null, cv = null, cx = null;
  var banner = null, overUi = null, hud = null;
  var mode = "idle";                 // idle | invite | claimed | countdown | running | mirror | over
  var player = { name: "", img: "" , imEl: null };
  var net = { x: 0.5, fire: false, lastInput: 0 };
  var raf = 0, videoPaused = false;
  var G = {}, stars = [];
  // Handy-Modus: die letzten beiden Spielstaende vom Handy. Das Display
  // rendert ~110 ms in der Vergangenheit und interpoliert dazwischen -
  // dadurch laeuft der Spiegel butterweich mit 60 fps statt mit der
  // Funk-Taktung des Handys zu ruckeln.
  var snapA = null, snapB = null;    // { t: Ankunftszeit, s: Spielstand }
  var MIRROR_DELAY = 110;
  // Gewinnstufen (vom Server, aufsteigend sortiert): { points, name, img }
  var prizes = [], prizeReached = 0, prizeEls = null;
  // Schwierigkeit (vom Server): Faktoren fuer Tempo, Spawn-Takt, Beschuss
  var DIFF = { spd: 1, rate: 1, shoot: 1 };
  function applyDifficulty(d) {
    if (d === "leicht") DIFF = { spd: .8, rate: 1.35, shoot: .6 };
    else if (d === "schwer") DIFF = { spd: 1.25, rate: .75, shoot: 1.5 };
    else DIFF = { spd: 1, rate: 1, shoot: 1 };
  }

  // Austauschbare Grafiken (Stufe 2): PNG/JPG als URL oder data-URL.
  // Schluessel: ship, enemy (leicht), enemy2 (schwer), bonus, bullet.
  var SKIN = {};
  function setSkin(map) {
    map = map || {};
    for (var k in map) {
      if (!map.hasOwnProperty(k)) continue;
      if (map[k]) {
        var im = new Image();
        im.src = map[k];
        SKIN[k] = im;
      } else delete SKIN[k];
    }
  }
  function skinReady(k) {
    return SKIN[k] && SKIN[k].complete && SKIN[k].naturalWidth > 0;
  }

  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }
  function el(tag, css, parent) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (parent) parent.appendChild(d);
    return d;
  }

  /* ============================================ Aufbau der Ebenen */

  function ensureLayer() {
    if (layer) return;
    layer = el("div",
      "position:fixed;top:0;left:0;width:100%;height:100%;z-index:7;display:none;" +
      "font-family:'Samsung One',Arial,Helvetica,sans-serif;", document.body);

    // Banner (Einladung): faehrt von oben herein, Video laeuft darunter weiter.
    banner = el("div",
      "position:absolute;top:0;left:50%;-webkit-transform:translate(-50%,-105%);transform:translate(-50%,-105%);" +
      "-webkit-transition:-webkit-transform .7s ease;transition:transform .7s ease;" +
      "background:rgba(5,7,12,.94);border:1px solid rgba(235,90,33,.55);border-top:none;" +
      "border-radius:0 0 2.4vw 2.4vw;padding:3.4vh 4vw 3vh;text-align:center;color:#dfe8f2;" +
      "box-shadow:0 12px 60px rgba(0,0,0,.65);max-width:82%;", layer);

    // Spiel-Buehne: schwarzer Vollbildhintergrund + 9:16-Canvas mittig.
    stage = el("div",
      "position:absolute;top:0;left:0;width:100%;height:100%;background:#05070c;display:none;", layer);
    cv = el("canvas", "position:absolute;top:50%;left:50%;" +
      "-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%);", stage);
    cv.width = W; cv.height = H;
    cx = cv.getContext("2d");
    fitCanvas();
    safe(function () { global.addEventListener("resize", fitCanvas); });

    // HUD (Name, Foto, Punkte, Leben) als DOM ueber dem Canvas.
    hud = el("div",
      "position:absolute;top:2vh;left:50%;-webkit-transform:translateX(-50%);transform:translateX(-50%);" +
      "width:92%;max-width:60vh;display:none;color:#dfe8f2;", stage);

    overUi = el("div",
      "position:absolute;top:0;left:0;width:100%;height:100%;display:none;" +
      "background:rgba(5,7,12,.92);text-align:center;color:#dfe8f2;", stage);

    for (var i = 0; i < 70; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H,
                   s: Math.random() * 1.6 + .4, v: Math.random() * .8 + .3 });
    }
  }

  function fitCanvas() {
    if (!cv) return;
    var vw = global.innerWidth || 1080, vh = global.innerHeight || 1920;
    var s = Math.min(vw / W, vh / H);
    cv.style.width = Math.round(W * s) + "px";
    cv.style.height = Math.round(H * s) + "px";
  }

  /* ============================================ Banner + QR */

  function showInvite(code, joinUrl, logoUrl, prizeList) {
    ensureLayer();
    // Falls direkt nach einer Runde die naechste startet: Video sofort weiter.
    if (videoPaused) {
      videoPaused = false;
      safe(function () { if (global.MB_NATIVE) global.MB_NATIVE.gameResume(); });
    }
    mode = "invite";
    layer.style.display = "block";
    stage.style.display = "none";
    overUi.style.display = "none";
    var qr = "https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=2" +
             "&color=05070c&bgcolor=ffffff&data=" + encodeURIComponent(joinUrl);
    banner.innerHTML =
      (logoUrl ? '<img src="' + logoUrl + '" alt="" style="max-width:22vh;max-height:9vh;' +
        'object-fit:contain;margin-bottom:1.6vh;" onerror="this.style.display=\'none\'">' : '') +
      '<div style="font-size:2.6vh;font-weight:700;letter-spacing:.32em;text-indent:.32em;color:' + ORANGE + ';">GEWINN-RUNDE</div>' +
      '<div style="font-size:4vh;font-weight:700;letter-spacing:.12em;margin:1.2vh 0 .6vh;">JETZT SCHNELL SEIN!</div>' +
      '<div style="font-size:2.1vh;opacity:.75;letter-spacing:.14em;margin-bottom:2.4vh;">WER ZUERST SCANNT, DER SPIELT</div>' +
      prizeTeaser(prizeList) +
      '<div style="background:#fff;border-radius:1.6vw;padding:1.4vh;display:inline-block;">' +
        '<img src="' + qr + '" alt="" style="width:26vh;height:26vh;display:block;" ' +
        'onerror="this.parentNode.style.display=\'none\'">' +
      '</div>' +
      '<div style="font-size:1.8vh;opacity:.55;margin-top:1.8vh;letter-spacing:.1em;">CODE ' +
        '<span style="color:' + ORANGE + ';font-weight:700;">' + code + '</span></div>' +
      '<div style="font-size:1.1vh;opacity:.3;letter-spacing:.2em;margin-top:1.6vh;">developed by Luca Kingsley</div>';
    // hereinfahren
    setTimeout(function () {
      banner.style.webkitTransform = "translate(-50%,0)";
      banner.style.transform = "translate(-50%,0)";
    }, 40);
  }

  // Kleine Gewinn-Vorschau auf dem Einladungs-Banner
  function prizeTeaser(list) {
    if (!list || !list.length) return "";
    var h = '<div style="display:-webkit-box;display:flex;-webkit-box-pack:center;' +
      'justify-content:center;gap:2.2vh;margin-bottom:2.2vh;">';
    for (var i = 0; i < list.length; i++) {
      h += '<div style="text-align:center;">' +
        '<div style="width:5.6vh;height:5.6vh;border-radius:50%;border:2px solid rgba(235,90,33,.6);' +
        'background:#0d1320;overflow:hidden;margin:0 auto .6vh;display:-webkit-box;display:flex;' +
        '-webkit-box-pack:center;justify-content:center;-webkit-box-align:center;align-items:center;">' +
        (list[i].img
          ? '<img src="' + list[i].img + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'">'
          : '<span style="font-size:2.2vh;font-weight:700;color:#8b98b8;">' + list[i].name.charAt(0).toUpperCase() + '</span>') +
        '</div>' +
        '<div style="font-size:1.4vh;letter-spacing:.06em;">' + list[i].name + '</div>' +
        '<div style="font-size:1.2vh;opacity:.5;">ab ' + list[i].points + '</div></div>';
    }
    return h + '</div>';
  }

  function showClaimed() {
    if (!banner) return;
    mode = "claimed";
    banner.innerHTML =
      '<div style="font-size:3.4vh;font-weight:700;letter-spacing:.2em;color:' + ORANGE + ';margin-bottom:1vh;">VERBUNDEN!</div>' +
      '<div style="font-size:2.2vh;opacity:.8;letter-spacing:.14em;">MACH DICH AM HANDY BEREIT …</div>';
  }

  function hideBanner() {
    if (!banner) return;
    banner.style.webkitTransform = "translate(-50%,-105%)";
    banner.style.transform = "translate(-50%,-105%)";
  }

  /* ============================================ Spielzustand */

  function reset() {
    G = { run: false, score: 0, lives: 3, px: W / 2, t: 0, wave: 0, waveAt: 0, shake: 0,
          bullets: [], ebullets: [], foes: [], parts: [], pows: [],
          lastFire: 0, lastSpawn: 0, combo: 0, comboAt: 0, mult: 1,
          rapidUntil: 0, spreadUntil: 0, shield: false };
  }

  function buildHud() {
    hud.innerHTML = "";
    hud.style.display = "block";
    var row = el("div", "display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;" +
      "-webkit-box-pack:justify;justify-content:space-between;", hud);
    var left = el("div", "display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;", row);
    if (player.img) {
      var im = el("img", "width:5.4vh;height:5.4vh;border-radius:50%;border:2px solid " + ORANGE + ";" +
        "margin-right:1.4vh;object-fit:cover;", left);
      im.src = player.img;
    }
    var col = el("div", "", left);
    el("div", "font-size:2vh;font-weight:600;letter-spacing:.1em;opacity:.85;", col).textContent = player.name || "SPIELER";
    var sc = el("div", "font-size:3.2vh;font-weight:700;color:" + ORANGE + ";", col);
    sc.id = "ksScore"; sc.textContent = "0";
    var cb = el("div", "font-size:1.8vh;font-weight:600;color:#8cbeff;min-height:2.2vh;", col);
    cb.id = "ksCombo";
    var lv = el("div", "font-size:2.6vh;color:" + ORANGE + ";letter-spacing:.12em;", row);
    lv.id = "ksLives"; lv.textContent = "♥♥♥";
    buildPrizeBar();
  }

  /* Gewinn-Leiste: fuellt sich mit den Punkten, Stufen-Bilder als Marker. */
  function buildPrizeBar() {
    prizeReached = 0; prizeEls = null;
    if (!prizes.length) return;
    var max = prizes[prizes.length - 1].points;
    var wrap = el("div", "margin-top:3.6vh;position:relative;", hud);
    var bar = el("div", "height:1.3vh;background:rgba(255,255,255,.09);" +
      "border-radius:1vh;overflow:hidden;", wrap);
    var fill = el("div", "height:100%;width:0%;background:-webkit-linear-gradient(left," +
      ORANGE + ",#ffb37a);background:linear-gradient(90deg," + ORANGE + ",#ffb37a);" +
      "border-radius:1vh;-webkit-transition:width .4s;transition:width .4s;", bar);
    var marks = [];
    for (var i = 0; i < prizes.length; i++) {
      var pct = Math.max(4, Math.min(96, prizes[i].points / max * 100));
      var m = el("div", "position:absolute;top:-4.6vh;left:" + pct + "%;" +
        "-webkit-transform:translateX(-50%);transform:translateX(-50%);text-align:center;", wrap);
      var box = el("div", "width:4.4vh;height:4.4vh;border-radius:50%;margin:0 auto;" +
        "border:2px solid rgba(255,255,255,.35);background:#0d1320;overflow:hidden;" +
        "display:-webkit-box;display:flex;-webkit-box-pack:center;justify-content:center;" +
        "-webkit-box-align:center;align-items:center;", m);
      if (prizes[i].img) {
        var im = el("img", "width:100%;height:100%;object-fit:cover;", box);
        im.src = prizes[i].img;
      } else {
        el("div", "font-size:1.7vh;font-weight:700;color:#8b98b8;", box)
          .textContent = prizes[i].name.charAt(0).toUpperCase();
      }
      el("div", "font-size:1.2vh;opacity:.55;margin-top:.3vh;letter-spacing:.06em;", m)
        .textContent = prizes[i].points;
      marks.push(box);
    }
    prizeEls = { fill: fill, marks: marks, max: max };
  }
  function updatePrizeBar(score) {
    if (!prizeEls) return;
    var pct = Math.min(100, score / prizeEls.max * 100);
    prizeEls.fill.style.width = pct + "%";
    var n = 0;
    for (var i = 0; i < prizes.length; i++) if (score >= prizes[i].points) n = i + 1;
    if (n > prizeReached) {
      for (var j = prizeReached; j < n; j++) {
        prizeEls.marks[j].style.borderColor = ORANGE;
        prizeEls.marks[j].style.boxShadow = "0 0 14px rgba(235,90,33,.8)";
        flashPrize(prizes[j].name);
      }
      prizeReached = n;
    }
  }
  function flashPrize(name) {
    var f = el("div",
      "position:absolute;top:30%;left:0;right:0;text-align:center;" +
      "font-size:4.6vh;font-weight:700;letter-spacing:.22em;text-indent:.22em;color:" + ORANGE + ";" +
      "text-shadow:0 0 24px rgba(235,90,33,.7);opacity:1;-webkit-transition:opacity .5s;" +
      "transition:opacity .5s;pointer-events:none;", stage);
    f.textContent = name.toUpperCase() + " GESICHERT!";
    setTimeout(function () { f.style.opacity = "0"; }, 1300);
    setTimeout(function () { safe(function () { stage.removeChild(f); }); }, 2000);
  }
  function localPrizeFor(score) {
    var won = null;
    for (var i = 0; i < prizes.length; i++) if (score >= prizes[i].points) won = prizes[i];
    return won;
  }
  function hudSet(id, txt) {
    var d = document.getElementById(id);
    if (d) d.textContent = txt;
  }

  function centerMsg(html) {
    overUi.style.display = "block";
    overUi.innerHTML =
      '<div style="position:absolute;top:50%;left:50%;-webkit-transform:translate(-50%,-50%);' +
      'transform:translate(-50%,-50%);width:90%;">' + html + '</div>';
  }

  /* ============================================ Start / Countdown */

  function startGame(p) {
    ensureLayer();
    player.name = (p && p.name) || "SPIELER";
    player.img = (p && p.img) || "";
    hideBanner();
    // Video anhalten: das Spiel bekommt den ganzen Bildschirm.
    safe(function () { if (global.MB_NATIVE) global.MB_NATIVE.gamePause(); });
    videoPaused = true;
    layer.style.display = "block";
    stage.style.display = "block";
    overUi.style.display = "none";
    reset();
    buildHud();
    net.x = 0.5; net.fire = false; net.lastInput = Date.now();
    mode = "countdown";
    var n = 3;
    var tick = function () {
      if (mode !== "countdown") return;
      if (n > 0) {
        centerMsg('<div style="font-size:16vh;font-weight:700;color:' + ORANGE + ';">' + n + '</div>' +
          '<div style="font-size:2.4vh;letter-spacing:.24em;opacity:.7;">' +
          (player.name || "").toUpperCase() + ' – GLEICH GEHT’S LOS</div>');
        n--; setTimeout(tick, 900);
      } else {
        overUi.style.display = "none";
        mode = "running";
        G.run = true; G.waveAt = Date.now();
      }
    };
    tick();
    if (!raf) loop();
  }

  /* ============================================ Spiel-Logik (Portrait 9:16) */

  function boom(x, y, col, n) {
    for (var i = 0; i < n; i++) {
      G.parts.push({ x: x, y: y, vx: (Math.random() - .5) * 8, vy: (Math.random() - .5) * 8, l: 1, col: col });
    }
  }
  function addCombo() {
    var now = Date.now();
    G.combo = (now - G.comboAt < 2000) ? G.combo + 1 : 1;
    G.comboAt = now;
    G.mult = Math.min(5, 1 + Math.floor(G.combo / 4));
    hudSet("ksCombo", G.mult > 1 ? ("COMBO x" + G.mult) : "");
  }
  function spawn() {
    var r = Math.random(), type = r < .66 ? "a" : (r < .92 ? "b" : "bonus");
    var sp = (2.2 + G.wave * .55 + G.score / 1400) * DIFF.spd;
    G.foes.push({ x: 40 + Math.random() * (W - 80), y: -40, type: type,
      v: (type === "b" ? 1.6 : 1) * sp, w: type === "bonus" ? 54 : 44,
      drift: (Math.random() - .5) * (2 + G.wave * .4), hp: type === "bonus" ? 2 : 1,
      canShoot: type === "b" && G.wave >= 2 });
  }
  function maybeDrop(x, y) {
    if (Math.random() > .14) return;
    var k = ["S", "R", "H"][Math.floor(Math.random() * 3)];
    G.pows.push({ x: x, y: y, k: k, v: 2.4 });
  }

  function drawShip(x, y, shield) {
    if (shield) {
      cx.save(); cx.strokeStyle = "rgba(140,190,255,.8)"; cx.lineWidth = 2;
      cx.shadowColor = "#8cbeff"; cx.shadowBlur = 16;
      cx.beginPath(); cx.arc(x, y, 42, 0, 7); cx.stroke(); cx.restore();
    }
    if (skinReady("ship")) {
      cx.drawImage(SKIN.ship, x - 34, y - 34, 68, 68);
      return;
    }
    // Profilbild als Pilot im Schiff, sonst Vektor-Schiff.
    cx.save(); cx.translate(x, y);
    cx.strokeStyle = "#dfe8f2"; cx.lineWidth = 2.5; cx.shadowColor = "#8cbeff"; cx.shadowBlur = 14;
    cx.beginPath(); cx.moveTo(0, -30); cx.lineTo(24, 22); cx.lineTo(10, 14); cx.lineTo(0, 22);
    cx.lineTo(-10, 14); cx.lineTo(-24, 22); cx.closePath(); cx.stroke();
    cx.shadowColor = ORANGE; cx.strokeStyle = ORANGE;
    cx.beginPath(); cx.moveTo(-6, 26); cx.lineTo(0, 38 + Math.random() * 6); cx.lineTo(6, 26); cx.stroke();
    if (player.imEl && player.imEl.complete) {
      cx.shadowBlur = 0;
      cx.beginPath(); cx.arc(0, -2, 11, 0, 7); cx.closePath(); cx.clip();
      safe(function () { cx.drawImage(player.imEl, -11, -13, 22, 22); });
    }
    cx.restore();
  }
  function drawFoe(f, tick) {
    var key = f.type === "bonus" ? "bonus" : (f.type === "b" ? "enemy2" : "enemy");
    if (skinReady(key)) {
      cx.drawImage(SKIN[key], f.x - f.w / 2, f.y - f.w / 2, f.w, f.w);
      return;
    }
    cx.save(); cx.translate(f.x, f.y); cx.rotate(Math.sin((tick || G.t) / 18 + f.x) * 0.18);
    if (f.type === "bonus") { cx.strokeStyle = ORANGE; cx.shadowColor = ORANGE; }
    else { cx.strokeStyle = f.type === "b" ? "#9fd0ff" : "#6f9fdf"; cx.shadowColor = "#6f9fdf"; }
    cx.lineWidth = 2.5; cx.shadowBlur = 12;
    var r = f.w / 2;
    cx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2, rr = (i % 2 ? r * .55 : r);
      cx[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    cx.closePath(); cx.stroke();
    cx.beginPath(); cx.arc(0, 0, r * .22, 0, 7); cx.stroke();
    cx.restore();
  }
  function drawBullet(x, y) {
    if (skinReady("bullet")) {
      cx.drawImage(SKIN.bullet, x - 9, y - 20, 18, 24);
      return;
    }
    cx.save(); cx.fillStyle = "#ffd9c4"; cx.shadowColor = ORANGE; cx.shadowBlur = 10;
    cx.fillRect(x - 2, y - 14, 4, 14); cx.restore();
  }

  function drawPow(p) {
    cx.save(); cx.translate(p.x, p.y);
    var col = p.k === "H" ? "#8cbeff" : ORANGE;
    cx.strokeStyle = col; cx.shadowColor = col; cx.shadowBlur = 14; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(0, 0, 16, 0, 7); cx.stroke();
    cx.fillStyle = col; cx.font = "700 16px Arial";
    cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(p.k, 0, 1);
    cx.restore();
  }

  function hit() {
    if (G.shield) { G.shield = false; G.shake = 10; return; }
    G.lives--; G.shake = 18;
    hudSet("ksLives", "♥♥♥♥♥".slice(0, Math.max(0, G.lives)) || "–");
    if (G.lives <= 0) gameOver();
  }

  function loop() {
    raf = global.requestAnimationFrame ? requestAnimationFrame(loop) : setTimeout(loop, 33);
    if (!cx || (mode !== "running" && mode !== "countdown" && mode !== "over" && mode !== "mirror")) return;
    cx.fillStyle = "#05070c"; cx.fillRect(0, 0, W, H); G.t++;
    cx.fillStyle = "rgba(160,200,255,.5)";
    for (var si = 0; si < stars.length; si++) {
      var s = stars[si];
      s.y += s.v * ((G.run || mode === "mirror") ? 1.4 : 1);
      if (s.y > H) s.y = 0;
      cx.fillRect(s.x, s.y, s.s, s.s);
    }
    if (G.shake > 0) {
      cx.save(); cx.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
      G.shake *= .9;
    }

    // Handy-Modus: zwischen den letzten beiden Spielstaenden interpolieren.
    if (mode === "mirror") {
      if (snapB) {
        var cur = snapB.s, prv = snapA ? snapA.s : cur;
        var tB = snapB.t, tA = snapA ? snapA.t : tB - 50;
        var al = tB > tA ? (Date.now() - MIRROR_DELAY - tA) / (tB - tA) : 1;
        if (al < 0) al = 0; if (al > 1) al = 1;
        var lerp = function (a, b) { return a + (b - a) * al; };
        // Index des aelteren Zustands nach Objekt-ID
        var pmap = function (arr) {
          var m = {}; if (arr) for (var j = 0; j < arr.length; j++) m[arr[j][0]] = arr[j];
          return m;
        };
        var pf = pmap(prv.f), pb = pmap(prv.b), pe = pmap(prv.e), pp = pmap(prv.p);
        var i2, a, o;
        for (i2 = 0; i2 < (cur.f || []).length; i2++) {
          a = cur.f[i2]; o = pf[a[0]];
          drawFoe({ x: o ? lerp(o[1], a[1]) : a[1], y: o ? lerp(o[2], a[2]) : a[2],
                    type: a[3], w: a[4] }, cur.t);
        }
        for (i2 = 0; i2 < (cur.p || []).length; i2++) {
          a = cur.p[i2]; o = pp[a[0]];
          drawPow({ x: o ? lerp(o[1], a[1]) : a[1], y: o ? lerp(o[2], a[2]) : a[2], k: a[3] });
        }
        for (i2 = 0; i2 < (cur.b || []).length; i2++) {
          a = cur.b[i2]; o = pb[a[0]];
          drawBullet(o ? lerp(o[1], a[1]) : a[1], o ? lerp(o[2], a[2]) : a[2]);
        }
        cx.fillStyle = "#ff8c8c";
        for (i2 = 0; i2 < (cur.e || []).length; i2++) {
          a = cur.e[i2]; o = pe[a[0]];
          cx.save(); cx.shadowColor = "#ff5c5c"; cx.shadowBlur = 8;
          cx.fillRect((o ? lerp(o[1], a[1]) : a[1]) - 2, o ? lerp(o[2], a[2]) : a[2], 4, 12);
          cx.restore();
        }
        drawShip(lerp(prv.px || W / 2, cur.px || W / 2), H - 90, !!cur.sh);
        hudSet("ksScore", String(cur.sc || 0));
        hudSet("ksLives", "♥♥♥♥♥".slice(0, Math.max(0, cur.lv == null ? 3 : cur.lv)) || "–");
        hudSet("ksCombo", cur.m > 1 ? ("COMBO x" + cur.m) : "");
        updatePrizeBar(cur.sc || 0);
      }
      if (G.shake > 0) cx.restore();
      return;
    }

    var now = Date.now();
    if (G.run) {
      if (now - G.waveAt > 18000) { G.wave++; G.waveAt = now; }

      // Netz-Eingabe: Zielposition vom Handy, sanft nachziehen.
      G.px += (net.x * W - G.px) * .3;
      G.px = Math.max(30, Math.min(W - 30, G.px));

      var fireMs = (now < G.rapidUntil ? 110 : 220);
      if (net.fire && now - G.lastFire > fireMs) {
        G.lastFire = now;
        G.bullets.push({ x: G.px, y: H - 110, vx: 0 });
        if (now < G.spreadUntil) {
          G.bullets.push({ x: G.px, y: H - 110, vx: -3.4 });
          G.bullets.push({ x: G.px, y: H - 110, vx: 3.4 });
        }
      }

      var rate = Math.max(180, (820 - G.wave * 90 - G.score / 6) * DIFF.rate);
      if (now - G.lastSpawn > rate) { G.lastSpawn = now; spawn(); }

      for (var fi = 0; fi < G.foes.length; fi++) {
        var f = G.foes[fi];
        f.y += f.v; f.x += f.drift;
        if (f.x < 25 || f.x > W - 25) f.drift *= -1;
        if (f.canShoot && Math.random() < .006 * DIFF.shoot) {
          G.ebullets.push({ x: f.x, y: f.y + 20, v: 5 + G.wave * .5 });
        }
      }

      G.bullets.forEach(function (b) { b.y -= 16; b.x += b.vx; });
      G.bullets = G.bullets.filter(function (b) {
        for (var i = 0; i < G.foes.length; i++) {
          var f2 = G.foes[i];
          if (Math.abs(b.x - f2.x) < f2.w / 2 + 4 && Math.abs(b.y - f2.y) < f2.w / 2 + 8) {
            f2.hp--;
            if (f2.hp <= 0) {
              addCombo();
              G.score += (f2.type === "bonus" ? 50 : (f2.type === "b" ? 20 : 10)) * G.mult;
              boom(f2.x, f2.y, f2.type === "bonus" ? ORANGE : "#8cbeff", f2.type === "bonus" ? 26 : 14);
              maybeDrop(f2.x, f2.y);
              G.foes.splice(i, 1);
            } else boom(b.x, b.y, ORANGE, 5);
            return false;
          }
        }
        return b.y > -20 && b.x > -10 && b.x < W + 10;
      });

      G.ebullets.forEach(function (b) { b.y += b.v; });
      G.ebullets = G.ebullets.filter(function (b) {
        if (b.y > H - 110 && b.y < H - 60 && Math.abs(b.x - G.px) < 26) { hit(); return false; }
        return b.y < H + 20;
      });

      G.pows.forEach(function (p) { p.y += p.v; });
      G.pows = G.pows.filter(function (p) {
        if (p.y > H - 130 && Math.abs(p.x - G.px) < 34) {
          if (p.k === "S") G.spreadUntil = now + 8000;
          if (p.k === "R") G.rapidUntil = now + 8000;
          if (p.k === "H") G.shield = true;
          return false;
        }
        return p.y < H + 20;
      });

      G.foes = G.foes.filter(function (f3) {
        if (f3.y > H - 70 && Math.abs(f3.x - G.px) < f3.w / 2 + 26) {
          hit(); boom(G.px, H - 90, ORANGE, 30); return false;
        }
        if (f3.y > H + 40) { if (f3.type !== "bonus") hit(); return false; }
        return true;
      });

      if (now - G.comboAt > 2000 && G.mult > 1) { G.mult = 1; G.combo = 0; hudSet("ksCombo", ""); }
      hudSet("ksScore", String(G.score));
      updatePrizeBar(G.score);
    }

    G.foes.forEach(function (f) { drawFoe(f); });
    G.pows.forEach(drawPow);
    G.bullets.forEach(function (b) { drawBullet(b.x, b.y); });
    cx.fillStyle = "#ff8c8c";
    G.ebullets.forEach(function (b) {
      cx.save(); cx.shadowColor = "#ff5c5c"; cx.shadowBlur = 8;
      cx.fillRect(b.x - 2, b.y, 4, 12); cx.restore();
    });
    if (G.run || mode === "countdown") drawShip(G.px, H - 90, G.shield);
    G.parts.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.l -= .03;
      cx.globalAlpha = Math.max(0, p.l); cx.fillStyle = p.col;
      cx.fillRect(p.x, p.y, 3, 3); cx.globalAlpha = 1;
    });
    G.parts = G.parts.filter(function (p) { return p.l > 0; });
    if (G.shake > 0) cx.restore();
  }

  /* ============================================ Ende & Aufraeumen */

  function showOverScreen(score) {
    var won = localPrizeFor(score);
    var prizeHtml;
    if (won) {
      prizeHtml =
        '<div style="margin-top:1.6vh;padding:2vh 3vh;border:2px solid ' + ORANGE + ';' +
        'border-radius:2vh;display:inline-block;background:rgba(235,90,33,.12);">' +
        '<div style="font-size:1.7vh;letter-spacing:.3em;text-indent:.3em;opacity:.7;">GEWONNEN</div>' +
        (won.img ? '<img src="' + won.img + '" style="width:7vh;height:7vh;border-radius:50%;' +
          'object-fit:cover;margin:1vh 0 .4vh;" onerror="this.style.display=\'none\'">' : '') +
        '<div style="font-size:3.4vh;font-weight:700;color:' + ORANGE + ';">' + won.name.toUpperCase() + '</div>' +
        '<div style="font-size:1.6vh;opacity:.6;margin-top:.6vh;">An der Theke abholen!</div></div>';
    } else if (prizes.length) {
      prizeHtml = '<div style="font-size:1.9vh;opacity:.6;letter-spacing:.1em;margin-top:1.4vh;">' +
        'Knapp daneben – ab ' + prizes[0].points + ' Punkten gibt’s ' + prizes[0].name + '!</div>';
    } else {
      prizeHtml = '';
    }
    centerMsg(
      '<div style="font-size:3vh;font-weight:600;letter-spacing:.3em;text-indent:.3em;opacity:.7;">GAME OVER</div>' +
      (player.img ? '<img src="' + player.img + '" style="width:9vh;height:9vh;border-radius:50%;' +
        'border:3px solid ' + ORANGE + ';object-fit:cover;margin:2.4vh 0 0;">' : '') +
      '<div style="font-size:2.4vh;letter-spacing:.14em;margin-top:1.4vh;">' + (player.name || "SPIELER") + '</div>' +
      '<div style="font-size:12vh;font-weight:700;color:' + ORANGE + ';line-height:1.15;">' + score + '</div>' +
      prizeHtml +
      '<div style="font-size:2vh;opacity:.55;letter-spacing:.16em;margin-top:1.4vh;">DANKE FÜRS MITSPIELEN!</div>' +
      '<div style="font-size:1.1vh;opacity:.3;letter-spacing:.2em;margin-top:3vh;">developed by Luca Kingsley</div>');
    // 10 s zeigen, dann Video weiter und alles verstecken. Kommt vorher schon
    // die naechste Einladung, darf der Timer nichts mehr anfassen.
    setTimeout(function () { if (mode === "over") cleanup(); }, 10000);
  }

  function gameOver() {
    if (mode !== "running") return;
    mode = "over";
    G.run = false;
    // Ergebnis an den Server melden (geht weiter ans Handy).
    safe(function () {
      if (global.MB_NATIVE && global.MB_NATIVE.send) {
        global.MB_NATIVE.send({ type: "game-over", score: G.score });
      }
    });
    showOverScreen(G.score);
  }

  // Handy-Modus: Buehne sofort zeigen und auf Spiegel-Daten warten.
  function startMirror(p) {
    ensureLayer();
    player.name = (p && p.name) || "SPIELER";
    player.img = (p && p.img) || "";
    hideBanner();
    safe(function () { if (global.MB_NATIVE) global.MB_NATIVE.gamePause(); });
    videoPaused = true;
    layer.style.display = "block";
    stage.style.display = "block";
    overUi.style.display = "none";
    reset();
    buildHud();
    snapA = null; snapB = null;
    mode = "mirror";
    if (!raf) loop();
  }

  function cleanup() {
    mode = "idle";
    G.run = false;
    snapA = null; snapB = null;
    hideBanner();
    if (videoPaused) {
      videoPaused = false;
      safe(function () { if (global.MB_NATIVE) global.MB_NATIVE.gameResume(); });
      // Buehne erst kurz nach dem Video-Neustart ausblenden, damit kein
      // schwarzes Loch zwischen Spiel und Video aufblitzt.
      setTimeout(function () {
        if (mode === "idle" && layer) { layer.style.display = "none"; stage.style.display = "none"; }
      }, 1800);
    } else if (layer) {
      setTimeout(function () {
        if (mode === "idle") layer.style.display = "none";
      }, 800);
    }
  }

  /* ============================================ Nachrichten vom Server */

  function onMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === "game-invite") {
      showInvite(msg.code || "", msg.joinUrl || "", msg.logoUrl || null, msg.prizes || null);
    } else if (msg.type === "game-claimed") {
      showClaimed();
    } else if (msg.type === "game-start") {
      if (msg.player && msg.player.img) {
        player.imEl = new Image();
        player.imEl.src = msg.player.img;
      } else player.imEl = null;
      prizes = msg.prizes || [];
      setSkin(msg.skins || {});
      applyDifficulty(msg.difficulty);
      if (msg.mode === "phone") startMirror(msg.player || {});
      else startGame(msg.player || {});
    } else if (msg.type === "game-mirror") {
      if (mode === "mirror" && msg.s) { snapA = snapB; snapB = { t: Date.now(), s: msg.s }; }
    } else if (msg.type === "game-mirror-over") {
      if (mode === "mirror") {
        mode = "over";
        showOverScreen(Number(msg.score) || 0);
      }
    } else if (msg.type === "game-input") {
      net.x = Math.max(0, Math.min(1, Number(msg.x) || 0));
      net.fire = !!msg.fire;
      net.lastInput = Date.now();
    } else if (msg.type === "game-end") {
      cleanup();
    }
  }

  // Kleine Diagnose fuer die Konsole am Geraet
  function info() {
    return { mode: mode, videoPaused: videoPaused,
             mirrorAge: snapB ? (Date.now() - snapB.t) : null };
  }

  global.MB_GAME = { onMessage: onMessage, setSkin: setSkin, info: info };
})(window);
