/*
 * MenuBoard – nativer Signage-Player (AVPlay + lokaler Dateispeicher)
 * ===================================================================
 *
 * Warum es das gibt
 * -----------------
 * Der bisherige Weg lädt die Player-Seite des Servers in einen iframe und
 * spielt dort per HTML5-<video>. Auf Samsung-Signage gelten dafür harte
 * Grenzen: maximal Full HD, maximal 30 fps, und nur EIN Video gleichzeitig
 * (der Crossfade-Player benutzt aber zwei). Zusätzlich wird bei jedem
 * Durchlauf neu vom Server gestreamt.
 *
 * Dieses Modul umgeht das komplett:
 *   1. Abspielen über AVPlay – Samsungs nativen Player. Der spricht den
 *      Hardware-Decoder direkt an: 4K, hohe Bitraten, keine fps-Deckelung.
 *   2. Videos werden einmal per tizen.download auf den privaten App-Speicher
 *      geladen und von dort abgespielt. Nach dem ersten Mal fließt kein Byte
 *      mehr über das Netz – und anders als ein Cache im Arbeitsspeicher
 *      überlebt das jeden Neustart des Displays.
 *   3. Die Playlist kommt weiterhin per WebSocket vom Server, das Dashboard
 *      bleibt also unverändert bedienbar.
 *
 * Sicherheitsnetz
 * ---------------
 * isAvailable() prüft, ob AVPlay, tizen.download und tizen.filesystem
 * wirklich vorhanden sind. Fehlt eines davon – etwa im normalen Browser
 * oder auf einem älteren Panel – meldet das Modul "nicht verfügbar" und der
 * Loader nimmt weiterhin den iframe-Weg. Schlimmstenfalls also wie bisher,
 * nie schlechter.
 *
 * Erwartetes Playlist-Format (wie vom Server über WebSocket geliefert):
 *   [ { videoId: "...", url: "http://…/media/x.mp4", repeat: 1 }, … ]
 */

