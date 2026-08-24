$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$root = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'webview2'
Add-Type -Path (Join-Path $root 'Microsoft.Web.WebView2.Core.dll')
Add-Type -Path (Join-Path $root 'Microsoft.Web.WebView2.WinForms.dll')

$logPath = Join-Path $root 'smoketest-result.txt'
function Log($msg) { Add-Content -Path $logPath -Value $msg }
Remove-Item $logPath -ErrorAction SilentlyContinue
Log "start"

[Microsoft.Web.WebView2.Core.CoreWebView2Environment]::SetLoaderDllFolderPath($root)
Log "loader path set"

$userDataFolder = Join-Path $env:TEMP 'wv2-smoketest-userdata'

$form = New-Object System.Windows.Forms.Form
$form.Width = 400
$form.Height = 300
$wv = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$wv.Dock = 'Fill'

$cp = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties
$cp.UserDataFolder = $userDataFolder
$wv.CreationProperties = $cp

$form.Controls.Add($wv)

$script:result = "did not complete"

$wv.add_CoreWebView2InitializationCompleted({
    param($s, $e)
    Log "init completed event fired, success=$($e.IsSuccess)"
    if ($e.IsSuccess) {
        $s.CoreWebView2.NavigateToString('<h1>ok</h1>')
    } else {
        $script:result = "init failed: $($e.InitializationException.Message)"
        $form.Close()
    }
})

$wv.add_NavigationCompleted({
    param($s, $e)
    Log "navigation completed event fired, success=$($e.IsSuccess)"
    if ($e.IsSuccess) {
        $script:result = "SUCCESS"
    } else {
        $script:result = "navigation failed: $($e.WebErrorStatus)"
    }
    $form.Close()
})

$form.Add_Shown({
    Log "form shown, calling EnsureCoreWebView2Async"
    try {
        $wv.EnsureCoreWebView2Async($null) | Out-Null
        Log "EnsureCoreWebView2Async call returned (task started)"
    } catch {
        Log "EnsureCoreWebView2Async threw: $($_.Exception.ToString())"
        $script:result = "threw: $($_.Exception.Message)"
        $form.Close()
    }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 20000
$timer.Add_Tick({ Log "timeout hit"; $script:result = "TIMEOUT"; $timer.Stop(); $form.Close() })
$timer.Start()

[System.Windows.Forms.Application]::Run($form)

Log "result: $script:result"
Write-Output $script:result
