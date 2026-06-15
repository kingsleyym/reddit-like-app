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

## Tag- und Abend-Szenen

Das Board kennt zwei **Szenen**: **Tag** (z. B. Mittagsmenü) und **Abend**.
Jede Szene legt fest, welches Video auf links / Mitte / rechts läuft.

- Oben im Dashboard mit einem Tipp zwischen Tag und Abend umschalten – der
  Wechsel erscheint sofort auf allen Bildschirmen.
- Unter „Szene bearbeiten" stellst du je Szene ein, welches Video wohin kommt.
- **Automatik Tag → Abend**: optional automatisch nach Uhrzeit umschalten
  (z. B. Tag ab 11:00, Abend ab 17:00).

## Mediathek

Videos werden hochgeladen (auch von zu Hause über Tailscale), bekommen eine
Vorschau, lassen sich umbenennen und löschen. Zuweisen an einen Bildschirm per
Tippen in der Szene.

## Nachtbetrieb (automatisch aus/an)

Im Dashboard unter „Nachtbetrieb":

- **Schlafen um** (z. B. 23:30) – der PC geht abends in den Ruhezustand (~1–2 W).
- **Aufwachen um** (z. B. 08:30) – Windows weckt den PC morgens automatisch.

> Hinweis: Damit der Zeitplan eingerichtet werden kann, muss die App **einmalig
> als Administrator** laufen (Rechtsklick → „Als Administrator ausführen"), weil
> dafür Windows-Aufgaben angelegt werden. Danach läuft alles automatisch.

---

## Wo liegen die Dateien?

Alles lokal auf dem PC unter dem Windows-Benutzerprofil:

```
C:\Users\<Name>\AppData\Roaming\MenuBoard\
  media\        ← alle hochgeladenen Videos
  config.json   ← Einstellungen (Szenen, Zeitplan, Zuordnung)
```

Schnellzugriff: im Explorer `%AppData%\MenuBoard` in die Adresszeile eingeben.
Im Dashboard zeigen **Einstellungen → Speicherort** den genauen Pfad an, plus
einen Knopf „Medien-Ordner öffnen".

## Wartungsmodus & Autostart

- **Autostart mit Windows**: standardmäßig an. Im Dashboard abschaltbar.
- **Wartungsmodus**: schließt die Vollbild-Player, damit der PC bedienbar ist
  (z. B. für Einstellungen). Die App bleibt im Tray, der Player kommt nicht von
  selbst zurück, bis der Modus wieder aus ist. Erreichbar über das Dashboard
  oder das Tray-Symbol (Rechtsklick). Nach einem Neustart läuft das Board
  automatisch wieder normal.

## Wie funktioniert der Fernzugriff (Tailscale)?

Tailscale ist nur die **sichere Leitung** zum PC – ein verschlüsselter privater
Tunnel. Die App-Kommunikation läuft immer über denselben **lokalen Server** auf
dem PC (Port 8787). Ob im Lokal (WLAN) oder von zu Hause (Tailscale): es ist
derselbe Server, nur der Weg dorthin unterscheidet sich.

## Mit nur einem Monitor testen

Die App läuft auch mit einem einzigen Bildschirm: Sie legt dann nur ein
Vollbild-Fenster an (Slot „Links"). Schließt du später die zwei weiteren
Fernseher an, verteilen sich die Slots automatisch.

Da der Player den Desktop verdeckt, gibt es Tastenkürzel direkt am PC:

| Kürzel | Funktion |
|--------|----------|
| `Strg` + `Shift` + `D` | Dashboard in einem Fenster auf diesem PC öffnen |
| `Strg` + `Shift` + `Q` | App beenden (Kiosk verlassen, z. B. für Wartung) |

Alternativ das Dashboard wie im Betrieb vom Handy öffnen
(`http://<IP-des-PCs>:8787`).

> Internet wird nur zum **Herunterladen** der `.exe` und beim Installieren
> gebraucht. Danach läuft alles offline.

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
