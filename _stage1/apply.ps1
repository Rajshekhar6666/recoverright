# Copies this update into E:\recoverright (web and api) and backs up every file it overwrites.
# NOT executed by the author (no PowerShell was available): it is short, read it first.
param([string]$Root = "E:\recoverright")
$ErrorActionPreference = "Stop"
$backup = Join-Path $Root ("backup_stage1_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
$count = 0
foreach ($part in @("web", "api")) {
    $src = Join-Path $PSScriptRoot $part
    $dst = Join-Path $Root $part
    if (-not (Test-Path $dst)) { throw "Cannot find $dst. Run with -Root <your project folder>." }
    Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
        $rel  = $_.FullName.Substring($src.Length).TrimStart('\', '/')
        $dest = Join-Path $dst $rel
        if (Test-Path $dest) {
            $bak = Join-Path (Join-Path $backup $part) $rel
            New-Item -ItemType Directory -Force -Path (Split-Path $bak) | Out-Null
            Copy-Item $dest $bak -Force
        }
        New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
        Copy-Item $_.FullName $dest -Force
        $count++
    }
}
Write-Host "Copied $count files."
Write-Host "Originals of every overwritten file are in: $backup"
Write-Host "Now RESTART the API (it must reload main.py), then run the web app."
