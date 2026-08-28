[CmdletBinding()]
param(
    [string]$InvokeRoot = $(if ($env:INVOKEAI_ROOT) { $env:INVOKEAI_ROOT } else { Join-Path $env:USERPROFILE "invokeai" }),
    [switch]$NoDesktopShortcut,
    [switch]$NoShortcuts,
    [switch]$NoUserEnvironment,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$SupportedInvokeVersion = "6.14.0"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$InvokeRoot = [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($InvokeRoot))
$PythonExe = Join-Path $InvokeRoot ".venv\Scripts\python.exe"
$InvokeExe = Join-Path $InvokeRoot ".venv\Scripts\invokeai-web.exe"

if (-not (Test-Path -LiteralPath $PythonExe) -or -not (Test-Path -LiteralPath $InvokeExe)) {
    throw "InvokeAI was not found at '$InvokeRoot'. Install InvokeAI first, then run this installer again."
}

$InvokeVersion = (& $PythonExe -c "from importlib.metadata import version; print(version('invokeai'))" 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($InvokeVersion)) {
    throw "The InvokeAI version could not be detected from '$PythonExe'."
}

if ($InvokeVersion -ne $SupportedInvokeVersion -and -not $Force) {
    throw "This release is tested with InvokeAI $SupportedInvokeVersion, but $InvokeVersion is installed. Re-run with -Force only if you accept compatibility risk."
}

$SimpleTarget = Join-Path $InvokeRoot "simple-mode"
$LauncherSourceTarget = Join-Path $InvokeRoot "launcher-src"
$LauncherTarget = Join-Path $InvokeRoot "launcher"

foreach ($directory in @($SimpleTarget, (Join-Path $SimpleTarget "workspaces"), $LauncherSourceTarget, $LauncherTarget)) {
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }
}

foreach ($name in @("app.js", "index.html", "styles.css", "simple-mode-nav.js", "simple_mode_server.py")) {
    Copy-Item -LiteralPath (Join-Path $ProjectRoot "simple-mode\$name") -Destination (Join-Path $SimpleTarget $name) -Force
}
Copy-Item -LiteralPath (Join-Path $ProjectRoot "VERSION") -Destination (Join-Path $SimpleTarget "VERSION") -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot "launcher-src\Program.cs") -Destination (Join-Path $LauncherSourceTarget "Program.cs") -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot "launcher-src\Build-Launcher.cmd") -Destination (Join-Path $LauncherSourceTarget "Build-Launcher.cmd") -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot "assets\InvokeAI.ico") -Destination (Join-Path $LauncherTarget "InvokeAI.ico") -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot "assets\InvokeAI-icon-source.png") -Destination (Join-Path $LauncherTarget "InvokeAI-icon-source.png") -Force

$LauncherExe = Join-Path $LauncherTarget "InvokeAI Simple Mode.exe"
$PrebuiltLauncher = Join-Path $ProjectRoot "dist\InvokeAI Simple Mode.exe"
if (Test-Path -LiteralPath $PrebuiltLauncher) {
    Copy-Item -LiteralPath $PrebuiltLauncher -Destination $LauncherExe -Force
} else {
    $Compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    if (-not (Test-Path -LiteralPath $Compiler)) {
        throw "The Windows C# compiler was not found and this package has no prebuilt launcher."
    }
    & $Compiler /nologo /target:winexe "/win32icon:$(Join-Path $LauncherTarget 'InvokeAI.ico')" "/out:$LauncherExe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll (Join-Path $LauncherSourceTarget "Program.cs")
    if ($LASTEXITCODE -ne 0) {
        throw "The launcher could not be built."
    }
}

if ($InvokeRoot -ne (Join-Path $env:USERPROFILE "invokeai") -and -not $NoUserEnvironment) {
    [Environment]::SetEnvironmentVariable("INVOKEAI_ROOT", $InvokeRoot, "User")
}

if (-not $NoShortcuts) {
    $Shell = New-Object -ComObject WScript.Shell
    $StartMenu = Join-Path ([Environment]::GetFolderPath("Programs")) "InvokeAI Simple Mode.lnk"
    $StartShortcut = $Shell.CreateShortcut($StartMenu)
    $StartShortcut.TargetPath = $LauncherExe
    $StartShortcut.WorkingDirectory = $InvokeRoot
    $StartShortcut.IconLocation = "$(Join-Path $LauncherTarget 'InvokeAI.ico'),0"
    $StartShortcut.Description = "Start InvokeAI and the Simple Mode node canvas"
    $StartShortcut.Save()

    if (-not $NoDesktopShortcut) {
        $DesktopLink = Join-Path ([Environment]::GetFolderPath("Desktop")) "InvokeAI Simple Mode.lnk"
        $DesktopShortcut = $Shell.CreateShortcut($DesktopLink)
        $DesktopShortcut.TargetPath = $LauncherExe
        $DesktopShortcut.WorkingDirectory = $InvokeRoot
        $DesktopShortcut.IconLocation = "$(Join-Path $LauncherTarget 'InvokeAI.ico'),0"
        $DesktopShortcut.Description = "Start InvokeAI and the Simple Mode node canvas"
        $DesktopShortcut.Save()
    }
}

Write-Host "InvokeAI Simple Mode v1.1.1 installed." -ForegroundColor Green
Write-Host "InvokeAI: $InvokeVersion"
Write-Host "Launcher: $LauncherExe"
Write-Host "Your existing models, outputs, databases, and Simple Mode workspaces were not modified."
