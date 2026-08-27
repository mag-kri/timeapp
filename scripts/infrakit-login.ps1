# Logg inn mot Infrakit og lagre API-nøkkelen lokalt i infrakit-config.json.
# Kjør denne SELV i et PowerShell-vindu (spør om brukernavn/passord interaktivt):
#   powershell -ExecutionPolicy Bypass -File scripts\infrakit-login.ps1
# Nøkkelen lagres kun på denne PC-en og brukes av utviklingsserverens proxy.

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072

$root = Split-Path -Parent $PSScriptRoot
$user = Read-Host "Infrakit-brukernavn (e-post)"
$sec = Read-Host "Infrakit-passord" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

try {
    $res = Invoke-RestMethod -Method Post -Uri "https://app.infrakit.com/kuura/apilogin.json" -Body @{ username = $user; password = $pass }
    if (-not $res.apiKey) { throw "Innlogging feilet - sjekk brukernavn og passord." }
    @{ apiKey = $res.apiKey; expire = $res.expire; savedAt = (Get-Date).ToString("s") } |
        ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $root "infrakit-config.json")
    $exp = "ukjent"
    if ($res.expire) { $exp = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$res.expire).LocalDateTime }
    Write-Host ""
    Write-Host "OK! API-nokkel lagret i infrakit-config.json (gyldig til $exp)."
    Write-Host "Start utviklingsserveren pa nytt, sa henter appen maskinlista fra Infrakit."
}
catch {
    Write-Host "FEIL: $($_.Exception.Message)"
}
finally {
    $pass = $null
}
