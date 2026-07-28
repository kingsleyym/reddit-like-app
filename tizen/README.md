# MenuBoard auf Samsung-Signage-Displays (Tizen / SSSP)

Diese Anleitung bringt den MenuBoard-Player als **native Tizen-App** auf die
Samsung-Signage-Displays. Kein Zusatzgerät, keine laufenden Kosten – die
Displays holen sich die App selbst vom MenuBoard-Server im Lokal.

---

## 1. Wie das Ganze funktioniert

```
   Zentraler PC                                Samsung-Display
   ┌──────────────────────────┐                ┌────────────────────────┐
   │ standalone.js  Port 8787 │                │ Menü → Custom App      │
   │                          │                │  http://<IP>:8787/     │
   │  /tizen/2/sssp_config.xml│ ◀───(1) GET ───┤        tizen/2         │
   │  /tizen/2/MenuBoard.wgt  │ ◀───(2) GET ───┤                        │
   │                          │                │  installiert die App   │
   │  /api/tizen/assign       │ ◀───(3) ───────┤  Widget fragt seine    │
   │                          │                │  Bildschirm-Nummer ab  │
   │  /player?screen=2        │ ◀───(4) ───────┤  zeigt den Player      │
   └──────────────────────────┘                └────────────────────────┘
```

1. Am Display wird unter **Custom App** die *Ordner-Adresse* `http://<SERVER-IP>:8787/tizen/2`
   eingetragen (die `2` ist die Bildschirm-Nummer).
2. Das Display lädt `sssp_config.xml`, liest daraus Version und Paketnamen und
   lädt danach das signierte `.wgt`-Paket aus demselben Ordner.
3. Die installierte App startet ab jetzt bei **jedem Einschalten automatisch**.
4. Beim Start meldet sie sich beim Server, bekommt ihre Bildschirm-Nummer
   zugewiesen und lädt `http://<SERVER-IP>:8787/player?screen=<N>` im Vollbild.

**Ein Paket genügt für alle vier Displays.** Der Server merkt sich, über
welche Install-Adresse ein Gerät gekommen ist, und teilt dem Widget beim ersten
Start die passende Nummer mit. Umhängen geht später jederzeit im Dashboard
unter *Mehr → Samsung-Displays* – ohne Neuinstallation.

---

## 2. Was du brauchst

| | |
|---|---|
| Windows-/Mac-/Linux-PC | zum Bauen (einmalig; kann derselbe PC sein, auf dem der Server läuft) |
| Node.js | ist bereits da, wenn MenuBoard läuft |
| Tizen Studio 6.1 (CLI reicht) | https://developer.tizen.org/development/tizen-studio/download |
| Java 8+ | von Tizen Studio benötigt |
| Samsung-Konto | nur für **Variante B** (Tizen 7/8) |
| Zugriff auf die Displays | zum Eintragen der Adresse und für die DUID |

Vorher prüfen: `http://<SERVER-IP>:8787/player?screen=1` muss im Handy-Browser
laufen. Wenn das nicht geht, hilft die Tizen-App auch nicht.

---

## 3. Schritt 1 – Tizen Studio installieren

Es reicht die **CLI-Variante** (`web-cli_…`), wenn du bei Variante A bleibst.
Für Variante B (Samsung-Zertifikat) brauchst du die **IDE-Variante**
(`web-ide_…`), weil der Certificate Manager eine grafische Oberfläche ist.

Download-Index: <https://download.tizen.org/sdk/Installer/tizen-studio_6.1/>

* Windows: `web-ide_Tizen_Studio_6.1_windows-64.exe` → Standardpfad `C:\tizen-studio`
* macOS: `web-ide_Tizen_Studio_6.1_macos-64.dmg`
* Linux: `web-ide_Tizen_Studio_6.1_ubuntu-64.bin`

Headless/Linux geht auch:

```bash
./web-cli_Tizen_Studio_6.1_ubuntu-64.bin --accept-license --no-java-check /opt/tizen-studio
```

Prüfen, dass die CLI erreichbar ist:

```bash
# Linux/macOS
~/tizen-studio/tools/ide/bin/tizen version
:: Windows
C:\tizen-studio\tools\ide\bin\tizen.bat version
```

