@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Prisma - Genera licenza
echo.
echo ==========================================
echo   PRISMA - Genera licenza per un cliente
echo ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Installalo da nodejs.org e riprova.
  pause
  exit /b 1
)
if not exist chiave-privata.pem (
  echo Manca chiave-privata.pem in questa cartella: senza non posso firmare licenze.
  pause
  exit /b 1
)
set "STUDIO="
set "CODICE="
set "SCAD="
set /p STUDIO=Nome dello studio: 
set /p CODICE=Codice macchina (es. A1B2-C3D4-E5F6-7890): 
set /p SCAD=Scadenza AAAA-MM-GG (Invio = senza scadenza): 
if "%STUDIO%"=="" goto manca
if "%CODICE%"=="" goto manca
echo.
if "%SCAD%"=="" (
  node genera-licenza.js --studio "%STUDIO%" --fingerprint "%CODICE%"
) else (
  node genera-licenza.js --studio "%STUDIO%" --fingerprint "%CODICE%" --scadenza "%SCAD%"
)
if errorlevel 1 (
  echo.
  echo Errore: controlla il codice macchina e riprova.
  pause
  exit /b 1
)
echo.
echo Licenza creata. Apro la cartella: manda al cliente SOLO il file license.json.
if not exist emesse mkdir emesse
start "" explorer "%~dp0emesse"
pause
exit /b 0
:manca
echo.
echo Nome studio e codice macchina sono obbligatori.
pause
exit /b 1
