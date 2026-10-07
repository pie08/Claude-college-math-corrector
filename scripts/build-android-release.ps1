# Builds the standalone Android app (APP_VARIANT=production) and installs it
# on the USB-connected phone.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-android-release.ps1 [-NoInstall]
#
# It builds the last commit in a separate git worktree at a short path
# (C:\ctb by default): React Native's native build creates file paths that
# exceed Windows' 260-character limit from this repo's long folder name. A
# drive alias (subst) doesn't work, because Metro resolves real paths and
# expo-router then finds no screens. Commit your changes first.
param(
  [string]$BuildDir = 'C:\ctb',
  [switch]$NoInstall
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$head = (git -C $repo rev-parse HEAD).Trim()

if (-not (Test-Path $BuildDir)) {
  git -C $repo worktree add --detach $BuildDir $head
} else {
  git -C $BuildDir checkout --detach --force $head
}

# The app's server URL and secret are bundled from apps/mobile/.env (gitignored).
Copy-Item "$repo\apps\mobile\.env" "$BuildDir\apps\mobile\.env" -Force

$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\Temurin\jdk-17"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:APP_VARIANT = 'production'
$env:NODE_ENV = 'production'
$env:CI = '1'

Push-Location $BuildDir
try {
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  Set-Location apps\mobile
  npx expo prebuild --clean --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw 'prebuild failed' }
  Set-Location android
  # arm64 only: the Pixel's processor; also much faster than all four ABIs.
  .\gradlew.bat assembleRelease --console=plain -PreactNativeArchitectures=arm64-v8a
  if ($LASTEXITCODE -ne 0) { throw 'gradle build failed' }
} finally {
  Pop-Location
}

$apk = "$BuildDir\apps\mobile\android\app\build\outputs\apk\release\app-release.apk"
New-Item -ItemType Directory -Force "$repo\dist" | Out-Null
Copy-Item $apk "$repo\dist\calculus-tutor.apk" -Force
Write-Host "Built dist\calculus-tutor.apk from $($head.Substring(0, 7))"

if (-not $NoInstall) {
  & "$env:ANDROID_HOME\platform-tools\adb.exe" install -r "$repo\dist\calculus-tutor.apk"
}