Praktisch, aber nicht nötig: den Ordner `tools/ide/bin` in den PATH aufnehmen.
Die Build-Skripte hier finden die CLI auch an den Standardpfaden von allein.

---

## 4. Schritt 2 – Zertifikat erstellen

Ein `.wgt` muss **zweifach signiert** sein: Author-Zertifikat (wer hat die App
gebaut) und Distributor-Zertifikat (wer darf sie installieren). Ohne beides
verweigert das Display die Installation.

Es gibt zwei Wege. **Fang mit Variante A an** – sie ist in zehn Minuten
erledigt und braucht kein Samsung-Konto. Nur wenn das Display die
Installation ablehnt, gehst du zu Variante B.

### Variante A – Tizen-Zertifikat (selbstsigniert)

Funktioniert zuverlässig auf **Tizen 4.0 und 6.0/6.5** (Modellreihen QMN, QBN,
QEN, OMN, OHN, QMR, QBR, QHB, QBB, QMB …).

```bash
# Linux/macOS
cd tizen
./setup-cert.sh
```

```bat
:: Windows
cd tizen
setup-cert.bat
```

Das Skript macht genau zwei Dinge, die du auch von Hand ausführen kannst:

```bash
tizen certificate -a MenuBoard -p menuboard \
  -c DE -s Bayern -ct Muenchen -o MenuBoard -u IT \
  -n "MenuBoard Admin" -e admin@menuboard.local -f menuboard

tizen security-profiles add -n MenuBoard \
  -a ~/tizen-studio-data/keystore/author/menuboard.p12 -p menuboard
```

Da `-d` (Distributor) fehlt, nimmt die CLI automatisch das in Tizen Studio
mitgelieferte Distributor-Zertifikat (Public-Level). Genau das will man hier.

### Variante B – Samsung-Zertifikat (bei Tizen 7 / 8 nötig)

Neuere Panels (QHC, QMC, QBC, OH…DX, Tizen 7.0+) prüfen die Zertifikatskette
strenger und lehnen das mitgelieferte Tizen-Distributor-Zertifikat ab. Dann
brauchst du ein **Samsung-Zertifikat**, in dem die **DUIDs deiner Displays**
eingetragen sind. Das ist kostenlos, aber an ein Samsung-Konto gebunden.

1. **DUID an jedem Display ablesen:**
   `Menü → Support → Contact Samsung → Unique Device ID`
   (auf manchen Modellen: `Über dieses Gerät` / `About TV → Unique ID`).
   Alle vier notieren.
2. Tizen Studio öffnen → **Tools → Certificate Manager** → `+`
3. **Samsung** wählen (nicht *Tizen*) → **TV** → **Public** (nicht *Partner*)
4. Mit dem Samsung-Konto anmelden.
5. Author-Zertifikat erstellen (Name z. B. `MenuBoard`, Passwort merken).
6. Beim Distributor-Zertifikat die **vier DUIDs** eintragen.
   Bis zu 50 Geräte pro Profil sind möglich.
7. Fertig. Die Dateien liegen unter
   `~/SamsungCertificate/MenuBoard/` bzw. `C:\Users\<du>\SamsungCertificate\MenuBoard\`.

Profil für die CLI registrieren (falls Tizen Studio das nicht schon getan hat):

```bash
tizen security-profiles add -n MenuBoard \
  -a ~/SamsungCertificate/MenuBoard/author.p12      -p <AUTHOR-PASSWORT> \
  -d ~/SamsungCertificate/MenuBoard/distributor.p12 -dp <DIST-PASSWORT>
