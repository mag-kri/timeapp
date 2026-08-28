// Test av timehentingen over flere prosjekter, mot etterlignet D1 og Infrakit.
export async function kjorTimeTest() {
  const src = await fetch('cloud/worker.js?v=' + Date.now()).then((r) => r.text());
  const mod = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));

  const db = { companies: new Map(), users: new Map(), invites: new Map(), sessions: new Map(), integrations: new Map(), entries: new Map() };
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const DB = {
    prepare(sql) {
      const q = norm(sql);
      let a = [];
      const api = {
        bind(...args) { a = args; return api; },
        async first() {
          if (q.startsWith('SELECT * FROM users WHERE email')) return db.users.get(a[0]) || null;
          if (q.startsWith('SELECT * FROM companies WHERE id')) return db.companies.get(a[0]) || null;
          if (q.startsWith('SELECT s.token, u.*')) {
            const s = db.sessions.get(a[0]);
            if (!s || s.expires_at <= a[1]) return null;
            const u = db.users.get(s.email);
            return u ? { token: s.token, ...u } : null;
          }
          if (q.startsWith('SELECT config FROM integrations') || q.startsWith('SELECT connected_by FROM integrations')) {
            return db.integrations.get(a[0] + ':' + a[1]) || null;
          }
          if (q.startsWith('SELECT u.name FROM entries e2')) {
            const treff = [...db.entries.values()].find((e) => e.company_id === a[0] && e.date === a[1] && e.machine === a[2] && e.email !== a[3]);
            return treff ? { name: (db.users.get(treff.email) || {}).name || 'Ukjent' } : null;
          }
          return null;
        },
        async all() {
          if (q.startsWith('SELECT id, date, project, machine, hours, note, start_at, end_at FROM entries')) {
            return { results: [...db.entries.values()].filter((e) => e.email === a[0]) };
          }
          if (q.startsWith('SELECT e.id, e.email, u.name')) {
            return { results: [...db.entries.values()].filter((e) => e.company_id === a[0]).map((e) => ({ ...e, name: (db.users.get(e.email) || {}).name })) };
          }
          if (q.startsWith('SELECT e.date, e.machine, e.email, u.name')) {
            return { results: [...db.entries.values()].filter((e) => e.company_id === a[0] && e.machine && e.date >= a[1]).map((e) => ({ date: e.date, machine: e.machine, email: e.email, name: (db.users.get(e.email) || {}).name })) };
          }
          return { results: [] };
        },
        async run() {
          if (q.startsWith('INSERT INTO companies')) db.companies.set(a[0], { id: a[0], name: a[1], created_at: a[2], refresh_token: null });
          else if (q.startsWith('INSERT INTO users')) db.users.set(a[0], { email: a[0], name: a[1], company_id: a[2], role: a[3], salt: a[4], verifier: a[5], created_at: a[6] });
          else if (q.startsWith('INSERT INTO sessions')) db.sessions.set(a[0], { token: a[0], email: a[1], expires_at: a[2] });
          else if (q.startsWith('UPDATE companies SET refresh_token = ?, connected_by')) { const c = db.companies.get(a[3]); if (c) c.refresh_token = a[0]; }
          else if (q.startsWith('INSERT INTO integrations')) db.integrations.set(a[0] + ':' + a[1], { config: a[2], connected_by: a[3] });
          else if (q.startsWith('INSERT INTO entries')) {
            const fantes = db.entries.get(a[0]);
            if (!fantes || fantes.email === a[1]) {
              db.entries.set(a[0], { id: a[0], email: a[1], company_id: a[2], date: a[3], project: a[4], machine: a[5], hours: a[6], note: a[7], start_at: a[8], end_at: a[9] });
            }
          }
          else if (q.startsWith('DELETE FROM entries')) {
            const e = db.entries.get(a[0]);
            if (e && e.email === a[1]) db.entries.delete(a[0]);
          }
          return { success: true };
        },
      };
      return api;
    },
  };
  const env = { DB, ENC_KEY: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))), SETUP_KEY: 'k' };

  const kall = [];
  const byttelogg = [];
  let aktivtProsjekt = 1; // brukeren star pa Prosjekt A
  const idag = new Date().toISOString().slice(0, 10);
  const ekte = window.fetch;
  window.fetch = async (u, o) => {
    const url = String(typeof u === 'string' ? u : u.url);
    if (url.startsWith('https://iam.infrakit.com')) {
      return new Response(JSON.stringify({ accessToken: 'AT', refreshToken: 'RT', expiresIn: 3600 }), { status: 200 });
    }
    if (url.startsWith('https://tripletex.no')) {
      if (url.includes('/token/session/:create')) return new Response(JSON.stringify({ value: { token: 'TTOEKT' } }), { status: 200 });
      if (url.includes('whoAmI')) return new Response(JSON.stringify({ value: { employee: { id: 42, firstName: 'Kari', lastName: 'Kontor' } } }), { status: 200 });
      if (url.endsWith('/v2/project') && o && o.method === 'POST') {
        const inn = JSON.parse(o.body);
        if (!inn.name || !inn.projectManager || !inn.projectManager.id) return new Response(JSON.stringify({ message: 'mangler felt' }), { status: 400 });
        return new Response(JSON.stringify({ value: { id: 7, number: '2044', name: inn.name } }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }
    if (!url.includes('infrakit.com/kuura')) return ekte(u, o);
    if (url.endsWith('/v1/project') && o && o.method === 'POST') {
      const inn = JSON.parse(o.body);
      if (!inn.name) return new Response(JSON.stringify({ errorMessage: 'Parameters are invalid.' }), { status: 400 });
      return new Response(JSON.stringify({ status: true, uuid: 'nyttp', id: 99 }), { status: 200 });
    }
    kall.push(url.split('/kuura')[1].split('&start')[0]);
    if (url.includes('/ajax_projects.json')) {
      return new Response(JSON.stringify([
        { id: 1, uuid: 'p1', name: 'Prosjekt A' },
        { id: 2, uuid: 'p2', name: 'Prosjekt B' },
        { id: 3, uuid: 'p3', name: 'Prosjekt C' },
      ]), { status: 200 });
    }
    if (url.includes('ajax_vehicles.json?projectId=1')) return new Response(JSON.stringify({ vehicles: [{ id: 11, uuid: 'm11', name: 'Gravemaskin A', type: 1, worktimeLastWeek: 20 }] }), { status: 200 });
    if (url.includes('ajax_vehicles.json?projectId=2')) return new Response(JSON.stringify({ vehicles: [{ id: 22, uuid: 'm22', name: 'Lastebil B', type: 9, worktimeLastWeek: 30 }] }), { status: 200 });
    if (url.includes('ajax_vehicles.json?projectId=3')) return new Response(JSON.stringify({ vehicles: [{ id: 33, uuid: 'm33', name: 'Sovende maskin', worktimeLastWeek: 0, lastReport: 0, lastActive: 0 }] }), { status: 200 });
    if (url.includes('/ajax_current_project.json')) {
      return new Response(JSON.stringify({ id: aktivtProsjekt, name: 'Aktivt' }), { status: 200 });
    }
    if (url.includes('/ajax_change_project.json')) {
      aktivtProsjekt = Number(new URL(url).searchParams.get('projectId'));
      byttelogg.push(aktivtProsjekt);
      return new Response('{}', { status: 200 });
    }
    if (url.includes('/ajax_calendar_events.json')) {
      // Som i Infrakit: kalenderen svarer kun for maskiner i AKTIVT prosjekt
      const vid = Number(new URL(url).searchParams.get('vehicleId'));
      const hjemme = { 11: 1, 22: 2, 33: 3 }[vid];
      if (hjemme !== aktivtProsjekt) return new Response(JSON.stringify({ events: [] }), { status: 200 });
      // Som i Infrakit: arbeidsoekter uten modell- eller pelinfo i tooltip-en
      return new Response(JSON.stringify({ events: [
        { start: idag + ' 08:00', end: idag + ' 14:00', title: '', tooltip: '<b>Maskin</b> 08:00 - 14:00' },
        { start: idag + ' 14:00', end: idag + ' 16:00', title: '', tooltip: '<b>Maskin</b> 14:00 - 16:00' },
      ] }), { status: 200 });
    }
    if (url.includes('/ajax_calendar_active_model_events')) {
      // Modellnavn i <b>, pelnummer i tooltip; ett event mangler end-felt
      const vid = Number(new URL(url).searchParams.get('vehicleId'));
      if (vid !== 11) return new Response(JSON.stringify({ events: [] }), { status: 200 });
      return new Response(JSON.stringify({ events: [
        { start: idag + ' 08:00', end: idag + ' 14:00', title: '', tooltip: '<b>Traubunn P200</b><br/>08:00 - 14:00<br>Foerste pel.nr.:1200<br>Siste pel.nr.:1450' },
        { start: idag + ' 14:00', title: '', tooltip: '<b>Grusdekke</b><br/>14:00 - 15:00<br>' },
      ] }), { status: 200 });
    }
    if (url.includes('/logpoints')) {
      // Som i Infrakit: as-built-punkter med kode og maskin-attribusjon.
      // 'measured' kommer i praksis som [aar, mnd, dag, t, m, s] i UTC.
      // Ett makulert, ett fra fremmed maskin og ett fra i gaar skal vekk.
      const [aar, mnd, dag] = idag.split('-').map(Number);
      const igaar = new Date(Date.parse(idag) - 86400000).toISOString().slice(0, 10).split('-').map(Number);
      return new Response(JSON.stringify({ status: true, last: true, logpoints: [
        { measured: [aar, mnd, dag, 5, 15, 0], voided: null, meta: { code: 'SOK', instrument: { equipmentUuid: 'm11', type: 'VEHICLE' } } },
        { measured: [aar, mnd, dag, 6, 20, 12], voided: null, meta: { code: 'SOK', instrument: { equipmentUuid: 'm11', type: 'VEHICLE' } } },
        { measured: [aar, mnd, dag, 7, 5, 45], voided: null, meta: { code: 'SOK', instrument: { equipmentUuid: 'm11', type: 'VEHICLE' } } },
        { measured: idag + 'T10:00:00+00:00', voided: null, meta: { code: 'V-KUM', instrument: { equipmentUuid: 'm11', type: 'VEHICLE' } } },
        { measured: [aar, mnd, dag, 8, 30, 0], voided: null, meta: { code: '', instrument: { equipmentUuid: 'm11', type: 'VEHICLE' } } },
        { measured: [aar, mnd, dag, 9, 0, 0], voided: [2026, 1, 1, 0, 0, 0], meta: { code: 'SOK', instrument: { equipmentUuid: 'm11', type: 'VEHICLE' } } },
        { measured: [aar, mnd, dag, 9, 30, 0], voided: null, meta: { code: 'ANNEN', instrument: { equipmentUuid: 'm99', type: 'ROVER_GPS' } } },
        { measured: [igaar[0], igaar[1], igaar[2], 10, 0, 0], voided: null, meta: { code: 'SOK', instrument: { equipmentUuid: 'm11', type: 'VEHICLE' } } },
      ] }), { status: 200 });
    }
    if (url.includes('/areas')) return new Response(JSON.stringify({ areas: [{ uuid: 'a1', title: 'Brudd' }, { uuid: 'a2', title: 'Deponi' }] }), { status: 200 });
    if (url.includes('/trips')) {
      return new Response(JSON.stringify({ trips: [
        { equipmentUuid: 'm22', startMillis: Date.parse(idag + 'T09:00'), distance: 12000, material: 'Pukk', startAreaUuid: 'a1', endAreaUuid: 'a2' },
        { equipmentUuid: 'm22', startMillis: Date.parse(idag + 'T11:00'), distance: 11000, material: 'Pukk', startAreaUuid: 'a1', endAreaUuid: 'a2' },
      ] }), { status: 200 });
    }
    if (url.includes('/v1/projects')) return new Response(JSON.stringify({ projects: [{ uuid: 'p1', name: 'Prosjekt A' }, { uuid: 'p2', name: 'Prosjekt B' }] }), { status: 200 });
    if (url.includes('/equipment/by-project/')) return new Response(JSON.stringify([{ uuid: 'm11', name: 'Gravemaskin A', type: 1 }]), { status: 200 });
    return new Response('{}', { status: 200 });
  };

  const kallApi = async (sti, { method = 'GET', body, token } = {}) => {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await mod.default.fetch(new Request('https://p' + sti, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: r.status, data: await r.json().catch(() => null) };
  };

  const reg = await kallApi('/api/auth/register', { method: 'POST', body: { setupKey: 'k', company: 'Test', name: 'A', email: 'a@b.no', salt: 's', derivedKey: 'd' } });
  const token = reg.data.token;
  await kallApi('/api/infrakit/connect', { method: 'POST', token, body: { username: 'u', password: 'p' } });
  kall.length = 0;
  const timer = await kallApi('/api/infrakit/hours', { token });
  const maskiner = await kallApi('/api/infrakit/machines', { token });
  // Per prosjekt: skal gi kun det prosjektets maskiner, med faa kall
  kall.length = 0;
  const prosjekter = await kallApi('/api/infrakit/projects', { token });
  const kunP2 = await kallApi('/api/infrakit/hours?projectId=2', { token });
  const kallPerProsjekt = kall.length;

  // Timefoeringer i skyen: lagre, oppdatere, hente, slette - og eierskapsvern
  await kallApi('/api/timer', { method: 'POST', token, body: { entries: [
    { id: 'e1', date: idag, project: 'Prosjekt A', machine: 'Gravemaskin A', hours: 8.2, note: 'dagsrapport', start: idag + 'T07:00:00', end: idag + 'T15:30:00' },
    { id: 'e2', date: idag, project: 'Prosjekt A', hours: 2, note: '' },
  ] } });
  await kallApi('/api/timer', { method: 'POST', token, body: { entries: [{ id: 'e2', date: idag, project: 'Prosjekt A', hours: 3.5, note: 'endret' }] } });
  db.entries.set('fremmed', { id: 'fremmed', email: 'x@y.no', company_id: 'ANNEN', date: idag, hours: 1 });
  await kallApi('/api/timer', { method: 'POST', token, body: { entries: [{ id: 'fremmed', date: idag, hours: 9 }] } });
  // Maskinvern: en kollega har alt foert timer paa Sovende maskin i dag
  const cid = [...db.companies.keys()][0];
  db.users.set('kollega@b.no', { email: 'kollega@b.no', name: 'Kari Kollega', company_id: cid, role: 'employee', salt: 's', verifier: 'v' });
  db.entries.set('k1', { id: 'k1', email: 'kollega@b.no', company_id: cid, date: idag, machine: 'Sovende maskin', hours: 6 });
  const kollisjon = await kallApi('/api/timer', { method: 'POST', token, body: { entries: [{ id: 'e3', date: idag, machine: 'Sovende maskin', hours: 4 }] } });
  const maskinbruk = await kallApi('/api/timer/maskinbruk', { token });

  const mineTimer = await kallApi('/api/timer', { token });
  const alleTimer = await kallApi('/api/timer?alle=1', { token });
  await kallApi('/api/timer/slett', { method: 'POST', token, body: { id: 'e1' } });
  await kallApi('/api/timer/slett', { method: 'POST', token, body: { id: 'fremmed' } });
  const etterSlett = await kallApi('/api/timer', { token });

  // Integrasjoner: koble Tripletex, sjekk status, opprett prosjekt i tre systemer
  const integFoer = await kallApi('/api/integrasjoner', { token });
  const kobleTT = await kallApi('/api/integrasjoner/tripletex', { method: 'POST', token, body: { consumerToken: 'ct', employeeToken: 'et' } });
  const integEtter = await kallApi('/api/integrasjoner', { token });
  const opprett = await kallApi('/api/prosjekt/opprett', { method: 'POST', token, body: { name: 'Testfelt 42', systems: ['infrakit', 'tripletex', 'xsite'] } });

  window.fetch = ekte;
  const dager = timer.data?.days || [];
  return {
    antallKall: kall.length,
    underGrensen: kall.length < 50,
    maskinerMedTimer: dager.map((d) => d.machine + ' (' + d.project + ') ' + d.hours + 't'),
    sovendeUtelatt: !dager.some((d) => d.machine.includes('Sovende')),
    notatLastebil: dager.find((d) => d.machine === 'Lastebil B')?.note,
    notatGraver: dager.find((d) => d.machine === 'Gravemaskin A')?.note,
    punkterRett: (() => {
      const n = dager.find((d) => d.machine === 'Gravemaskin A')?.note || '';
      return n.includes('5 punkter') && n.includes('SOK') && n.includes('3 stk') && n.includes('V-KUM') && n.includes('(uten kode)') && !n.includes('ANNEN');
    })(),
    strukturertRett: (() => {
      const g = dager.find((d) => d.machine === 'Gravemaskin A') || {};
      return g.points === 5 && g.codes && g.codes.SOK === 3 && Array.isArray(g.models)
        && g.models.some((m) => m.name === 'Traubunn P200' && m.from === '08:00' && m.hours === 6)
        && g.noModelHours === 1;
    })(),
    okterRett: (() => {
      const g = dager.find((d) => d.machine === 'Gravemaskin A') || {};
      return JSON.stringify(g.sessions) === JSON.stringify([{ from: '08:00', to: '16:00' }]);
    })(),
    modellerRett: (() => {
      const n = dager.find((d) => d.machine === 'Gravemaskin A')?.note || '';
      return n.includes('pel 1200-1450') && n.includes('08:00 Traubunn P200 · 6 t')
        && n.includes('14:00 Grusdekke · 1 t') && n.includes('Uten modell · 1 t');
    })(),
    lastebilUtenModellstoy: (() => {
      const n = dager.find((d) => d.machine === 'Lastebil B')?.note || '';
      return !n.includes('Modeller') && !n.includes('Uten modell');
    })(),
    modellkallKunGraver: !kall.some((k) => k.includes('active_model_events') && k.includes('vehicleId=22')),
    prosjekterIMaskinliste: maskiner.data?.projects,
    prosjektrute: prosjekter.data?.projects,
    kallPerProsjekt,
    kunProsjekt2: (kunP2.data?.days || []).map((d) => d.machine + ' (' + d.project + ')'),
    prosjektbytter: byttelogg,
    aktivtProsjektTilSlutt: aktivtProsjekt,
    satteTilbake: aktivtProsjekt === 1,
    skyTimer: {
      mine: (mineTimer.data?.entries || []).map((e) => e.id + ' ' + e.hours + 't ' + (e.machine || '-') + ' ' + (e.note || '-')),
      alleHarNavn: (alleTimer.data?.entries || []).every((e) => e.name),
      fremmedUrort: db.entries.get('fremmed')?.hours === 1,
      etterSlett: (etterSlett.data?.entries || []).map((e) => e.id),
    },
    maskinvern: {
      avvistMedNavn: (kollisjon.data?.avvist || []).some((x) => x.id === 'e3' && x.feil.includes('Kari Kollega')),
      ikkeLagret: !db.entries.has('e3'),
      egenGikkGjennom: db.entries.has('e2'),
      brukListe: (maskinbruk.data?.bruk || []).map((b) => b.machine + ':' + b.name),
    },
    integrasjonerFoer: integFoer.data,
    tripletexKobling: kobleTT.data,
    integrasjonerEtter: integEtter.data,
    opprettelse: opprett.data && opprett.data.resultat,
  };
}
