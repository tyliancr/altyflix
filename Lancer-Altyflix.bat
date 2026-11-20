@echo off
title ALTYFLIX Desktop
cd /d "%~dp0"

echo ========================================================
echo          ALTYFLIX DESKTOP (Client Lourd)
echo      4K HDR / Remux / 100%% Son Garanti (FFmpeg)
echo ========================================================
echo.

IF NOT EXIST "node_modules" (
    echo [1/3] Installation des composants requis...
    call npm install
)

IF NOT EXIST "dist\index.html" (
    echo [2/3] Compilation de l'interface Netflix...
    call npm run build
)

echo [3/3] Demarrage d'ALTYFLIX Desktop...
call npm run app
