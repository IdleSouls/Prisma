@echo off
setlocal
title Prisma - Rigenera Prisma.mcpb
cd /d "%~dp0"
rem Sostituisce server\tools.js dentro Prisma.mcpb con la versione attuale di mcp-server\tools.js.
rem Richiede Windows 10+ (tar e PowerShell integrati). Dopo: reinstalla il file in Claude Desktop.
set "TMP=%TEMP%\prisma-mcpb"
if exist "%TMP%" rmdir /s /q "%TMP%"
mkdir "%TMP%"
copy "..\Prisma.mcpb" "%TMP%\p.zip" >nul
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%TMP%\p.zip' -DestinationPath '%TMP%\x' -Force"
copy /y "tools.js" "%TMP%\x\server\tools.js" >nul
del "..\Prisma.mcpb"
powershell -NoProfile -Command "Compress-Archive -Path '%TMP%\x\*' -DestinationPath '%TMP%\nuovo.zip' -Force"
move /y "%TMP%\nuovo.zip" "..\Prisma.mcpb" >nul
rmdir /s /q "%TMP%"
echo.
echo Fatto: Prisma.mcpb aggiornato. In Claude Desktop: Impostazioni - Estensioni,
echo rimuovi la vecchia Prisma e trascina dentro il nuovo file.
pause
