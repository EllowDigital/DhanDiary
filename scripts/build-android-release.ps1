# Build helper: prebuild + gradle assembleRelease
# - Loads .env (simple parser)
# - Optionally writes android/gradle.properties signing entries if present in .env
# - Runs `npx expo prebuild --platform android` then `android\gradlew.bat assembleRelease`

param(
  [switch] $SkipSigningProperties
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

$envFile = Join-Path $root '.env'
if (-Not (Test-Path $envFile)) {
  Write-Output ".env file not found at $envFile — continuing but ensure your EXPO_PUBLIC_* vars are set."
} else {
  Write-Output "Loading .env"
  Get-Content $envFile | ForEach-Object {
    $_ = $_.Trim()
    if ($_ -and -not $_.StartsWith('#')) {
      $parts = $_ -split '='
      if ($parts.Count -ge 2) {
        $key = $parts[0].Trim()
        $val = ($parts[1..($parts.Count-1)] -join '=') -replace '^"|"$',''
        $env:$key = $val
      }
    }
  }
}

# Optionally write signing properties to android/gradle.properties
$gradlePropsPath = Join-Path $root 'android\gradle.properties'
if (-Not $SkipSigningProperties) {
  $required = @('MYAPP_UPLOAD_STORE_FILE','MYAPP_UPLOAD_KEY_ALIAS','MYAPP_UPLOAD_STORE_PASSWORD','MYAPP_UPLOAD_KEY_PASSWORD')
  $hasAll = $true
  foreach ($k in $required) { if (-not [string]::IsNullOrEmpty($env:$k) -eq $false) { $hasAll = $false } }
  # Better: treat presence of store file and alias as sufficient
  if ($env:MYAPP_UPLOAD_STORE_FILE -and $env:MYAPP_UPLOAD_KEY_ALIAS) {
    Write-Output "Writing signing properties to android/gradle.properties"
    $lines = @()
    if (Test-Path $gradlePropsPath) { $lines = Get-Content $gradlePropsPath }

    # ensure or replace entries
    $props = @{
      MYAPP_UPLOAD_STORE_FILE = $env:MYAPP_UPLOAD_STORE_FILE
      MYAPP_UPLOAD_KEY_ALIAS = $env:MYAPP_UPLOAD_KEY_ALIAS
      MYAPP_UPLOAD_STORE_PASSWORD = $env:MYAPP_UPLOAD_STORE_PASSWORD
      MYAPP_UPLOAD_KEY_PASSWORD = $env:MYAPP_UPLOAD_KEY_PASSWORD
    }

    foreach ($k in $props.Keys) {
      $existingIdx = $lines.FindIndex({ param($i) $i -like "$k=*" })
      if ($existingIdx -ge 0) {
        $lines[$existingIdx] = "$k=$($props[$k])"
      } else {
        $lines += "$k=$($props[$k])"
      }
    }

    $lines | Set-Content $gradlePropsPath -Encoding UTF8
  } else {
    Write-Output "Signing properties not found in .env — skipping writing gradle.properties. Provide MYAPP_UPLOAD_STORE_FILE and MYAPP_UPLOAD_KEY_ALIAS to write signing config."
  }
} else {
  Write-Output "Skipping signing properties write (SkipSigningProperties set)."
}

# Run expo prebuild
Write-Output "Running: npx expo prebuild --platform android"
$pre = Start-Process -FilePath "npx" -ArgumentList "expo prebuild --platform android" -NoNewWindow -Wait -PassThru
if ($pre.ExitCode -ne 0) { Write-Error "expo prebuild failed with exit code $($pre.ExitCode)"; exit $pre.ExitCode }

# Run gradle assembleRelease
Write-Output "Running Gradle assembleRelease"
Push-Location -Path (Join-Path $root 'android')
$gradleExe = Join-Path (Get-Location) 'gradlew.bat'
if (-Not (Test-Path $gradleExe)) { Write-Error "gradlew.bat not found — ensure you've prebuilt the android project."; exit 1 }

$g = Start-Process -FilePath $gradleExe -ArgumentList 'assembleRelease' -NoNewWindow -Wait -PassThru
if ($g.ExitCode -ne 0) { Write-Error "Gradle assembleRelease failed with exit code $($g.ExitCode)"; Pop-Location; exit $g.ExitCode }

Pop-Location

$apk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
if (Test-Path $apk) {
  Write-Output "Build succeeded. APK: $apk"
} else {
  Write-Error "APK not found at expected path: $apk"
}
