// Timeapp skyproxy - Cloudflare Worker
//
// Brukere, roller og Infrakit-data for flere bedrifter, lagret i D1 (SQLite).
// Hver bedrift kobles til sin EGEN Infrakit-bruker av koordinatoren, og
// proxyen lagrer kun et fornybart refresh-token (kryptert) - aldri passord.
//
// Passord forlater aldri telefonen: appen utleder en noekkel med PBKDF2 og
// sender kun den. Serveren lagrer SHA-256 av avledet noekkel + pepper.
//
// Ruter:
//   POST /api/auth/register   koordinator registrerer bedrift (krever oppsettkode)
//   GET  /api/auth/salt       salt for e-post (roeper ikke om brukeren finnes)
//   POST /api/auth/login      e-post + avledet noekkel -> oekt-token
//   POST /api/auth/accept     ansatt loeser inn engangskode og setter passord
//   GET  /api/auth/me         hvem er innlogget
//   POST /api/auth/logout     avslutt oekten
//   GET  /api/users           koordinator: brukere og ventende invitasjoner
//   POST /api/users/invite    koordinator: opprett engangskode til ansatt
//   POST /api/users/remove    koordinator: fjern bruker
//   POST /api/infrakit/connect  koordinator: koble bedriften til Infrakit
//   GET  /api/infrakit/status   status for innlogget bruker
//   GET  /api/infrakit/machines bedriftens maskiner
//   GET  /api/infrakit/hours    bedriftens maskintimer
//
// Bindinger i Cloudflare:
//   D1-database bundet som  DB          (skjema: cloud/schema.sql)
//   Secret  ENC_KEY    - base64 av 32 tilfeldige bytes
//   Secret  SETUP_KEY  - oppsettkode for aa registrere en ny bedrift
//
// Merk: kildekoden holdes ren ASCII slik at den taaler kopiering mellom
// verktoy med ulike tegnsett.

// Oekes ved endringer, slik at appen kan se hvilken serverversjon som kjoerer
const VERSJON = 3;

const IAM = 'https://iam.infrakit.com/auth/token';
const IK = 'https://app.infrakit.com/kuura';
const ALLOWED_ORIGINS = ['https://mag-kri.github.io', 'http://localhost:8613'];
const KODE_ALFABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const OEKT_LEVETID = 30 * 24 * 3600;
const INVITE_LEVETID = 14 * 24 * 3600;

const SEP = ' \u00B7 ';
const ARROW = ' \u2192 ';
const BULLET = '\u2022 ';

// Mellomlagring per bedrift (nullstilles naar workeren resirkuleres)
const tokenCache = new Map();
const dataCache = new Map();

/* ---------- Smaating ---------- */

const na = () => Math.floor(Date.now() / 1000);
const iso = () => new Date().toISOString();
const epostAv = (e) => String(e || '').trim().toLowerCase();

function bytesTilB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64TilBytes(b64) {
  const bin = atob(b64);
  const ut = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) ut[i] = bin.charCodeAt(i);
  return ut;
}

function tilfeldigKode(grupper) {
  const bytes = crypto.getRandomValues(new Uint8Array(grupper * 4));
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0 && i % 4 === 0) s += '-';
    s += KODE_ALFABET[bytes[i] % KODE_ALFABET.length];
  }
  return s;
}

function tilfeldigToken() {
  return bytesTilB64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Konstanttidssammenligning
function likeStrenger(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let ulikt = 0;
  for (let i = 0; i < x.length; i++) ulikt |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return ulikt === 0;
}

async function sha256B64(tekst) {
  return bytesTilB64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst))));
}

// Beviset serveren lagrer. Klienten har allerede kjoert PBKDF2, saa dette er
// billig for workeren, men like tungt aa knekke offline.
const verifikator = (env, avledetNokkel) => sha256B64(String(avledetNokkel) + ':' + String(env.ENC_KEY || ''));

// Salt for ukjente e-poster utledes deterministisk, slik at svaret ikke roeper
// om brukeren finnes.
async function lokkeSalt(env, epost) {
  return (await sha256B64('salt:' + epost + ':' + String(env.ENC_KEY || ''))).slice(0, 24);
}

