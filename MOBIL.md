# Timeapp på mobil

Tre veier til appen på telefonen, fra enklest til tyngst. **Alle tre kjører
nøyaktig samme kode** – butikk-appene er et skall rundt den samme PWA-en, så en
utrulling til GitHub Pages oppdaterer alle sammen uten ny butikkgodkjenning.

| Vei | Kostnad | Krever | Tid |
|---|---|---|---|
| 1. Installer fra nettleser | 0 kr | ingenting | i dag |
| 2. Google Play | ~300 kr engangs | Play-konto | 1–3 dager |
| 3. App Store | ~1 100 kr/år | **Mac med Xcode** | 1–2 uker |

---

## 1. Installer fra nettleser (virker nå)

Send de ansatte adressen <https://mag-kri.github.io/timeapp/>.

- **Android**: Chrome → meny (⋮) → «Installer app»
- **iPhone**: Safari → Del-knappen → «Legg til på Hjem-skjerm»

Under **Mer → Installer som app** ligger nå en ekte installasjonsknapp på
Android, og trinnvis framgangsmåte på iPhone. Kortet forsvinner av seg selv når
appen alt er installert.

Resultatet er et eget ikon, ingen adresselinje, offline-drift og push-varsler –
det samme du får fra butikkene. For en intern bedriftsapp er dette som regel
godt nok.

---

## 2. Google Play

### Først: domenet må ryddes

Dette er den ene tingen som må løses før Android-appen kan bli helskjerm.

En Play-app pakket rundt en nettside (Trusted Web Activity) beviser at den eier
nettstedet ved å hente **`https://<domene>/.well-known/assetlinks.json`**.
Oppslaget går alltid til *roten av domenet* – stien i adressen teller ikke.

For dere betyr det at Android leter her:

```
https://mag-kri.github.io/.well-known/assetlinks.json     ← hit ser Android
https://mag-kri.github.io/timeapp/.well-known/...          ← hit havner repoets fil
```

Filen i dette repoet havner altså på feil sted, og verifiseringen slår feil.
Appen *kjører* fortsatt, men med en adresselinje øverst – den ser ut som en
nettside i en ramme, ikke som en app.

**Anbefalt løsning: eget underdomene.** Dere eier `rentalk.net` allerede:

1. Lag en `CNAME`-fil i dette repoet med innholdet `timer.rentalk.net`
2. Sett opp en CNAME-post hos domeneleverandøren:
   `timer.rentalk.net` → `mag-kri.github.io`
3. GitHub → repoets Settings → Pages → Custom domain → `timer.rentalk.net`,
   og huk av for «Enforce HTTPS»

Da blir adressen `https://timer.rentalk.net/`, dere eier hele domenet, og
`.well-known/assetlinks.json` havner der Android faktisk leter. Kortere adresse
for de ansatte på kjøpet.

*Alternativet* er å opprette et eget repo som heter `mag-kri.github.io` og legge
`assetlinks.json` i roten der – men da knyttes Android-appen til hele
`mag-kri.github.io`, som er delt med alle andre GitHub-brukere. Eget domene er
klart å foretrekke.

> `.nojekyll` er lagt inn i repoet. Uten den hopper GitHub Pages over mapper som
> begynner med punktum, og `.well-known/` ville aldri blitt servert i det hele tatt.

### Så: lag pakken

Ingen Node eller Android Studio nødvendig – <https://www.pwabuilder.com> gjør
jobben i nettleseren.

1. Lim inn adressen → **Package for stores** → **Android**
2. Fyll ut:
   - Package ID: `net.rentalk.timeapp`
   - App name: `Timeapp`
   - Signing key: **Create new** (last ned og ta vare på filen – mister du den,
     kan appen aldri oppdateres)
3. Last ned zip-filen. Den inneholder `.aab`-filen, signeringsnøkkelen og en
   ferdig utfylt `assetlinks.json`
4. Kopier `assetlinks.json` fra zip-en inn i `.well-known/` her og push

### Til slutt: Play Console

Konto koster ~300 kr én gang på <https://play.google.com/console>.

