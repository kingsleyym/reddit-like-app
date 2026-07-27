@echo off
title MenuBoard Server
cd /d "%~dp0"
echo Starte MenuBoard-Server ...
node standalone.js
echo.
echo Server wurde beendet. Fenster kann geschlossen werden.
pause