```

> **Wichtig:** Ein Werksreset (`Self Diagnosis → Reset`) **ändert die DUID** –
> danach installiert die App nicht mehr und das Zertifikat muss neu erzeugt
> werden. `Reset Smart Hub` ist unkritisch. Gleiches gilt beim Tausch eines
> defekten Panels.

> **Kein Partner-Zertifikat nötig.** Public-Level reicht, solange die App keine
> Partner-Privilegien anfordert – und genau darauf ist das mitgelieferte
> `config.xml` ausgelegt. Nur wenn du mit `--partner` baust, brauchst du eins.

---

## 5. Schritt 3 – Bauen und signieren

```bash
cd tizen
node build.js --server http://192.168.1.50:8787 --profile MenuBoard
```

`--server` ist die Adresse des PCs, auf dem `standalone.js` läuft. Sie wird
ins Paket eingebacken und dient als Rückfall-Adresse, falls das Widget seine
Install-Adresse nicht auslesen kann. Beim nächsten Bauen wird sie gemerkt
(`tizen/.build-settings.json`), du kannst `--server` dann weglassen.

Was passiert:

1. `tizen/app/` wird nach `tizen/build/universal/` kopiert
2. `config.xml` bekommt die Versionsnummer aus `package.json`
3. `mb-config.js` wird mit Server-Adresse und Version geschrieben
4. `tizen build-web` erzeugt `.buildResult`
5. `tizen package -t wgt -s MenuBoard` signiert und packt
6. das fertige `MenuBoard.wgt` landet in `tizen/dist/` **und** im
   MenuBoard-Datenordner (`%ProgramData%\MenuBoard\tizen` bzw. `~/.menuboard/tizen`)

Nützliche Optionen:

| Option | Wirkung |
|---|---|
| `--no-deploy` | nicht in den Datenordner kopieren (nur `tizen/dist/`) |
| `--deploy <ordner>` | anderen Zielordner verwenden |
| `--version 1.2.0` | Version übersteuern |
| `--per-screen 4` | vier feste Pakete `MenuBoard1..4.wgt` statt eines universellen |
| `--partner` | Partner-Privilegien in `config.xml` aufnehmen |
| `--tizen <pfad>` | Pfad zur `tizen`-CLI, falls sie nicht gefunden wird |
| `--skip-package` | nur vorbereiten, nichts bauen (zum Nachschauen) |

Läuft der Server auf einem **anderen** PC als der Build: `--no-deploy` bauen und
`tizen/dist/MenuBoard.wgt` von Hand nach `%ProgramData%\MenuBoard\tizen\`
kopieren.

---

## 6. Schritt 4 – Server prüfen

Server starten (`node standalone.js`) und im Browser aufrufen:

```
http://<SERVER-IP>:8787/tizen
```

Dort stehen die Install-Adressen für alle Bildschirme, der Paketname und die
aktuelle Version. Zusätzlich muss

```
http://<SERVER-IP>:8787/tizen/1/sssp_config.xml
```

sauberes XML liefern, ungefähr so:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget>
	<ver>1.1.1-71d2865d8789</ver>
	<size>412963</size>
	<widgetname>MenuBoard</widgetname>
	<webtype>tizen</webtype>
</widget>
```

Und `http://<SERVER-IP>:8787/tizen/1/MenuBoard.wgt` muss die Datei
herunterladen.

Stell in der Dashboard-App unter **Mehr → Bildschirme** die Anzahl auf **4**,
sonst gibt es die Adressen `/tizen/4` nicht sinnvoll.

---

## 7. Schritt 5 – Am Display installieren

Je nach Firmware heißt der Menüpunkt unterschiedlich:

* Tizen 6.5+: `Home → Custom App → Install Custom App`
* Tizen 7: `Menü → System → Play via → Custom App`, zusätzlich `Features → App Management`
* ältere Geräte: `Menü → System → Play via → URL Launcher`, dann `URL Launcher Settings → Install Web App`

Vorgehen pro Display:

1. Netzwerk prüfen: Display und Server im selben LAN/WLAN.
2. **Datum und Uhrzeit am Display prüfen** (`Menü → System → Zeit`).
   Eine falsche Uhr ist die häufigste Ursache für „App kann nicht
   heruntergeladen werden“.
3. Adresse eintragen – **komplett klein geschrieben**, ohne Schrägstrich am Ende:

   ```
   http://192.168.1.50:8787/tizen/1
   ```

   Display 2 bekommt `/tizen/2`, Display 3 `/tizen/3`, Display 4 `/tizen/4`.
