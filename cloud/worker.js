// Timeapp skyproxy - Cloudflare Worker (flerselskaps)
//
// Hver bedriftsadmin kobler til sin EGEN Infrakit-bruker en gang. Proxyen
// lagrer kun et fornybart refresh-token (kryptert), aldri passord, og hver
// bedrift har sin egen tilgangskode - data krysser aldri mellom bedrifter.
//
// Ruter:
//   POST /api/infrakit/connect   (admin: oppsettkode + Infrakit-innlogging -> tilgangskode)
//   GET  /api/infrakit/status    (X-Timeapp-Key: hvem er tilkoblet)
//   GET  /api/infrakit/machines  (X-Timeapp-Key: bedriftens maskiner)
//   GET  /api/infrakit/hours     (X-Timeapp-Key: bedriftens maskintimer)
//
// Bindinger som maa settes opp i Cloudflare:
//   KV-namespace bundet som  TIMEAPP_KV
//   Secret  ENC_KEY    - base64 av 32 tilfeldige bytes (krypterer refresh-tokens)
//   Secret  SETUP_KEY  - oppsettkode som admin maa oppgi for aa koble til
//
// Merk: kildekoden holdes ren ASCII slik at den taaler kopiering mellom
// verktoy med ulike tegnsett.

const IAM = 'https://iam.infrakit.com/auth/token';
const IK = 'https://app.infrakit.com/kuura';
const ALLOWED_ORIGINS = ['https://mag-kri.github.io', 'http://localhost:8613'];
const KODE_ALFABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // uten forvekslingstegn

const SEP = ' \u00B7 ';   // midtprikk
const ARROW = ' \u2192 '; // pil
const BULLET = '\u2022 '; // punktmerke

// Mellomlagring per bedrift (nullstilles naar workeren resirkuleres)
const tokenCache = new Map(); // kode -> { accessToken, expiresAt }
const dataCache = new Map();  // kode + ':' + type -> { ts, body }

/* ---------- Kryptering av refresh-tokens ---------- */

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

function lagKode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) s += '-';
    s += KODE_ALFABET[bytes[i] % KODE_ALFABET.length];
  }
  return s; // f.eks. K7N2-9PQR-4XTL-M3BW
}

/* ---------- Infrakit-innlogging ---------- */

// IAM krever parametrene i query-strengen (bekreftet mot API-et).
async function iamToken(params) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(IAM + '?' + q, {
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

async function hentBedrift(env, kode) {
  if (!kode) return null;
  const rad = await env.TIMEAPP_KV.get('company:' + kode, 'json');
  return rad || null;
}

// Gyldig accessToken for bedriften - fornyes med refresh-token ved behov.
async function accessToken(env, kode, bedrift) {
  const na = Date.now();
  const bufret = tokenCache.get(kode);
  if (bufret && bufret.expiresAt > na + 60000) return bufret.accessToken;

  const refresh = await dekrypter(env, bedrift.refreshToken);
  const svar = await iamToken({ grant_type: 'refresh_token', refresh_token: refresh });
  tokenCache.set(kode, {
    accessToken: svar.accessToken,
    expiresAt: na + (Number(svar.expiresIn) || 3600) * 1000,
  });
  // Infrakit gir som regel samme refresh-token tilbake; lagre nytt hvis det kommer
  if (svar.refreshToken && svar.refreshToken !== refresh) {
    bedrift.refreshToken = await krypter(env, svar.refreshToken);
    await env.TIMEAPP_KV.put('company:' + kode, JSON.stringify(bedrift));
  }
  return svar.accessToken;
}

async function ik(sti, token) {
  const r = await fetch(IK + sti, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Infrakit svarte ' + r.status);
  return r.json();
}

const osloFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const osloDate = (ms) => osloFmt.format(new Date(ms)); // -> YYYY-MM-DD

/* ---------- Datauttrekk ---------- */

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
    updated: new Date().toISOString(),
    machines: [...machines.values()].sort((a, b) => a.name.localeCompare(b.name, 'nb')),
  });
}

