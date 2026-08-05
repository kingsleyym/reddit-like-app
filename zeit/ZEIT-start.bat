@echo off
rem =====================================================================
rem  Kingsley Zeit - Waechter
rem  ------------------------
rem  Startet die Stempeluhr und startet sie SOFORT neu, falls sie je
rem  abstuerzt. Die Aufgabenplanung ruft diese Datei auf (nicht direkt
rem  node), denn eine geplante Aufgabe merkt nicht, wenn ihr Programm
rem  stirbt - diese Schleife schon.
rem
rem  Alles, was die Stempeluhr ausgibt, landet in daten\lauf.log;
rem  harte Fehler zusaetzlich in daten\fehler.log (schreibt start.js).
rem =====================================================================
setlocal
cd /d "%~dp0"
if not exist daten mkdir daten

:schleife
rem Log klein halten: ueber ~2 MB -> als .alt beiseitelegen
for %%A in ("daten\lauf.log") do if exist %%A if %%~zA GTR 2097152 (
  del "daten\lauf.log.alt" >nul 2>&1
  ren "daten\lauf.log" "lauf.log.alt" >nul 2>&1
)
echo [%date% %time%] Stempeluhr startet >> "daten\lauf.log"
node start.js >> "daten\lauf.log" 2>&1
echo [%date% %time%] Stempeluhr beendet (Code %errorlevel%) - Neustart in 5 Sekunden >> "daten\lauf.log"
rem Kurz warten, damit eine Dauerschleife bei kaputter Installation
rem nicht die CPU frisst und der Port sicher wieder frei ist.
ping -n 6 127.0.0.1 >nul
goto schleife
