# Enkel utviklingsserver for Timeapp – krever kun PowerShell.
# Serverer appen statisk OG proxyer Infrakit-API-et under /api/infrakit/*
# (API-nøkkel fra infrakit-config.json, se scripts\infrakit-login.ps1).
# Bruk:  powershell -ExecutionPolicy Bypass -File scripts\serve.ps1
param([int]$Port = 8613)

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072

$root = Split-Path -Parent $PSScriptRoot
$global:ikCache = $null
$global:ikHoursCache = $null

function Get-InfrakitMachinesJson([object]$cfg) {
    if ($global:ikCache -and ((Get-Date) - $global:ikCache.ts).TotalMinutes -lt 10) {
        return $global:ikCache.body
    }
    $h = @{ Authorization = "Bearer $($cfg.apiKey)" }
    $pr = Invoke-RestMethod -Uri "https://app.infrakit.com/kuura/v1/projects" -Headers $h
    $plist = @()
    if ($pr -is [array]) { $plist = $pr }
    elseif ($pr.projects) { $plist = $pr.projects }
    $machines = @{}
    foreach ($p in $plist) {
        try {
            $eq = Invoke-RestMethod -Uri "https://app.infrakit.com/kuura/v1/equipment/by-project/$($p.uuid)" -Headers $h
            $elist = @()
            if ($eq -is [array]) { $elist = $eq }
            elseif ($eq.equipment) { $elist = $eq.equipment }
            foreach ($m in $elist) {
                if (-not $m.name) { continue }
                $key = if ($m.uuid) { "$($m.uuid)" } else { "$($m.name)" }
                if (-not $machines.ContainsKey($key)) {
                    $machines[$key] = @{ name = "$($m.name)"; type = "$($m.type)"; projects = @() }
                }
                $machines[$key].projects += "$($p.name)"
            }
        }
        catch { }
    }
    $body = @{ updated = (Get-Date).ToString("s"); machines = @($machines.Values | Sort-Object { $_.name }) } | ConvertTo-Json -Depth 5 -Compress
    $global:ikCache = @{ ts = (Get-Date); body = $body }
    return $body
}

