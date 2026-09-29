@echo off
setlocal
title Prisma - Costruzione eseguibili (.exe)
cd /d "%~dp0"

echo.
echo ============================================================
echo   PRISMA - Costruzione di Installa-Prisma.exe
echo ============================================================
echo.
echo Questo script va eseguito UNA VOLTA (o ogni volta che aggiorni
echo il codice) su un PC Windows con Node.js installato. Costruisce
echo SOLO l'installer per la chiavetta USB:
echo   - licensing\Installa-Prisma.exe   (va sulla chiavetta USB)
echo.
echo Il lanciatore quotidiano "Prisma.exe" si costruisce separatamente
echo con electron-app\Costruisci-Prisma-Desktop.bat (e' un altro tipo
echo di programma, con la sua finestra e l'icona nella barra di sistema).
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non e' installato su questo PC.
  echo Scaricalo da https://nodejs.org ^(versione "LTS"^), poi riprova.
  pause
  exit /b 1
)

rem Serve Node.js 25.5 o piu' recente: usa il metodo nuovo e integrato di Node
rem (--build-sea), che non passa piu' per lo strumento esterno "postject" -
rem quello vecchio ha un bug noto e non risolto ("Multiple occurences of
rem sentinel") su diverse installazioni Windows. Node 25.5 e' uscito a
rem gennaio 2026: se il tuo Node e' piu' vecchio, va solo aggiornato una volta.
node -e "const [maj,min]=process.versions.node.split('.').map(Number); process.exit((maj>25||(maj===25&&min>=5))?0:1)"
if errorlevel 1 (
  echo.
  echo La versione di Node.js installata su questo PC e' troppo vecchia
  echo per il metodo piu' affidabile di costruzione dell'eseguibile.
  echo.
  echo Aggiorna Node.js all'ultima versione da https://nodejs.org
  echo ^(scegli "LTS", Avanti-Avanti-Fine^), poi rilancia questo file.
  echo.
  pause
  exit /b 1
)

echo.
echo Costruisco Installa-Prisma.exe ^(per la chiavetta USB^)...
del /q Installa-Prisma.exe >nul 2>nul
node --build-sea build-sea-installer.json
if errorlevel 1 goto :errore

echo.
echo ============================================================
echo   FATTO
echo ============================================================
echo.
echo   licensing\Installa-Prisma.exe    - questo va sulla chiavetta USB
echo.
echo Per costruire anche "Prisma.exe" ^(il lanciatore quotidiano con
echo finestra e icona nella barra di sistema^), vai nella cartella
echo "electron-app" e lancia "Costruisci-Prisma-Desktop.bat".
echo.
echo Facoltativo: puoi dargli un'icona personalizzata con un tool
echo come rcedit ^(cerca "rcedit exe icon" per le istruzioni^), e
echo firmarlo con "signtool sign" se hai un certificato - non e'
echo obbligatorio, l'eseguibile funziona comunque senza.
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