(function (global) {
  "use strict";

  var LOG_PREFIX = "[MB-native]";
  var BUILD_TAG = "nativ-T13-spiel";   // sichtbare Kennung, damit klar ist, welcher Build laeuft
  var STORAGE = "wgt-private";      // privater, beschreibbarer App-Speicher
  var SUBDIR = "media";             // darin legen wir die Videos ab
  var RETRY_MS = 4000;              // Wartezeit vor erneutem Verbindungsversuch
  var DOWNLOAD_RETRY = 2;           // Versuche je Datei

  var state = {
    base: "",
    screen: "1",
    ws: null,
    playlist: [],
    idx: 0,
    playsLeft: 0,
    currentKey: null,
    dir: null,               // File-Objekt des Medienordners
    localPaths: {},          // Server-URL -> lokaler Pfad
    downloading: {},         // Server-URL -> true, solange der Download läuft
    playing: false,
    started: false,
    onStatus: null,          // Callback für den Loader (Splash-Texte)
    lastError: ""
  };

  function log() {
    try {
      var a = Array.prototype.slice.call(arguments);
      a.unshift(LOG_PREFIX);
      console.log.apply(console, a);
    } catch (_) {}
  }

  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function status(msg, detail) {
    if (typeof state.onStatus === "function") {
      safe(function () { state.onStatus(msg, detail || ""); });
    }
  }

  /**
   * Relative Server-URLs absolut machen. Der Server liefert "/media/x.mp4" -
   * im Browser-Player ergaenzt der Browser das gegen den Server-Ursprung,
   * aber das Widget laeuft aus dem Paket (file://). AVPlay wertet einen
   * fuehrenden "/" als LOKALEN Dateipfad, der auf dem Display nicht
   * existiert - prepare haengt dann fuer immer. DAS war die Ursache aller
   * bisherigen "Video startet ..."-Haenger.
   */
  function absUrl(u) {
    u = String(u || "");
    if (/^https?:\/\//i.test(u)) return u;
    return state.base + (u.charAt(0) === "/" ? "" : "/") + u;
  }

  /* ============================================================ Verfügbarkeit */

  /**
   * Prüft, ob dieses Display den nativen Weg überhaupt kann.
   * Alles-oder-nichts: Fehlt ein Baustein, bleibt der iframe-Weg aktiv.
   */
  function isAvailable() {
    var hasAvplay = safe(function () {
      return !!(global.webapis && global.webapis.avplay &&
                typeof global.webapis.avplay.open === "function");
    }, false);
    var hasDownload = safe(function () {
      return !!(global.tizen && global.tizen.download &&
                typeof global.tizen.download.start === "function");
    }, false);
    var hasFs = safe(function () {
      return !!(global.tizen && global.tizen.filesystem &&
                typeof global.tizen.filesystem.resolve === "function");
    }, false);

    log("Verfügbarkeit – avplay:", hasAvplay, "download:", hasDownload, "filesystem:", hasFs);
    return hasAvplay && hasDownload && hasFs;
  }

  /* ============================================================ Dateispeicher */

  /** Medienordner im privaten App-Speicher öffnen bzw. anlegen. */
  function openDir(cb) {
    if (state.dir) { cb(null, state.dir); return; }

    global.tizen.filesystem.resolve(STORAGE, function (root) {
      var dir = safe(function () { return root.resolve(SUBDIR); }, null);
      if (!dir) {
        dir = safe(function () { return root.createDirectory(SUBDIR); }, null);
      }
      if (!dir) { cb(new Error("Medienordner konnte nicht angelegt werden")); return; }
      state.dir = dir;
      log("Medienordner:", safe(function () { return dir.fullPath; }, "?"));
      cb(null, dir);
    }, function (e) {
      cb(new Error("Speicher nicht erreichbar: " + (e && e.message)));
    }, "rw");
  }

  /** Aus einer Server-URL einen stabilen, kollisionsfreien Dateinamen bauen. */
  function fileNameFor(url) {
    var clean = String(url).split("?")[0];
    var tail = clean.substring(clean.lastIndexOf("/") + 1) || "video.mp4";
    tail = tail.replace(/[^A-Za-z0-9._-]/g, "_");

    // Kurzer Hash der vollen URL, damit gleichnamige Dateien aus
    // verschiedenen Pfaden nicht kollidieren.
    var h = 5381;
    for (var i = 0; i < clean.length; i++) {
      h = ((h << 5) + h + clean.charCodeAt(i)) & 0xffffffff;
    }
    var hash = Math.abs(h).toString(36);

    var dot = tail.lastIndexOf(".");
    var stem = dot > 0 ? tail.substring(0, dot) : tail;
    var ext = dot > 0 ? tail.substring(dot) : ".mp4";
    return (stem.substring(0, 40) + "_" + hash + ext);
  }

  /** Liegt die Datei schon lokal? Liefert den Pfad oder null. */
  function localPathIfPresent(url) {
    // Laufender Download = Datei ist halbfertig -> NICHT verwenden.
    // (Genau daraus entstand der sporadische PLAYER_ERROR_INVALID_URI.)
    if (state.downloading[url]) return null;
    if (state.localPaths[url]) return state.localPaths[url];
    if (!state.dir) return null;

    var name = fileNameFor(url);
    var f = safe(function () { return state.dir.resolve(name); }, null);
    if (f && !f.isDirectory) {
      // WICHTIG: toURI() liefert die echte file://-Adresse. fullPath ist nur
      // Tizens virtueller Pfad ("wgt-private/...") - den quittiert AVPlay
      // mit PLAYER_ERROR_INVALID_URI.
      var p = safe(function () { return f.toURI(); }, null) ||
              safe(function () { return f.fullPath; }, null);
      if (p) { state.localPaths[url] = p; return p; }
    }
    return null;
  }

  /**
   * Datei herunterladen, falls noch nicht vorhanden.
   * cb(err, lokalerPfad)
   */
  function ensureLocal(url, cb, attempt) {
    attempt = attempt || 1;

    var have = localPathIfPresent(url);
    if (have) { cb(null, have); return; }

    if (state.downloading[url]) {
      // Läuft bereits – kurz warten und erneut schauen.
      setTimeout(function () { ensureLocal(url, cb, attempt); }, 700);
      return;
    }

    openDir(function (err, dir) {
      if (err) { cb(err); return; }

      var name = fileNameFor(url);
      state.downloading[url] = true;
      log("Download startet im Hintergrund:", url, "->", name);

      var partName = name + ".part";
      var req = new global.tizen.DownloadRequest(url, dir.fullPath, partName);

      var listener = {
        onprogress: function (id, received, total) {
          // Nur ins Protokoll - der Splash darf hier nicht mehr erscheinen,
          // weil das Video zu diesem Zeitpunkt bereits laeuft.
          if (!total) return;
          var pct = Math.round((received / total) * 100);
          if (pct % 25 === 0) log("Download", name, pct + "%");
        },
        onpaused: function () {},
        oncanceled: function () {
          delete state.downloading[url];
          cb(new Error("Download abgebrochen"));
        },
        oncompleted: function (id, fullPath) {
          // Fertig heruntergeladen -> von .part auf den finalen Namen
          // umbenennen. Erst DANACH ist die Datei fuer den Player sichtbar.
          dir.moveTo(dir.fullPath + "/" + partName, dir.fullPath + "/" + name, true,
            function () {
              delete state.downloading[url];
              var f = safe(function () { return dir.resolve(name); }, null);
              var p = f && (safe(function () { return f.toURI(); }, null) ||
                            safe(function () { return f.fullPath; }, null));
              if (!p) { cb(new Error("Pfad nach Download unbekannt")); return; }
              state.localPaths[url] = p;
              log("Download fertig:", p);
              cb(null, p);
            },
            function (e) {
              delete state.downloading[url];
              cb(new Error("Umbenennen fehlgeschlagen: " + (e && e.message)));
            });
        },
        onfailed: function (id, error) {
          delete state.downloading[url];
          var msg = (error && (error.message || error.name)) || "unbekannt";
          log("Download fehlgeschlagen:", msg, "(Versuch " + attempt + ")");
          if (attempt < DOWNLOAD_RETRY) {
            setTimeout(function () { ensureLocal(url, cb, attempt + 1); }, 1500);
          } else {
            cb(new Error("Download fehlgeschlagen: " + msg));
          }
        }
      };

      var downloadId = null;
      var fertig = false;
      var origComplete = listener.oncompleted;
      var origFailed = listener.onfailed;
      listener.oncompleted = function (id, fp) { fertig = true; origComplete(id, fp); };
      listener.onfailed = function (id, e) { fertig = true; origFailed(id, e); };

      try {
        downloadId = global.tizen.download.start(req, listener);
      } catch (e) {
        delete state.downloading[url];
        cb(new Error("Download nicht startbar: " + (e && e.message)));
        return;
      }

      // Notbremse: Manche Firmwares melden weder Erfolg noch Fehler und der
      // Download haengt still. Nach 5 Minuten abbrechen und aufgeben - die
      // Wiedergabe laeuft ohnehin schon vom Server.
      setTimeout(function () {
        if (fertig) return;
        log("Download-Zeitueberschreitung, breche ab:", url);
        safe(function () { if (downloadId !== null) global.tizen.download.cancel(downloadId); });
        delete state.downloading[url];
        cb(new Error("Download-Zeitueberschreitung"));
      }, 5 * 60 * 1000);
    });
  }

  /** Dateien löschen, die in der aktuellen Playlist nicht mehr vorkommen. */
  function pruneUnused() {
    if (!state.dir) return;
    var keep = {};
    for (var i = 0; i < state.playlist.length; i++) {
      var u = state.playlist[i] && state.playlist[i].url;
      if (u) keep[fileNameFor(absUrl(u))] = true;
    }

    state.dir.listFiles(function (files) {
      for (var j = 0; j < files.length; j++) {
        var f = files[j];
        var n = safe(function () { return f.name; }, "");
        if (!n) continue;
        // .part-Reste abgebrochener Downloads immer entsorgen
        if (!/\.part$/i.test(n) && keep[n]) continue;
        if (/\.part$/i.test(n)) { /* immer loeschen */ }
        else if (keep[n]) continue;
        log("verwaiste Datei entfernen:", n);
        safe(function () { state.dir.deleteFile(f.fullPath, function () {}, function () {}); });
      }
    }, function () {});
  }

  /* ============================================================ AVPlay */
  /*
   * Umgesetzt nach Samsungs offiziellem Signage-Beispiel
   * "AVPlaySeamlessStillMode" (Apache-2.0, github.com/SamsungDForum):
   *   - ZWEI Player ueber webapis.avplaystore.getPlayer() statt des
   *     einzelnen webapis.avplay (Singleton ist auf Signage unzuverlaessig).
   *   - Reihenfolge: open -> setListener -> setDisplayRect(0,0,1920,1080)
   *     -> prepare() SYNCHRON -> play().
   *   - Wechsel: alter Player setVideoStillMode("true") + stop() ->
   *     letztes Bild bleibt stehen, nahtlos, kein Schwarz.
   */

  var av = { players: null, active: -1, gen: 0 };

  function avInit() {
    if (av.players) return av.players;
    var st = global.webapis && global.webapis.avplaystore;
    if (st && typeof st.getPlayer === "function") {
      av.players = [st.getPlayer(), st.getPlayer()];
      log("avplaystore: zwei Player-Instanzen (Samsung-Signage-Muster)");
    } else {
      av.players = [global.webapis.avplay];
      log("avplaystore fehlt - Rueckfall auf einzelnen avplay");
    }
    return av.players;
  }

  function avStop() {
    var ps = av.players || [];
    for (var i = 0; i < ps.length; i++) {
      (function (pl) {
        safe(function () { pl.stop(); });
        safe(function () { pl.close(); });
      })(ps[i]);
    }
    av.active = -1;
    av.gen++;
    state.playing = false;
  }

  function avPlayFile(path, onEnded, onError) {
    var ps = avInit();
    var nextIdx = ps.length > 1 ? (av.active === 0 ? 1 : 0) : 0;
    var np = ps[nextIdx];
    var op = av.active >= 0 ? ps[av.active] : null;
    var myGen = ++av.gen;

    var listener = {
      onbufferingstart: function () {},
      onbufferingprogress: function () {},
      onbufferingcomplete: function () {},
      oncurrentplaytime: function () {},
      onevent: function () {},
      ondrmevent: function () {},
      onstreamcompleted: function () {
        if (myGen !== av.gen) return;
        log("Stream zu Ende");
        if (typeof onEnded === "function") onEnded();
      },
      onerror: function (e) {
        if (myGen !== av.gen) return;
        var msg = (e && (e.message || e.name)) || String(e || "unbekannt");
        log("AVPlay-Fehler:", msg);
        if (typeof onError === "function") onError(new Error(msg));
      }
    };

    try {
      if (op && ps.length > 1) {
        safe(function () { op.setVideoStillMode("true"); });
        safe(function () { op.stop(); });
      } else if (ps.length === 1) {
        safe(function () {
          var stt = np.getState();
          if (stt && stt !== "NONE" && stt !== "IDLE") { np.stop(); np.close(); }
        });
      }

      np.open(path);
      np.setListener(listener);
      np.setDisplayRect(0, 0, 1920, 1080);
      np.prepare();
      // Die Drehung macht jetzt AVPlay selbst - NACH prepare (Zustand READY).
      // Der fruehere Haenger mit diesem Befehl war sehr wahrscheinlich die
      // damals kaputte URL, nicht die Drehung. Steht das Bild auf dem Kopf:
      // 90 -> 270 tauschen.
      safe(function () { np.setDisplayRotation("PLAYER_DISPLAY_ROTATION_90"); });
      safe(function () { np.setVideoStillMode("false"); });
      np.play();

      av.active = nextIdx;
      avplayReady = true;
      state.playing = true;
      status("", "");
      log("Wiedergabe läuft (" + BUILD_TAG + "):", path);
    } catch (e) {
      var m = (e && (e.message || e.name)) || "Start fehlgeschlagen";
      log("avPlayFile Ausnahme:", m);
      status("Video-Fehler: " + m + " (" + BUILD_TAG + ")", path);
      if (typeof onError === "function") onError(new Error(m));
    }
  }

  var avplayReady = false;

  /* ============================================================ Playlist */

  /** Reine Fortschaltlogik – bewusst identisch zum Web-Player. */
  function nextStep(list, i, left) {
    if (list.length <= 1) return { idx: i, playsLeft: left, action: "replay" };
    left -= 1;
    if (left > 0) return { idx: i, playsLeft: left, action: "replay" };
    var ni = (i + 1) % list.length;
    return { idx: ni, playsLeft: list[ni].repeat || 1, action: "advance" };
  }

  function announce(videoId) {
    safe(function () {
      if (state.ws && state.ws.readyState === 1) {
        state.ws.send(JSON.stringify({
          type: "playing", slot: state.screen, videoId: videoId || null
        }));
      }
    });
  }

  function prefetchNext() {
    if (state.playlist.length < 2) return;
    var nxt = state.playlist[(state.idx + 1) % state.playlist.length];
    if (!nxt || !nxt.url) return;
    var nurl = absUrl(nxt.url);
    if (!localPathIfPresent(nurl)) ensureLocal(nurl, function () {});
  }

  function playCurrent() {
    var item = state.playlist[state.idx];
    if (!item || !item.url) return;

    // WICHTIG: Es wird NICHT auf den Download gewartet.
    // AVPlay spielt auch Netzwerkadressen direkt ab und puffert dabei
    // deutlich besser als ein HTML5-<video>. Liegt die Datei bereits
    // lokal, wird sie genommen; sonst startet die Wiedergabe sofort vom
    // Server und die Datei wandert im Hintergrund auf den Speicher.
    // Ab dem naechsten Durchlauf laeuft sie dann lokal.
    var url = absUrl(item.url);
    var local = localPathIfPresent(url);
    var quelle = local || url;

    log(local ? "spiele lokal:" : "streame vom Server:", quelle);
    // Nur vor dem allerersten Video anzeigen - bei Uebergaengen zwischen
    // Clips darf NIE ein Splash/Boot-Element aufblitzen.
    if (!state.playing) {
      status("Video startet … (" + BUILD_TAG + ")",
             (local ? "lokal: " : "Server: ") + quelle);
    }

    avPlayFile(quelle, function () {
      // Stream zu Ende - fortschalten oder wiederholen.
      var s = nextStep(state.playlist, state.idx, state.playsLeft);
      state.idx = s.idx;
      state.playsLeft = s.playsLeft;
      playCurrent();
    }, function (e) {
      log("Wiedergabefehler:", e.message);
      state.lastError = e.message;
      // Selbstheilung: War die Quelle eine lokale Datei, ist sie offenbar
      // beschaedigt -> Cache-Eintrag verwerfen, Datei loeschen und sofort
      // direkt vom Server streamen statt in den Fehler zu laufen.
      if (local) {
        delete state.localPaths[url];
        safe(function () {
          var bn = fileNameFor(url);
          state.dir.deleteFile(state.dir.fullPath + "/" + bn, function () {}, function () {});
        });
        log("lokale Datei verworfen, streame vom Server");
        avPlayFile(url, function () {
          var s2 = nextStep(state.playlist, state.idx, state.playsLeft);
          state.idx = s2.idx; state.playsLeft = s2.playsLeft; playCurrent();
        }, function (e2) {
          log("auch Streamen fehlgeschlagen:", e2.message);
          state.lastError = e2.message;
        });
        return;
      }
      status("Video-Fehler: " + e.message + " (" + BUILD_TAG + ")", quelle);
      setTimeout(function () {
        var s = nextStep(state.playlist, state.idx, 1);
        state.idx = s.idx;
        state.playsLeft = state.playlist[state.idx] ? (state.playlist[state.idx].repeat || 1) : 1;
        playCurrent();
      }, 2500);
    });

    announce(item.videoId);

    // Im Hintergrund lokal ablegen - ohne die Wiedergabe aufzuhalten.
    if (!local) ensureLocal(url, function () {});
    prefetchNext();
  }

  function setPlaylist(list) {
    list = Array.prototype.slice.call(list || []);
    var key = JSON.stringify(list.map(function (e) {
      return String(e && e.url) + "@" + ((e && e.repeat) || 1);
    }));
    if (key === state.currentKey) return;   // unverändert – weiterlaufen lassen
    state.currentKey = key;
    state.playlist = list;
    state.idx = 0;

    if (!list.length) {
      avStop();
      status("Keine Videos für diesen Bildschirm", "");
      announce(null);
      return;
    }

    state.playsLeft = list[0].repeat || 1;
    log("neue Playlist:", list.length, "Element(e)");
    openDir(function () {
      pruneUnused();
      playCurrent();
    });
  }

  /* ============================================================ WebSocket */

  function wsUrl() {
    var b = String(state.base || "").replace(/^https?:\/\//i, "");
    return "ws://" + b;
  }

  function connect() {
    safe(function () { if (state.ws) state.ws.close(); });

    var ws;
    try {
      ws = new global.WebSocket(wsUrl());
    } catch (e) {
      log("WebSocket nicht aufbaubar:", e && e.message);
      setTimeout(connect, RETRY_MS);
      return;
    }
    state.ws = ws;

    ws.onopen = function () {
      log("WebSocket offen");
      safe(function () {
        ws.send(JSON.stringify({ type: "hello", role: "player", slot: state.screen }));
      });
    };

    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.type === "live" && msg.screens) {
        setPlaylist(msg.screens[state.screen]);
      } else if (msg.type === "state" && msg.state && msg.state.live) {
        setPlaylist(msg.state.live[state.screen]);
      } else if (typeof msg.type === "string" && msg.type.indexOf("game-") === 0) {
        // Spiel-Nachrichten an das Spielmodul weiterreichen (falls geladen).
        if (global.MB_GAME && typeof global.MB_GAME.onMessage === "function") {
          safe(function () { global.MB_GAME.onMessage(msg); });
        }
      }
    };

    ws.onclose = function () {
      log("WebSocket zu – neuer Versuch in " + RETRY_MS + "ms");
      setTimeout(connect, RETRY_MS);
    };

    ws.onerror = function () { safe(function () { ws.close(); }); };
  }

  /* ============================================================ API */

  /**
   * Startet den nativen Player.
   *   base    z.B. "http://192.168.2.60:8787"
   *   screen  Bildschirm-Nummer als String
   *   opts    { onStatus: function(text, detail) }
   */
  function start(base, screen, opts) {
    state.base = String(base || "").replace(/\/+$/, "");
    state.screen = String(screen || "1");
    state.onStatus = opts && opts.onStatus;

    if (state.started) {
      // Nur Bildschirm gewechselt: Playlist verwerfen und neu anfordern.
      state.currentKey = null;
      safe(function () {
        if (state.ws && state.ws.readyState === 1) {
          state.ws.send(JSON.stringify({ type: "hello", role: "player", slot: state.screen }));
        }
      });
      return true;
    }

    state.started = true;
    log("Start – Server:", state.base, "Bildschirm:", state.screen);
    status("Verbinde mit " + state.base, "Bildschirm " + state.screen);
    openDir(function (err) {
      if (err) log("Speicher-Warnung:", err.message);
      connect();
    });
    return true;
  }

  function stop() {
    avStop();
    safe(function () { if (state.ws) state.ws.close(); });
    state.ws = null;
    state.started = false;
    state.currentKey = null;
  }

  function info() {
    return {
      available: isAvailable(),
      base: state.base,
      screen: state.screen,
      items: state.playlist.length,
      idx: state.idx,
      playing: state.playing,
      cached: Object.keys(state.localPaths).length,
      lastError: state.lastError
    };
  }

  /* --------- Schnittstelle fuer das Spiel (game.js) ---------------------- */

  // Nachricht an den Server schicken (Slot wird automatisch ergaenzt).
  function send(obj) {
    safe(function () {
      if (state.ws && state.ws.readyState === 1) {
        obj = obj || {};
        if (!obj.slot) obj.slot = state.screen;
        state.ws.send(JSON.stringify(obj));
      }
    });
  }

  // Video anhalten, damit das Spiel Vollbild hat (Dekoder freigeben).
  function gamePause() {
    avStop();
  }

  // Nach dem Spiel: aktuelles Video wieder starten.
  function gameResume() {
    if (state.playlist.length) playCurrent();
  }

  global.MB_NATIVE = {
    isAvailable: isAvailable,
    start: start,
    stop: stop,
    info: info,
    send: send,
    gamePause: gamePause,
    gameResume: gameResume,
    // für Tests aus der Konsole
    _nextStep: nextStep
  };
})(window);
