@echo off
echo Frame Shelf development build installer
echo This enables unsigned CEP 12 extensions for the current Windows user.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" -EnableUnsignedDevelopmentExtension
if errorlevel 1 echo Installation failed. Please share the error above.
pause
