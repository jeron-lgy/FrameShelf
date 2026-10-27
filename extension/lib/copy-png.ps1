$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$pngFile = $env:FRAMESHELF_PNG_FILE
if (-not [IO.File]::Exists($pngFile)) { throw 'PNG file does not exist.' }
$files = New-Object System.Collections.Specialized.StringCollection
[void]$files.Add($pngFile)
$data = New-Object System.Windows.Forms.DataObject
$data.SetFileDropList($files)
# File-drop only: image/bitmap fallbacks can make chat clients flatten alpha.
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true, 10, 100)
$actual = [System.Windows.Forms.Clipboard]::GetFileDropList()
if ($actual.Count -ne 1 -or $actual[0] -cne $pngFile) { throw 'Clipboard verification failed.' }
