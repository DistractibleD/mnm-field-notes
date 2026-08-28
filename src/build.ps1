# Compiles MnMFieldNotes.exe from src/*.cs via csc.exe directly - no MSBuild,
# no .csproj, no NuGet client. csc.exe ships with every Windows install as
# part of .NET Framework (the same compiler PowerShell's own
# `Add-Type -TypeDefinition` already used in the old MnMFieldNotes.ps1), so
# this needs nothing beyond what's already on the machine. See CLAUDE.md
# "Architecture" for the full reasoning.
$ErrorActionPreference = 'Stop'

$cscPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $cscPath)) { throw "csc.exe not found at $cscPath" }

$root = Split-Path -Parent $PSScriptRoot
$sources = @(Get-ChildItem -Path $PSScriptRoot -Filter '*.cs' -Recurse | ForEach-Object { $_.FullName })
if ($sources.Count -eq 0) { throw "No .cs files found under $PSScriptRoot" }

$outExe = Join-Path $root 'MnMFieldNotes.exe'
$iconPath = Join-Path $root 'app.ico'
$wv2Core = Join-Path $root 'lib\webview2\Microsoft.Web.WebView2.Core.dll'
$wv2Forms = Join-Path $root 'lib\webview2\Microsoft.Web.WebView2.WinForms.dll'

foreach ($dll in @($wv2Core, $wv2Forms)) {
    if (-not (Test-Path $dll)) { throw "Missing required reference: $dll" }
}

# lib\webview2\WebView2Loader.dll is a native x64 PE (verified) - must match platform.
$refs = @(
    'System.dll', 'System.Core.dll', 'System.Windows.Forms.dll',
    'System.Drawing.dll', 'System.Net.Http.dll', 'System.Web.Extensions.dll',
    $wv2Core, $wv2Forms
) -join ','

$args = @(
    '/nologo'
    '/target:winexe'
    '/platform:x64'
    "/out:$outExe"
)
if (Test-Path $iconPath) { $args += "/win32icon:$iconPath" }
$args += "/reference:$refs"
$args += $sources

& $cscPath @args
if ($LASTEXITCODE -ne 0) { throw "Build failed (csc.exe exit code $LASTEXITCODE)" }

Write-Host "Built: $outExe" -ForegroundColor Green
