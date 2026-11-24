$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "[ALTYFLIX] Démarrage du serveur 24/7 avec redémarrage automatique..." -ForegroundColor Cyan

while ($true) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] Lancement de node server/server-vf-api.cjs..." -ForegroundColor Green
    node server/server-vf-api.cjs
    $code = $LASTEXITCODE
    $tsEnd = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$tsEnd] Serveur arrêté (code $code). Redémarrage dans 3 secondes..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}
