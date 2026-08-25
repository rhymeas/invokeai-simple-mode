@echo off
setlocal
set "PROJECT=%~dp0.."
set "OUT=%PROJECT%\dist"
if not "%~1"=="" set "OUT=%~1"
if not exist "%OUT%" mkdir "%OUT%"
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /win32icon:"%PROJECT%\assets\InvokeAI.ico" /out:"%OUT%\InvokeAI Simple Mode.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll "%~dp0Program.cs"
if errorlevel 1 exit /b 1
echo Built "%OUT%\InvokeAI Simple Mode.exe"
