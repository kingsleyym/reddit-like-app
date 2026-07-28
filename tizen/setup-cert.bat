@echo off
REM MenuBoard - erzeugt ein selbstsigniertes Tizen-Zertifikat und ein
REM Security-Profil "MenuBoard" fuer die tizen-CLI (Windows).
REM
REM Das reicht fuer aeltere Signage-Displays (Tizen 4.0 / 6.0). Bei Tizen 7/8
REM verlangen die Displays meist ein SAMSUNG-Zertifikat mit registrierter DUID
REM - das geht nur ueber den Certificate Manager von Tizen Studio
REM (siehe README.md, Abschnitt "Variante B").

setlocal
if "%PROFILE%"=="" set PROFILE=MenuBoard
if "%PASSWORD%"=="" set PASSWORD=menuboard
if "%KEYFILE%"=="" set KEYFILE=menuboard

set TIZEN=
if exist "%USERPROFILE%\tizen-studio\tools\ide\bin\tizen.bat" set TIZEN=%USERPROFILE%\tizen-studio\tools\ide\bin\tizen.bat
if "%TIZEN%"=="" if exist "C:\tizen-studio\tools\ide\bin\tizen.bat" set TIZEN=C:\tizen-studio\tools\ide\bin\tizen.bat
if "%TIZEN%"=="" if not "%TIZEN_CLI%"=="" set TIZEN=%TIZEN_CLI%
if "%TIZEN%"=="" (
  echo tizen-CLI nicht gefunden. Bitte Tizen Studio installieren oder TIZEN_CLI setzen.
  exit /b 1
)
echo tizen-CLI: %TIZEN%

set AUTHOR_P12=%USERPROFILE%\tizen-studio-data\keystore\author\%KEYFILE%.p12

echo 1/2  Author-Zertifikat erzeugen ...
call "%TIZEN%" certificate -a "%PROFILE%" -p "%PASSWORD%" -c DE -s Bayern -ct Muenchen -o MenuBoard -u IT -n "MenuBoard Admin" -e admin@menuboard.local -f "%KEYFILE%"
if errorlevel 1 exit /b 1

echo 2/2  Security-Profil "%PROFILE%" anlegen ...
call "%TIZEN%" security-profiles add -n "%PROFILE%" -a "%AUTHOR_P12%" -p "%PASSWORD%"
if errorlevel 1 exit /b 1

echo.
echo Fertig. Profil: %PROFILE%   Passwort: %PASSWORD%
echo Weiter mit:  node build.js --server http://^<SERVER-IP^>:8787 --profile %PROFILE%
endlocal
