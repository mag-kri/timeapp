# Feilsoker hvorfor loggpunkter ikke dukker opp i dagsrapporten.
# Sporr /v1/project/{uuid}/logpoints slik workeren gjor, og viser hva som
# faktisk kommer tilbake. Skriver aldri ut tokens.
#
#   powershell -ExecutionPolicy Bypass -File scripts\infrakit-punkt-test.ps1

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072

$IAM = "https://iam.infrakit.com/auth/token"
$K = "https://app.infrakit.com/kuura"
$PROSJEKTNAVN = "3302047"
$MASKINNAVN = "Volvo EC200EL"

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

# 1) Finn prosjektet (svaret kan vaere ren liste ELLER pakket i .projects)
$pr = Invoke-RestMethod -Uri "$K/v1/projects" -Headers $h
$plist = @($pr)
if ($pr -isnot [Array] -and $pr.PSObject.Properties['projects']) { $plist = @($pr.projects) }
$prosjekt = $plist | Where-Object { $_.name -like "*$PROSJEKTNAVN*" -or $_.name -like "*Karasjok*" } | Select-Object -First 1
if (-not $prosjekt) {
    Write-Host "FEIL: fant ikke prosjektet. Navnene /v1/projects ga:" -ForegroundColor Red
    foreach ($p in $plist | Select-Object -First 30) { Write-Host "   - '$($p.name)'" }
    return
}
Write-Host ""
Write-Host "1) Prosjekt: $($prosjekt.name)"
Write-Host "   uuid: $($prosjekt.uuid)"

# 2) Finn maskinen og dens uuid
$eq = Invoke-RestMethod -Uri "$K/v1/equipment/by-project/$($prosjekt.uuid)" -Headers $h
$maskin = @($eq) | Where-Object { $_.name -like "*$MASKINNAVN*" } | Select-Object -First 1
if ($maskin) {
    Write-Host "2) Maskin: $($maskin.name)"
    Write-Host "   uuid: $($maskin.uuid)"
}
else {
    Write-Host "2) FANT IKKE maskinen '$MASKINNAVN' i /v1/equipment-lista" -ForegroundColor Yellow
    Write-Host "   Maskiner der: $((@($eq) | ForEach-Object { $_.name }) -join ', ')"
}

# 3) Hent loggpunkter slik workeren gjor (16 dagers vindu)
$slutt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + 86400000
$start = $slutt - (16 * 86400000)
$uri = "$K/v1/project/$($prosjekt.uuid)/logpoints?sinceUnixTimeMillis=$start&untilUnixTimeMillis=$slutt&page=0&size=1000"
Write-Host ""
Write-Host "3) Sporr logpoints (samme kall som workeren)..."
try {
    $lp = Invoke-RestMethod -Uri $uri -Headers $h
}
catch {
    $kode = "?"
    try { $kode = $_.Exception.Response.StatusCode.value__ } catch {}
    Write-Host "   FEIL: HTTP $kode - dette er grunnen til at punktene mangler!" -ForegroundColor Red
    return
}
$punkter = @($lp.logpoints)
Write-Host "   status: $($lp.status)  antall pa side 0: $($lp.numberOfElements)  siste side: $($lp.last)"

if (-not $punkter.Count) {
    Write-Host ""
    Write-Host "   0 punkter i 16-dagersvinduet. Prover UTEN tidsfilter (side 0, 5 stk)..." -ForegroundColor Yellow
    $lp2 = Invoke-RestMethod -Uri "$K/v1/project/$($prosjekt.uuid)/logpoints?page=0&size=5" -Headers $h
    $p2 = @($lp2.logpoints)
    Write-Host "   Uten filter: $($p2.Count) punkter pa forste side"
    foreach ($p in $p2) {
        Write-Host "   - measured: $($p.measured)  kode: $($p.meta.code)  utstyr: $($p.meta.instrument.equipmentUuid)  type: $($p.meta.instrument.type)"
    }
    return
}

# 4) Grupper etter utstyr, sammenlign med maskinens uuid
$medUtstyr = $punkter | Where-Object { $_.meta.instrument.equipmentUuid }
$utenUtstyr = $punkter.Count - @($medUtstyr).Count
Write-Host ""
Write-Host "4) Av $($punkter.Count) punkter har $(@($medUtstyr).Count) equipmentUuid (mangler pa $utenUtstyr)"
$grupper = @($medUtstyr) | Group-Object { $_.meta.instrument.equipmentUuid } | Sort-Object Count -Descending
foreach ($g in $grupper | Select-Object -First 8) {
    $navnTreff = ""
    if ($maskin -and $g.Name -eq $maskin.uuid) { $navnTreff = "  <-- $($maskin.name)" }
    Write-Host "   $($g.Name)  $($g.Count) stk$navnTreff"
}
$makulerte = @($punkter | Where-Object { $_.voided }).Count
Write-Host "   Makulerte (voided): $makulerte"
Write-Host ""
Write-Host "5) Eksempelpunkt (forste med utstyr):"
$eks = @($medUtstyr) | Select-Object -First 1
if ($eks) {
    Write-Host "   measured: $($eks.measured)"
    Write-Host "   kode: '$($eks.meta.code)'  flatekode: '$($eks.meta.surfaceCode)'"
    Write-Host "   utstyr: $($eks.meta.instrument.equipmentUuid)  type: $($eks.meta.instrument.type)"
}
if ($maskin) {
    $treff = @($medUtstyr | Where-Object { $_.meta.instrument.equipmentUuid -eq $maskin.uuid }).Count
    Write-Host ""
    Write-Host "6) Punkter satt av $($maskin.name): $treff" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "Ferdig. Ingen tokens er skrevet ut." -ForegroundColor Cyan
