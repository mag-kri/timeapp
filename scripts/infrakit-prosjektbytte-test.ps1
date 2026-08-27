# Tester om prosjektbytte virker med API-token (Bearer), slik serveren gjor det.
# Skriver kun prosjekt-id-er og antall hendelser - aldri tokens.
#
#   powershell -ExecutionPolicy Bypass -File scripts\infrakit-prosjektbytte-test.ps1

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072

$IAM = "https://iam.infrakit.com/auth/token"
$K = "https://app.infrakit.com/kuura"
$KARASJOK = 15719      # 3302047 - Karasjok skole og helsesenter
$DOOSAN = 17663        # Doosan DX140LCR #020862

$user = Read-Host "Infrakit-brukernavn (e-post)"
$sec = Read-Host "Infrakit-passord" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

$q = "grant_type=password&username=$([Uri]::EscapeDataString($user))&password=$([Uri]::EscapeDataString($pass))"
try {
    $auth = Invoke-RestMethod -Method Post -Uri "$IAM`?$q" -Body "{}" -ContentType "application/json"
}
catch { Write-Host "FEIL: innlogging avvist" -ForegroundColor Red; return }
$pass = $null
$h = @{ Authorization = "Bearer $($auth.accessToken)" }
Write-Host "Innlogget OK" -ForegroundColor Green

function AktivtProsjekt {
    try { (Invoke-RestMethod -Uri "$K/ajax_current_project.json" -Headers $h).id } catch { "feil" }
}
function TellHendelser($vid) {
    $slutt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + 86400000
    $start = $slutt - (15 * 86400000)
    try {
        $r = Invoke-RestMethod -Uri "$K/ajax_calendar_events.json?vehicleId=$vid&start=$start&end=$slutt" -Headers $h
        @($r.events).Count
    }
    catch { "feil" }
}

$opprinnelig = AktivtProsjekt
Write-Host ""
Write-Host "1) Aktivt prosjekt na: $opprinnelig"
Write-Host "   Doosan-hendelser med dette aktive prosjektet: $(TellHendelser $DOOSAN)"

Write-Host ""
Write-Host "2) Bytter aktivt prosjekt til Karasjok ($KARASJOK)..."
try {
    Invoke-RestMethod -Method Post -Uri "$K/ajax_change_project.json?projectId=$KARASJOK" -Headers $h | Out-Null
    Write-Host "   POST gikk gjennom" -ForegroundColor Green
}
catch {
    $kode = "?"
    try { $kode = $_.Exception.Response.StatusCode.value__ } catch {}
    Write-Host "   FEIL: byttet ble avvist (HTTP $kode)" -ForegroundColor Red
}
$etter = AktivtProsjekt
Write-Host "   Aktivt prosjekt etter bytte: $etter $(if ($etter -eq $KARASJOK) { '(byttet!)' } else { '(uendret - byttet virket IKKE med token)' })" -ForegroundColor $(if ($etter -eq $KARASJOK) { "Green" } else { "Red" })
Write-Host "   Doosan-hendelser na: $(TellHendelser $DOOSAN)" -ForegroundColor Cyan

Write-Host ""
Write-Host "3) Setter tilbake til $opprinnelig..."
try { Invoke-RestMethod -Method Post -Uri "$K/ajax_change_project.json?projectId=$opprinnelig" -Headers $h | Out-Null } catch {}
Write-Host "   Aktivt prosjekt til slutt: $(AktivtProsjekt)"
Write-Host ""
Write-Host "Ferdig. Ingen tokens er skrevet ut." -ForegroundColor Cyan