/* ---------- Kryptering av Infrakit-tokens ---------- */

async function encKey(env) {
  if (!env.ENC_KEY) throw new Error('ENC_KEY mangler i workerens hemmeligheter');
  return crypto.subtle.importKey('raw', b64TilBytes(env.ENC_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function krypter(env, tekst) {
  const key = await encKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(tekst)));
  const samlet = new Uint8Array(iv.length + ct.length);
  samlet.set(iv);
  samlet.set(ct, iv.length);
  return bytesTilB64(samlet);
}

async function dekrypter(env, b64) {
  const key = await encKey(env);
  const buf = b64TilBytes(b64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
  return new TextDecoder().decode(pt);
}

/* ---------- Database ---------- */

const spor = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);

const hentBruker = (env, epost) =>
  spor(env, 'SELECT * FROM users WHERE email = ?', epostAv(epost)).first();

const hentBedrift = (env, id) =>
  spor(env, 'SELECT * FROM companies WHERE id = ?', String(id || '')).first();

async function nyOekt(env, bruker) {
  const token = tilfeldigToken();
  await spor(env, 'INSERT INTO sessions (token, email, expires_at, created_at) VALUES (?, ?, ?, ?)',
    token, bruker.email, na() + OEKT_LEVETID, iso()).run();
  await spor(env, 'UPDATE users SET last_login = ? WHERE email = ?', iso(), bruker.email).run();
  return token;
}

async function hentOekt(env, request) {
  const h = request.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  const rad = await spor(env,
    `SELECT s.token, u.* FROM sessions s JOIN users u ON u.email = s.email
     WHERE s.token = ? AND s.expires_at > ?`, token, na()).first();
  if (!rad) return null;
  const bedrift = await hentBedrift(env, rad.company_id);
  if (!bedrift) return null;
  return { token, bruker: rad, bedrift };
}

const offentligBruker = (b) => ({ email: b.email, name: b.name, role: b.role });
const offentligBedrift = (b) => ({ id: b.id, name: b.name, infrakit: Boolean(b.refresh_token) });

/* ---------- Infrakit ---------- */

// IAM krever parametrene i query-strengen (bekreftet mot API-et).
async function iamToken(params) {
  const r = await fetch(IAM + '?' + new URLSearchParams(params).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) {
    const feil = new Error('Infrakit avviste innloggingen (HTTP ' + r.status + ')');
    feil.status = r.status;
    throw feil;
  }
  const j = await r.json();
  if (!j.accessToken) throw new Error('Fikk ikke token fra Infrakit');
  return j;
}

async function accessToken(env, bedrift) {
  const bufret = tokenCache.get(bedrift.id);
  if (bufret && bufret.expiresAt > Date.now() + 60000) return bufret.accessToken;
  if (!bedrift.refresh_token) throw new Error('Bedriften er ikke koblet til Infrakit');

  const refresh = await dekrypter(env, bedrift.refresh_token);
  const svar = await iamToken({ grant_type: 'refresh_token', refresh_token: refresh });
  tokenCache.set(bedrift.id, {
    accessToken: svar.accessToken,
    expiresAt: Date.now() + (Number(svar.expiresIn) || 3600) * 1000,
  });
  if (svar.refreshToken && svar.refreshToken !== refresh) {
    await spor(env, 'UPDATE companies SET refresh_token = ? WHERE id = ?',
      await krypter(env, svar.refreshToken), bedrift.id).run();
  }
  return svar.accessToken;
}

async function ik(sti, token) {
  const r = await fetch(IK + sti, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Infrakit svarte ' + r.status);
  return r.json();
}

async function ikPost(sti, token) {
  const r = await fetch(IK + sti, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  return r.ok;
}

// Cloudflare tillater maks 50 utgaaende kall per forespoersel, saa timehentingen
// holder regnskap og prioriterer maskinene med mest aktivitet.
const MAKS_KALL = 44;

const osloFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const osloDate = (ms) => osloFmt.format(new Date(ms));

async function buildMachines(token) {
  const pr = await ik('/v1/projects', token);
  const plist = Array.isArray(pr) ? pr : pr.projects || [];
  const machines = new Map();
  for (const p of plist) {
    try {
      const eq = await ik('/v1/equipment/by-project/' + p.uuid, token);
      const elist = Array.isArray(eq) ? eq : eq.equipment || [];
      for (const m of elist) {
        if (!m.name) continue;
        const key = m.uuid || m.name;
        if (!machines.has(key)) machines.set(key, { name: String(m.name), type: String(m.type ?? ''), projects: [] });
        machines.get(key).projects.push(String(p.name));
      }
    } catch { /* hopp over prosjekt uten tilgang */ }
  }
  return JSON.stringify({
    updated: iso(),
    projects: plist.map((p) => String(p.name)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb')),
    machines: [...machines.values()].sort((a, b) => a.name.localeCompare(b.name, 'nb')),
  });
}

async function hentProsjekter(token) {
  const pr = await ik('/ajax_projects.json', token);
  return (Array.isArray(pr) ? pr : pr.projects || []).filter((p) => p && p.name);
}

// Med kunProsjektId hentes bare ett prosjekt - da holder appen seg godt innenfor
// kallgrensen selv med mange maskiner, og henter prosjektene hver for seg.
async function buildHours(token, kunProsjektId) {
  const endMs = Date.now() + 86400000;
  const startMs = endMs - 15 * 86400000;
  const days = [];
  const areaMaps = new Map();
  let kall = 0;
  const budsjett = () => kall < MAKS_KALL;

  // Kjoretoylista er bundet til ett prosjekt om gangen, saa vi spoer per prosjekt.
  let plist = await hentProsjekter(token);
  kall++;
  if (kunProsjektId) plist = plist.filter((p) => String(p.id) === String(kunProsjektId));

  // Infrakit serverer kalenderdata KUN for maskiner i det aktive prosjektet, saa
  // vi maa bytte aktivt prosjekt underveis - og sette tilbake det brukeren hadde.
  let opprinnelig = null;
  try {
    const cur = await ik('/ajax_current_project.json', token);
    kall++;
    if (cur && cur.id) opprinnelig = cur.id;
  } catch { /* klarer oss uten */ }

  const grense = Date.now() - 16 * 86400000;
  const vlist = [];

  for (const p of plist) {
    if (!budsjett()) break;
    try {
      if (String(p.id) !== String(opprinnelig)) {
        await ikPost('/ajax_change_project.json?projectId=' + p.id, token);
        kall++;
      }
      const veh = await ik('/ajax_vehicles.json?projectId=' + p.id, token);
      kall++;
      const aktive = (veh.vehicles || [])
        .filter((v) => v.id && (Number(v.worktimeLastWeek) > 0 || Number(v.lastReport) > grense || Number(v.lastActive) > grense))
        .sort((a, b) => (Number(b.worktimeLastWeek) || 0) - (Number(a.worktimeLastWeek) || 0));
      for (const v of aktive) {
        vlist.push({ v, projectName: String(p.name || ''), projectUuid: String(p.uuid || '') });
        if (!budsjett()) break;
        await samleTimer(v, p);
      }
    } catch { /* hopp over prosjekt uten tilgang */ }
  }

  // Sett tilbake prosjektet brukeren hadde aktivt i Infrakit
  if (opprinnelig && plist.some((p) => String(p.id) !== String(opprinnelig))) {
    try { await ikPost('/ajax_change_project.json?projectId=' + opprinnelig, token); } catch { /* best effort */ }
  }

  return JSON.stringify({ updated: iso(), days });

  async function samleTimer(v, p) {
    const post = { v, projectName: String(p.name || ''), projectUuid: String(p.uuid || '') };
    try {
      const per = new Map();
      const bucket = (dag) => {
        if (!per.has(dag)) per.set(dag, { ms: 0, first: null, last: null, turer: 0, km: 0, mod: new Map(), mat: new Map(), ruter: new Map() });
        return per.get(dag);
      };

      const ev = await ik(`/ajax_calendar_events.json?vehicleId=${v.id}&start=${startMs}&end=${endMs}`, token);
      kall++;
      for (const e of ev.events || []) {
        if (!e.start || !e.end) continue;
        const ms = new Date(String(e.end).replace(' ', 'T')) - new Date(String(e.start).replace(' ', 'T'));
        if (ms <= 0) continue;
        const d = bucket(String(e.start).slice(0, 10));
        d.ms += ms;
        const fra = String(e.start).slice(11, 16);
        const til = String(e.end).slice(11, 16);
        if (!d.first || fra < d.first) d.first = fra;
        if (!d.last || til > d.last) d.last = til;
      }

      try {
        if (!per.size || !budsjett()) throw new Error('hopp over');
        const mev = await ik(`/ajax_calendar_active_model_events.json?vehicleId=${v.id}&start=${startMs}&end=${endMs}`, token);
        kall++;
        for (const m of mev.events || []) {
          const navn = String(m.title || '').trim();
          if (!m.start || !navn) continue;
          const dag = String(m.start).slice(0, 10);
          if (per.has(dag)) per.get(dag).mod.set(navn, true);
        }
      } catch { /* modeller er valgfritt */ }

      const pu = post.projectUuid || (v.activeProject ? String(v.activeProject.uuid) : '');
      if (pu && per.size && v.uuid) {
        // Turer og omraader hentes en gang per prosjekt og gjenbrukes
        if (!areaMaps.has(pu) && budsjett()) {
          const map = { omrader: new Map(), turer: new Map() };
          try {
            const ar = await ik('/v1/project/' + pu + '/areas', token);
            kall++;
            for (const a of ar.areas || []) if (a.uuid && a.title) map.omrader.set(String(a.uuid), String(a.title).trim());
          } catch { /* omrader er valgfritt */ }
          try {
            let page = 1;
            let batch;
            do {
              const tr = await ik(`/v1/project/${pu}/trips?start=${startMs}&end=${endMs}&page=${page}&pageSize=100`, token);
              kall++;
              batch = tr.trips || [];
              for (const t of batch) {
                const nokkel = String(t.equipmentUuid || '');
                if (!nokkel) continue;
                if (!map.turer.has(nokkel)) map.turer.set(nokkel, []);
                map.turer.get(nokkel).push(t);
              }
              page++;
            } while (batch.length === 100 && page <= 5 && budsjett());
          } catch { /* turer er valgfritt */ }
          areaMaps.set(pu, map);
        }
        const pdata = areaMaps.get(pu);
        for (const t of (pdata && pdata.turer.get(String(v.uuid))) || []) {
          if (!t.startMillis) continue;
          const dag = osloDate(Number(t.startMillis));
          if (!per.has(dag)) continue;
          const d = per.get(dag);
          d.turer++;
          if (t.distance) d.km += Number(t.distance) / 1000;
          const mnavn = String(t.material || '').trim();
          if (mnavn) d.mat.set(mnavn, (d.mat.get(mnavn) || 0) + 1);
          const fra = t.startAreaUuid ? pdata.omrader.get(String(t.startAreaUuid)) : null;
          const til = t.endAreaUuid ? pdata.omrader.get(String(t.endAreaUuid)) : null;
          if (fra || til) {
            const rute = fra && til ? fra + ARROW + til : fra ? fra + ' (kun lastet)' : '(ukjent)' + ARROW + til;
            d.ruter.set(rute, (d.ruter.get(rute) || 0) + 1);
          }
        }
      }

      const projName = post.projectName || (v.activeProject ? String(v.activeProject.name) : null);
      for (const [dag, d] of per) {
        const linjer = [];
        const deler = [];
        if (d.turer > 0) deler.push(d.turer === 1 ? '1 tur' : d.turer + ' turer');
        if (d.km >= 1) deler.push(Math.round(d.km) + ' km');
        if (deler.length) linjer.push(deler.join(SEP));
        if (d.mod.size) {
          linjer.push('', 'Modeller:');
          for (const navn of [...d.mod.keys()].sort()) linjer.push(BULLET + navn);
        }
        if (d.mat.size) {
          linjer.push('', 'Masse:');
          for (const [navn, n] of [...d.mat].sort((a, b) => b[1] - a[1])) linjer.push(`${BULLET}${navn}${SEP}${n} lass`);
        }
        if (d.ruter.size) {
          linjer.push('', 'Ruter:');
          for (const [rute, n] of [...d.ruter].sort((a, b) => b[1] - a[1])) {
            linjer.push(`${BULLET}${rute}${SEP}${n === 1 ? '1 tur' : n + ' turer'}`);
          }
        }
        let note = linjer.join('\n').trim();
        if (note.length > 900) note = note.slice(0, 899) + '\u2026';
        days.push({
          date: dag,
          machine: String(v.name),
          project: projName,
          hours: Math.round((d.ms / 3600000) * 100) / 100,
          note,
          start: d.first ? `${dag}T${d.first}:00` : null,
          end: d.last ? `${dag}T${d.last}:00` : null,
        });
      }
    } catch { /* hopp over kjoretoy som feiler */ }
  }
}

async function medCache(id, type, maxAlderMs, lag) {
  const nokkel = id + ':' + type;
  const bufret = dataCache.get(nokkel);
  if (bufret && Date.now() - bufret.ts < maxAlderMs) return bufret.body;
  const body = await lag();
  dataCache.set(nokkel, { ts: Date.now(), body });
  return body;
}

/* ---------- HTTP ---------- */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const sti = url.pathname.replace(/\/+$/, '');
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });
    const lesInn = async () => {
      try { return await request.json(); } catch { return null; }
    };

    try {
      /* --- Innlogging og registrering --- */

      if (sti === '/api/versjon') return json({ version: VERSJON });

      if (sti === '/api/auth/salt') {
        const epost = epostAv(url.searchParams.get('email'));
        if (!epost) return json({ error: 'Mangler e-post' }, 400);
        const bruker = await hentBruker(env, epost);
        return json({ salt: bruker ? bruker.salt : await lokkeSalt(env, epost) });
      }

      if (sti === '/api/auth/register' && request.method === 'POST') {
        const inn = await lesInn();
        if (!inn) return json({ error: 'Ugyldig forespoersel' }, 400);
        if (!env.SETUP_KEY || !likeStrenger(inn.setupKey, env.SETUP_KEY)) {
          return json({ error: 'Feil oppsettkode' }, 401);
        }
        const epost = epostAv(inn.email);
        const navn = String(inn.name || '').trim().slice(0, 80);
        const bedriftsnavn = String(inn.company || '').trim().slice(0, 80);
        if (!epost.includes('@')) return json({ error: 'Ugyldig e-post' }, 400);
        if (!navn) return json({ error: 'Mangler navn' }, 400);
        if (!bedriftsnavn) return json({ error: 'Mangler bedriftsnavn' }, 400);
        if (!inn.salt || !inn.derivedKey) return json({ error: 'Mangler passord' }, 400);
        if (await hentBruker(env, epost)) return json({ error: 'Denne e-posten er allerede registrert' }, 409);

        const cid = tilfeldigKode(3);
        await spor(env, 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', cid, bedriftsnavn, iso()).run();
        const bruker = {
          email: epost, name: navn, company_id: cid, role: 'coordinator',
          salt: String(inn.salt).slice(0, 64), verifier: await verifikator(env, inn.derivedKey),
        };
        await spor(env,
          'INSERT INTO users (email, name, company_id, role, salt, verifier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          bruker.email, bruker.name, cid, bruker.role, bruker.salt, bruker.verifier, iso()).run();
        return json({
          token: await nyOekt(env, bruker),
          user: offentligBruker(bruker),
          company: { id: cid, name: bedriftsnavn, infrakit: false },
        });
      }

      if (sti === '/api/auth/login' && request.method === 'POST') {
        const inn = await lesInn();
        if (!inn) return json({ error: 'Ugyldig forespoersel' }, 400);
        const bruker = await hentBruker(env, inn.email);
        const gitt = await verifikator(env, inn.derivedKey);
        if (!bruker || !likeStrenger(bruker.verifier, gitt)) {
          return json({ error: 'Feil e-post eller passord' }, 401);
        }
        const bedrift = await hentBedrift(env, bruker.company_id);
        return json({
          token: await nyOekt(env, bruker),
          user: offentligBruker(bruker),
          company: bedrift ? offentligBedrift(bedrift) : null,
        });
      }

      if (sti === '/api/auth/accept' && request.method === 'POST') {
        const inn = await lesInn();
        if (!inn) return json({ error: 'Ugyldig forespoersel' }, 400);
        const kode = String(inn.code || '').trim().toUpperCase();
        const invitasjon = kode
          ? await spor(env, 'SELECT * FROM invites WHERE code = ? AND expires_at > ?', kode, na()).first()
          : null;
        if (!invitasjon) return json({ error: 'Ugyldig eller utloept engangskode' }, 401);
        if (!inn.salt || !inn.derivedKey) return json({ error: 'Mangler passord' }, 400);
        if (await hentBruker(env, invitasjon.email)) {
          return json({ error: 'Brukeren finnes allerede - logg inn i stedet' }, 409);
        }
        const bruker = {
          email: invitasjon.email,
          name: String(inn.name || invitasjon.name || '').trim().slice(0, 80) || invitasjon.email,
          company_id: invitasjon.company_id,
          role: invitasjon.role,
          salt: String(inn.salt).slice(0, 64),
          verifier: await verifikator(env, inn.derivedKey),
        };
        await spor(env,
          'INSERT INTO users (email, name, company_id, role, salt, verifier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          bruker.email, bruker.name, bruker.company_id, bruker.role, bruker.salt, bruker.verifier, iso()).run();
        await spor(env, 'DELETE FROM invites WHERE code = ?', kode).run();
        const bedrift = await hentBedrift(env, bruker.company_id);
        return json({
          token: await nyOekt(env, bruker),
          user: offentligBruker(bruker),
          company: bedrift ? offentligBedrift(bedrift) : null,
        });
      }

      /* --- Alt under her krever innlogging --- */

      const oekt = await hentOekt(env, request);

      if (sti === '/api/auth/me') {
        if (!oekt) return json({ error: 'Ikke innlogget' }, 401);
        return json({ user: offentligBruker(oekt.bruker), company: offentligBedrift(oekt.bedrift) });
      }

      if (sti === '/api/auth/logout' && request.method === 'POST') {
        if (oekt) await spor(env, 'DELETE FROM sessions WHERE token = ?', oekt.token).run();
        return json({ ok: true });
      }

      if (sti.startsWith('/api/users') || sti.startsWith('/api/infrakit')) {
        if (!oekt) return json({ error: 'Ikke innlogget' }, 401);
      }

      /* --- Brukeradministrasjon (kun koordinator) --- */

      const kunKoordinator = () => oekt.bruker.role === 'coordinator';

      if (sti === '/api/users') {
        if (!kunKoordinator()) return json({ error: 'Kun koordinator kan se brukerlista' }, 403);
        const brukere = await spor(env,
          'SELECT email, name, role, created_at, last_login FROM users WHERE company_id = ? ORDER BY name',
          oekt.bruker.company_id).all();
        const ventende = await spor(env,
          'SELECT code, email, name, role FROM invites WHERE company_id = ? AND expires_at > ? ORDER BY email',
          oekt.bruker.company_id, na()).all();
        return json({ users: brukere.results || [], pending: ventende.results || [] });
      }

      if (sti === '/api/users/invite' && request.method === 'POST') {
        if (!kunKoordinator()) return json({ error: 'Kun koordinator kan opprette brukere' }, 403);
        const inn = await lesInn();
        if (!inn) return json({ error: 'Ugyldig forespoersel' }, 400);
        const epost = epostAv(inn.email);
        if (!epost.includes('@')) return json({ error: 'Ugyldig e-post' }, 400);
        if (await hentBruker(env, epost)) return json({ error: 'Denne e-posten har allerede en bruker' }, 409);
        const kode = tilfeldigKode(2);
        await spor(env,
          'INSERT INTO invites (code, email, name, company_id, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          kode, epost, String(inn.name || '').trim().slice(0, 80), oekt.bruker.company_id,
          inn.role === 'coordinator' ? 'coordinator' : 'employee', na() + INVITE_LEVETID, iso()).run();
        return json({ code: kode, email: epost });
      }

      if (sti === '/api/users/remove' && request.method === 'POST') {
        if (!kunKoordinator()) return json({ error: 'Kun koordinator kan fjerne brukere' }, 403);
        const inn = await lesInn();
        if (!inn) return json({ error: 'Ugyldig forespoersel' }, 400);
        const epost = epostAv(inn.email);
        if (epost === oekt.bruker.email) return json({ error: 'Du kan ikke fjerne deg selv' }, 400);
        const b = await hentBruker(env, epost);
        if (!b || b.company_id !== oekt.bruker.company_id) return json({ error: 'Fant ikke brukeren' }, 404);
        await spor(env, 'DELETE FROM sessions WHERE email = ?', epost).run();
        await spor(env, 'DELETE FROM users WHERE email = ?', epost).run();
        return json({ removed: epost });
      }

      /* --- Infrakit --- */

      if (sti === '/api/infrakit/connect' && request.method === 'POST') {
        if (!kunKoordinator()) return json({ error: 'Kun koordinator kan koble bedriften til Infrakit' }, 403);
        const inn = await lesInn();
        if (!inn) return json({ error: 'Ugyldig forespoersel' }, 400);
        if (!inn.username || !inn.password) return json({ error: 'Mangler Infrakit-innlogging' }, 400);
        try {
          const auth = await iamToken({ grant_type: 'password', username: inn.username, password: inn.password });
          if (!auth.refreshToken) return json({ error: 'Infrakit ga ikke fornybart token for denne brukeren' }, 502);
          const pr = await ik('/v1/projects', auth.accessToken);
          const antall = (Array.isArray(pr) ? pr : pr.projects || []).length;
          await spor(env,
            'UPDATE companies SET refresh_token = ?, connected_by = ?, connected_at = ? WHERE id = ?',
            await krypter(env, auth.refreshToken), oekt.bruker.email, iso(), oekt.bruker.company_id).run();
          tokenCache.delete(oekt.bruker.company_id);
          dataCache.delete(oekt.bruker.company_id + ':machines');
          dataCache.delete(oekt.bruker.company_id + ':hours');
          return json({ connected: true, company: oekt.bedrift.name, projects: antall });
        } catch (err) {
          if (err.status === 400 || err.status === 401 || err.status === 403) {
            return json({ error: 'Infrakit avviste innloggingen - sjekk brukernavn og passord' }, 401);
          }
          return json({ error: String(err.message || err) }, 502);
        }
      }

      if (sti === '/api/infrakit/status') {
        return json({
          connected: Boolean(oekt.bedrift.refresh_token),
          company: oekt.bedrift.name,
          role: oekt.bruker.role,
          connectedBy: oekt.bedrift.connected_by || null,
          proxy: 'cloudflare',
        });
      }

      if (sti === '/api/infrakit/machines' || sti === '/api/infrakit/hours' || sti === '/api/infrakit/projects') {
        if (!oekt.bedrift.refresh_token) {
          return json({ error: 'Bedriften er ikke koblet til Infrakit ennaa' }, 409);
        }
        try {
          const token = await accessToken(env, oekt.bedrift);
          let body;
          if (sti.endsWith('machines')) {
            body = await medCache(oekt.bedrift.id, 'machines', 10 * 60000, () => buildMachines(token));
          } else if (sti.endsWith('projects')) {
            body = await medCache(oekt.bedrift.id, 'projects', 10 * 60000, async () => {
              const plist = await hentProsjekter(token);
              return JSON.stringify({ projects: plist.map((p) => ({ id: p.id, name: String(p.name) })) });
            });
          } else {
            const pid = url.searchParams.get('projectId');
            body = await medCache(oekt.bedrift.id, 'hours' + (pid ? ':' + pid : ''), 5 * 60000,
              () => buildHours(token, pid));
          }
          return new Response(body, { headers: cors });
        } catch (err) {
          return json({ error: 'Infrakit-kallet feilet: ' + (err.message || err) }, 502);
        }
      }

      return json({ error: 'ukjent rute' }, 404);
    } catch (err) {
      return json({ error: 'Serverfeil: ' + (err.message || err) }, 500);
    }
  },
};
