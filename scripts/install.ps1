param([switch]$EnableUnsignedDevelopmentExtension)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\extension'
if (!(Test-Path -LiteralPath (Join-Path $source 'CSXS\manifest.xml'))) { throw 'Extension source is missing.' }
$parent = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$target = Join-Path $parent 'com.frameshelf.ae'
New-Item -ItemType Directory -Path $parent -Force | Out-Null
if (Test-Path -LiteralPath $target) {
    $resolved = (Resolve-Path -LiteralPath $target).Path
    if ($resolved -ne [IO.Path]::GetFullPath($target) -or (Split-Path $resolved -Parent) -ne [IO.Path]::GetFullPath($parent)) { throw 'Unexpected installation path.' }
    # Preserve the old installation outside CEP's scanned extensions folder.
    $backupParent = Join-Path $env:APPDATA 'FrameShelf\installation-backups'
    New-Item -ItemType Directory -Path $backupParent -Force | Out-Null
    $backup = Join-Path $backupParent ([guid]::NewGuid().ToString('N'))
    Move-Item -LiteralPath $resolved -Destination $backup
    Write-Output "Previous installation retained: $backup"
}
Copy-Item -LiteralPath $source -Destination $target -Recurse
if ($EnableUnsignedDevelopmentExtension) {
    $key = 'HKCU:\Software\Adobe\CSXS.12'
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name PlayerDebugMode -PropertyType String -Value '1' -Force | Out-Null
    Write-Output 'CEP 12 unsigned development extension loading is enabled for this Windows user.'
} else {
    Write-Output 'Unsigned loading was not changed. This development build needs CEP 12 PlayerDebugMode=1.'
    Write-Output 'To opt in, rerun with -EnableUnsignedDevelopmentExtension. This applies to all CEP 12 extensions for this user.'
}
Write-Output "Installed: $target"
Write-Output 'Reopen AE 2025. Window > Extensions > Frame Shelf.'
