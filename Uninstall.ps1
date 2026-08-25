[CmdletBinding()]
param(
    [string]$InvokeRoot = $(if ($env:INVOKEAI_ROOT) { $env:INVOKEAI_ROOT } else { Join-Path $env:USERPROFILE "invokeai" }),
    [switch]$RemoveWorkspaces
)

$ErrorActionPreference = "Stop"
$InvokeRoot = [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($InvokeRoot))
$SimpleTarget = Join-Path $InvokeRoot "simple-mode"
$LauncherTarget = Join-Path $InvokeRoot "launcher"
$LauncherSourceTarget = Join-Path $InvokeRoot "launcher-src"

foreach ($path in @(
    (Join-Path $SimpleTarget "app.js"),
    (Join-Path $SimpleTarget "index.html"),
    (Join-Path $SimpleTarget "styles.css"),
    (Join-Path $SimpleTarget "simple-mode-nav.js"),
    (Join-Path $SimpleTarget "simple_mode_server.py"),
    (Join-Path $SimpleTarget "VERSION"),
    (Join-Path $LauncherTarget "InvokeAI Simple Mode.exe"),
    (Join-Path $LauncherTarget "InvokeAI.ico"),
    (Join-Path $LauncherTarget "InvokeAI-icon-source.png"),
    (Join-Path $LauncherSourceTarget "Program.cs"),
    (Join-Path $LauncherSourceTarget "Build-Launcher.cmd")
)) {
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
    }
}

foreach ($shortcut in @(
    (Join-Path ([Environment]::GetFolderPath("Programs")) "InvokeAI Simple Mode.lnk"),
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "InvokeAI Simple Mode.lnk")
)) {
    if (Test-Path -LiteralPath $shortcut) {
        Remove-Item -LiteralPath $shortcut -Force
    }
}

if ($RemoveWorkspaces) {
    $ExpectedWorkspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $SimpleTarget "workspaces"))
    if (Test-Path -LiteralPath $ExpectedWorkspaceRoot) {
        $ResolvedWorkspaceRoot = (Resolve-Path -LiteralPath $ExpectedWorkspaceRoot).Path
        if ($ResolvedWorkspaceRoot -ne $ExpectedWorkspaceRoot -or -not $ResolvedWorkspaceRoot.StartsWith($InvokeRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove unexpected workspace path '$ResolvedWorkspaceRoot'."
        }
        Remove-Item -LiteralPath $ResolvedWorkspaceRoot -Recurse -Force
    }
}

Write-Host "InvokeAI Simple Mode was removed. InvokeAI, models, outputs, and databases remain installed." -ForegroundColor Green
if (-not $RemoveWorkspaces) {
    Write-Host "Simple Mode workspaces were preserved at '$SimpleTarget\workspaces'."
}
