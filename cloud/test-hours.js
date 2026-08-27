// Test av timehentingen over flere prosjekter, mot etterlignet D1 og Infrakit.
export async function kjorTimeTest() {
  const src = await fetch('cloud/worker.js?v=' + Date.now()).then((r) => r.text());
  const mod = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));

  const db = { companies: new Map(), users: new Map(), invites: new Map(), sessions: new Map() };
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
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          if (q.startsWith('INSERT INTO companies')) db.companies.set(a[0], { id: a[0], name: a[1], created_at: a[2], refresh_token: null });
          else if (q.startsWith('INSERT INTO users')) db.users.set(a[0], { email: a[0], name: a[1], company_id: a[2], role: a[3], salt: a[4], verifier: a[5], created_at: a[6] });
          else if (q.startsWith('INSERT INTO sessions')) db.sessions.set(a[0], { token: a[0], email: a[1], expires_at: a[2] });
          else if (q.startsWith('UPDATE companies SET refresh_token = ?, connected_by')) { const c = db.companies.get(a[3]); if (c) c.refresh_token = a[0]; }
          return { success: true };
        },
      };
      return api;
    },
  };
  const env = { DB, ENC_KEY: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))), SETUP_KEY: 'k' };

  const kall = [];
  const idag = new Date().toISOString().slice(0, 10);
  const ekte = window.fetch;
  window.fetch = async (u, o) => {
    const url = String(typeof u === 'string' ? u : u.url);
    if (url.startsWith('https://iam.infrakit.com')) {
      return new Response(JSON.stringify({ accessToken: 'AT', refreshToken: 'RT', expiresIn: 3600 }), { status: 200 });
    }
    if (!url.includes('infrakit.com/kuura')) return ekte(u, o);
    kall.push(url.split('/kuura')[1].split('&start')[0]);
    if (url.includes('/ajax_projects.json')) {
      return new Response(JSON.stringify([
        { id: 1, uuid: 'p1', name: 'Prosjekt A' },
        { id: 2, uuid: 'p2', name: 'Prosjekt B' },
        { id: 3, uuid: 'p3', name: 'Prosjekt C' },
      ]), { status: 200 });
    }
    if (url.includes('ajax_vehicles.json?projectId=1')) return new Response(JSON.stringify({ vehicles: [{ id: 11, uuid: 'm11', name: 'Gravemaskin A', worktimeLastWeek: 20 }] }), { status: 200 });
    if (url.includes('ajax_vehicles.json?projectId=2')) return new Response(JSON.stringify({ vehicles: [{ id: 22, uuid: 'm22', name: 'Lastebil B', worktimeLastWeek: 30 }] }), { status: 200 });
    if (url.includes('ajax_vehicles.json?projectId=3')) return new Response(JSON.stringify({ vehicles: [{ id: 33, uuid: 'm33', name: 'Sovende maskin', worktimeLastWeek: 0, lastReport: 0, lastActive: 0 }] }), { status: 200 });
    if (url.includes('/ajax_calendar_events.json')) return new Response(JSON.stringify({ events: [{ start: idag + ' 08:00', end: idag + ' 16:00' }] }), { status: 200 });
    if (url.includes('/ajax_calendar_active_model_events')) return new Response(JSON.stringify({ events: [{ start: idag + ' 09:00', title: 'Traubunn P200' }] }), { status: 200 });
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

  window.fetch = ekte;
  const dager = timer.data?.days || [];
  return {
    antallKall: kall.length,
    underGrensen: kall.length < 50,
    maskinerMedTimer: dager.map((d) => d.machine + ' (' + d.project + ') ' + d.hours + 't'),
    sovendeUtelatt: !dager.some((d) => d.machine.includes('Sovende')),
    notatLastebil: dager.find((d) => d.machine === 'Lastebil B')?.note,
    notatGraver: dager.find((d) => d.machine === 'Gravemaskin A')?.note,
    prosjekterIMaskinliste: maskiner.data?.projects,
  };
}