4. Bestätigen. Das Display lädt und installiert die App.
5. Display neu starten. Die App startet ab jetzt automatisch mit.
6. Zur Sicherheit noch einstellen:
   `Menü → System → Power Control → Auto Power On: Ein`,
   `Network Standby: Ein`, `No Signal Power Off: Aus`.

> Wenn „App kann nicht heruntergeladen werden“ kommt: **einmal mit
> Schrägstrich am Ende probieren** (`…/tizen/1/`). Manche Firmwares brauchen
> ihn, andere stören sich daran – der Server beantwortet beide Varianten,
> aber das Display baut die Anfrage unterschiedlich zusammen.

---

## 8. Bildschirm-Zuordnung ändern

Drei Wege, in dieser Reihenfolge der Priorität:

1. **Neuinstallation über eine andere Adresse** (`/tizen/3` statt `/tizen/1`) –
   überschreibt alles andere.
2. **Dashboard** → *Mehr → Samsung-Displays* → beim gewünschten Gerät die Nummer
   im Auswahlfeld ändern. Das Display übernimmt das innerhalb von ~15 Sekunden,
   ohne Neuinstallation.
3. **Fernbedienung am Display**: Taste **1–9** drücken → das Display schaltet
   sofort auf diesen Bildschirm und merkt sich das.

Mit **dreimal 0** öffnet sich am Display ein kleiner Einstellungs-Bildschirm,
in dem Server-IP, Port und Bildschirm-Nummer von Hand eingetragen werden
können (Ziffern tippen, `◀` löscht, `▶` fügt einen Punkt ein, `▲▼` wechselt
das Feld, `ENTER` speichert). Der Bildschirm zeigt außerdem Modell, IP und
DUID des Geräts an – praktisch, um Displays im Dashboard auseinanderzuhalten.

---

## 9. Neue Version ausrollen

Die Versionskennung `<ver>` in `sssp_config.xml` setzt der Server automatisch
aus Paketversion **und Prüfsumme der Datei** zusammen. Es reicht also:

```bash
cd tizen
node build.js --profile MenuBoard        # --server wird gemerkt
```

Neues `.wgt` im Datenordner → neue `<ver>` → beim nächsten **Einschalten**
installieren die Displays automatisch neu. Keine Handarbeit an XML-Dateien.

Nur den Player/das Dashboard geändert? Dann ist **kein** neues `.wgt` nötig –
das Widget lädt die Seite ohnehin bei jedem Start frisch vom Server. Es reicht
im Dashboard „Alle Displays neu laden“ zu drücken.

Optional lässt sich die Version festnageln: eine Datei `manifest.json` neben
dem `.wgt` mit `{"version": "1.4.0"}` – der Server hängt trotzdem die Prüfsumme
an, damit ein vergessener Versionssprung nichts kaputt macht.

---

## 10. Testplan

Von oben nach unten abarbeiten; jeder Schritt baut auf dem vorherigen auf.

| # | Test | Erwartung |
|---|---|---|
| 1 | `http://<IP>:8787/player?screen=1` im Handy-Browser | Video läuft |
| 2 | `node tizen/build.js …` | endet mit „Fertig.“ und nennt die Dateigröße |
| 3 | `tizen/dist/MenuBoard.wgt` mit einem Zip-Programm öffnen | enthält `author-signature.xml` **und** `signature1.xml` |
| 4 | `http://<IP>:8787/tizen` im Browser | Tabelle mit 4 Install-Adressen, Paket „vorhanden“ |
| 5 | `http://<IP>:8787/tizen/1/sssp_config.xml` | XML wie oben, `<size>` = Dateigröße |
| 6 | `http://<IP>:8787/tizen/1/MenuBoard.wgt` | Datei lädt herunter, Größe stimmt |
| 7 | Display 1: Adresse eintragen | Installation läuft durch |
| 8 | Display 1 aus- und wieder einschalten | App startet allein, Video läuft |
| 9 | Dashboard → Samsung-Displays | Display taucht als 🟢 online auf |
| 10 | Server beenden | Display zeigt nach ~30 s „Kein Kontakt zum MenuBoard-Server“ |
| 11 | Server wieder starten | Display lädt innerhalb von ~20 s von allein neu |
| 12 | Dashboard: Display auf Bildschirm 2 umhängen | Display wechselt binnen ~15 s |
| 13 | Fernbedienung: Taste `1` | Display wechselt sofort auf Bildschirm 1 |
| 14 | Displays 2–4 mit `/tizen/2` … `/tizen/4` installieren | jedes zeigt seinen eigenen Inhalt |
| 15 | `node build.js` erneut, Displays neu starten | neue Version wird automatisch installiert |
| 16 | Stromausfall simulieren (Steckdose) | alle Displays kommen selbstständig hoch |

