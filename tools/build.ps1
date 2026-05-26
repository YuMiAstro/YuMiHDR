# ============================================================================
# tools/build.ps1
# ----------------------------------------------------------------------------
# Build the YuMiHDR script package and refresh the update repository manifest.
#
# Output:
#   dist/YuMiHDR-script-<VERSION>.zip       distributable package
#   repository/YuMiHDR-script-<VERSION>.zip same zip, ready to publish
#   repository/updates.xri                  with the actual sha1 inlined
#
# Usage (from any directory):
#   pwsh -File D:\YuMiHDR\tools\build.ps1 [-Version 1.0.0]
# ============================================================================

[CmdletBinding()]
param(
    [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"

$root      = Split-Path -Parent $PSScriptRoot
$srcDir    = Join-Path $root "src"
$repoDir   = Join-Path $root "repository"
$distDir   = Join-Path $root "dist"
$stageDir  = Join-Path $root "build\stage"
$xri       = Join-Path $repoDir "updates.xri"

$zipName = "YuMiHDR-script-$Version.zip"
$zipPath = Join-Path $distDir $zipName

Write-Host "YuMiHDR build $Version"

# Clean stage / dist
if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
New-Item -ItemType Directory -Force $stageDir | Out-Null
New-Item -ItemType Directory -Force $distDir  | Out-Null

# Mirror PixInsight installation layout: src/scripts/YuMiHDR/*
$stageScripts = Join-Path $stageDir "src\scripts\YuMiHDR"
New-Item -ItemType Directory -Force $stageScripts | Out-Null
Copy-Item -Force (Join-Path $srcDir "scripts\YuMiHDR\*") $stageScripts

# Build zip
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force
Copy-Item -Force $zipPath (Join-Path $repoDir $zipName)

# Compute SHA1 and inline it into updates.xri
$sha = (Get-FileHash -Algorithm SHA1 $zipPath).Hash.ToLower()
Write-Host "  zip   : $zipPath"
Write-Host "  sha1  : $sha"

if (Test-Path $xri) {
    $content = Get-Content -Raw $xri
    $content = [Regex]::Replace(
        $content,
        'fileName="YuMiHDR-script-[\d\.]+\.zip"\s+sha1="[^"]+"',
        "fileName=`"$zipName`" sha1=`"$sha`""
    )
    $content = [Regex]::Replace(
        $content,
        'releaseDate="\d{4}-\d{2}-\d{2}"',
        ('releaseDate="' + (Get-Date -Format 'yyyy-MM-dd') + '"')
    )
    Set-Content -Path $xri -Value $content -Encoding utf8
    Write-Host "  xri   : $xri (updated)"
}

# Cleanup stage
Remove-Item -Recurse -Force $stageDir

Write-Host "Done. Publish the contents of '$repoDir' as the repository root."
