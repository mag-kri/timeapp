// Test av worker.js mot en etterlignet D1-database.
// Kjores i nettleseren pa localhost:8613 (samme opphav som cloud/worker.js).

export async function kjorTest() {
  const src = await fetch('cloud/worker.js?v=' + Date.now()).then((r) => r.text());
  const mod = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));

  // --- Etterlignet D1 ---
  const db = { companies: new Map(), users: new Map(), invites: new Map(), sessions: new Map() };
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  const DB = {
    prepare(sql) {
      const q = norm(sql);
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async first() {
          if (q.startsWith('SELECT * FROM users WHERE email')) return db.users.get(args[0]) || null;
          if (q.startsWith('SELECT * FROM companies WHERE id')) return db.companies.get(args[0]) || null;
          if (q.startsWith('SELECT * FROM invites WHERE code')) {
            const i = db.invites.get(args[0]);
            return i && i.expires_at > args[1] ? i : null;
          }
          if (q.startsWith('SELECT s.token, u.*')) {
            const s = db.sessions.get(args[0]);
            if (!s || s.expires_at <= args[1]) return null;
            const u = db.users.get(s.email);
            return u ? { token: s.token, ...u } : null;
          }
          throw new Error('Ukjent first(): ' + q);
        },
        async all() {
          if (q.startsWith('SELECT email, name, role, created_at, last_login FROM users')) {
            return { results: [...db.users.values()].filter((u) => u.company_id === args[0])
              .map(({ email, name, role, created_at, last_login }) => ({ email, name, role, created_at, last_login }))
              .sort((a, b) => a.name.localeCompare(b.name)) };
          }
          if (q.startsWith('SELECT code, email, name, role FROM invites')) {
            return { results: [...db.invites.values()].filter((i) => i.company_id === args[0] && i.expires_at > args[1])
              .map(({ code, email, name, role }) => ({ code, email, name, role })) };
          }
          throw new Error('Ukjent all(): ' + q);
        },
        async run() {
          if (q.startsWith('INSERT INTO companies')) {
            db.companies.set(args[0], { id: args[0], name: args[1], created_at: args[2], refresh_token: null, connected_by: null });
          } else if (q.startsWith('INSERT INTO users')) {
            db.users.set(args[0], {
              email: args[0], name: args[1], company_id: args[2], role: args[3],
              salt: args[4], verifier: args[5], created_at: args[6], last_login: null,
            });
          } else if (q.startsWith('INSERT INTO sessions')) {
            db.sessions.set(args[0], { token: args[0], email: args[1], expires_at: args[2], created_at: args[3] });
          } else if (q.startsWith('INSERT INTO invites')) {
            db.invites.set(args[0], {
              code: args[0], email: args[1], name: args[2], company_id: args[3],
              role: args[4], expires_at: args[5], created_at: args[6],
            });
          } else if (q.startsWith('UPDATE users SET last_login')) {
            const u = db.users.get(args[1]); if (u) u.last_login = args[0];
          } else if (q.startsWith('UPDATE companies SET refresh_token = ?, connected_by')) {
            const c = db.companies.get(args[3]);
            if (c) { c.refresh_token = args[0]; c.connected_by = args[1]; c.connected_at = args[2]; }
          } else if (q.startsWith('UPDATE companies SET refresh_token = ? WHERE')) {
            const c = db.companies.get(args[1]); if (c) c.refresh_token = args[0];
          } else if (q.startsWith('DELETE FROM invites')) {
            db.invites.delete(args[0]);
          } else if (q.startsWith('DELETE FROM sessions WHERE token')) {
            db.sessions.delete(args[0]);
          } else if (q.startsWith('DELETE FROM sessions WHERE email')) {
            for (const [k, s] of db.sessions) if (s.email === args[0]) db.sessions.delete(k);
          } else if (q.startsWith('DELETE FROM users')) {
            db.users.delete(args[0]);
          } else {
            throw new Error('Ukjent run(): ' + q);
          }
          return { success: true };
        },
      };
      return api;
    },
  };

  const env = {
    DB,
    ENC_KEY: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
    SETUP_KEY: 'oppsett-123',
  };

  // --- Etterlignet Infrakit ---
  const ekte = window.fetch;
  window.fetch = async (u) => {
    const url = String(u);
    if (url.startsWith('https://iam.infrakit.com/auth/token')) {
      const sp = new URL(url).searchParams;
      if (sp.get('grant_type') === 'password' && sp.get('password') !== 'riktig') return new Response('nei', { status: 401 });
      return new Response(JSON.stringify({ accessToken: 'AT', refreshToken: 'RT-hemmelig', expiresIn: 3600 }), { status: 200 });
    }
    if (url.includes('/kuura/v1/projects')) return new Response(JSON.stringify({ projects: [{ uuid: 'p1', name: 'Prosjekt A' }] }), { status: 200 });
    if (url.includes('/equipment/by-project/')) return new Response(JSON.stringify([{ uuid: 'm1', name: 'Volvo FMX', type: 9 }]), { status: 200 });
    return new Response('{}', { status: 200 });
  };

  const kall = async (sti, { method = 'GET', body, token } = {}) => {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await mod.default.fetch(
      new Request('https://p' + sti, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: r.status, data: await r.json().catch(() => null) };
  };

  const res = {};

  // 1) Registrering krever riktig oppsettkode
  res.registrerFeilKode = (await kall('/api/auth/register', {
    method: 'POST', body: { setupKey: 'feil', company: 'X', name: 'A', email: 'a@b.no', salt: 's1', derivedKey: 'dk1' },
  })).status;

  // 2) Koordinator registrerer bedriften
  const reg = await kall('/api/auth/register', {
    method: 'POST',
    body: { setupKey: 'oppsett-123', company: 'Arctic Minerals AS', name: 'Magnus', email: 'Magnus@Test.no', salt: 's1', derivedKey: 'dk1' },
  });
  res.registrer = { status: reg.status, rolle: reg.data?.user?.role, epostSmaa: reg.data?.user?.email, bedrift: reg.data?.company?.name };
  const koordToken = reg.data?.token;

  // 3) Samme e-post to ganger
  res.duplikat = (await kall('/api/auth/register', {
    method: 'POST', body: { setupKey: 'oppsett-123', company: 'Y', name: 'B', email: 'magnus@test.no', salt: 's', derivedKey: 'd' },
  })).status;

  // 4) Innlogging
  res.loggInnFeil = (await kall('/api/auth/login', { method: 'POST', body: { email: 'magnus@test.no', derivedKey: 'feil' } })).status;
  const inn = await kall('/api/auth/login', { method: 'POST', body: { email: 'magnus@test.no', derivedKey: 'dk1' } });
  res.loggInn = { status: inn.status, rolle: inn.data?.user?.role };

  // 5) Salt roeper ikke om brukeren finnes
  const s1 = await kall('/api/auth/salt?email=magnus@test.no');
  const s2 = await kall('/api/auth/salt?email=finnesikke@test.no');
  res.salt = { kjent: s1.data?.salt, ukjentHarSalt: Boolean(s2.data?.salt), likeLange: Boolean(s2.data?.salt) };

  // 6) Uten oekt naas ingenting
  res.utenOekt = {
    me: (await kall('/api/auth/me')).status,
    brukere: (await kall('/api/users')).status,
    maskiner: (await kall('/api/infrakit/machines')).status,
  };

  // 7) Koordinator inviterer ansatt
  const inv = await kall('/api/users/invite', { method: 'POST', token: koordToken, body: { email: 'Sjafor@Test.no', name: 'Ola' } });
  res.invitasjon = { status: inv.status, kodeOK: /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(inv.data?.code || '') };

  // 8) Ansatt loeser inn koden og setter passord
  const acc = await kall('/api/auth/accept', {
    method: 'POST', body: { code: inv.data?.code, name: 'Ola Nordmann', salt: 's2', derivedKey: 'dk2' },
  });
  res.loesInn = { status: acc.status, rolle: acc.data?.user?.role, bedrift: acc.data?.company?.name };
  const ansattToken = acc.data?.token;

  // 9) Koden kan ikke brukes to ganger
  res.kodeBruktOpp = (await kall('/api/auth/accept', {
    method: 'POST', body: { code: inv.data?.code, name: 'Tyv', salt: 's3', derivedKey: 'dk3' },
  })).status;

  // 10) Ansatt kan ikke gjore koordinatorting
  res.ansattForsoker = {
    brukerliste: (await kall('/api/users', { token: ansattToken })).status,
    inviter: (await kall('/api/users/invite', { method: 'POST', token: ansattToken, body: { email: 'x@y.no' } })).status,
    kobleTil: (await kall('/api/infrakit/connect', { method: 'POST', token: ansattToken, body: { username: 'a', password: 'riktig' } })).status,
    fjern: (await kall('/api/users/remove', { method: 'POST', token: ansattToken, body: { email: 'magnus@test.no' } })).status,
  };

  // 11) Maskindata foer tilkobling
  res.foerTilkobling = (await kall('/api/infrakit/machines', { token: ansattToken })).status;

  // 12) Koordinator kobler til Infrakit
  res.kobleFeilPassord = (await kall('/api/infrakit/connect', {
    method: 'POST', token: koordToken, body: { username: 'a@b.no', password: 'galt' },
  })).status;
  const kobl = await kall('/api/infrakit/connect', {
    method: 'POST', token: koordToken, body: { username: 'a@b.no', password: 'riktig' },
  });
  res.kobleTil = { status: kobl.status, prosjekter: kobl.data?.projects };
  res.tokenKryptert = !JSON.stringify([...db.companies.values()]).includes('RT-hemmelig');

  // 13) Naa faar ansatt maskindata
  const mask = await kall('/api/infrakit/machines', { token: ansattToken });
  res.maskinerEtter = { status: mask.status, navn: mask.data?.machines?.map((m) => m.name) };

  // 14) Brukerliste for koordinator
  const liste = await kall('/api/users', { token: koordToken });
  res.brukerliste = { status: liste.status, antall: liste.data?.users?.length, navn: liste.data?.users?.map((u) => u.name) };

  // 15) Bedrift 2 ser ikke bedrift 1 sine data
  const reg2 = await kall('/api/auth/register', {
    method: 'POST', body: { setupKey: 'oppsett-123', company: 'Annen AS', name: 'Kari', email: 'kari@annen.no', salt: 's4', derivedKey: 'dk4' },
  });
  const liste2 = await kall('/api/users', { token: reg2.data?.token });
  res.bedrift2 = { egenBedrift: reg2.data?.company?.name, serAntallBrukere: liste2.data?.users?.length, infrakit: (await kall('/api/infrakit/status', { token: reg2.data?.token })).data?.connected };

  // 16) Fjerne bruker og utlogging
  res.fjernSegSelv = (await kall('/api/users/remove', { method: 'POST', token: koordToken, body: { email: 'magnus@test.no' } })).status;
  res.fjernAnnenBedrift = (await kall('/api/users/remove', { method: 'POST', token: koordToken, body: { email: 'kari@annen.no' } })).status;
  await kall('/api/auth/logout', { method: 'POST', token: ansattToken });
  res.etterUtlogging = (await kall('/api/auth/me', { token: ansattToken })).status;

  window.fetch = ekte;
  return res;
}
