# Sette opp skyproxyen (Cloudflare Worker)

Gjør at maskindata fra Infrakit virker på mobilene, ikke bare på PC-en.
Workeren logger inn mot Infrakit selv og fornyer API-nøkkelen automatisk –
ukesfornyelsen med `infrakit-login.ps1` trengs ikke i skyen.

## Steg (5–10 minutter, gratis)

1. Gå til <https://dash.cloudflare.com> og logg inn (eller opprett gratis konto).
2. Velg **Workers & Pages** → **Create** → **Create Worker**.
3. Gi den navnet `timeapp-proxy` → **Deploy** (hello world-versjonen).
4. Trykk **Edit code**, slett alt, og lim inn hele innholdet i `cloud/worker.js`
   fra dette repoet → **Deploy**.
5. Gå til workerens **Settings → Variables and Secrets** og legg inn tre
   hemmeligheter (type **Secret**):
   - `INFRAKIT_USER` – Infrakit-brukernavnet (e-post)
   - `INFRAKIT_PASS` – Infrakit-passordet
   - `APP_KEY` – en selvvalgt tilgangskode (lang og vanskelig å gjette,
     f.eks. tre-fire tilfeldige ord). Denne deles med de ansatte.
6. Noter worker-adressen, f.eks. `https://timeapp-proxy.dittnavn.workers.dev`.

## Koble appen til

På hver telefon (én gang): åpne Timeapp → **Mer** → Infrakit →
lim inn **Proxy-adresse** og **Tilgangskode** → **Lagre tilkobling**.

(Adressen kan også bakes inn i appen som standard – sett `DEFAULT_PROXY`
øverst i Infrakit-delen av `js/app.js` og push, så slipper de ansatte
adressefeltet og trenger bare koden.)

## Sikkerhet

- Passordet og nøklene ligger kun som hemmeligheter hos Cloudflare og på
  Infrakits egne servere – aldri i appen eller i dette repoet.
- Uten riktig `APP_KEY` svarer proxyen 401 på alle dataruter.
- CORS er låst til appens adresser (`mag-kri.github.io` + localhost) –
  endre `ALLOWED_ORIGINS` øverst i `worker.js` hvis appen flytter.