# Maskintimer per dag de siste 14 dagene, utledet av arbeidsøktene i Infrakit,
# med automatisk notat: arbeidsvindu, antall turer, kjørte km og modellnavn.
function Get-InfrakitHoursJson([object]$cfg) {
    if ($global:ikHoursCache -and ((Get-Date) - $global:ikHoursCache.ts).TotalMinutes -lt 5) {
        return $global:ikHoursCache.body
    }
    $sep = ' ' + [char]0xB7 + ' '        # midtprikk
    $dash = [string][char]0x2013         # tankestrek
    $arrow = ' ' + [char]0x2192 + ' '    # pil for ruter, med luft
    $bullet = [string][char]0x2022 + ' ' # punktmerke
    $areaMaps = @{}                      # prosjektUuid -> (omraadeUuid -> tittel)
    $h = @{ Authorization = "Bearer $($cfg.apiKey)" }
    $veh = Invoke-RestMethod -Uri "https://app.infrakit.com/kuura/ajax_vehicles.json" -Headers $h
    $vlist = @()
    if ($veh.vehicles) { $vlist = $veh.vehicles }
    $endMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + 86400000
    $startMs = $endMs - (15 * 86400000)
    $days = New-Object System.Collections.ArrayList
    foreach ($v in $vlist) {
        try {
            $per = @{}
            $ev = Invoke-RestMethod -Uri "https://app.infrakit.com/kuura/ajax_calendar_events.json?vehicleId=$($v.id)&start=$startMs&end=$endMs" -Headers $h
            foreach ($e in @($ev.events)) {
                if (-not $e.start -or -not $e.end) { continue }
                $dag = ([string]$e.start).Substring(0, 10)
                $ms = ([DateTime]$e.end - [DateTime]$e.start).TotalMilliseconds
                if ($ms -le 0) { continue }
                if (-not $per.ContainsKey($dag)) { $per[$dag] = @{ ms = 0.0; first = $null; last = $null; turer = 0; km = 0.0; mod = @{}; mat = @{}; ruter = @{} } }
                $per[$dag].ms += $ms
                $fra = ([string]$e.start).Substring(11, 5)
                $til = ([string]$e.end).Substring(11, 5)
                if (-not $per[$dag].first -or $fra -lt $per[$dag].first) { $per[$dag].first = $fra }
                if (-not $per[$dag].last -or $til -gt $per[$dag].last) { $per[$dag].last = $til }
            }
            # Modellnavn (hva maskinen jobbet mot) – ofte tomt for lastebiler
            try {
                $mev = Invoke-RestMethod -Uri "https://app.infrakit.com/kuura/ajax_calendar_active_model_events.json?vehicleId=$($v.id)&start=$startMs&end=$endMs" -Headers $h
                foreach ($m in @($mev.events)) {
                    if (-not $m.start -or -not $m.title -or -not "$($m.title)".Trim()) { continue }
                    $dag = ([string]$m.start).Substring(0, 10)
                    if ($per.ContainsKey($dag)) { $per[$dag].mod["$($m.title)".Trim()] = $true }
                }
            }
            catch { }
            # Turer (massetransport) for kjøretøyets aktive prosjekt
            if ($v.activeProject -and $v.uuid) {
                $pu = "$($v.activeProject.uuid)"
                if (-not $areaMaps.ContainsKey($pu)) {
                    $map = @{}
                    try {
                        $ar = Invoke-RestMethod -Uri "https://app.infrakit.com/kuura/v1/project/$pu/areas" -Headers $h
                        foreach ($aa in @($ar.areas)) {
                            if ($aa.uuid -and $aa.title) { $map["$($aa.uuid)"] = "$($aa.title)".Trim() }
                        }
                    }
                    catch { }
                    $areaMaps[$pu] = $map
                }
                $amap = $areaMaps[$pu]
                try {
                    $page = 1
                    do {
                        $tr = Invoke-RestMethod -Uri "https://app.infrakit.com/kuura/v1/project/$pu/trips?start=$startMs&end=$endMs&equipmentUuid=$($v.uuid)&page=$page&pageSize=100" -Headers $h
                        foreach ($t in @($tr.trips)) {
                            if (-not $t.startMillis) { continue }
                            $dag = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$t.startMillis).LocalDateTime.ToString('yyyy-MM-dd')
                            if (-not $per.ContainsKey($dag)) { continue }
                            $per[$dag].turer++
                            if ($t.distance) { $per[$dag].km += [double]$t.distance / 1000.0 }
                            if ($t.material) {
                                $mnavn = "$($t.material)".Trim()
                                if ($mnavn) { $per[$dag].mat[$mnavn] = [int]($per[$dag].mat[$mnavn]) + 1 }
                            }
                            $fra = $null
                            $til = $null
                            if ($t.startAreaUuid -and $amap.ContainsKey("$($t.startAreaUuid)")) { $fra = $amap["$($t.startAreaUuid)"] }
                            if ($t.endAreaUuid -and $amap.ContainsKey("$($t.endAreaUuid)")) { $til = $amap["$($t.endAreaUuid)"] }
                            if ($fra -or $til) {
                                $rute = if ($fra -and $til) { "$fra$arrow$til" } elseif ($fra) { "$fra (kun lastet)" } else { "(ukjent)$arrow$til" }
                                $per[$dag].ruter[$rute] = [int]($per[$dag].ruter[$rute]) + 1
                            }
                        }
                        $page++
                    } while ($tr.trips -and @($tr.trips).Count -eq 100 -and $page -le 10)
                }
                catch { }
            }
            $projName = $null
            if ($v.activeProject) { $projName = "$($v.activeProject.name)" }
            foreach ($dag in $per.Keys) {
                $d = $per[$dag]
                $linjer = New-Object System.Collections.ArrayList
                $deler = New-Object System.Collections.ArrayList
                if ($d.turer -gt 0) {
                    if ($d.turer -eq 1) { [void]$deler.Add('1 tur') } else { [void]$deler.Add("$($d.turer) turer") }
                }
                if ($d.km -ge 1) { [void]$deler.Add("$([Math]::Round($d.km)) km") }
                if ($deler.Count -gt 0) { [void]$linjer.Add(($deler.ToArray() -join $sep)) }
                if ($d.mod.Count -gt 0) {
                    [void]$linjer.Add('')
                    [void]$linjer.Add('Modeller:')
                    foreach ($m in @($d.mod.Keys | Sort-Object)) { [void]$linjer.Add("$bullet$m") }
                }
                if ($d.mat.Count -gt 0) {
                    [void]$linjer.Add('')
                    [void]$linjer.Add('Masse:')
                    foreach ($m in @($d.mat.GetEnumerator() | Sort-Object -Property Value -Descending)) {
                        [void]$linjer.Add("$bullet$($m.Key)$sep$($m.Value) lass")
                    }
                }
                if ($d.ruter.Count -gt 0) {
                    [void]$linjer.Add('')
                    [void]$linjer.Add('Ruter:')
                    foreach ($r in @($d.ruter.GetEnumerator() | Sort-Object -Property Value -Descending)) {
                        $antall = if ($r.Value -eq 1) { '1 tur' } else { "$($r.Value) turer" }
                        [void]$linjer.Add("$bullet$($r.Key)$sep$antall")
                    }
                }
                $note = (($linjer.ToArray() -join "`n")).Trim()
                if ($note.Length -gt 900) { $note = $note.Substring(0, 899) + [char]0x2026 }
                $startIso = $null
                $endIso = $null
                if ($d.first) { $startIso = "$dag" + "T$($d.first):00" }
                if ($d.last) { $endIso = "$dag" + "T$($d.last):00" }
                [void]$days.Add(@{ date = $dag; machine = "$($v.name)"; project = $projName; hours = [Math]::Round($d.ms / 3600000, 2); note = $note; start = $startIso; end = $endIso })
            }
        }
        catch { }
    }
    $body = @{ updated = (Get-Date).ToString("s"); days = $days.ToArray() } | ConvertTo-Json -Depth 4 -Compress
    $global:ikHoursCache = @{ ts = (Get-Date); body = $body }
    return $body
}
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

            # --- Infrakit-proxy ---
            if ($rel -like 'api\infrakit*') {
                $res.ContentType = "application/json; charset=utf-8"
                $res.Headers.Add("Cache-Control", "no-store")
                $cfg = $null
                $cfgPath = Join-Path $root "infrakit-config.json"
                if (Test-Path $cfgPath) {
                    try { $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json } catch { }
                }
                $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                $connected = ($null -ne $cfg) -and $cfg.apiKey -and ((-not $cfg.expire) -or ([double]$cfg.expire -gt $nowMs))
                $body = '{"error":"ukjent api-rute"}'
                if ($rel -eq 'api\infrakit\status') {
                    $exp = $null
                    if ($cfg) { $exp = $cfg.expire }
                    $body = @{ connected = [bool]$connected; expire = $exp } | ConvertTo-Json -Compress
                }
                elseif ($rel -eq 'api\infrakit\machines') {
                    if (-not $connected) {
                        $res.StatusCode = 503
                        $body = '{"error":"Ikke koblet til Infrakit. Kjor scripts\\infrakit-login.ps1 og start serveren pa nytt."}'
                    }
                    else {
                        try { $body = Get-InfrakitMachinesJson $cfg }
                        catch {
                            $res.StatusCode = 502
                            $body = '{"error":"Infrakit-kallet feilet. Nokkelen kan vaere utlopt - kjor infrakit-login.ps1 pa nytt."}'
                        }
                    }
                }
                elseif ($rel -eq 'api\infrakit\hours') {
                    if (-not $connected) {
                        $res.StatusCode = 503
                        $body = '{"error":"Ikke koblet til Infrakit."}'
                    }
                    else {
                        try { $body = Get-InfrakitHoursJson $cfg }
                        catch {
                            $res.StatusCode = 502
                            $body = '{"error":"Kunne ikke hente maskintimer fra Infrakit."}'
                        }
                    }
                }
                else { $res.StatusCode = 404 }
                $bytes = [Text.Encoding]::UTF8.GetBytes($body)
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                $res.Close()
                continue
            }

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
