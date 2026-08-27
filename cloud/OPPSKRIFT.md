# Sette opp skytjenesten (Cloudflare Worker + D1)

Serverdelen gir Timeapp innlogging, brukere, roller og maskindata fra Infrakit —
for flere bedrifter samtidig, hver med sin egen Infrakit-tilgang.

## Slik henger det sammen

| Rolle | Gjør | Får |
|---|---|---|
| Du (drifter tjenesten) | Setter opp workeren og deler ut *oppsettkoden* | En tjeneste alle bedrifter kan bruke |
| Koordinator | Registrerer bedriften i appen med oppsettkoden, kobler til Infrakit med bedriftens Infrakit-innlogging, oppretter brukere | Full tilgang for sin bedrift |
| Ansatt | Får engangskode av koordinatoren og velger sitt eget passord | Sine egne prosjekter, maskiner og timer |

Passord lagres aldri. Den ansattes passord forlater ikke telefonen (nøkkelen
utledes lokalt med PBKDF2), og Infrakit-tilgangen lagres som et fornybart
token, kryptert med AES-GCM.

## Steg (gratis, ca. 10 minutter)

### 1. Lag databasen

Cloudflare-dashbordet → **Storage & databases → D1 SQL Database** →
**Create** → navn `timeapp` → Create.

Åpne databasen → **Console**, lim inn hele `cloud/schema.sql` og kjør.

### 2. Bind databasen til workeren

Workeren `timeapp-proxy` → **Bindings** → **Add binding** → **D1 database** →
Variable name: `DB`, Database: `timeapp` → Add.

*(En eventuell gammel KV-binding `TIMEAPP_KV` kan fjernes — den brukes ikke.)*

### 3. Hemmeligheter

**Settings → Variables and Secrets**, begge som type **Secret**:

- `ENC_KEY` – krypteringsnøkkel. Lag en slik (kopieres til utklippstavlen):

  ```
  powershell -Command "[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 })) | Set-Clipboard"
  ```

  **Endres den senere, blir lagrede Infrakit-tilkoblinger ulesbare** og
  koordinatorene må koble til på nytt.

- `SETUP_KEY` – oppsettkoden du deler med koordinatorer. Uten den kan ingen
  registrere en bedrift.

### 4. Legg inn koden

Workeren → **Edit code** → lim inn hele `cloud/worker.js` → **Deploy**.

## Ta i bruk

1. Koordinatoren åpner appen → **Registrer en ny bedrift** → bedriftsnavn,
   oppsettkoden, eget navn, e-post og passord.
2. **Mer → Infrakit → Koble til Infrakit** med bedriftens Infrakit-innlogging.
3. **Mer → Ansatte → + Legg til ansatt** → gi engangskoden til den ansatte.
4. Den ansatte åpner appen → **Jeg har fått en engangskode** → setter sitt
   eget passord.

## Sikkerhet

- **Passord**: PBKDF2 (300 000 runder) kjøres i appen; serveren ser kun den
  avledede nøkkelen og lagrer SHA-256 av den med `ENC_KEY` som pepper.
- **Infrakit**: kun et fornybart token lagres, AES-GCM-kryptert.
- **Roller**: kun koordinator kan koble til Infrakit og administrere brukere.
- **Bedriftsskille**: alle spørringer filtreres på bedriften brukeren tilhører,
  og hurtiglagringen er adskilt per bedrift.
- **CORS** er låst til appens adresser — se `ALLOWED_ORIGINS` i `worker.js`.

## Testing

`cloud/test-worker.js` (server) og `cloud/test-app.js` (app + server) kjøres i
nettleseren mot en etterlignet database:

```js
(await import('/cloud/test-worker.js')).kjorTest()
(await import('/cloud/test-app.js')).kjorAppTest()
```
