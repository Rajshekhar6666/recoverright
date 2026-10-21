# Copies the Stage 2 patient files into E:\recoverright\web and backs up every file it overwrites.
param([string]$Root = "E:\recoverright")
$ErrorActionPreference = "Stop"
$backup = Join-Path $Root ("backup_stage2_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
$src = Join-Path $PSScriptRoot "web"
$dst = Join-Path $Root "web"
if (-not (Test-Path $dst)) { throw "Cannot find $dst. Run with -Root <your project folder>." }
$count = 0
Get-ChildItem -LiteralPath $src -Recurse -File | ForEach-Object {
    $rel  = $_.FullName.Substring($src.Length).TrimStart("\", "/")
    $dest = Join-Path $dst $rel
    if (Test-Path -LiteralPath $dest) {
        $bak = Join-Path (Join-Path $backup "web") $rel
        New-Item -ItemType Directory -Force -Path (Split-Path $bak) | Out-Null
        Copy-Item -LiteralPath $dest $bak -Force
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Copy-Item -LiteralPath $_.FullName $dest -Force
    $count++
}
Write-Host "Copied $count files."
Write-Host "Originals of every overwritten file are in: $backup"
