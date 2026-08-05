@echo off
setlocal EnableDelayedExpansion
title Kingsley Zeit - Stempeluhr einrichten
color 0F

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   FEHLER: Als Administrator ausfuehren.
  echo   Rechtsklick -^> "Als Administrator ausfuehren"
  echo.
  pause
  exit /b 1
)

set "ZIEL=%~dp0"
if "%ZIEL:~-1%"=="\" set "ZIEL=%ZIEL:~0,-1%"

rem "ZEIT-einrichten.bat auto" laeuft ohne Nachfragen durch - dafuer ruft das
rem Mac-Skript es auf. Ohne "auto" bleibt alles wie gewohnt mit Pausen.
set "HALT=pause"
if /I "%~1"=="auto" set "HALT=rem"

echo ============================================================
echo   Kingsley Zeit - Stempeluhr einrichten
echo ============================================================
echo.
echo   Ordner: %ZIEL%
echo.
echo   Der Assistent macht folgendes:
echo     1. Node.js pruefen (und bei Bedarf installieren)
echo     2. Stempeluhr als Autostart einrichten
echo     3. Firewall fuer das Laden-Netzwerk oeffnen
echo     4. Oeffentlichen Zugang ueber Tailscale einrichten
echo.
%HALT%
echo.

echo  1/4  Node.js pruefen
where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js fehlt - wird installiert, das dauert 1-3 Minuten ...
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;C:\Program Files\nodejs"
  ping -n 3 127.0.0.1 >nul
  where node >nul 2>&1
  if errorlevel 1 (
    echo.
    echo   FEHLER: Node.js konnte nicht installiert werden.
    echo   Bitte einmal von nodejs.org herunterladen und installieren,
    echo   danach dieses Skript erneut ausfuehren.
    echo.
    pause
    exit /b 1
  )
  echo   OK - Node.js installiert
) else (
  for /f "delims=" %%v in ('node -v') do echo   OK - Node.js %%v ist da
)
echo.

echo  2/4  Autostart einrichten
schtasks /Delete /TN "KingsleyZeit" /F >nul 2>&1
schtasks /Create /TN "KingsleyZeit" /TR "cmd /c cd /d \"%ZIEL%\" && node start.js" /SC ONLOGON /RL HIGHEST /F >nul 2>&1
if errorlevel 1 (
  echo   FEHLER beim Autostart - laeuft trotzdem, muss aber manuell gestartet werden.
) else (
  echo   OK - startet ab jetzt automatisch mit Windows
)
echo.

echo  3/4  Firewall oeffnen (8792 privat, 8794 oeffentlich)
netsh advfirewall firewall delete rule name="Kingsley Zeit 8792" >nul 2>&1
netsh advfirewall firewall delete rule name="Kingsley Zeit 8794" >nul 2>&1
netsh advfirewall firewall add rule name="Kingsley Zeit 8792" dir=in action=allow protocol=TCP localport=8792 >nul
netsh advfirewall firewall add rule name="Kingsley Zeit 8794" dir=in action=allow protocol=TCP localport=8794 >nul
if errorlevel 1 (echo   FEHLER) else (echo   OK)
echo.

echo  4/4  Oeffentlicher Zugang ueber Tailscale (8443 -^> 8794)
echo       WICHTIG: nach aussen geht NUR der Stempel-Port.
echo       Der Chef-Bereich bleibt privat.
set "TS=C:\Program Files\Tailscale\tailscale.exe"
if not exist "%TS%" set "TS=C:\Program Files (x86)\Tailscale\tailscale.exe"
if not exist "%TS%" (
  echo   Tailscale nicht gefunden - uebersprungen.
  echo   Die Stempeluhr laeuft dann nur im Laden-Netzwerk.
) else (
  "%TS%" funnel --bg --https=8443 8794
  echo.
  echo   Deine oeffentliche Adresse:
  "%TS%" funnel status 2>nul | findstr /C:"8443"
  echo.
  rem Funnel muss im Tailscale-Konto einmalig erlaubt sein. Ohne die
  rem Freigabe richtet der Befehl nur "Serve" ein - dann geht die Adresse
  rem NUR mit eingeschaltetem Tailscale-VPN, nicht aus dem normalen Netz.
  "%TS%" funnel status 2>nul | findstr /C:"Funnel on" >nul
  if errorlevel 1 (
    echo   ACHTUNG: Funnel ist noch NICHT oeffentlich freigegeben!
    echo   Die Adresse geht dann nur mit Tailscale-VPN. So schaltest du frei:
    echo     1. Diesen Befehl ausfuehren und die Ausgabe lesen:
    echo        "%TS%" funnel --bg --https=8443 8794
    echo     2. Erscheint eine login.tailscale.com-Adresse: im Browser
    echo        oeffnen und Funnel erlauben. Ggf. in der Admin-Konsole
    echo        unter DNS "MagicDNS" und "HTTPS Certificates" einschalten.
    echo     3. Danach diesen Schritt wiederholen, bis hier "Funnel on" steht.
  ) else (
    echo   OK - Funnel ist oeffentlich (auch ohne Tailscale erreichbar).
  )
)
echo.

echo  Stempeluhr starten
rem Laeuft schon eine aeltere Fassung? Erst sauber beenden, sonst
rem blockiert sie die Ports und die neuen Dateien werden nie geladen.
schtasks /End /TN "KingsleyZeit" >nul 2>&1
ping -n 3 127.0.0.1 >nul
rem Ueber die Aufgabenplanung starten - das funktioniert auch per SSH,
rem wo es kein Fenster gibt, und laeuft nach dem Abmelden weiter.
schtasks /Run /TN "KingsleyZeit" >nul 2>&1
if errorlevel 1 (
  echo   Konnte nicht automatisch starten - nach dem naechsten Anmelden laeuft sie.
) else (
  echo   OK - laeuft
)
ping -n 5 127.0.0.1 >nul
echo.

echo ============================================================
echo   Fertig.
echo.
echo   Stempeln:      http://localhost:8794/
echo   Chef-Bereich:  http://localhost:8792/chef    (privat!)
echo.
echo   NAECHSTER SCHRITT:
echo     1. Chef-Bereich oeffnen und Chef-PIN festlegen
echo     2. Unter "Team" die Mitarbeiter anlegen (Name + 4-stellige PIN)
echo     3. Unter "Einstellungen" die oeffentliche Adresse eintragen
echo        (die https-Adresse von oben), dann QR/NFC-Adressen abholen
echo.
echo   CHEF-DASHBOARD VON UNTERWEGS - zwei Wege:
echo     a) Mit Tailscale auf dem Handy:  http://100.114.126.37:8792/chef
echo     b) Ohne Tailscale, ueber das Internet:
echo        Einstellungen -^> "Chef von unterwegs" einschalten,
echo        langes Passwort setzen, geheime Adresse einmal am Handy
echo        oeffnen. Ohne diese Adresse antwortet der Server nach
echo        aussen mit "Nicht gefunden" - fuer Fremde ist der
echo        Chef-Bereich also gar nicht vorhanden.
echo ============================================================
echo.
%HALT%
