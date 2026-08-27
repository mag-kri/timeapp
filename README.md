# Timeapp

En enkel timeføringsapp (PWA) som fungerer i nettleser og kan installeres på
hjemskjermen på både Android og iPhone. Ingen byggeverktøy – ren HTML, CSS og
JavaScript.

## Funksjoner

- **Stemple inn/ut** med valgfritt prosjekt – utstempling lagres automatisk som timeføring
- **Timeføring** per dag med prosjekt, antall timer og notat
- **Ukeoversikt** med norske ukenumre, søylediagram per dag og fordeling per prosjekt
- **Maskintimer** (gravemaskiner, lastebiler) som egen kategori, adskilt fra
  arbeidstimer – vises per dag og per uke med egne summer
- **Prosjekter** med egne farger
- **Offline**: fungerer uten nett etter første besøk (service worker)
- **Lokal lagring**: alt lagres i nettleserens `localStorage` på enheten,
  med eksport/import av JSON-sikkerhetskopi under «Mer»

## Maskintimer fra Infrakit

Appen leser automatisk filen `machine-hours.json` fra appmappen (ved oppstart,
når appen hentes fram igjen, og via knappen under «Mer»). Formatet er
dokumentert i `machine-hours.example.json`:

```json
{ "days": [ { "date": "2026-08-25", "machine": "Volvo EC250E", "project": "Prosjekt A", "hours": 7.5 } ] }
```

Innfletting er idempotent: samme dato + maskin + prosjekt oppdateres i stedet
for å dupliseres, og ukjente prosjektnavn opprettes automatisk. For datoene
filen dekker er den fasit – maskinføringer som er fjernet fra filen fjernes
også i appen.

### Direkte API-kobling (anbefalt)

Infrakit-API-et tillater ikke kall fra nettleseren (CORS), så utviklingsserveren
(`scripts/serve.ps1`) proxyer API-et under `/api/infrakit/*`:

1. Kjør `powershell -ExecutionPolicy Bypass -File scripts\infrakit-login.ps1`
   én gang (spør om Infrakit-brukernavn/passord, bytter dem i en API-nøkkel via
   `POST /kuura/apilogin.json` og lagrer den i `infrakit-config.json` – som er
   gitignorert og aldri når selve appen).
2. Start serveren på nytt.

Deretter henter appen automatisk:

- **Maskinlista** fra `GET /v1/equipment/by-project/{uuid}` for alle prosjekter
  (`/api/infrakit/machines`) – brukes i «Maskin»-nedtrekket, caches for offline
- **Maskintimer** per dag siste 14 dager (`/api/infrakit/hours`) – arbeidsøktene
  fra kalender-endepunktet summeres per dag per maskin

`machine-hours.json` fungerer som reserve når proxyen ikke er tilgjengelig
(f.eks. statisk hosting uten backend) – Claude kan oppdatere den på
forespørsel. Ved publisering til statisk vert må proxyen erstattes av en liten
serverless-funksjon med samme ruter.

## Kjøre lokalt

Appen må serveres over HTTP (ikke åpnes som fil). Uten noe installert:

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\serve.ps1
```

Åpne deretter <http://localhost:8613/>. Har du Node eller Python tilgjengelig
fungerer en hvilken som helst statisk server like godt.

## Legge ut på nett (for bruk på mobil)

Alt i denne mappen (unntatt `scripts/` og `.claude/`) er statiske filer. Last dem
opp til en hvilken som helst statisk vert med HTTPS, f.eks. Netlify, Cloudflare
Pages, Vercel eller GitHub Pages. HTTPS kreves for at service worker og
«installer som app» skal fungere på mobil.

Deretter, på telefonen:

- **iPhone**: åpne adressen i Safari → Del → «Legg til på Hjem-skjerm»
- **Android**: åpne adressen i Chrome → meny (⋮) → «Legg til på startsiden»

## Filstruktur

```
index.html          appens skall
manifest.webmanifest PWA-manifest (navn, ikoner, farger)
sw.js               service worker (offline-støtte)
css/app.css         alt av stiler, lys og mørk modus
js/app.js           visninger og hendelser
js/store.js         tilstand + localStorage + eksport/import
js/dates.js         datohjelpere (ISO-uke, norsk formatering)
icons/              app-ikoner (genereres av scripts/make-icons.ps1)
scripts/serve.ps1   enkel utviklingsserver (kun PowerShell)
```

Dataene ligger kun lokalt på hver enhet. Synkronisering (f.eks. mot Tripletex
eller en felles backend) kan bygges på senere – `js/store.js` er laget for å
kunne bytte lagringslag.