Registrer dere som **organisasjon**, ikke privatperson. Nye *personlige* kontoer
må kjøre en lukket test med 12 testere i 14 dager før de får publisere –
organisasjonskontoer slipper det. Organisasjon krever et D-U-N-S-nummer, som er
gratis og tar noen dager.

For en intern app trenger dere neppe offentlig publisering i det hele tatt:
**sporet «Intern testing» tar opptil 100 brukere, går utenom gjennomgang og er
tilgjengelig minutter etter opplasting.** De ansatte får en lenke og installerer
fra Play som normalt. Det er nesten alltid riktig valg her.

Uansett spor må dere ha:

- **En personvernerklæring på en offentlig adresse.** Påkrevd, ingen unntak.
  Appen lagrer navn, e-post, arbeidstider og prosjekttilknytning.
- **Datasikkerhetsskjemaet** utfylt (hva samles inn, hvorfor, deles det?)
- **Skjermbilder**: minst 2, mellom 320 og 3840 piksler. Ta dem fra telefonen –
  det gir langt bedre bilder enn noe som lages på en PC.
- **Butikkikon**: bruk `icons/store-icon-512.png`

---

## 3. App Store

### Dette kan ikke gjøres herfra

iOS-apper må kompileres og signeres med Xcode, som bare finnes på macOS. Uten
tilgang til en Mac stopper det her – ingen omvei fra Windows.

Sjekk om noen i firmaet har en Mac, eventuelt lei en i skyen (MacStadium,
MacinCloud) for noen hundrelapper i måneden mens jobben gjøres.

### Framgangsmåte når Mac er på plass

1. Apple Developer Program: ~1 100 kr/år på <https://developer.apple.com/programs/>
   – bedriftsregistrering krever D-U-N-S-nummer
2. PWABuilder → **Package for stores** → **iOS**. Bundle ID: `net.rentalk.timeapp`
3. Pakk ut på Macen, åpne `.xcworkspace` i Xcode
4. Signing & Capabilities → velg utviklerkontoen
5. Product → Archive → Distribute App → App Store Connect
6. Legg inn oppføringen på <https://appstoreconnect.apple.com>: navn, beskrivelse,
   skjermbilder fra iPhone, ikon `icons/store-icon-1024.png`, personvernerklæring

### Vær forberedt på avslag

Apples retningslinje **4.2 (Minimum Functionality)** avviser apper som i
hovedsak er en innpakket nettside. Timeapp har gode kort på hånden – den
fungerer offline, lagrer data på enheten og har stempling som fungerer uten
dekning – men avslag i første runde er vanlig. Skriv i notatet til
gjennomgangen at appen er et internt verktøy med offline-funksjonalitet, og
legg ved en testbruker de kan logge inn med.

### Enklere: TestFlight

For en intern app slipper dere unna med **TestFlight**: opptil 100 interne
testere, langt lettere gjennomgang, og appen trenger aldri ligge offentlig i
App Store. Krever fortsatt Mac og medlemskapet på 1 100 kr/år, men fjerner
mesteparten av risikoen for avslag.

---

## Skjermbilder til butikkene

Ta dem fra en telefon med ekte data i appen:

- **iPhone**: volum opp + sidebryter samtidig
- **Android**: volum ned + av/på samtidig

Fire–fem bilder holder: Timer-fanen med noen føringer, Stemple-fanen midt i en
økt, Uke-fanen med søylediagrammet, og en maskindagsrapport.

Vil du at Chrome skal vise en rikere installasjonsdialog, legg bildene i
`screenshots/` og ta dem inn i `manifest.webmanifest`:

```json
"screenshots": [
  {
    "src": "screenshots/timer.png",
    "sizes": "1080x2400",
    "type": "image/png",
    "form_factor": "narrow",
    "label": "Dagens timeføringer"
  }
]
```

---

## Etter at butikk-appene er ute

Vanlige utrullinger fungerer som før: bump `APP_VERSJON` i `js/app.js`,
`VERSION` i `sw.js` og `?v=`-numrene, og push. Butikk-appene henter samme
nettinnhold og oppdaterer seg selv.

Ny opplasting til butikkene trengs bare når selve skallet endres – ikon, navn,
tillatelser eller adressen appen peker på.
