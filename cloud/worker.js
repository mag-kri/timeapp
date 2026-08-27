// Timeapp skyproxy - Cloudflare Worker
// Samme ruter som scripts/serve.ps1: /api/infrakit/{status,machines,hours}
// Hemmeligheter (Settings -> Variables and Secrets, alle tre som "Secret"):
//   INFRAKIT_USER  - Infrakit-brukernavn (e-post)
//   INFRAKIT_PASS  - Infrakit-passord (workeren logger inn og fornyer token selv)
//   APP_KEY        - selvvalgt tilgangskode som appen skal sende (X-Timeapp-Key)
// Merk: kildekoden holdes ren ASCII (\u-escapes for spesialtegn) slik at den
// taaler kopiering mellom verktoey med ulike tegnsett.

const IK = 'https://app.infrakit.com/kuura';
const ALLOWED_ORIGINS = ['https://mag-kri.github.io', 'http://localhost:8613'];

let tokenCache = { key: null, expire: 0 };
let machinesCache = { ts: 0, body: null };
let hoursCache = { ts: 0, body: null };

const SEP = ' \u00B7 ';   // midtprikk
const ARROW = ' \u2192 '; // pil
const BULLET = '\u2022 '; // punktmerke

async function getToken(env) {
  const now = Date.now();
  if (tokenCache.key && tokenCache.expire > now + 60000) return tokenCache.key;
  const form = new URLSearchParams({ username: env.INFRAKIT_USER, password: env.INFRAKIT_PASS });
  const r = await fetch(IK + '/apilogin.json', { method: 'POST', body: form });
  const j = await r.json().catch(() => ({}));
  if (!j.apiKey) throw new Error('Infrakit-innlogging feilet');
  tokenCache = { key: j.apiKey, expire: Number(j.expire) || now + 6 * 86400000 };
  return tokenCache.key;
}

async function ik(path, token) {
  const r = await fetch(IK + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Infrakit svarte ' + r.status);
  return r.json();
}

const osloFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const osloDate = (ms) => osloFmt.format(new Date(ms)); // -> YYYY-MM-DD

async function buildMachines(env) {
  if (machinesCache.body && Date.now() - machinesCache.ts < 10 * 60000) return machinesCache.body;
  const token = await getToken(env);
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
  const body = JSON.stringify({
    updated: new Date().toISOString(),
    machines: [...machines.values()].sort((a, b) => a.name.localeCompare(b.name, 'nb')),
  });
  machinesCache = { ts: Date.now(), body };
  return body;
}

async function buildHours(env) {
  if (hoursCache.body && Date.now() - hoursCache.ts < 5 * 60000) return hoursCache.body;
  const token = await getToken(env);
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

  const body = JSON.stringify({ updated: new Date().toISOString(), days });
  hoursCache = { ts: Date.now(), body };
  return body;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Timeapp-Key',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });

    if (path === '/api/infrakit/status') {
      return json({
        connected: Boolean(env.INFRAKIT_USER && env.INFRAKIT_PASS),
        expire: tokenCache.expire || null,
        proxy: 'cloudflare',
      });
    }

    if (path === '/api/infrakit/machines' || path === '/api/infrakit/hours') {
      if (!env.APP_KEY || request.headers.get('X-Timeapp-Key') !== env.APP_KEY) {
        return json({ error: 'Ugyldig eller manglende tilgangskode' }, 401);
      }
      try {
        const body = path.endsWith('machines') ? await buildMachines(env) : await buildHours(env);
        return new Response(body, { headers: cors });
      } catch (err) {
        return json({ error: 'Infrakit-kallet feilet: ' + err.message }, 502);
      }
    }

    return json({ error: 'ukjent rute' }, 404);
  },
};
