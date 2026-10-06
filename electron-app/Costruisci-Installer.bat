@echo off
setlocal
title Prisma - Costruzione dell'installer (Installa-Prisma.exe)
cd /d "%~dp0"
echo.
echo ============================================================
echo   PRISMA - Costruzione di Installa-Prisma.exe
echo ============================================================
echo.
echo Un solo file da dare allo studio: contiene l'app completa.
echo Alla prima esecuzione chiede la licenza (mostra il codice macchina).
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non e' installato. Scaricalo da https://nodejs.org ^(LTS^) e riprova.
  pause
  exit /b 1
)
if not exist ..\licensing\chiave-pubblica.pem (
  echo Manca licensing\chiave-pubblica.pem. Esegui prima licensing\genera-chiavi.js.
  pause
  exit /b 1
)
echo [1/2] Librerie ^(la prima volta scarica Electron, puo' volerci qualche minuto^)...
call npm install
if errorlevel 1 goto :errore
echo.
echo [2/2] Preparo i file e costruisco l'installer...
call npm run build:setup
if errorlevel 1 goto :errore
echo.
echo ============================================================
echo   FATTO
echo ============================================================
echo.
echo Il file da mandare e':   electron-app\dist-setup\Installa-Prisma.exe
echo.
start "" explorer "%~dp0dist-setup"
pause
exit /b 0
:errore
echo.
echo Qualcosa e' andato storto: copia il messaggio d'errore qui sopra e mandamelo.
pause
exit /b 1
