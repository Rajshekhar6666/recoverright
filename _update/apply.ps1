# Copies this update into your project and backs up every file it overwrites.
# NOT executed by the author (no PowerShell was available): it is short, read it first.
param([string]$Root = "E:\recoverright")
$ErrorActionPreference = "Stop"
$web = Join-Path $Root "web"
$src = Join-Path $PSScriptRoot "web"
if (-not (Test-Path $web)) { throw "Cannot find $web. Run with -Root <your project folder>." }
$backup = Join-Path $Root ("web_backup_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
$count = 0
Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    $rel  = $_.FullName.Substring($src.Length).TrimStart('\', '/')
    $dest = Join-Path $web $rel
    if (Test-Path $dest) {
        $bak = Join-Path $backup $rel
        New-Item -ItemType Directory -Force -Path (Split-Path $bak) | Out-Null
        Copy-Item $dest $bak -Force
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Copy-Item $_.FullName $dest -Force
    $count++
}
Write-Host "Copied $count files into $web"
Write-Host "Originals of overwritten files are in: $backup"