async function buildHours(token) {
  const veh = await ik('/ajax_vehicles.json', token);
  const vlist = veh.vehicles || [];
  const endMs = Date.now() + 86400000;
  const startMs = endMs - 15 * 86400000;
  const days = [];
  const areaMaps = new Map();

  for (const v of vlist) {
    try {
      const per = new Map();
      const bucket = (dag) => {
        if (!per.has(dag)) per.set(dag, { ms: 0, first: null, last: null, turer: 0, km: 0, mod: new Map(), mat: new Map(), ruter: new Map() });
        return per.get(dag);
      };

      const ev = await ik(`/ajax_calendar_events.json?vehicleId=${v.id}&start=${startMs}&end=${endMs}`, token);
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
        const mev = await ik(`/ajax_calendar_active_model_events.json?vehicleId=${v.id}&start=${startMs}&end=${endMs}`, token);
        for (const m of mev.events || []) {
          const navn = String(m.title || '').trim();
          if (!m.start || !navn) continue;
          const dag = String(m.start).slice(0, 10);
          if (per.has(dag)) per.get(dag).mod.set(navn, true);
        }
      } catch { /* modeller er valgfritt */ }

      if (v.activeProject && v.uuid) {
        const pu = String(v.activeProject.uuid);
        if (!areaMaps.has(pu)) {
          const map = new Map();
          try {
            const ar = await ik('/v1/project/' + pu + '/areas', token);
            for (const a of ar.areas || []) if (a.uuid && a.title) map.set(String(a.uuid), String(a.title).trim());
          } catch { /* omrader er valgfritt */ }
          areaMaps.set(pu, map);
        }
        const amap = areaMaps.get(pu);
        try {
          let page = 1;
          let batch;
          do {
            const tr = await ik(`/v1/project/${pu}/trips?start=${startMs}&end=${endMs}&equipmentUuid=${v.uuid}&page=${page}&pageSize=100`, token);
            batch = tr.trips || [];
            for (const t of batch) {
              if (!t.startMillis) continue;
              const dag = osloDate(Number(t.startMillis));
              if (!per.has(dag)) continue;
              const d = per.get(dag);
              d.turer++;
              if (t.distance) d.km += Number(t.distance) / 1000;
              const mnavn = String(t.material || '').trim();
              if (mnavn) d.mat.set(mnavn, (d.mat.get(mnavn) || 0) + 1);
              const fra = t.startAreaUuid ? amap.get(String(t.startAreaUuid)) : null;
              const til = t.endAreaUuid ? amap.get(String(t.endAreaUuid)) : null;
              if (fra || til) {
                const rute = fra && til ? fra + ARROW + til : fra ? fra + ' (kun lastet)' : '(ukjent)' + ARROW + til;
                d.ruter.set(rute, (d.ruter.get(rute) || 0) + 1);
              }
            }
            page++;
          } while (batch.length === 100 && page <= 10);
        } catch { /* turer er valgfritt */ }
      }

      const projName = v.activeProject ? String(v.activeProject.name) : null;
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
  return JSON.stringify({ updated: new Date().toISOString(), days });
}

async function medCache(kode, type, maxAlderMs, lag) {
  const nokkel = kode + ':' + type;
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
      'Access-Control-Allow-Headers': 'X-Timeapp-Key, Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const sti = new URL(request.url).pathname.replace(/\/+$/, '');
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });
    const kode = (request.headers.get('X-Timeapp-Key') || '').trim().toUpperCase();

    // --- Admin kobler bedriften til ---
    if (sti === '/api/infrakit/connect' && request.method === 'POST') {
      let inn;
      try { inn = await request.json(); } catch { return json({ error: 'Ugyldig forespoersel' }, 400); }
      if (!env.SETUP_KEY || inn.setupKey !== env.SETUP_KEY) {
        return json({ error: 'Feil oppsettkode' }, 401);
      }
      const navn = String(inn.company || '').trim().slice(0, 80);
      if (!navn) return json({ error: 'Mangler bedriftsnavn' }, 400);
      if (!inn.username || !inn.password) return json({ error: 'Mangler brukernavn eller passord' }, 400);
      try {
        const auth = await iamToken({ grant_type: 'password', username: inn.username, password: inn.password });
        if (!auth.refreshToken) return json({ error: 'Infrakit ga ikke fornybart token for denne brukeren' }, 502);
        const pr = await ik('/v1/projects', auth.accessToken);
        const antall = (Array.isArray(pr) ? pr : pr.projects || []).length;
        const nyKode = lagKode();
        await env.TIMEAPP_KV.put('company:' + nyKode, JSON.stringify({
          name: navn,
          refreshToken: await krypter(env, auth.refreshToken),
          createdAt: new Date().toISOString(),
        }));
        return json({ code: nyKode, company: navn, projects: antall });
      } catch (err) {
        if (err.status === 400 || err.status === 401 || err.status === 403) {
          return json({ error: 'Infrakit avviste innloggingen - sjekk brukernavn og passord' }, 401);
        }
        return json({ error: String(err.message || err) }, 502);
      }
    }

    // --- Status (aapen, men viser bedrift naar koden er gyldig) ---
    if (sti === '/api/infrakit/status') {
      const bedrift = await hentBedrift(env, kode).catch(() => null);
      return json({
        connected: Boolean(bedrift),
        company: bedrift ? bedrift.name : null,
        needsKey: !kode,
        proxy: 'cloudflare',
      });
    }

    // --- Data for bedriften bak tilgangskoden ---
    if (sti === '/api/infrakit/machines' || sti === '/api/infrakit/hours') {
      const bedrift = await hentBedrift(env, kode);
      if (!bedrift) return json({ error: 'Ugyldig eller manglende tilgangskode' }, 401);
      try {
        const token = await accessToken(env, kode, bedrift);
        const body = sti.endsWith('machines')
          ? await medCache(kode, 'machines', 10 * 60000, () => buildMachines(token))
          : await medCache(kode, 'hours', 5 * 60000, () => buildHours(token));
        return new Response(body, { headers: cors });
      } catch (err) {
        return json({ error: 'Infrakit-kallet feilet: ' + (err.message || err) }, 502);
      }
    }

    return json({ error: 'ukjent rute' }, 404);
  },
};
