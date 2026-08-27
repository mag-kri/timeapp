# Sette opp skyproxyen (Cloudflare Worker)

Gjør at maskindata fra Infrakit virker på mobilene, ikke bare på PC-en – og at
**hver bedrift kobler til sin egen Infrakit-bruker**, så de ser sine egne
prosjekter og maskiner.

## Slik henger det sammen

| Rolle | Gjør én gang | Får |
|---|---|---|
| Du (som drifter proxyen) | Setter opp workeren under, og deler ut *oppsettkoden* til bedriftsadmins | En proxy alle bedrifter kan bruke |
| Bedriftsadmin | Mer → Infrakit → «Koble til bedrift», logger inn med bedriftens Infrakit-bruker | En **tilgangskode** for bedriften |
| Ansatt | Mer → Infrakit → taster tilgangskoden | Sine egne prosjekter, maskiner og timer |

Passord lagres aldri. Proxyen tar vare på et fornybart token (kryptert med
AES-GCM) og fornyer tilgangen selv – ingen ukentlig ny innlogging.

## Steg (gratis, ca. 10 minutter)

### 1. Lag KV-lageret (her ligger bedriftenes tilkoblinger)

Cloudflare-dashbordet → **Storage & databases → KV** → **Create namespace** →
navn `timeapp` → Add.

### 2. Bind lageret til workeren

Workeren `timeapp-proxy` → **Settings → Bindings** → **Add binding** →
**KV namespace** → Variable name: `TIMEAPP_KV`, Namespace: `timeapp` → Deploy.

### 3. Legg inn de to hemmelighetene

**Settings → Variables and Secrets**, begge som type **Secret**:

- `ENC_KEY` – krypteringsnøkkel. Lag en med denne kommandoen (den kopieres til
  utklippstavlen, uten å vises noe sted):

  ```
  powershell -Command "[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 })) | Set-Clipboard"
  ```

- `SETUP_KEY` – oppsettkoden du deler med bedriftsadmins (velg selv, f.eks.
  fire tilfeldige ord). Uten den kan ingen koble en bedrift til proxyen.

### 4. Legg inn koden

Workeren → **Edit code** → lim inn hele `cloud/worker.js` → **Deploy**.

## Koble til en bedrift

I appen (Mer → Infrakit → «Administrator: koble bedriften til Infrakit»):
bedriftsnavn, oppsettkoden, og bedriftens Infrakit-brukernavn og passord.
Appen viser da tilgangskoden – del den med de ansatte.

## Sikkerhet

- **Passord lagres aldri** – kun et fornybart token, kryptert med `ENC_KEY`.
- **Bedriftene er isolert** – tilgangskoden bestemmer hvilken Infrakit-tilgang
  som brukes, og hurtiglagringen er adskilt per bedrift.
- **Oppsettkoden** hindrer at utenforstående kan registrere bedrifter (og at
  proxyen misbrukes til å gjette Infrakit-passord).
- **CORS** er låst til appens adresser – se `ALLOWED_ORIGINS` i `worker.js`.
- Skal en bedrift kobles fra: slett nøkkelen `company:<tilgangskode>` i
  KV-lageret.
