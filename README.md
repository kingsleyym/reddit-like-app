# MenuBoard – Synchrones 4K-Menü-Board für 3 Bildschirme

Eine kleine Windows-App für ein Restaurant-Menüboard mit **drei Bildschirmen**
an einem Mini-PC (3× HDMI). Jeder Bildschirm zeigt ein Video im Dauer-Loop und
Vollbild. Über ein **Dashboard** (Handy, Tablet oder Laptop – auch von zu Hause)
kannst du Videos hochladen, das Mittags-/Abendmenü tauschen und den Nachtbetrieb
(automatisch Schlafen + Aufwachen) steuern.

Alles läuft **lokal auf dem Mini-PC**. Die Videos werden auf dem PC gespeichert
und spielen offline – kein Internet im laufenden Betrieb nötig.

---

## Was der Kunde installiert

Nur **eine Datei**: `MenuBoard-Setup.exe`. Doppelklick → Installieren → fertig.
Kein Node, keine zusätzliche Software. Alles ist in der `.exe` enthalten.

### Woher kommt die .exe?

Sie wird automatisch auf GitHub gebaut (auf einem echten Windows-Rechner):

1. Auf GitHub → Reiter **Actions** → Workflow **„Build Windows .exe"**.
2. Den neuesten erfolgreichen Lauf öffnen.
3. Unter **Artifacts** → **MenuBoard-Setup** herunterladen (ZIP mit der `.exe`).

---

## Einrichtung auf dem Mini-PC (einmalig)

1. **Drei Monitore anschließen** (3× HDMI) und in den Windows-Anzeige-
   einstellungen als *erweitert* (nebeneinander) einrichten.
2. `MenuBoard-Setup.exe` installieren und starten. Die App öffnet automatisch
   auf jedem Monitor ein Vollbild-Fenster.
   - Die Zuordnung ist automatisch: **linker / mittlerer / rechter** Monitor =
     sortiert nach Bildschirmposition. Falls vertauscht, im Dashboard unter
     „Bildschirme" anpassen.
3. **Autostart**: Die App trägt sich selbst in den Windows-Autostart ein, läuft
   also nach jedem Hochfahren automatisch.
4. **BIOS** (empfohlen): „Power On After AC Loss" / „Restore on AC Power"
   aktivieren – dann fährt der PC nach einem Stromausfall von selbst wieder hoch.
5. **Fernzugriff von zu Hause** mit Tailscale:
   - [Tailscale](https://tailscale.com/) auf dem Mini-PC installieren und mit
     deinem Account anmelden.
   - Tailscale auf deinem Handy/Laptop installieren (gleicher Account).
   - Dann das Dashboard von überall öffnen:
     `http://<Tailscale-IP-des-PCs>:8787`

### Dashboard öffnen

- **Im Lokal** (gleiches WLAN): `http://<lokale-IP-des-PCs>:8787`
  (die IP steht in Windows unter „Eigenschaften" der Netzwerkverbindung).
- **Von zu Hause**: über die Tailscale-IP (siehe oben).
- **Am PC selbst**: `http://localhost:8787`

---

## Nachtbetrieb (automatisch aus/an)

Im Dashboard unter „Nachtbetrieb":

- **Schlafen um** (z. B. 23:30) – der PC geht abends in den Ruhezustand (~1–2 W).
- **Aufwachen um** (z. B. 08:30) – Windows weckt den PC morgens automatisch.

> Hinweis: Damit der Zeitplan eingerichtet werden kann, muss die App **einmalig
> als Administrator** laufen (Rechtsklick → „Als Administrator ausführen"), weil
> dafür Windows-Aufgaben angelegt werden. Danach läuft alles automatisch.

---

## Videos aus After Effects exportieren (wichtig!)

Damit die Wiedergabe ruckelfrei läuft, **nicht** die rohe AE-Ausgabe abspielen,
sondern in **H.264, 4K, 25/30 fps** umwandeln. H.264 wird von der Grafikeinheit
des Mini-PCs garantiert in Hardware dekodiert.

Mit [ffmpeg](https://ffmpeg.org/) (auf deinem eigenen Rechner, nicht auf dem
Kunden-PC):

```bash
ffmpeg -i menue_master.mov \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -b:v 30M -maxrate 35M -bufsize 60M \
  -r 30 -g 60 -an \
  -movflags +faststart \
  menue_4k.mp4
```

- `-g 60` (Keyframe alle 2 s) sorgt für sauberes Loopen.
- `-an` entfernt die Tonspur (Menüboard braucht keinen Ton).
- Für nahtlose Schleife: Anfang und Ende des Videos sollten visuell ineinander
  übergehen (im After-Effects-Projekt gestalten).

---

## Für Entwickler (lokal testen)

```bash
npm install
npm start        # startet Electron + Server lokal
npm run lint     # Syntax-Check
npm run dist     # baut die Windows-.exe (nur auf Windows)
```

Standard-Port: **8787**. Player-Seite: `/player?screen=left|middle|right`.
Dashboard: `/` bzw. `/dashboard`.

### Aufbau

| Datei | Zweck |
|-------|-------|
| `electron/main.js` | Erstellt die 3 Vollbild-Fenster pro Monitor, Auto-Recovery |
| `electron/power.js` | Nachtbetrieb (Schlafen/Aufwachen) über Windows-Aufgaben |
| `server/index.js` | Web-Server: Dashboard, Upload, Live-Updates (WebSocket) |
| `server/store.js` | Lokale Konfiguration & Video-Liste (JSON) |
| `renderer/player.html` | Vollbild-Player mit weichem Video-Wechsel |
| `renderer/dashboard.html` | Bedienoberfläche |
