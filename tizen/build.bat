@echo off
REM MenuBoard - Wrapper um build.js (Windows).
REM   build.bat --server http://192.168.1.50:8787 --profile MenuBoard
cd /d "%~dp0"
node build.js %*
