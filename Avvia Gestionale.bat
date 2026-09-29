@echo off
setlocal
title Gestionale Studio - Server (lascia aperta questa finestra)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ============================================================
  echo   Node.js non e' installato su questo PC.
  echo ============================================================
  echo.
  echo   Per far funzionare il gestionale condiviso serve Node.js.
  echo   Scaricalo da: https://nodejs.org  ^(versione "LTS", va bene
  echo   di default: Avanti, Avanti, Fine^), poi riapri questo file.
  echo.
  pause
  exit /b 1
)

if not exist "gestionale.htm" (
  echo.
  echo   ATTENZIONE: non trovo "gestionale.htm" in questa cartella.
  echo   Assicurati che questo file sia nella STESSA cartella di
  echo   gestionale.htm e server.js, poi riprova.
  echo.
  pause
  exit /b 1
)

echo.
echo Avvio del server in corso, un attimo...
echo.
node server.js

echo.
echo Il server si e' fermato. Se non l'hai chiuso tu volontariamente,
echo leggi sopra per capire l'errore.
pause
