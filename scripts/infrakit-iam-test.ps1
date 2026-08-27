# Tester om Infrakits IAM-token (med fornybart refresh_token) fungerer paa alle
# endepunktene Timeapp trenger. Skriver KUN statuskoder og antall - aldri tokens.
#
#   powershell -ExecutionPolicy Bypass -File scripts\infrakit-iam-test.ps1

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072

$IAM = "https://iam.infrakit.com/auth/token"
$KUURA = "https://app.infrakit.com/kuura"

$user = Read-Host "Infrakit-brukernavn (e-post)"
$sec = Read-Host "Infrakit-passord" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

function Test-Endpoint($navn, $url, $token, $tellFelt) {
    try {
        $r = Invoke-RestMethod -Uri $url -Headers @{ Authorization = "Bearer $token" }
        $antall = "-"
        if ($tellFelt) {
            $v = $r.$tellFelt
            if ($v) { $antall = @($v).Count }
        }
        elseif ($r -is [array]) { $antall = @($r).Count }
        Write-Host ("  OK   {0,-28} antall: {1}" -f $navn, $antall) -ForegroundColor Green
        return $r
    }
    catch {
        $kode = "?"
        try { $kode = $_.Exception.Response.StatusCode.value__ } catch {}
        Write-Host ("  FEIL {0,-28} HTTP {1}" -f $navn, $kode) -ForegroundColor Red
        return $null
    }
}

Write-Host ""
Write-Host "1) Logger inn mot IAM (grant_type=password)..."
$auth = $null
$brukteVariant = $null

# Variant A (foretrukket): grant_type i query, brukernavn/passord i kroppen
try {
    $body = @{ username = $user; password = $pass; grant_type = "password" } | ConvertTo-Json
    $auth = Invoke-RestMethod -Method Post -Uri "$IAM`?grant_type=password" -Body $body -ContentType "application/json"
    $brukteVariant = "A: grant_type i query + innlogging i kroppen"
}
catch {
    $kodeA = "?"
    try { $kodeA = $_.Exception.Response.StatusCode.value__ } catch {}
    Write-Host "  variant A ga HTTP $kodeA - proever variant B" -ForegroundColor DarkGray
    # Variant B: alt som query-parametre (Infrakits egen dokumentasjon)
    try {
        $q = "grant_type=password&username=$([Uri]::EscapeDataString($user))&password=$([Uri]::EscapeDataString($pass))"
        $auth = Invoke-RestMethod -Method Post -Uri "$IAM`?$q" -Body "{}" -ContentType "application/json"
        $brukteVariant = "B: alt i query-strengen"
    }
    catch {
        $kodeB = "?"
        try { $kodeB = $_.Exception.Response.StatusCode.value__ } catch {}
        Write-Host "  FEIL: innlogging avvist (variant A: HTTP $kodeA, variant B: HTTP $kodeB)" -ForegroundColor Red
        Write-Host "  Sjekker hvilke innloggingsmetoder brukeren har..."
        try {
            $lo = Invoke-RestMethod -Uri "https://iam.infrakit.com/api/public/auth/login-options/$([Uri]::EscapeDataString($user))"
            "  login-options: " + ($lo | ConvertTo-Json -Compress -Depth 3)
        }
        catch { Write-Host "  (kunne ikke hente login-options)" }
        return
    }
}
$pass = $null
Write-Host "  Fungerende format -> $brukteVariant" -ForegroundColor Cyan

if (-not $auth.accessToken) { Write-Host "  FEIL: fikk ikke accessToken" -ForegroundColor Red; return }
Write-Host ("  OK   accessToken mottatt, gyldig i {0} sekunder ({1:N1} timer)" -f $auth.expiresIn, ($auth.expiresIn / 3600)) -ForegroundColor Green
Write-Host ("  {0} refreshToken mottatt" -f $(if ($auth.refreshToken) { "OK  " } else { "FEIL" })) -ForegroundColor $(if ($auth.refreshToken) { "Green" } else { "Red" })

Write-Host ""
Write-Host "2) Tester Infrakit-endepunktene med IAM-tokenet..."
$token = $auth.accessToken
$pr = Test-Endpoint "v1/projects" "$KUURA/v1/projects" $token "projects"
$veh = Test-Endpoint "ajax_vehicles.json" "$KUURA/ajax_vehicles.json" $token "vehicles"

$pUuid = $null
if ($pr) { $liste = if ($pr -is [array]) { $pr } else { $pr.projects }; if (@($liste).Count -gt 0) { $pUuid = @($liste)[0].uuid } }
if ($pUuid) {
    Test-Endpoint "v1/equipment/by-project" "$KUURA/v1/equipment/by-project/$pUuid" $token | Out-Null
    Test-Endpoint "v1/project/{uuid}/areas" "$KUURA/v1/project/$pUuid/areas" $token "areas" | Out-Null
    $slutt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $start = $slutt - (7 * 86400000)
    Test-Endpoint "v1/project/{uuid}/trips" "$KUURA/v1/project/$pUuid/trips?start=$start&end=$slutt&pageSize=5" $token "trips" | Out-Null
}
if ($veh -and @($veh.vehicles).Count -gt 0) {
    $vid = @($veh.vehicles)[0].id
    $slutt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $start = $slutt - (7 * 86400000)
    Test-Endpoint "ajax_calendar_events.json" "$KUURA/ajax_calendar_events.json?vehicleId=$vid&start=$start&end=$slutt" $token "events" | Out-Null
}

Write-Host ""
Write-Host "3) Tester fornyelse (grant_type=refresh_token)..."
if ($auth.refreshToken) {
    $ny = $null
    $rVariant = $null
    # Variant B-stil: alt i query (samme som fungerte for innlogging)
    try {
        $q2 = "grant_type=refresh_token&refresh_token=$([Uri]::EscapeDataString($auth.refreshToken))"
        $ny = Invoke-RestMethod -Method Post -Uri "$IAM`?$q2" -Body "{}" -ContentType "application/json"
        $rVariant = "alt i query"
    }
    catch {
        $k1 = "?"
        try { $k1 = $_.Exception.Response.StatusCode.value__ } catch {}
        Write-Host "  query-variant ga HTTP $k1 - proever med username i tillegg" -ForegroundColor DarkGray
        # Noen IAM-oppsett krever ogsaa username ved fornyelse
        try {
            $q3 = "grant_type=refresh_token&refresh_token=$([Uri]::EscapeDataString($auth.refreshToken))&username=$([Uri]::EscapeDataString($user))"
            $ny = Invoke-RestMethod -Method Post -Uri "$IAM`?$q3" -Body "{}" -ContentType "application/json"
            $rVariant = "query + username"
        }
        catch {
            $k2 = "?"
            try { $k2 = $_.Exception.Response.StatusCode.value__ } catch {}
            Write-Host "  FEIL: fornyelse avvist (uten username: HTTP $k1, med username: HTTP $k2)" -ForegroundColor Red
        }
    }
    if ($ny -and $ny.accessToken) {
        Write-Host "  OK   fornyelse virker uten passord ($rVariant)" -ForegroundColor Green
        Write-Host ("  {0} nytt refreshToken i svaret" -f $(if ($ny.refreshToken) { "OK  " } else { "NB: " }))
        # Fungerer det fornyede tokenet mot Infrakit?
        Test-Endpoint "v1/projects (fornyet token)" "$KUURA/v1/projects" $ny.accessToken "projects" | Out-Null
    }
}

Write-Host ""
Write-Host "Ferdig. Ingen tokens er skrevet ut eller lagret." -ForegroundColor Cyan
