// Ende-til-ende-test: appen (js/app.js) mot workeren med etterlignet database.
// Kjores i nettleseren pa localhost:8613 fra Timeapp-siden.

export async function kjorAppTest() {
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
          if (q.startsWith('SELECT * FROM invites WHERE code')) {
            const i = db.invites.get(a[0]);
            return i && i.expires_at > a[1] ? i : null;
          }
          if (q.startsWith('SELECT s.token, u.*')) {
            const s = db.sessions.get(a[0]);
            if (!s || s.expires_at <= a[1]) return null;
            const u = db.users.get(s.email);
            return u ? { token: s.token, ...u } : null;
          }
          if (q.includes('FROM integrations')) return null;
          throw new Error('Ukjent first: ' + q);
        },
        async all() {
          if (q.includes('FROM users WHERE company_id')) {
            return { results: [...db.users.values()].filter((u) => u.company_id === a[0]) };
          }
          if (q.includes('FROM invites WHERE company_id')) {
            return { results: [...db.invites.values()].filter((i) => i.company_id === a[0] && i.expires_at > a[1]) };
          }
          if (q.includes('FROM entries')) return { results: [] };
          throw new Error('Ukjent all: ' + q);
        },
        async run() {
          if (q.startsWith('INSERT INTO companies')) db.companies.set(a[0], { id: a[0], name: a[1], created_at: a[2], refresh_token: null, connected_by: null });
          else if (q.startsWith('INSERT INTO users')) db.users.set(a[0], { email: a[0], name: a[1], company_id: a[2], role: a[3], salt: a[4], verifier: a[5], created_at: a[6], last_login: null });
          else if (q.startsWith('INSERT INTO sessions')) db.sessions.set(a[0], { token: a[0], email: a[1], expires_at: a[2], created_at: a[3] });
          else if (q.startsWith('INSERT INTO invites')) db.invites.set(a[0], { code: a[0], email: a[1], name: a[2], company_id: a[3], role: a[4], expires_at: a[5], created_at: a[6] });
          else if (q.startsWith('UPDATE users SET last_login')) { const u = db.users.get(a[1]); if (u) u.last_login = a[0]; }
          else if (q.startsWith('UPDATE companies SET refresh_token = ?, connected_by')) { const c = db.companies.get(a[3]); if (c) { c.refresh_token = a[0]; c.connected_by = a[1]; } }
          else if (q.startsWith('UPDATE companies SET refresh_token = ? WHERE')) { const c = db.companies.get(a[1]); if (c) c.refresh_token = a[0]; }
          else if (q.startsWith('DELETE FROM invites')) db.invites.delete(a[0]);
          else if (q.startsWith('DELETE FROM sessions WHERE token')) db.sessions.delete(a[0]);
          else if (q.startsWith('DELETE FROM sessions WHERE email')) { for (const [k, s] of db.sessions) if (s.email === a[0]) db.sessions.delete(k); }
          else if (q.startsWith('DELETE FROM users')) db.users.delete(a[0]);
          else if (q.startsWith('INSERT INTO entries') || q.startsWith('DELETE FROM entries') || q.startsWith('INSERT INTO integrations')) { /* dekkes av test-hours */ }
          else throw new Error('Ukjent run: ' + q);
          return { success: true };
        },
      };
      return api;
    },
  };

  const env = {
    DB,
    ENC_KEY: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
    SETUP_KEY: 'test-oppsett',
  };

  const ekte = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    const url = typeof u === 'string' ? u : u.url;
    if (url.startsWith('https://timeapp-proxy.')) {
      return mod.default.fetch(new Request(url, o), env);
    }
    if (url.startsWith('https://iam.infrakit.com/auth/token')) {
      const sp = new URL(url).searchParams;
      if (sp.get('grant_type') === 'password' && sp.get('password') !== 'riktig') return new Response('nei', { status: 401 });
      return new Response(JSON.stringify({ accessToken: 'AT', refreshToken: 'RT', expiresIn: 3600 }), { status: 200 });
    }
    if (url.includes('/kuura/v1/projects')) return new Response(JSON.stringify({ projects: [{ uuid: 'p1', name: 'Prosjekt A' }] }), { status: 200 });
    if (url.includes('/equipment/by-project/')) return new Response(JSON.stringify([{ uuid: 'm1', name: 'Volvo FMX', type: 9 }]), { status: 200 });
    if (url.includes('/ajax_vehicles.json')) return new Response(JSON.stringify({ vehicles: [] }), { status: 200 });
    return ekte(u, o);
  };

  const vent = (ms) => new Promise((r) => setTimeout(r, ms));
  const ventPa = async (fn, maks = 12000) => {
    const slutt = Date.now() + maks;
    while (Date.now() < slutt) {
      if (fn()) return true;
      await vent(150);
    }
    return false;
  };
  const skriv = (felt, verdi) => { felt.value = verdi; felt.dispatchEvent(new Event('input', { bubbles: true })); };

  const res = {};
  localStorage.removeItem('timeapp:auth');
  localStorage.removeItem('timeapp:machines:v1');
  location.hash = '';

  // Tving appen til innloggingsskjermen
  window.dispatchEvent(new Event('storage'));
  document.dispatchEvent(new Event('visibilitychange'));
  await vent(300);

  // Sikre at vi starter fra innloggingsskjermen, uansett hvilken modus appen sto i
  const gaTilModus = async (modus) => {
    if (!document.querySelector('[data-action="login-mode"]')) return false;
    const tilbake = document.querySelector('[data-action="login-mode"][data-mode="login"]');
    if (tilbake) tilbake.click();
    await vent(100);
    const knapp = document.querySelector(`[data-action="login-mode"][data-mode="${modus}"]`);
    if (knapp) knapp.click();
    await vent(100);
    return true;
  };

  // --- 1. Registrer bedrift som koordinator ---
  await gaTilModus('register');
  const rf = document.getElementById('registerForm');
  skriv(rf.company, 'Test Anlegg AS');
  skriv(rf.setupKey, 'test-oppsett');
  skriv(rf.name, 'Kari Koordinator');
  skriv(rf.email, 'kari@test.no');
  skriv(rf.password, 'passord123');
  skriv(rf.password2, 'passord123');
  rf.requestSubmit();
  res.registrertOK = await ventPa(() => document.querySelector('.tabbar'));
  res.etterRegistrering = { harFaner: !!document.querySelector('.tabbar'), lagretRolle: JSON.parse(localStorage.getItem('timeapp:auth') || '{}')?.user?.role };

  // --- 2. Mer-fanen viser konto, Infrakit og ansatte ---
  document.querySelector('[data-tab="more"]').click();
  await ventPa(() => document.body.textContent.includes('Ansatte'));
  res.merFane = [...document.querySelectorAll('.card h2')].map((h) => h.textContent);
  res.visesSomKoordinator = document.body.textContent.includes('Koordinator');

  // --- 3. Koble til Infrakit ---
  document.querySelector('[data-action="admin-connect"]').click();
  const cf = document.getElementById('connectForm');
  skriv(cf.username, 'drift@test.no');
  skriv(cf.password, 'riktig');
  const gammelAlert = window.alert;
  let alertTekst = '';
  window.alert = (t) => { alertTekst = String(t); };
  cf.requestSubmit();
  await ventPa(() => alertTekst.includes('Koblet til'));
  res.infrakitTilkobling = alertTekst;
  window.alert = gammelAlert;

  // --- 4. Legg til ansatt ---
  await vent(400);
  document.querySelector('[data-action="invite-user"]').click();
  const iu = document.getElementById('inviteUserForm');
  skriv(iu.name, 'Ola Sjaafoer');
  skriv(iu.email, 'ola@test.no');
  iu.requestSubmit();
  await ventPa(() => document.querySelector('.kode'));
  const engangskode = document.querySelector('.kode')?.textContent.trim();
  res.engangskode = { vist: Boolean(engangskode), format: /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(engangskode || '') };
  document.querySelector('[data-action="close-modal"]').click();

  // --- 5. Logg ut ---
  await vent(300);
  document.querySelector('[data-tab="more"]').click();
  document.querySelector('[data-action="logout"]').click();
  res.loggetUt = await ventPa(() => document.getElementById('loginForm'));

  // --- 6. Ansatt loeser inn engangskoden ---
  await gaTilModus('invite');
  const inv = document.getElementById('inviteForm');
  skriv(inv.code, engangskode);
  skriv(inv.name, 'Ola Sjaafoer');
  skriv(inv.password, 'ansatt1234');
  skriv(inv.password2, 'ansatt1234');
  inv.requestSubmit();
  res.ansattInne = await ventPa(() => document.querySelector('.tabbar'));
  document.querySelector('[data-tab="more"]').click();
  await vent(600);
  res.ansattSerIkkeAnsattliste = !document.body.textContent.includes('Legg til ansatt');
  res.ansattRolle = JSON.parse(localStorage.getItem('timeapp:auth') || '{}')?.user?.role;

  // --- 7. Logg ut og inn igjen som koordinator ---
  document.querySelector('[data-action="logout"]').click();
  await ventPa(() => document.getElementById('loginForm'));
  const lf = document.getElementById('loginForm');
  skriv(lf.email, 'kari@test.no');
  skriv(lf.password, 'feilpassord');
  lf.requestSubmit();
  res.feilPassordVises = await ventPa(() => document.querySelector('.form-error'));
  const lf2 = document.getElementById('loginForm');
  skriv(lf2.email, 'kari@test.no');
  skriv(lf2.password, 'passord123');
  lf2.requestSubmit();
  res.innIgjen = await ventPa(() => document.querySelector('.tabbar'));

  window.fetch = ekte;
  localStorage.removeItem('timeapp:auth');
  return res;
}
