# Genererer app-ikonene (PNG) med System.Drawing – ingen andre verktøy kreves.
Add-Type -AssemblyName System.Drawing

$accent = [System.Drawing.Color]::FromArgb(255, 42, 120, 214)  # #2a78d6
$white = [System.Drawing.Color]::White

function New-Icon([int]$size, [string]$path, [bool]$fullBleed) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $brush = New-Object System.Drawing.SolidBrush($accent)

    if ($fullBleed) {
        $g.FillRectangle($brush, 0, 0, $size, $size)
    }
    else {
        # Avrundet firkant med gjennomsiktige hjørner
        $r = [float]($size * 0.22)
        $dia = $r * 2
        $w = [float]$size
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $p.AddArc(0, 0, $dia, $dia, 180, 90)
        $p.AddArc($w - $dia, 0, $dia, $dia, 270, 90)
        $p.AddArc($w - $dia, $w - $dia, $dia, $dia, 0, 90)
        $p.AddArc(0, $w - $dia, $dia, $dia, 90, 90)
        $p.CloseFigure()
        $g.FillPath($brush, $p)
        $p.Dispose()
    }

    # Klokke: ring + visere som peker på ca. 10:09
    $c = $size / 2.0
    $ringR = if ($fullBleed) { $size * 0.26 } else { $size * 0.30 }
    $pen = New-Object System.Drawing.Pen($white, [float]($size * 0.065))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawEllipse($pen, [float]($c - $ringR), [float]($c - $ringR), [float]($ringR * 2), [float]($ringR * 2))

    foreach ($hand in @(, @(304.5, $ringR * 0.52)) + @(, @(54.0, $ringR * 0.78))) {
        $rad = $hand[0] * [Math]::PI / 180.0
        $x = $c + [Math]::Sin($rad) * $hand[1]
        $y = $c - [Math]::Cos($rad) * $hand[1]
        $g.DrawLine($pen, [float]$c, [float]$c, [float]$x, [float]$y)
    }

    $pen.Dispose()
    $brush.Dispose()
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Skrev $path"
}

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root "icons"
New-Item -ItemType Directory -Force $icons | Out-Null

New-Icon 192 (Join-Path $icons "icon-192.png") $false
New-Icon 512 (Join-Path $icons "icon-512.png") $false
New-Icon 512 (Join-Path $icons "maskable-512.png") $true
New-Icon 180 (Join-Path $icons "apple-touch-icon.png") $true
