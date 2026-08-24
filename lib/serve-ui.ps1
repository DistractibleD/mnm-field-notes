$ErrorActionPreference = 'Stop'
$root = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) 'ui'
$port = 8791
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Output "Serving $root on http://localhost:$port/"

$mime = @{ '.html'='text/html'; '.css'='text/css'; '.js'='application/javascript'; '.json'='application/json' }

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $ctx.Response.KeepAlive = $false
        $path = $ctx.Request.Url.LocalPath
        if ($path -eq '/') { $path = '/index.html' }
        $file = Join-Path $root ($path.TrimStart('/'))
        if (Test-Path $file -PathType Leaf) {
            $ext = [IO.Path]::GetExtension($file)
            $ctx.Response.ContentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
            $bytes = [IO.File]::ReadAllBytes($file)
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
        }
    } catch {
        Write-Output "Request error: $_"
    } finally {
        $ctx.Response.OutputStream.Close()
    }
}
