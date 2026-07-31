/* MenuBoard – Tizen/SSSP Loader
 *
 * Bewusst reines ES5 (kein let/const, keine Arrow-Functions, kein fetch,
 * kein Promise), damit das Widget auch auf alten Signage-Firmwares läuft.
 *
 * Aufgaben:
 *   1. Server-Adresse und Bildschirm-Nummer bestimmen
 *      (lokale Übersteuerung > Install-URL > Server-Zuweisung > Build-Default)
 *   2. Player-Seite im Vollbild-iframe laden
 *   3. Watchdog: bei Server-Ausfall/Ladefehler automatisch neu laden
 *   4. Fernbedienung: Ziffer = Bildschirm setzen, 0-0-0 = Setup-Bildschirm
 */
(function () {
  "use strict";

  var CFG = window.MB_CONFIG || {};
  var DEFAULT_PORT = "8787";

  var POLL_MS = Number(CFG.pollMs) || 15000;   // Heartbeat/Watchdog-Intervall
  var FAIL_UNTIL_OFFLINE = 2;                  // Fehlversuche bis Offline-Anzeige
  var IFRAME_TIMEOUT_MS = 25000;               // Ladezeit bis Neuversuch
  var DAILY_RELOAD_HOUR = (CFG.dailyReloadHour === null || CFG.dailyReloadHour === undefined)
    ? 4 : Number(CFG.dailyReloadHour);         // harter Neustart nachts, -1 = aus

  var el = {
    frame: document.getElementById("player"),
    keys: document.getElementById("keycatcher"),
    splash: document.getElementById("splash"),
    splashMsg: document.getElementById("splashMsg"),
    splashInfo: document.getElementById("splashInfo"),
    setup: document.getElementById("setup"),
    setupInfo: document.getElementById("setupInfo"),
    toast: document.getElementById("toast"),
    valIp: document.getElementById("valIp"),
    valPort: document.getElementById("valPort"),
    valScreen: document.getElementById("valScreen"),
    rows: [
      document.getElementById("rowIp"),
      document.getElementById("rowPort"),
      document.getElementById("rowScreen")
    ]
  };

  var state = {
    base: "",           // z.B. http://192.168.1.50:8787
    screen: "",         // z.B. "2"
    device: {},         // duid / mac / model / ip
    failures: 0,
    offline: false,
    loaded: false,
    epoch: null,        // Server-Reload-Zähler
    lastUrl: "",
    loadTimer: null,
    setupOpen: false
  };

  /* ---------------------------------------------------------------- Utils */

  function log() {
    try { console.log.apply(console, ["[menuboard]"].concat([].slice.call(arguments))); } catch (e) {}
  }

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem("mb." + key);
      if (value === null) { window.localStorage.removeItem("mb." + key); return null; }
      window.localStorage.setItem("mb." + key, String(value));
      return String(value);
    } catch (e) { return null; }
  }

  function getJSON(url, cb) {
    var xhr = new XMLHttpRequest();
    var done = false;
    function finish(err, data) { if (!done) { done = true; cb(err, data); } }
    try { xhr.open("GET", url, true); } catch (e) { finish(e); return; }
    try { xhr.timeout = 8000; } catch (e) {}
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        var d = null;
        try { d = JSON.parse(xhr.responseText); } catch (e) { finish(new Error("ungueltige Antwort")); return; }
        finish(null, d);
      } else {
        finish(new Error("HTTP " + xhr.status));
      }
    };
    xhr.ontimeout = function () { finish(new Error("Zeitueberschreitung")); };
    xhr.onerror = function () { finish(new Error("Netzwerkfehler")); };
    try { xhr.send(); } catch (e) { finish(e); }
  }

  function q(obj) {
    var parts = [];
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (obj[k] === null || obj[k] === undefined || obj[k] === "") continue;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]));
    }
    return parts.length ? "?" + parts.join("&") : "";
  }

  function toast(msg, ms) {
    el.toast.innerHTML = msg;
    el.toast.style.display = "block";
    if (toast._t) clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.style.display = "none"; }, ms || 2500);
  }

  /* --------------------------------------------------- Samsung-Signage-API */

  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  function readDevice() {
    var d = {};
    d.duid = safe(function () { return webapis.productinfo.getDuid(); }) || "";
    d.model = safe(function () { return webapis.productinfo.getRealModel(); }) || "";
    d.mac = safe(function () { return webapis.network.getMac(); })
         || safe(function () { return b2bapis.b2bcontrol.getMACAddress(); }) || "";
    d.ip = safe(function () { return webapis.network.getIp(); }) || "";
    if (!d.model) {
      safe(function () {
        tizen.systeminfo.getPropertyValue("BUILD", function (b) { if (b && b.model) state.device.model = b.model; });
      });
    }
    return d;
  }

  // Bildschirm soll nie ausgehen / nie in den Screensaver.
  function applySignageSettings() {
    safe(function () {
      webapis.appcommon.setScreenSaver(
        webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF,
        function () {}, function () {});
    });
    safe(function () { b2bapis.b2bcontrol.setAutoPowerOn(true, function () {}, function () {}); });
    safe(function () { b2bapis.b2bcontrol.setNoSignalPowerOff("off", function () {}, function () {}); });
    safe(function () { b2bapis.b2bcontrol.setEnergySavingMode("off", function () {}, function () {}); });
    // Fernbedienungstasten, die wir auswerten wollen.
    safe(function () {
      var keys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
      for (var i = 0; i < keys.length; i++) {
        try { tizen.tvinputdevice.registerKey(keys[i]); } catch (e) {}
      }
    });
  }

  // Adresse, die im Display unter "Custom App" / "URL Launcher" eingetragen ist.
  function installAddress() {
    var a = safe(function () { return b2bapis.b2bcontrol.getURLLauncherAddress(); })
         || safe(function () { return webapis.b2bcontrol.getURLLauncherAddress(); })
         || safe(function () { return b2bapis.b2bcontrol.getUrlLauncherAddress(); });
    return a ? String(a) : "";
  }

  /* ------------------------------------------------------- URL-Auswertung */

  // "http://10.0.0.5:8787/tizen/3/" -> { base: "http://10.0.0.5:8787", screen: "3" }
  function parseInstallUrl(url) {
    var s = String(url || "").trim();
    var m = /^(https?:\/\/[^\/?#]+)([^?#]*)/i.exec(s);
    if (!m) return null;
    var out = { base: m[1].replace(/\/+$/, ""), screen: "" };
    var p = /\/tizen\/([^\/?#]+)/i.exec(m[2] || "");
    if (p) {
      var v = decodeURIComponent(p[1]);
      if (v && v.toLowerCase() !== "sssp_config.xml" && !/\.wgt$/i.test(v)) out.screen = v;
    }
    return out;
  }

  function buildBase(ip, port) {
    var host = String(ip || "").trim();
    if (!host) return "";
    if (!/^https?:\/\//i.test(host)) host = "http://" + host;
    host = host.replace(/\/+$/, "");
    var p = String(port || "").trim();
    if (p && !/:\d+$/.test(host)) host = host + ":" + p;
    return host;
  }

  function splitBase(base) {
    var m = /^(https?:\/\/)?([^:\/]+)(?::(\d+))?/i.exec(String(base || ""));
    if (!m) return { ip: "", port: DEFAULT_PORT };
    return { ip: m[2] || "", port: m[3] || DEFAULT_PORT };
  }

  /* ------------------------------------------------------------ Auflösung */

  function resolveInitial() {
    var installed = parseInstallUrl(installAddress());

    // 1) manuell am Display gesetzt  2) Install-URL  3) Build-Voreinstellung
    state.base =
      store("base") ||
      (installed && installed.base) ||
      String(CFG.server || "").replace(/\/+$/, "");

    state.screen =
      store("screen") ||
      (installed && installed.screen) ||
      String(CFG.screen || "1");

    log("Basis:", state.base, "Bildschirm:", state.screen,
        "Install-URL:", installAddress() || "(nicht verfuegbar)");
  }

  /* ------------------------------------------------ Server: Zuweisung/Ping */

  function assignUrl() {
    return state.base + "/api/tizen/assign" + q({
      duid: state.device.duid,
      mac: state.device.mac,
      model: state.device.model,
      ip: state.device.ip,
      hint: state.screen,
      manual: store("screen") ? "1" : "",
      v: CFG.buildVersion || "",
      t: String(new Date().getTime())
    });
  }

  function poll(first) {
    if (!state.base) { showSetupHint("Keine Server-Adresse hinterlegt."); return; }

    getJSON(assignUrl(), function (err, data) {
      if (err) {
        state.failures += 1;
        log("Ping fehlgeschlagen:", err.message, "(" + state.failures + ")");
        if (state.failures >= FAIL_UNTIL_OFFLINE) goOffline(err.message);
        return;
      }

      var wasOffline = state.offline;
      state.failures = 0;
      state.offline = false;

      // Frische Installation über /tizen/<N>/ schlägt eine früher am Display
      // von Hand gesetzte Nummer – der Server sagt uns das mit clearLocal.
      if (data && data.clearLocal && store("screen")) {
        store("screen", null);
        log("lokale Bildschirm-Einstellung verworfen (Install-URL gewinnt)");
      }

      // Bildschirm-Nummer: lokale Übersteuerung schlägt den Server.
      var next = store("screen") || (data && data.screen) || state.screen;
      var changed = String(next) !== String(state.screen);
      state.screen = String(next);

      // Der Server kann per Dashboard einen Neuladen-Befehl schicken.
      var epochChanged = false;
      if (data && data.epoch !== undefined && data.epoch !== null) {
        if (state.epoch !== null && String(data.epoch) !== String(state.epoch)) epochChanged = true;
        state.epoch = data.epoch;
      }

      // Branding (Name, Boot-Dauer, Logo) fuer den naechsten Start merken
      // und den Splash-Titel sofort mitziehen.
      if (data && data.branding) {
        safe(function () { store("branding", JSON.stringify(data.branding)); });
        if (data.branding.name) applyBrandName(data.branding.name);
      }

      if (first || changed || epochChanged || wasOffline || !state.loaded) {
        loadPlayer(changed || epochChanged || wasOffline);
      }
    });
  }

  function goOffline(reason) {
    state.offline = true;
    state.loaded = false;
    showSplash(
      "Kein Kontakt zum MenuBoard-Server",
      "Server: " + (state.base || "–") + "<br />Grund: " + (reason || "unbekannt") +
      "<br />Neuer Versuch läuft automatisch."
    );
  }

  /* -------------------------------------------------------- Player laden */

  function playerUrl() {
    return state.base + "/player" + q({
      screen: state.screen,
      via: "tizen",
      duid: state.device.duid ? String(state.device.duid).slice(0, 12) : "",
      cb: String(new Date().getTime())
    });
  }

  /* --- Player-Modus: nativ (AVPlay) oder iframe (HTML5) ------------------
     Der native Weg umgeht die HTML5-Grenzen der Signage-Browser
     (max. Full HD, max. 30 fps, nur ein Video gleichzeitig) und spielt aus
     dem lokalen Speicher statt vom Server zu streamen. Kann das Display das
     nicht, bleibt alles beim Alten - deshalb die Pruefung statt einer
     harten Umstellung. Mit MB_CONFIG.nativePlayer === false laesst er sich
     ausdruecklich abschalten. */
  var nativeChecked = false;
  var nativeOk = false;

  function nativeMode() {
    if (!nativeChecked) {
      nativeChecked = true;
      // Der native AVPlay-Weg ist standardmaessig AUS. Er startete auf den
      // QM43C-Panels nicht zuverlaessig (Video kam nicht hoch). Zum Testen
      // in mb-config.js  nativePlayer: true  setzen.
      nativeOk = !!(window.MB_NATIVE &&
                    CFG.nativePlayer === true &&
                    safe(function () { return window.MB_NATIVE.isAvailable(); }));
      if (nativeOk) {
        try { document.body.className += " native"; } catch (e) {}
      }
      log("Player-Modus:", nativeOk ? "nativ (AVPlay, lokaler Speicher)" : "iframe (HTML5-Video)");
    }
    return nativeOk;
  }

  function loadPlayerNative() {
    // Kein iframe-onload, das den Splash ausblendet - das macht hier der
    // Statusrueckruf des nativen Players, sobald das Bild wirklich laeuft.
    state.loaded = true;
    if (state.loadTimer) { clearTimeout(state.loadTimer); state.loadTimer = null; }

    window.MB_NATIVE.start(state.base, state.screen, {
      onStatus: function (msg, detail) {
        if (!msg) { window.__mbVideoStarted = true; hideSplash(); }
        else showSplash(msg, detail || ("Bildschirm " + state.screen));
      }
    });
  }

  function loadPlayer(force) {
    if (nativeMode()) { loadPlayerNative(); return; }

    var url = playerUrl();
    if (!force && state.loaded && state.lastUrl && url.split("&cb=")[0] === state.lastUrl.split("&cb=")[0]) return;

    state.lastUrl = url;
    state.loaded = false;
    showSplash("Verbinde mit " + state.base, "Bildschirm " + state.screen);

    if (state.loadTimer) clearTimeout(state.loadTimer);
    state.loadTimer = setTimeout(function () {
      if (!state.loaded) {
        log("iframe-Timeout, neuer Versuch");
        loadPlayer(true);
      }
    }, IFRAME_TIMEOUT_MS);

    try { el.frame.src = url; } catch (e) { log("iframe src fehlgeschlagen", e); }
  }

  el.frame.onload = function () {
    if (!el.frame.src || el.frame.src === "about:blank") return;
    state.loaded = true;
    if (state.loadTimer) { clearTimeout(state.loadTimer); state.loadTimer = null; }
    window.__mbVideoStarted = true;
    hideSplash();
    log("Player geladen:", state.lastUrl);
  };
  el.frame.onerror = function () {
    log("iframe-Fehler");
    state.loaded = false;
    setTimeout(function () { loadPlayer(true); }, 4000);
  };

  /* ---------------------------------------------------------- Splash / UI */

  /* ------------------------------------------------ Boot-Screen ---------
     Kingsley-Systems-Look: oben Matrix-Regen (nur oberes Drittel, blasst
     nach unten aus), unten leuchtende Wellen-Konturen in drei Tiefen-
     ebenen, mittig Logo + fein getippter Name. Dauer kommt aus dem
     Dashboard (Branding), 0 = aus. Laeuft rein lokal aus dem Cache. */

  function brandingCached() {
    var b = { name: "Kingsley Systems", bootSeconds: 10, logo: null };
    safe(function () {
      var raw = store("branding");
      if (raw) { var j = JSON.parse(raw); if (j && typeof j === "object") b = j; }
    });
    return b;
  }

  function applyBrandName(name) {
    safe(function () {
      var t = document.getElementById("splashTitle");
      if (t) {
        t.textContent = name;
        var d = document.createElement("span");
        d.className = "branddot"; d.textContent = ".";
        t.appendChild(d);
      }
    });
  }

  function startBootRain() {
    var c = document.getElementById("bootRain");
    if (!c || !c.getContext) return;
    var w = c.clientWidth || window.innerWidth || 1080;
    var h = c.clientHeight || Math.floor((window.innerHeight || 1920) * 0.34);
    // Halbe Aufloesung: sieht durch das Ausblenden identisch aus,
    // kostet aber nur ein Viertel der Rechenzeit.
    c.width = Math.max(160, Math.floor(w / 2));
    c.height = Math.max(90, Math.floor(h / 2));
    var ctx = c.getContext("2d");
    var chars = "01<>/#+=*.:アイウカキクサシスセタチツナニハヒフ";
    var fs = 15;
    var cols = Math.floor(c.width / fs);
    var drops = [];
    for (var i = 0; i < cols; i++) drops[i] = Math.floor(Math.random() * -40);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
    var iv = setInterval(function () {
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = fs + "px monospace";
      for (var i = 0; i < cols; i++) {
        var ch = chars.charAt(Math.floor(Math.random() * chars.length));
        ctx.fillStyle = Math.random() < 0.07
          ? "rgba(215,235,255,0.9)"     // einzelne helle "Funken"
          : "rgba(135,175,225,0.5)";    // Grundton, passend zu den Wellen
        ctx.fillText(ch, i * fs, drops[i] * fs);
        if (drops[i] * fs > c.height && Math.random() > 0.965) {
          drops[i] = Math.floor(Math.random() * -15);
        }
        drops[i]++;
      }
    }, 95);
    return function () { clearInterval(iv); };
  }

  function showBoot() {
    var b = brandingCached();
    applyBrandName(b.name || "Kingsley Systems");

    var dur = Number(b.bootSeconds);
    if (!isFinite(dur)) dur = 10;
    if (dur <= 0) return;

    var boot = document.getElementById("boot");
    var typed = document.getElementById("bootTyped");
    var cursor = document.getElementById("bootCursor");
    var logo = document.getElementById("bootLogo");
    if (!boot || !typed) return;

    var name = String(b.name || "Kingsley Systems").toUpperCase();
    boot.className = "on";
    typed.textContent = "";
    cursor.className = "";

    if (b.logo && state.base) {
      logo.onerror = function () { logo.style.display = "none"; };
      logo.style.display = "";
      logo.src = state.base + "/branding/" + b.logo + "?v=" + String(b.logo);
    } else {
      logo.style.display = "none";
    }

    var stopRain = startBootRain();

    // Tippgeschwindigkeit haengt an der Gesamtdauer.
    var typeMs = Math.max(30, Math.min(65, (dur * 1000 * 0.35) / Math.max(1, name.length)));
    var i = 0;
    var t = setInterval(function () {
      typed.textContent = name.slice(0, ++i);
      if (i >= name.length) {
        clearInterval(t);
        cursor.className = "blink";
        safe(function () { document.getElementById("bootDot").className = "in"; });
        setTimeout(function () { if (logo.style.display !== "none") logo.className = "in"; }, 400);
      }
    }, typeMs);

    // Ausblenden erst, wenn BEIDES gilt: Mindestdauer erreicht UND das
    // Video laeuft wirklich. Falls das Video haengt: Deckel bei dur+20s,
    // damit Fehlermeldungen auf dem Splash sichtbar werden.
    var t0boot = Date.now();
    var endIv = setInterval(function () {
      var el = (Date.now() - t0boot) / 1000;
      var ready = !!window.__mbVideoStarted;
      if ((el >= dur && ready) || el >= dur + 20) {
        clearInterval(endIv);
        boot.className = "on out";
        setTimeout(function () {
          boot.className = "";
          if (stopRain) stopRain();
          clearInterval(t);
        }, 700);
      }
    }, 250);
  }

  function showSplash(msg, info) {
    el.splashMsg.innerHTML = msg || "";
    el.splashInfo.innerHTML = (info || "") +
      "<br /><br />Ziffer 1–9 auf der Fernbedienung = Bildschirm wählen · dreimal 0 = Einstellungen";
    el.splash.style.display = "flex";
  }
  function hideSplash() { el.splash.style.display = "none"; }
  function showSetupHint(msg) { showSplash(msg, "Dreimal die Taste 0 drücken, um den Server einzutragen."); }

  /* ----------------------------------------------- Setup per Fernbedienung */

  var setupField = 0;
  var setupVals = ["", "", ""];

  function openSetup() {
    var parts = splitBase(state.base);
    setupVals = [parts.ip, parts.port, String(state.screen || "1")];
    setupField = 0;
    state.setupOpen = true;
    el.toast.style.display = "none";
    el.setupInfo.innerHTML =
      "Gerät: " + (state.device.model || "?") +
      " · IP: " + (state.device.ip || "?") +
      " · DUID: " + (state.device.duid || "?");
    renderSetup();
    el.setup.style.display = "flex";
  }

  function closeSetup() {
    state.setupOpen = false;
    el.setup.style.display = "none";
  }

  function renderSetup() {
    el.valIp.innerHTML = setupVals[0] || "&nbsp;";
    el.valPort.innerHTML = setupVals[1] || "&nbsp;";
    el.valScreen.innerHTML = setupVals[2] || "&nbsp;";
    for (var i = 0; i < el.rows.length; i++) {
      el.rows[i].className = (i === setupField) ? "row active" : "row";
    }
  }

  function saveSetup() {
    var base = buildBase(setupVals[0], setupVals[1] || DEFAULT_PORT);
    if (!base) { toast("Bitte eine Server-IP eintragen."); return; }
    store("base", base);
    store("screen", setupVals[2] || "1");
    closeSetup();
    state.base = base;
    state.screen = setupVals[2] || "1";
    state.failures = 0;
    toast("Gespeichert – lade neu …");
    setTimeout(function () { location.reload(); }, 800);
  }

  /* ------------------------------------------------------- Tasten-Handling */

  var zeroHits = [];

  function digitPressed(d) {
    if (state.setupOpen) {
      setupVals[setupField] = (setupVals[setupField] || "") + d;
      renderSetup();
      return;
    }
    if (d === "0") {
      var now = new Date().getTime();
      zeroHits.push(now);
      zeroHits = zeroHits.filter(function (t) { return now - t < 3000; });
      if (zeroHits.length >= 3) { zeroHits = []; openSetup(); }
      else toast("Einstellungen: noch " + (3 - zeroHits.length) + "× die 0 drücken");
      return;
    }
    // 1–9: Bildschirm sofort umstellen und merken.
    store("screen", d);
    state.screen = d;
    toast("Bildschirm " + d + " gewählt");
    loadPlayer(true);
  }

  function onKey(ev) {
    var k = ev.keyCode;

    // Ziffern: normale Tastatur (48–57), Numpad (96–105), TV-Fernbedienung.
    var d = null;
    if (k >= 48 && k <= 57) d = String(k - 48);
    else if (k >= 96 && k <= 105) d = String(k - 96);
    if (d !== null) { ev.preventDefault(); digitPressed(d); return; }

    if (!state.setupOpen) {
      if (k === 10009 || k === 27 || k === 461) { ev.preventDefault(); openSetup(); }
      return;
    }

    switch (k) {
      case 38: setupField = (setupField + 2) % 3; renderSetup(); break;             // hoch
      case 40: setupField = (setupField + 1) % 3; renderSetup(); break;             // runter
      case 37: setupVals[setupField] = (setupVals[setupField] || "").slice(0, -1); renderSetup(); break; // links = löschen
      case 39: if (setupField === 0) { setupVals[0] = (setupVals[0] || "") + "."; renderSetup(); } break; // rechts = Punkt
      case 13: saveSetup(); break;                                                  // ENTER
      case 8:  setupVals[setupField] = (setupVals[setupField] || "").slice(0, -1); renderSetup(); break;
      case 10009: case 27: case 461: closeSetup(); break;                           // RETURN/EXIT
      default: return;
    }
    ev.preventDefault();
  }

  // Nur EIN Listener – der Keycatcher liegt über dem iframe und lässt die
  // Ereignisse zum Dokument durchblubbern. Zwei Listener würden jeden
  // Tastendruck doppelt zählen.
  document.addEventListener("keydown", onKey, false);

  // Fokus beim Widget halten, damit Tasten nicht im iframe verschwinden.
  function grabFocus() { try { el.keys.focus(); } catch (e) {} }
  setInterval(grabFocus, 4000);

  /* ------------------------------------------------------------- Nachtlauf */

  function scheduleDailyReload() {
    if (!(DAILY_RELOAD_HOUR >= 0 && DAILY_RELOAD_HOUR <= 23)) return;
    setInterval(function () {
      var now = new Date();
      if (now.getHours() === DAILY_RELOAD_HOUR && now.getMinutes() < 5) {
        log("Nächtlicher Neustart des Widgets");
        location.reload();
      }
    }, 4 * 60 * 1000);
  }

  /* ------------------------------------------------------------------ Boot */

  function boot() {
    applySignageSettings();
    state.device = readDevice();
    resolveInitial();
    grabFocus();

    showBoot();
    showSplash("Starte …", state.base ? ("Server: " + state.base) : "");

    if (!state.base) { showSetupHint("Keine Server-Adresse hinterlegt."); }
    else { loadPlayer(true); }

    poll(true);
    setInterval(function () { poll(false); }, POLL_MS);
    scheduleDailyReload();

    // Application-Exit sauber abfangen (RETURN darf das Widget nicht beenden).
    window.addEventListener("beforeunload", function () { log("Widget wird beendet"); }, false);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(boot, 0);
  } else {
    document.addEventListener("DOMContentLoaded", boot, false);
  }
})();
