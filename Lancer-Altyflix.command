#!/bin/bash
cd "$(dirname "$0")"

echo "========================================================"
echo "         ALTYFLIX DESKTOP (Client Lourd macOS)"
echo "      4K HDR / Remux / 100% Son Garanti (FFmpeg)"
echo "========================================================"
echo ""

if [ ! -d "node_modules" ]; then
    echo "[1/3] Installation des composants..."
    npm install
fi

if [ ! -f "dist/index.html" ]; then
    echo "[2/3] Compilation de l'interface Netflix..."
    npm run build
fi

echo "[3/3] Demarrage d'ALTYFLIX Desktop..."
npm run app
