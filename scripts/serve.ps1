# Enkel utviklingsserver for Timeapp – krever kun PowerShell.
# Serverer appen statisk. Infrakit-data hentes fra skyproxyen (cloud/worker.js).
# Bruk:  powershell -ExecutionPolicy Bypass -File scripts\serve.ps1
param([int]$Port = 8613)

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072

$root = Split-Path -Parent $PSScriptRoot
$mime = @{
    ".html"        = "text/html; charset=utf-8"
    ".css"         = "text/css; charset=utf-8"
    ".js"          = "text/javascript; charset=utf-8"
    ".json"        = "application/json"
    ".webmanifest" = "application/manifest+json"
    ".svg"         = "image/svg+xml"
    ".png"         = "image/png"
    ".ico"         = "image/x-icon"
    ".txt"         = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Timeapp kjører på http://localhost:$Port/  (Ctrl+C for å stoppe)"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $res = $ctx.Response
        try {
            $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/')) -replace '/', '\'
            if ($rel -eq '') { $rel = 'index.html' }

            $full = [IO.Path]::GetFullPath((Join-Path $root $rel))

            if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
                $res.StatusCode = 404
            }
            else {
                if (-not (Test-Path $full -PathType Leaf) -and [IO.Path]::GetExtension($full) -eq '') {
                    $full = Join-Path $root 'index.html'   # SPA-fallback for navigasjoner
                }
                if (Test-Path $full -PathType Leaf) {
                    $ext = [IO.Path]::GetExtension($full).ToLower()
                    if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
                    else { $res.ContentType = "application/octet-stream" }
                    $res.Headers.Add("Cache-Control", "no-store")
                    $bytes = [IO.File]::ReadAllBytes($full)
                    $res.ContentLength64 = $bytes.Length
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                }
                else {
                    $res.StatusCode = 404
                }
            }
            $res.Close()
        }
        catch {
            try { $res.StatusCode = 500; $res.Close() } catch {}
        }
    }
}
finally {
    $listener.Stop()
}
