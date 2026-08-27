# Timeapp

En timeføringsapp (PWA) som fungerer i nettleser og kan installeres på
hjemskjermen på både Android og iPhone. Ingen byggeverktøy – ren HTML, CSS og
JavaScript, med en Cloudflare Worker som serverdel.

## Funksjoner

- **Innlogging** med egen bruker per ansatt, og rollene *koordinator* og *ansatt*
- **Stemple inn/ut** med valgfritt prosjekt – utstempling lagres automatisk som timeføring
- **Timeføring** per dag med prosjekt, start/slutt, antall timer og notat
- **Ukeoversikt** med norske ukenumre, søylediagram per dag og fordeling per prosjekt
- **Maskintimer** fra Infrakit som egen kategori, adskilt fra arbeidstimer, med
  automatisk dagsrapport per maskin (turer, kilometer, masse og ruter)
- **Prosjekter** med egne farger
- **Offline**: fungerer uten nett etter første besøk (service worker)
- **Timene lagres lokalt** på enheten, med eksport/import av JSON-sikkerhetskopi

## Roller

| Rolle | Kan |
|---|---|
| **Koordinator** | Registrere bedriften, koble den til Infrakit, opprette og fjerne brukere – i tillegg til alt en ansatt kan |
| **Ansatt** | Stemple, føre timer og se bedriftens maskiner og maskintimer |

Første bruker i en bedrift blir koordinator og må oppgi *oppsettkoden* fra den
som drifter tjenesten. Øvrige brukere opprettes av koordinatoren, som gir dem
en engangskode de bruker til å sette sitt eget passord.

## Serverdelen

`cloud/worker.js` er en Cloudflare Worker med D1-database (`cloud/schema.sql`)
som håndterer innlogging, brukere og Infrakit-data. Oppsett er beskrevet i
[cloud/OPPSKRIFT.md](cloud/OPPSKRIFT.md).

Infrakit-data hentes med bedriftens eget IAM-token: maskinlista fra
`/v1/equipment/by-project/{uuid}` og maskintimene ved å summere arbeidsøktene
fra kalender-endepunktet, beriket med turer, masser og områder fra
massetransport-modulen.

## Kjøre lokalt

Appen må serveres over HTTP (ikke åpnes som fil). Uten noe installert:

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\serve.ps1
```

Åpne deretter <http://localhost:8613/>. Appen snakker med den publiserte
skytjenesten – adressen kan overstyres under Mer → Infrakit → Avansert.

## Legge ut på nett

Alt utenom `cloud/`, `scripts/` og `.claude/` er statiske filer som kan legges
på en hvilken som helst vert med HTTPS. Denne appen ligger på GitHub Pages:
<https://mag-kri.github.io/timeapp/>

På telefonen:

- **iPhone**: åpne adressen i Safari → Del → «Legg til på Hjem-skjerm»
- **Android**: åpne adressen i Chrome → meny (⋮) → «Legg til på startsiden»

## Filstruktur

```
index.html            appens skall
manifest.webmanifest  PWA-manifest (navn, ikoner, farger)
sw.js                 service worker (offline-støtte)
css/app.css           alt av stiler, lys og mørk modus
js/app.js             visninger, innlogging og hendelser
js/store.js           tilstand + localStorage + eksport/import
js/dates.js           datohjelpere (ISO-uke, norsk formatering)
cloud/worker.js       serverdelen (Cloudflare Worker)
cloud/schema.sql      databaseskjema (D1/SQLite)
cloud/test-*.js       tester som kjøres i nettleseren
icons/                app-ikoner (genereres av scripts/make-icons.ps1)
scripts/serve.ps1     enkel utviklingsserver (kun PowerShell)
```
