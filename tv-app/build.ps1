# Builds the ALTYFLIX Android TV app (no Gradle): aapt2 -> javac -> d8 -> zipalign -> apksigner.
#
#   powershell -File tv-app/build.ps1 -Sdk <android-sdk> -Jdk <jdk-home> [-Install <tv-ip>]
#
# The signing key is created on first build in tv-app/keystore/ (git-ignored). Keep it:
# updates must be signed with the same key to install over the existing app.
param(
    [Parameter(Mandatory = $true)][string]$Sdk,
    [Parameter(Mandatory = $true)][string]$Jdk,
    [string]$Install = '',
    [string]$BuildTools = '34.0.0',
    [string]$Platform = 'android-34'
)
# Native tools write progress to stderr: failures are detected by exit code in Step instead
$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$out = Join-Path $here 'build'
$bt = Join-Path $Sdk "build-tools\$BuildTools"
$androidJar = Join-Path $Sdk "platforms\$Platform\android.jar"
$env:JAVA_HOME = $Jdk
$javac = Join-Path $Jdk 'bin\javac.exe'
$keytool = Join-Path $Jdk 'bin\keytool.exe'
# A missing tool would otherwise go unnoticed (the exit code of the previous step is kept)
foreach ($tool in $javac, $androidJar, "$bt\aapt2.exe", "$bt\d8.bat") {
    if (-not (Test-Path $tool)) { throw "Not found: $tool (check -Sdk / -Jdk: -Jdk is the folder that contains bin\javac.exe)" }
}

function Step($name, [scriptblock]$cmd) {
    Write-Host "== $name"
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "$name failed ($LASTEXITCODE)" }
}

Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$out\res", "$out\classes", "$out\gen" | Out-Null

Step 'Compile resources' { & "$bt\aapt2.exe" compile --dir "$here\res" -o "$out\res.zip" }
Step 'Link manifest' {
    & "$bt\aapt2.exe" link -o "$out\unsigned.apk" -I $androidJar --manifest "$here\AndroidManifest.xml" `
        --java "$out\gen" --min-sdk-version 24 --target-sdk-version 34 "$out\res.zip"
}
$sources = @(Get-ChildItem -Recurse "$here\src", "$out\gen" -Filter *.java | ForEach-Object FullName)
Step 'Compile Java' { & $javac -source 8 -target 8 -nowarn -classpath $androidJar -d "$out\classes" @sources }
$classes = @(Get-ChildItem -Recurse "$out\classes" -Filter *.class | ForEach-Object FullName)
Step 'Dex' { & "$bt\d8.bat" --min-api 24 --lib $androidJar --output $out @classes }

# Add classes.dex to the APK, then align
Push-Location $out
try { Step 'Package' { & "$Jdk\bin\jar.exe" uf unsigned.apk classes.dex } } finally { Pop-Location }
Step 'Align' { & "$bt\zipalign.exe" -f -p 4 "$out\unsigned.apk" "$out\aligned.apk" }

$ks = Join-Path $here 'keystore\altyflix-tv.jks'
if (-not (Test-Path $ks)) {
    New-Item -ItemType Directory -Force (Split-Path $ks) | Out-Null
    $pass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    Set-Content -Encoding ascii (Join-Path $here 'keystore\password.txt') $pass
    Step 'Create signing key' {
        & $keytool -genkeypair -keystore $ks -storepass $pass -keypass $pass -alias altyflix `
            -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=ALTYFLIX TV' 2>$null
    }
}
$pass = (Get-Content (Join-Path $here 'keystore\password.txt')).Trim()
Step 'Sign' {
    & "$bt\apksigner.bat" sign --ks $ks --ks-pass "pass:$pass" --key-pass "pass:$pass" `
        --out "$out\altyflix-tv.apk" "$out\aligned.apk"
}
Write-Host "APK: $out\altyflix-tv.apk"

if ($Install) {
    $adb = Join-Path $Sdk 'platform-tools\adb.exe'
    if (-not (Test-Path $adb)) { $adb = 'adb' }
    Step 'Connect' { & $adb connect "${Install}:5555" }
    Step 'Install' { & $adb -s "${Install}:5555" install -r "$out\altyflix-tv.apk" }
}
