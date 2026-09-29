@echo off
setlocal
title Prisma - Costruzione app desktop (Prisma.exe)
cd /d "%~dp0"

echo.
echo ============================================================
echo   PRISMA - Costruzione app desktop (Prisma.exe + Prisma Rete.exe)
echo ============================================================
echo.
echo La prima volta scarica Electron (circa 100-200 MB): puo'
echo volerci qualche minuto, dipende dalla connessione.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non e' installato su questo PC.
  echo Scaricalo da https://nodejs.org ^(versione "LTS"^), poi riprova.
  pause
  exit /b 1
)

echo [1/3] Scarico le librerie necessarie...
call npm install
if errorlevel 1 goto :errore

echo.
echo [2/3] Costruisco Prisma.exe ^(quello che avvia il server - per te^)...
call npm run build
if errorlevel 1 goto :errore

echo.
echo [3/3] Costruisco "Prisma Rete.exe" ^(si collega solo - per i colleghi^)...
call npm run build:rete
if errorlevel 1 goto :errore

echo.
echo ============================================================
echo   FATTO
echo ============================================================
echo.
echo Dentro la cartella "dist" qui accanto trovi:
echo   - Prisma.exe        - copialo nella cartella principale del
echo                          progetto ^(quella con gestionale.htm^),
echo                          sostituendo l'eventuale versione precedente.
echo   - Prisma Rete.exe   - per Sabrina/Federico: vedi la cartella
echo                          "ACCESSI\rete-locale-studio".
echo.
pause
exit /b 0

:errore
echo.
echo Qualcosa e' andato storto nel passaggio sopra - controlla il
echo messaggio d'errore. Se il problema persiste, manda l'output di
echo questa finestra a chi ti ha dato Prisma.
echo.
pause
exit /b 1