---

## 11. Wenn etwas nicht geht

### „App kann nicht heruntergeladen werden“ / „Unable to download the app“

Das Display kommt nicht an Manifest oder Paket. In dieser Reihenfolge prüfen:

1. **Uhrzeit am Display** falsch → `Menü → System → Zeit` korrigieren, NTP an.
   Mit Abstand die häufigste Ursache.
2. **Schrägstrich am Ende**: einmal mit, einmal ohne probieren.
3. **Groß-/Kleinschreibung**: die komplette Adresse klein eintippen, auch `http`.
4. Adresse vom Handy im selben Netz aufrufen – kommt das XML an?
   Wenn nicht: Windows-Firewall, falsche IP, anderes VLAN.
5. Liegt wirklich ein `.wgt` im Datenordner? `http://<IP>:8787/tizen` sagt es.
6. Server-IP hat sich geändert (DHCP)? Dem Server-PC eine feste IP geben.

### „App kann nicht gestartet werden“ / „Unable to start the app“

Herunterladen hat geklappt, die Installation scheitert an der Signatur.
Praktisch immer ein Zertifikatsproblem:

* Du bist bei **Variante A** und das Display ist Tizen 7/8 → **Variante B** machen.
* Bei Variante B: DUID falsch abgetippt, oder das Display wurde seitdem
  auf Werkseinstellungen zurückgesetzt (neue DUID).
* Du hast mit `--partner` gebaut, hast aber nur ein Public-Zertifikat →
  ohne `--partner` neu bauen.
* Zertifikat abgelaufen (Samsung-Zertifikate laufen nach ~2 Jahren aus) →
  im Certificate Manager erneuern und neu signieren.

Der Fehlercode `install failed[118, -12]` (manchmal als `118012`) bedeutet
„Invalid certificate chain“ und gehört in diese Kategorie.

### Display bleibt schwarz, App startet aber

* Widget-Fehlerseite abwarten: nach ~30 s erscheint „Kein Kontakt zum
  MenuBoard-Server“ mit der Adresse, die es probiert. Stimmt sie nicht:
  dreimal `0` drücken und die richtige IP eintragen.
* Server-Adresse im Paket veraltet → mit korrektem `--server` neu bauen.
* Player-Seite selbst prüfen: `http://<IP>:8787/player?screen=1` im Browser.

### Installation läuft, aber die alte Version bleibt

`<ver>` hat sich nicht geändert. Prüfen mit
`http://<IP>:8787/tizen/1/sssp_config.xml` – nach einem neuen Build muss dort
eine andere Zeichenkette stehen. Falls nicht: liegt das neue `.wgt` wirklich im
Datenordner? Danach das Display **komplett aus- und einschalten**, nicht nur
die App neu starten – die Prüfung passiert beim Booten.

### Fernbedienung reagiert nicht

Die Tasten werden vom Widget selbst ausgewertet. Wenn gar nichts passiert,
liegt der Fokus im eingebetteten Player – Display kurz aus/ein, dann geht es
wieder. Notfalls die App über `Custom App → Uninstall` entfernen und neu
installieren.

---

## 12. Technischer Anhang

### Was der Server ausliefert

