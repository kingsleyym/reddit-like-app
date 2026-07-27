# MenuBoard – Server-Setup (Samsung-Displays über Web-Loader)

Für den Standort mit **Samsung-Signage-Displays**: Ein Mini-PC im Serverraum
läuft nur als **Server**. Die Displays öffnen die Player-Seite selbst über ihren
eingebauten **URL Launcher** (kostenlos, keine MagicINFO-Lizenz). Kein HDMI,
keine GitHub Actions nötig.

## 1. Node.js installieren (einmalig)
- Auf dem Mini-PC [nodejs.org](https://nodejs.org) öffnen → **LTS**-Version
  (Windows Installer .msi) herunterladen und installieren. Einfach durchklicken.

## 2. MenuBoard-Ordner ablegen
- Den mitgelieferten Ordner `MenuBoard-Server` z. B. nach `C:\MenuBoard` kopieren.
- Testweise **`start-server.bat`** doppelklicken. Es sollte erscheinen:
  ```
  MenuBoard server läuft ...
  Dashboard: http://localhost:8787
             http://192.168.x.x:8787   <-- diese IP merken!
  ```
- Die Windows-Firewall-Abfrage mit **Zulassen** bestätigen (macht der Server
  auch automatisch für Port 8787).

## 3. Als Dienst einrichten (läuft ohne Login, startet bei Boot)
Damit der Server nach jedem Stromausfall **von allein** startet – auch ohne dass
sich jemand in Windows einloggt – als Windows-Dienst einrichten mit **NSSM**:

1. [nssm.cc](https://nssm.cc/download) → `nssm.exe` (win64) herunterladen, z. B.
   nach `C:\MenuBoard\nssm.exe`.
2. Eingabeaufforderung **als Administrator** öffnen und eingeben:
   ```
   C:\MenuBoard\nssm.exe install MenuBoard "C:\Program Files\nodejs\node.exe" "C:\MenuBoard\standalone.js"
   C:\MenuBoard\nssm.exe set MenuBoard AppDirectory "C:\MenuBoard"
   C:\MenuBoard\nssm.exe set MenuBoard Start SERVICE_AUTO_START
   C:\MenuBoard\nssm.exe start MenuBoard
   ```
3. Fertig. Der Server läuft jetzt dauerhaft und startet nach jedem Boot selbst.
   (Beenden/Neu starten: `nssm.exe restart MenuBoard`.)

## 4. Dashboard öffnen & auf 4 Bildschirme stellen
- Vom Handy/Laptop im gleichen Netz: `http://<IP-des-PCs>:8787`
- Unter **Mehr → Bildschirme** die **Anzahl auf 4** stellen → Übernehmen.
- Videos hochladen (Hochformat!) und je Bildschirm die Playlist füllen.

## 5. Samsung-Displays einrichten (je Display)
- Am Display ins Menü → **URL Launcher** (bzw. „Custom App" → URL Launcher).
- Adresse eintragen:
  - Display 1: `http://<IP-des-PCs>:8787/player?screen=1`
  - Display 2: `.../player?screen=2`
  - Display 3: `.../player?screen=3`
  - Display 4: `.../player?screen=4`
- Das Display öffnet die Seite beim Einschalten automatisch im Vollbild.

## 6. Netzwerk (Netgear-Switch)
- Mini-PC per Kabel an den Switch/Rack. **Kabel ist zuverlässiger als WLAN.**
- Am Display-Standort den Netgear-Switch setzen: eine Netzwerkdose rein, die 4
  Displays raus.

---

### Wichtig zur Zuverlässigkeit
- Als **Dienst** (Schritt 3) läuft der Server auch ohne Windows-Login → kein
  „blauer Anmeldebildschirm"-Problem.
- Die Videos liegen lokal unter `C:\ProgramData\MenuBoard\media` und werden über
  das Netzwerk an die Displays ausgeliefert.
- Steuerung wie gewohnt vom Handy (Menü tauschen, Tag/Abend, Playlists).