| Route | Zweck |
|---|---|
| `GET /tizen` | Übersichtsseite mit allen Install-Adressen |
| `GET /tizen/<N>` | Übersicht, merkt sich zugleich die Install-Absicht |
| `GET /tizen/<N>/sssp_config.xml` | SSSP-Manifest |
| `GET /tizen/<N>/<Name>.wgt` | signiertes Paket |
| `GET /api/tizen/assign` | Widget meldet sich, bekommt Bildschirm-Nummer |
| `GET /api/tizen/ping` | Erreichbarkeitstest |
| `GET /api/tizen/devices` | Liste der bekannten Displays |
| `POST /api/tizen/assign` | Dashboard: Display auf anderen Bildschirm legen |
| `POST /api/tizen/reload` | Dashboard: alle Displays neu laden |
| `POST /api/tizen/forget` | Dashboard: Gerät vergessen |

Doppelte Schrägstriche in der Adresse werden serverseitig eingeebnet, damit
`…/tizen/2//sssp_config.xml` genauso funktioniert wie ohne.

### Format von `sssp_config.xml`

Samsung dokumentiert das Format nicht öffentlich. Verwendet wird hier exakt
das Schema, das alle großen Signage-Anbieter (signageOS, Korbyt, EasySignage,
Signagelive, ScreenCloud, NoviSign, Smartsign) im Produktivbetrieb ausliefern:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget>
	<ver>…</ver>
	<size>…</size>
	<widgetname>…</widgetname>
	<webtype>tizen</webtype>
</widget>
```

* `<ver>` ist eine **Zeichenkette**, keine Zahl. Das Display vergleicht sie nur
  auf Ungleichheit – jede Änderung löst eine Neuinstallation aus, auch ein
  Rückschritt. Deshalb funktioniert hier „Version + Prüfsumme“.
* `<widgetname>` bestimmt den Dateinamen: das Display fragt
  `<basis>/<widgetname>.wgt` an. Groß-/Kleinschreibung muss stimmen.
* `<size>` wird von der Firmware nicht erzwungen (mehrere kommerzielle Anbieter
  liefern falsche Werte aus), wird hier aber trotzdem korrekt gesetzt.

Kursierende Formate mit `<sssp_config>`, `<app id>`, `<package_url>` oder
`<auto_start>` sind **keine echte Samsung-Spezifikation** und funktionieren
nicht.

### Aufbau des Widgets

```
tizen/app/
  config.xml      Tizen-Manifest (Vollbild, Netzwerk, CSP, Privilegien)
  index.html      Rahmen: Vollbild-iframe + Splash + Setup-Bildschirm
  loader.js       Logik: Adresse auflösen, Watchdog, Fernbedienung (reines ES5)
  mb-config.js    wird beim Bauen mit Server-Adresse überschrieben
  icon.png        App-Symbol
```

Der Player läuft in einem `<iframe>`, nicht als Top-Level-Navigation. Damit
behält der äußere Rahmen die Samsung-APIs (Screensaver aus, Auto Power On) und
kann bei Server-Ausfall selbst neu laden – nach einem `location.href` auf eine
fremde Seite wäre beides weg.

`config.xml` setzt bewusst alle drei Netzwerk-Mechanismen: `<access origin="*">`
für XHR, `<tizen:allow-navigation>` für die Navigation und eine eigene
`<tizen:content-security-policy>`, weil Tizens Standard-CSP (`script-src 'self'`)
die Skripte der Player-Seite blockieren würde.

### Quellen

* [signageOS – Samsung Tizen Device Provisioning](https://developers.signageos.io/devices/device-provisioning/device-guides/samsung/samsung-tizen-device-provisioning/)
* [Xibo – Tizen Installation Guide](https://account.xibosignage.com/docs/setup/tizen-installation-guide)
* [Samsung Developer – Configuring Web Applications (Signage)](https://developer.samsung.com/signage/develop/guides/fundamentals/configuring-web-applications.html)
* [Samsung Developer – Creating a certificate](https://developer.samsung.com/tizen/certificate-signing/creating-certificate.html)
* [Tizen Docs – Command Line Interface](https://docs.tizen.org/application/tizen-studio/common-tools/command-line-interface/)
* [Samsung Forum – wgt not installing on Tizen 7.0 (cert)](https://forum.developer.samsung.com/t/wgt-web-app-not-installing-on-tizen-7-0-cert-related/28331)
* [Samsung Forum – Custom App via URL for Signage](https://forum.developer.samsung.com/t/custom-app-via-url-for-signage/29044)
