import * as store from './store.js?v=18';
import { state, PALETTE, NO_PROJECT_COLOR } from './store.js?v=18';
import * as d from './dates.js?v=18';

const app = document.getElementById('app');
const modal = document.getElementById('modal');

const ui = {
  tab: 'day',
  date: d.todayISO(),
  weekStart: d.mondayOf(d.todayISO()),
  clockProject: '',
};

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => darkQuery.matches;
const projectColor = (p) => (isDark() ? PALETTE[p.color].dark : PALETTE[p.color].light);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const icons = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.25"/><path d="M12 7.5V12l3 2"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 19v-8M12 19V5M19 19v-5"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/></svg>',
};

/* ---------- Render ---------- */

function render() {
  if (!auth()) {
    app.innerHTML = `<main class="page">${renderLogin()}</main>`;
    return;
  }
  if (ui.tab === 'dash' && !erKoordinator()) ui.tab = 'day';
  const pages = { clock: renderClock, day: renderDay, week: renderWeek, dash: renderDashboard, more: renderMore };
  app.innerHTML = `<main class="page">${pages[ui.tab]()}</main>${renderTabBar()}`;
  syncTimer();
}

/* ---------- Innloggingsskjerm ---------- */

function renderLogin() {
  const modus = ui.loginModus || 'login';
  const feil = ui.loginFeil ? `<p class="form-error" style="margin:0 0 10px">${esc(ui.loginFeil)}</p>` : '';
  const jobber = ui.loginJobber;

  if (modus === 'invite') {
    return `
      <header class="page-head center"><h1>Ny bruker</h1><p class="muted">Skriv inn engangskoden du fikk av koordinatoren.</p></header>
      <form class="card" id="inviteForm">
        ${feil}
        <label class="field-label" for="ivCode" style="margin-top:0">Engangskode</label>
        <input class="input" id="ivCode" name="code" placeholder="XXXX-XXXX" autocomplete="off" spellcheck="false" style="text-transform:uppercase">
        <label class="field-label" for="ivName">Ditt navn</label>
        <input class="input" id="ivName" name="name" autocomplete="name">
        <label class="field-label" for="ivPass">Velg passord</label>
        <input class="input" id="ivPass" name="password" type="password" autocomplete="new-password">
        <label class="field-label" for="ivPass2">Gjenta passord</label>
        <input class="input" id="ivPass2" name="password2" type="password" autocomplete="new-password">
        <button class="btn primary big" type="submit" style="margin-top:16px"${jobber ? ' disabled' : ''}>${jobber ? 'Oppretter …' : 'Opprett bruker'}</button>
        <button class="btn ghost" type="button" data-action="login-mode" data-mode="login" style="width:100%;margin-top:8px">Tilbake til innlogging</button>
      </form>`;
  }

  if (modus === 'register') {
    return `
      <header class="page-head center"><h1>Registrer bedrift</h1><p class="muted">Kun for koordinator. Krever oppsettkoden.</p></header>
      <form class="card" id="registerForm">
        ${feil}
        <label class="field-label" for="rgCompany" style="margin-top:0">Bedriftsnavn</label>
        <input class="input" id="rgCompany" name="company" autocomplete="organization">
        <label class="field-label" for="rgSetup">Oppsettkode</label>
        <input class="input" id="rgSetup" name="setupKey" type="password" autocomplete="off">
        <label class="field-label" for="rgName">Ditt navn</label>
        <input class="input" id="rgName" name="name" autocomplete="name">
        <label class="field-label" for="rgEmail">E-post</label>
        <input class="input" id="rgEmail" name="email" type="email" autocomplete="email" spellcheck="false">
        <label class="field-label" for="rgPass">Velg passord</label>
        <input class="input" id="rgPass" name="password" type="password" autocomplete="new-password">
        <label class="field-label" for="rgPass2">Gjenta passord</label>
        <input class="input" id="rgPass2" name="password2" type="password" autocomplete="new-password">
        <button class="btn primary big" type="submit" style="margin-top:16px"${jobber ? ' disabled' : ''}>${jobber ? 'Registrerer …' : 'Registrer bedrift'}</button>
        <button class="btn ghost" type="button" data-action="login-mode" data-mode="login" style="width:100%;margin-top:8px">Tilbake til innlogging</button>
      </form>`;
  }

  return `
    <header class="page-head center" style="margin-top:24px">
      <h1>Timeapp</h1>
      <p class="muted">Logg inn for å føre timer</p>
    </header>
    <form class="card" id="loginForm">
      ${feil}
      <label class="field-label" for="lgEmail" style="margin-top:0">E-post</label>
      <input class="input" id="lgEmail" name="email" type="email" autocomplete="username" spellcheck="false">
      <label class="field-label" for="lgPass">Passord</label>
      <input class="input" id="lgPass" name="password" type="password" autocomplete="current-password">
      <button class="btn primary big" type="submit" style="margin-top:16px"${jobber ? ' disabled' : ''}>${jobber ? 'Logger inn …' : 'Logg inn'}</button>
    </form>
    <div class="center">
      <button class="btn ghost small" data-action="login-mode" data-mode="invite">Jeg har fått en engangskode</button>
    </div>
    <div class="center">
      <button class="btn ghost small muted" data-action="login-mode" data-mode="register">Registrer en ny bedrift</button>
    </div>`;
}

async function loginFlyt(fn) {
  ui.loginFeil = '';
  ui.loginJobber = true;
  render();
  try {
    const data = await fn();
    lagreAuth({ token: data.token, user: data.user, company: data.company });
    ui.loginJobber = false;
    ui.loginModus = 'login';
    ui.tab = 'day';
    render();
    synkFraSky();
  } catch (err) {
    ui.loginJobber = false;
    ui.loginFeil = String(err.message || err);
    render();
  }
}

function sjekkPassord(p1, p2) {
  if (!p1 || p1.length < 8) throw new Error('Passordet må ha minst 8 tegn.');
  if (p1 !== p2) throw new Error('Passordene er ikke like.');
}

function renderTabBar() {
  const tabs = [
    ['day', 'Timer', icons.list],
    ['clock', 'Stemple', icons.clock],
    ['week', 'Uke', icons.week],
    ...(erKoordinator() ? [['dash', 'Oversikt', icons.dash]] : []),
    ['more', 'Mer', icons.more],
  ];
  return `<nav class="tabbar" aria-label="Hovedmeny">${tabs.map(([id, label, icon]) => `
    <button class="tab${ui.tab === id ? ' active' : ''}" data-action="tab" data-tab="${id}"${ui.tab === id ? ' aria-current="page"' : ''}>
      <span class="tab-icon">${icon}${id === 'clock' && state.active ? '<span class="tab-dot"></span>' : ''}</span>
      <span>${label}</span>
    </button>`).join('')}</nav>`;
}

function projectSelect(attrs, selected) {
  return `<select class="select" ${attrs}>
    <option value="">Uten prosjekt</option>
    ${state.projects.map((p) => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
  </select>`;
}

function entryList(entries) {
  return `<ul class="entries">${entries.map((e) => {
    const p = e.projectId ? store.projectById(e.projectId) : null;
    const color = p ? projectColor(p) : NO_PROJECT_COLOR;
    const title = e.machine ? esc(e.machine) : (p ? esc(p.name) : 'Uten prosjekt');
    let meta;
    if (e.machine) {
      const parts = [];
      if (e.start && e.end) parts.push(`${d.fmtTime(e.start)}–${d.fmtTime(e.end)}`);
      if (e.task) parts.push(esc(e.task));
      if (p) parts.push(esc(p.name));
      meta = parts.length ? parts.join(' · ') : (e.id.startsWith('ik-') ? 'Fra Infrakit' : 'Ført manuelt');
    } else {
      const parts = [];
      if (e.start && e.end) parts.push(`${d.fmtTime(e.start)}–${d.fmtTime(e.end)}`);
      if (e.task) parts.push(esc(e.task));
      meta = parts.length ? parts.join(' · ') : 'Ført manuelt';
    }
    return `<li>
      <button class="entry" data-action="edit-entry" data-id="${e.id}" aria-label="Endre timeføring">
        <span class="dot" style="background:${color}"></span>
        <span class="entry-main">
          <span class="entry-title">${title}</span>
          <span class="entry-sub muted">${meta}${e.note ? ' · ' + esc(e.note) : ''}</span>
        </span>
        <span class="entry-hours">${d.fmtHours(e.hours)} t</span>
      </button>
    </li>`;
  }).join('')}</ul>`;
}

/* --- Oversikt (kun koordinator) --- */

// Alle bedriftens føringer fra skyen, bufret i ett minutt
async function hentAlleTimer() {
  if (!erKoordinator()) return;
  if (ui.henterAlle) return;
  if (ui.alleTimer && Date.now() - ui.alleTimer.ts < 60000) return;
  ui.henterAlle = true;
  try {
    const data = await api('api/timer?alle=1');
    ui.alleTimer = { ts: Date.now(), entries: data.entries || [] };
  } catch {
    if (!ui.alleTimer) ui.alleTimer = { ts: 0, entries: [] };
  } finally {
    ui.henterAlle = false;
    if (ui.tab === 'dash') render();
  }
}

// Maskindagen (ik-oppføring) som hører til en ansatts føring
const ikFor = (maskin, dato) =>
  state.entries.find((e) => e.id.startsWith('ik-') && e.date === dato && e.machine === maskin);

function dashGrunnlag() {
  if (!ui.dashUke) ui.dashUke = d.mondayOf(d.todayISO());
  const monday = ui.dashUke;
  const dagSet = new Set(Array.from({ length: 7 }, (_, i) => d.addDays(monday, i)));
  const alle = ((ui.alleTimer && ui.alleTimer.entries) || []).filter((e) => e && dagSet.has(e.date));
  const ikDager = state.entries.filter((e) => e.id.startsWith('ik-') && dagSet.has(e.date));
  return { monday, alle, ikDager };
}

const ikProsjektNavn = (e) => {
  const p = e.projectId ? store.projectById(e.projectId) : null;
  return p ? p.name : 'Uten prosjekt';
};

function renderDashboard() {
  hentAlleTimer();
  const { monday, alle, ikDager } = dashGrunnlag();
  const { week } = d.isoWeek(monday);
  const nav = `
    <header class="page-head"><h1>Oversikt</h1></header>
    <div class="datenav">
      <button class="iconbtn" data-action="dash-prev" aria-label="Forrige uke">‹</button>
      <div class="datelabel-static"><span>Uke ${week}</span><span class="muted">${d.weekRangeLabel(monday)}</span></div>
      <button class="iconbtn" data-action="dash-next" aria-label="Neste uke">›</button>
    </div>
    ${monday === d.mondayOf(d.todayISO()) ? '' : '<div class="center"><button class="btn ghost small" data-action="dash-current">Gå til denne uka</button></div>'}`;

  if (ui.dashProsjekt) return nav + renderDashProsjekt(alle, ikDager);

  if (!ui.alleTimer) return nav + '<section class="card"><p class="empty">Henter bedriftens timer …</p></section>';

  // Per ansatt: timer, punkter og hva de kjørte
  const ansatte = new Map();
  for (const e of alle) {
    const k = e.email || e.name || '?';
    if (!ansatte.has(k)) ansatte.set(k, { navn: e.name || e.email || '?', timer: 0, punkter: 0, maskiner: new Set(), modeller: new Set() });
    const a = ansatte.get(k);
    a.timer += Number(e.hours) || 0;
    if (e.machine) {
      a.maskiner.add(e.machine);
      const ik = ikFor(e.machine, e.date);
      if (ik) {
        a.punkter += ik.points || 0;
        for (const m of ik.models || []) a.modeller.add(m.name);
      }
    }
  }
  const ansattRader = [...ansatte.values()].sort((a, b) => b.timer - a.timer).map((a) => `
    <li><span class="legend-name">${esc(a.navn)}
      <span class="muted small" style="display:block">${[
        a.maskiner.size ? [...a.maskiner].map(esc).join(', ') : 'kun arbeidstimer',
        a.punkter ? a.punkter + ' punkter' : '',
        a.modeller.size ? a.modeller.size + ' modeller' : '',
      ].filter(Boolean).join(' · ')}</span></span>
    <span class="legend-hours">${d.fmtHours(a.timer)} t</span></li>`).join('');

  // Per prosjekt: folk, timer, maskintimer og punkter
  const prosjekter = new Map();
  const pros = (navn) => {
    const k = navn || 'Uten prosjekt';
    if (!prosjekter.has(k)) prosjekter.set(k, { navn: k, timer: 0, folk: new Set(), maskinTimer: 0, punkter: 0 });
    return prosjekter.get(k);
  };
  for (const e of alle) {
    const p = pros(e.project);
    p.timer += Number(e.hours) || 0;
    p.folk.add(e.name || e.email);
  }
  for (const ik of ikDager) {
    const p = pros(ikProsjektNavn(ik));
    p.maskinTimer += ik.hours;
    p.punkter += ik.points || 0;
  }
  const prosjektRader = [...prosjekter.values()]
    .sort((a, b) => (b.timer + b.maskinTimer) - (a.timer + a.maskinTimer))
    .map((p) => `
      <li><button class="entry" data-action="dash-project" data-navn="${esc(p.navn)}">
        <span class="entry-main">
          <span class="entry-title">${esc(p.navn)}</span>
          <span class="entry-sub muted">${[
            p.folk.size ? p.folk.size + (p.folk.size === 1 ? ' ansatt' : ' ansatte') : '',
            p.maskinTimer ? d.fmtHours(p.maskinTimer) + ' maskintimer' : '',
            p.punkter ? p.punkter + ' punkter' : '',
          ].filter(Boolean).join(' · ') || 'kun maskindata'}</span>
        </span>
        <span class="entry-hours">${p.timer ? d.fmtHours(p.timer) + ' t' : '–'}</span>
      </button></li>`).join('');

  return `${nav}
    <section class="card">
      <h2>Ansatte</h2>
      ${ansatte.size ? `<ul class="legend">${ansattRader}</ul>` : '<p class="empty">Ingen føringer denne uka.</p>'}
      <div class="day-total"><span>Sum arbeidstimer</span><strong>${d.fmtHours([...ansatte.values()].reduce((s, a) => s + a.timer, 0))} t</strong></div>
    </section>
    <section class="card">
      <h2>Prosjekter</h2>
      ${prosjekter.size ? `<ul class="entries">${prosjektRader}</ul>` : '<p class="empty">Ingenting registrert denne uka.</p>'}
      <p class="muted small" style="margin:10px 0 0">Trykk på et prosjekt for maskiner, modeller og punktkoder. Maskindata finnes for de siste ~14 dagene.</p>
    </section>`;
}

function renderDashProsjekt(alle, ikDager) {
  const navn = ui.dashProsjekt;
  const mine = alle.filter((e) => (e.project || 'Uten prosjekt') === navn);
  const ik = ikDager.filter((e) => ikProsjektNavn(e) === navn);

  // Hvem førte timer her
  const folk = new Map();
  for (const e of mine) {
    const k = e.email || e.name || '?';
    if (!folk.has(k)) folk.set(k, { navn: e.name || e.email || '?', timer: 0, maskiner: new Set() });
    const f = folk.get(k);
    f.timer += Number(e.hours) || 0;
    if (e.machine) f.maskiner.add(e.machine);
  }

  // Maskinene på prosjektet denne uka
  const maskiner = new Map();
  for (const e of ik) {
    if (!maskiner.has(e.machine)) maskiner.set(e.machine, { timer: 0, punkter: 0 });
    const m = maskiner.get(e.machine);
    m.timer += e.hours;
    m.punkter += e.points || 0;
  }

  // Modeller: hvem kjørte på hvilken flate, og hvor lenge
  const foererFor = (maskin, dato) => alle
    .filter((a) => a.machine === maskin && a.date === dato)
    .map((a) => a.name || a.email);
  const modeller = new Map();
  let utenModell = 0;
  const utenModellHvem = new Set();
  for (const e of ik) {
    for (const m of e.models || []) {
      if (!modeller.has(m.name)) modeller.set(m.name, { timer: 0, hvem: new Set() });
      const mo = modeller.get(m.name);
      mo.timer += Number(m.hours) || 0;
      for (const navn2 of foererFor(e.machine, e.date)) mo.hvem.add(navn2);
    }
    if (e.noModelHours) {
      utenModell += e.noModelHours;
      for (const navn2 of foererFor(e.machine, e.date)) utenModellHvem.add(navn2);
    }
  }

  // Punktkoder samlet for prosjektet
  const koder = new Map();
  for (const e of ik) {
    for (const [kode, n] of Object.entries(e.codes || {})) koder.set(kode, (koder.get(kode) || 0) + n);
  }

  const hvemTekst = (sett) => (sett.size ? [...sett].map(esc).join(', ') : 'ingen har ført timer på maskinen');

  return `
    <div class="center" style="margin-bottom:10px"><button class="btn ghost small" data-action="dash-back">‹ Alle prosjekter</button></div>
    <section class="card">
      <h2>${esc(navn)}</h2>
      ${folk.size ? `<ul class="legend">${[...folk.values()].sort((a, b) => b.timer - a.timer).map((f) => `
        <li><span class="legend-name">${esc(f.navn)}${f.maskiner.size ? `<span class="muted small" style="display:block">${[...f.maskiner].map(esc).join(', ')}</span>` : ''}</span>
        <span class="legend-hours">${d.fmtHours(f.timer)} t</span></li>`).join('')}</ul>`
    : '<p class="empty">Ingen ansatte har ført timer her denne uka.</p>'}
    </section>
    ${maskiner.size ? `
    <section class="card">
      <h2>Maskiner</h2>
      <ul class="legend">${[...maskiner].sort((a, b) => b[1].timer - a[1].timer).map(([mn, m]) => `
        <li><span class="legend-name">${esc(mn)}${m.punkter ? `<span class="muted small" style="display:block">${m.punkter} punkter</span>` : ''}</span>
        <span class="legend-hours">${d.fmtHours(m.timer)} t</span></li>`).join('')}</ul>
    </section>` : ''}
    ${modeller.size || utenModell ? `
    <section class="card">
      <h2>Modeller</h2>
      <ul class="legend">${[...modeller].sort((a, b) => b[1].timer - a[1].timer).map(([mn, m]) => `
        <li><span class="legend-name">${esc(mn)}<span class="muted small" style="display:block">${hvemTekst(m.hvem)}</span></span>
        <span class="legend-hours">${d.fmtHours(m.timer)} t</span></li>`).join('')}
      ${utenModell ? `<li><span class="legend-name">Uten modell<span class="muted small" style="display:block">${hvemTekst(utenModellHvem)}</span></span><span class="legend-hours">${d.fmtHours(utenModell)} t</span></li>` : ''}</ul>
    </section>` : ''}
    ${koder.size ? `
    <section class="card">
      <h2>Punktkoder</h2>
      <ul class="legend">${[...koder].sort((a, b) => b[1] - a[1]).map(([kode, n]) => `
        <li><span class="legend-name">${esc(kode)}</span><span class="legend-hours">${n} stk</span></li>`).join('')}</ul>
      <div class="day-total"><span>Sum punkter</span><strong>${[...koder.values()].reduce((s, n) => s + n, 0)} stk</strong></div>
    </section>` : ''}`;
}

/* --- Stemple --- */

function renderClock() {
  const today = d.todayISO();
  const a = state.active;
  let card;
  if (a) {
    const p = a.projectId ? store.projectById(a.projectId) : null;
    const startDay = d.isoDate(new Date(a.start));
    const dayPrefix = startDay === today ? '' : `${d.dayMonth(startDay)} `;
    card = `
      <section class="card clock-card">
        <div class="running-badge"><span class="pulse"></span>Stemplet inn ${dayPrefix}kl. ${d.fmtTime(a.start)}</div>
        <div class="live" id="liveTimer">00:00:00</div>
        ${p
          ? `<span class="chip"><span class="dot" style="background:${projectColor(p)}"></span>${esc(p.name)}</span>`
          : '<span class="muted small">Uten prosjekt</span>'}
        <button class="btn danger big" data-action="clock-out">Stemple ut</button>
        <button class="btn ghost small" data-action="cancel-active">Forkast stemplingen</button>
      </section>`;
  } else {
    card = `
      <section class="card clock-card">
        <label class="field-label" for="clockProject" style="margin-top:0;text-align:left">Prosjekt</label>
        ${projectSelect('id="clockProject"', ui.clockProject)}
        <button class="btn primary big" data-action="clock-in">Stemple inn</button>
      </section>`;
  }
  const entries = store.entriesOn(today);
  return `
    <header class="page-head"><h1>Stempling</h1><p class="muted">${cap(d.dateLabel(today))}</p></header>
    ${card}
    <div class="tiles">
      <div class="tile"><div class="tile-label">I dag</div><div class="tile-value">${d.fmtHours(store.totalOn(today))} <span class="unit">t</span></div></div>
      <div class="tile"><div class="tile-label">Denne uka</div><div class="tile-value">${d.fmtHours(store.weekTotal(d.mondayOf(today)))} <span class="unit">t</span></div></div>
    </div>
    <section class="card">
      <h2>Ført i dag</h2>
      ${entries.length ? entryList(entries) : '<p class="empty">Ingen timer ført ennå i dag.</p>'}
    </section>`;
}

/* --- Timer (dagvisning) --- */

function renderDay() {
  const entries = store.entriesOn(ui.date);
  const machineEntries = store.machineEntriesOn(ui.date);
  const total = entries.reduce((sum, e) => sum + e.hours, 0);
  const isToday = ui.date === d.todayISO();
  return `
    <header class="page-head"><h1>Timer</h1></header>
    <div class="datenav">
      <button class="iconbtn" data-action="day-prev" aria-label="Forrige dag">‹</button>
      <button class="datelabel" data-action="pick-date" aria-label="Velg dato">
        <span>${isToday ? 'I dag' : cap(d.weekdayShort(ui.date))} · ${d.dayMonth(ui.date)}</span>
        <input type="date" id="datePicker" value="${ui.date}" tabindex="-1" aria-hidden="true">
      </button>
      <button class="iconbtn" data-action="day-next" aria-label="Neste dag">›</button>
    </div>
    ${isToday ? '' : '<div class="center"><button class="btn ghost small" data-action="day-today">Gå til i dag</button></div>'}
    <section class="card">
      ${entries.length ? entryList(entries) : `<p class="empty">Ingen timer ført ${isToday ? 'i dag' : 'denne dagen'}.</p>`}
      <div class="day-total"><span>Sum</span><strong>${d.fmtHours(total)} t</strong></div>
    </section>
    <button class="btn primary big" data-action="new-entry">+ Ny timeføring</button>
    ${machineEntries.length ? `
    <section class="card">
      <h2>Maskintimer</h2>
      ${entryList(machineEntries)}
      <div class="day-total"><span>Sum maskiner</span><strong>${d.fmtHours(machineEntries.reduce((s, e) => s + e.hours, 0))} t</strong></div>
    </section>` : ''}`;
}

/* --- Uke --- */

function renderWeek() {
  const monday = ui.weekStart;
  const today = d.todayISO();
  const { week } = d.isoWeek(monday);
  const isCurrentWeek = monday === d.mondayOf(today);

  const days = [];
  for (let i = 0; i < 7; i++) days.push(d.addDays(monday, i));

  const groups = [...state.projects, null]; // null = uten prosjekt
  const perDay = days.map((date) => {
    const entries = store.entriesOn(date);
    const segments = groups
      .map((p) => ({
        project: p,
        hours: entries.filter((e) => e.projectId === (p ? p.id : null)).reduce((s, e) => s + e.hours, 0),
      }))
      .filter((s) => s.hours > 0);
    return { date, segments, total: segments.reduce((s, x) => s + x.hours, 0) };
  });

  const weekSum = perDay.reduce((s, x) => s + x.total, 0);
  const maxTotal = Math.max(9, ...perDay.map((x) => x.total));
  const machines = store.machinesForWeek(monday);

  const rows = perDay.map((day, i) => `
    <button class="week-row${day.date === today ? ' today' : ''}${i >= 5 ? ' weekend' : ''}" data-action="open-day" data-date="${day.date}" aria-label="Åpne ${d.dateLabel(day.date)}">
      <span class="wr-day">${cap(d.weekdayShort(day.date))}<span class="wr-date muted">${d.dayMonth(day.date)}</span></span>
      <span class="wr-bar">${day.segments.map((s) => `<span class="seg" style="width:${(s.hours / maxTotal) * 100}%;background:${s.project ? projectColor(s.project) : NO_PROJECT_COLOR}"></span>`).join('')}</span>
      <span class="wr-hours">${day.total ? d.fmtHours(day.total) : '–'}</span>
    </button>`).join('');

  const projTotals = groups
    .map((p) => ({
      name: p ? p.name : 'Uten prosjekt',
      color: p ? projectColor(p) : NO_PROJECT_COLOR,
      hours: perDay.reduce((s, day) => s + (day.segments.find((x) => x.project === p)?.hours || 0), 0),
    }))
    .filter((t) => t.hours > 0);

  return `
    <header class="page-head"><h1>Uke</h1></header>
    <div class="datenav">
      <button class="iconbtn" data-action="week-prev" aria-label="Forrige uke">‹</button>
      <div class="datelabel-static"><span>Uke ${week}</span><span class="muted">${d.weekRangeLabel(monday)}</span></div>
      <button class="iconbtn" data-action="week-next" aria-label="Neste uke">›</button>
    </div>
    ${isCurrentWeek ? '' : '<div class="center"><button class="btn ghost small" data-action="week-current">Gå til denne uka</button></div>'}
    <section class="card"><div class="week">${rows}</div></section>
    <section class="card">
      <h2>Arbeidstimer</h2>
      ${projTotals.length
        ? `<ul class="legend">${projTotals.map((t) => `<li><span class="dot" style="background:${t.color}"></span><span class="legend-name">${esc(t.name)}</span><span class="legend-hours">${d.fmtHours(t.hours)} t</span></li>`).join('')}</ul>`
        : '<p class="empty">Ingen timer ført denne uka.</p>'}
      <div class="day-total"><span>Sum uke ${week}</span><strong>${d.fmtHours(weekSum)} t</strong></div>
    </section>
    ${machines.length ? `
    <section class="card">
      <h2>Maskintimer</h2>
      <ul class="legend">${machines.map((m) => `<li><span class="legend-name">${esc(m.machine)}</span><span class="legend-hours">${d.fmtHours(m.hours)} t</span></li>`).join('')}</ul>
      <div class="day-total"><span>Sum maskiner</span><strong>${d.fmtHours(machines.reduce((s, m) => s + m.hours, 0))} t</strong></div>
    </section>` : ''}`;
}

/* --- Mer --- */

const erKoordinator = () => (auth()?.user?.role === 'coordinator');

function renderKonto() {
  const a = auth();
  if (!a) return '';
  return `
    <section class="card">
      <h2>Konto</h2>
      <div class="entry" style="cursor:default">
        <span class="entry-main">
          <span class="entry-title">${esc(a.user.name)}</span>
          <span class="entry-sub muted">${esc(a.user.email)} · ${a.user.role === 'coordinator' ? 'Koordinator' : 'Ansatt'}${a.company ? ' · ' + esc(a.company.name) : ''}</span>
        </span>
      </div>
      <button class="btn ghost" data-action="logout" style="width:100%;margin-top:8px">Logg ut</button>
    </section>`;
}

function renderInfrakitKort() {
  const tilkoblet = ui.infrakit && ui.infrakit.connected;
  return `
    <section class="card">
      <h2>Infrakit</h2>
      <p class="small" style="margin:0 0 10px">${
        tilkoblet
          ? `<strong style="color:var(--good)">✓ Tilkoblet</strong> – maskiner, timer og dagsrapport hentes automatisk${ui.infrakit.connectedBy ? ' (koblet til av ' + esc(ui.infrakit.connectedBy) + ')' : ''}.`
          : erKoordinator()
            ? 'Bedriften er ikke koblet til Infrakit ennå. Logg inn med bedriftens Infrakit-bruker for å hente maskiner og timer.'
            : 'Bedriften er ikke koblet til Infrakit ennå. Koordinatoren din må gjøre det.'
      }</p>
      ${erKoordinator() ? `<button class="btn${tilkoblet ? '' : ' primary'}" data-action="admin-connect" style="width:100%">${tilkoblet ? 'Koble til på nytt …' : 'Koble til Infrakit …'}</button>` : ''}
      <button class="btn" data-action="sync-machines" style="width:100%;margin-top:8px"${ui.synkStatus ? ' disabled' : ''}>${ui.synkStatus ? 'Henter …' : 'Oppdater maskiner og timer'}</button>
      ${ui.synkStatus ? `<p class="muted small center" style="margin:8px 0 0">${esc(ui.synkStatus)}</p>` : ''}
      <details style="margin-top:12px">
        <summary class="small muted" style="cursor:pointer">Avansert: serveradresse</summary>
        <input class="input" id="proxyUrl" value="${esc(proxyConf().url || DEFAULT_PROXY)}" autocomplete="off" inputmode="url" style="margin-top:10px">
        <button class="btn small" data-action="save-proxy" style="width:100%;margin-top:8px">Lagre adresse</button>
      </details>
    </section>`;
}

function renderBrukere() {
  const d = ui.brukere;
  return `
    <section class="card">
      <h2>Ansatte</h2>
      ${!d ? '<p class="empty">Henter …</p>' : `
        ${d.users.length ? `<ul class="entries">${d.users.map((u) => `
          <li><div class="entry" style="cursor:default">
            <span class="entry-main">
              <span class="entry-title">${esc(u.name)}</span>
              <span class="entry-sub muted">${esc(u.email)} · ${u.role === 'coordinator' ? 'Koordinator' : 'Ansatt'}${u.last_login ? '' : ' · aldri logget inn'}</span>
            </span>
            ${u.email === auth().user.email ? '<span class="entry-edit">Deg</span>'
              : `<button class="btn ghost small danger-text" data-action="remove-user" data-email="${esc(u.email)}">Fjern</button>`}
          </div></li>`).join('')}</ul>` : '<p class="empty">Ingen ansatte lagt til ennå.</p>'}
        ${d.pending.length ? `
          <h2 style="margin-top:16px">Venter på å bli tatt i bruk</h2>
          <ul class="entries">${d.pending.map((p) => `
            <li><div class="entry" style="cursor:default">
              <span class="entry-main">
                <span class="entry-title">${esc(p.name || p.email)}</span>
                <span class="entry-sub muted">${esc(p.email)}</span>
              </span>
              <span class="entry-hours">${esc(p.code)}</span>
            </div></li>`).join('')}</ul>` : ''}
      `}
      <button class="btn primary" data-action="invite-user" style="width:100%;margin-top:10px">+ Legg til ansatt</button>
    </section>`;
}

function renderMore() {
  return `
    <header class="page-head"><h1>Mer</h1></header>
    <section class="card">
      <h2>Prosjekter</h2>
      ${state.projects.length
        ? `<ul class="entries">${state.projects.map((p) => `
            <li><button class="entry" data-action="edit-project" data-id="${p.id}">
              <span class="dot" style="background:${projectColor(p)}"></span>
              <span class="entry-main"><span class="entry-title">${esc(p.name)}</span></span>
              <span class="entry-edit">Endre</span>
            </button></li>`).join('')}</ul>`
        : '<p class="empty">Ingen prosjekter ennå. Med prosjekter ser du enkelt hva timene gikk til.</p>'}
      <button class="btn" data-action="new-project" style="width:100%;margin-top:8px">+ Nytt prosjekt</button>
    </section>
    ${renderKonto()}
    ${renderInfrakitKort()}
    ${renderIntegrasjonerKort()}
    ${erKoordinator() ? renderBrukere() : ''}
    <section class="card">
      <h2>Data</h2>
      <p class="muted small" style="margin:0 0 12px">Timeføringene dine synkes til bedriftens database. Prosjektfarger og maskindata ligger lokalt på enheten – ta gjerne en sikkerhetskopi i tillegg.</p>
      <div class="btnrow" style="margin:0">
        <button class="btn" data-action="export" style="flex:1">Eksporter</button>
        <button class="btn" data-action="import" style="flex:1">Importer</button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <button class="btn ghost danger-text" data-action="reset" style="width:100%;margin-top:8px">Slett alle data …</button>
    </section>
    <section class="card">
      <h2>Installer som app</h2>
      <p class="small" style="margin:0 0 8px"><strong>iPhone:</strong> Åpne siden i Safari → trykk Del-knappen → «Legg til på Hjem-skjerm».</p>
      <p class="small" style="margin:0 0 8px"><strong>Android:</strong> Åpne siden i Chrome → meny (⋮) → «Legg til på startsiden» / «Installer app».</p>
      <p class="muted small" style="margin:0">Timeapp v${APP_VERSJON} · fungerer offline</p>
    </section>`;
}

/* ---------- Modaler ---------- */

function openEntryModal(entry, date, forslag) {
  const isEdit = !!entry;
  const f = forslag || {};
  const values = entry || { date, projectId: f.projectId || '', hours: f.hours || '', note: '' };
  const oppgave = (entry && entry.task) || f.task || '';
  const valgtMaskin = (entry && entry.machine) || f.machine || '';
  modal.innerHTML = `
    <form id="entryForm" data-date="${values.date}"${isEdit ? ` data-edit-id="${entry.id}"` : ''} novalidate>
      <h2>${isEdit ? 'Endre timeføring' : 'Ny timeføring'}</h2>
      <p class="muted small" style="margin:0">${cap(d.dateLabel(values.date))}${oppgave ? ` · ${esc(oppgave)}` : ''}${entry && entry.machine && entry.id.startsWith('ik-') ? ` · ${esc(entry.machine)} · hentet fra Infrakit` : ''}</p>
      <input type="hidden" name="task" value="${esc(oppgave)}">
      <label class="field-label" for="efProject">Prosjekt</label>
      ${projectSelect('id="efProject" name="projectId"', values.projectId || '')}
      ${entry && entry.machine && entry.id.startsWith('ik-') ? '' : `
      <label class="field-label" for="efMachine">Maskin <span class="muted">(valgfritt – timene føres på deg uansett)</span></label>
      <select class="select" id="efMachine" name="machine">${machineOptions(
        values.projectId && store.projectById(values.projectId) ? store.projectById(values.projectId).name : null,
        valgtMaskin,
        values.date
      )}</select>
      <p class="muted small" id="machineHint" style="margin:6px 0 0" hidden></p>
      <div id="maskinOkter" hidden></div>`}
      <div class="timerow">
        <div>
          <label class="field-label" for="efStart">Start <span class="muted">(valgfritt)</span></label>
          <input class="input" type="time" id="efStart" name="timeStart" value="${entry && entry.start ? d.fmtTime(entry.start) : f.start || ''}">
        </div>
        <div>
          <label class="field-label" for="efEnd">Slutt</label>
          <input class="input" type="time" id="efEnd" name="timeEnd" value="${entry && entry.end ? d.fmtTime(entry.end) : f.end || ''}">
        </div>
      </div>
      <label class="field-label" for="efHours">Timer</label>
      <div class="stepper">
        <button type="button" class="iconbtn" data-action="hours-minus" aria-label="Trekk fra en halv time">−</button>
        <input class="input" id="efHours" name="hours" inputmode="decimal" autocomplete="off" placeholder="0" value="${values.hours ? d.fmtHours(values.hours) : ''}">
        <button type="button" class="iconbtn" data-action="hours-plus" aria-label="Legg til en halv time">+</button>
      </div>
      <label class="field-label" for="efNote">Notat <span class="muted">(valgfritt)</span></label>
      <textarea class="input" id="efNote" name="note" rows="5" maxlength="900" placeholder="Hva jobbet du med?">${entry ? esc(entry.note) : ''}</textarea>
      <p class="form-error" id="formError" hidden></p>
      <div class="btnrow">
        ${isEdit ? `<button type="button" class="btn ghost danger-text" data-action="delete-entry" data-id="${entry.id}">Slett</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-action="close-modal">Avbryt</button>
        <button type="submit" class="btn primary">Lagre</button>
      </div>
    </form>`;
  modal.showModal();
  autosizeNote();
  fetchMaskinbruk();
  // Kommer vi fra veiviseren med maskin valgt, hentes notat og tidslinje straks
  if (!isEdit && valgtMaskin) {
    refreshMachineSelect();
  }
}

/* --- Veiviser for ny timeføring: prosjekt -> oppgave -> maskin -> start -> slutt --- */

function startVeiviser(date) {
  ui.vv = { date, steg: 1, projectId: null, oppgave: null, machine: null, start: null };
  fetchMaskinbruk();
  renderVeiviser();
}

function vvUndertekst(vv) {
  const deler = [cap(d.dateLabel(vv.date))];
  if (vv.steg > 1) deler.push(vv.projectId ? (store.projectById(vv.projectId)?.name || '?') : 'Uten prosjekt');
  if (vv.oppgave && (vv.steg > 2 || vv.machine)) deler.push(vv.oppgave);
  if (vv.machine) deler.push(vv.machine);
  if (vv.steg > 3 && vv.start) deler.push('fra ' + vv.start);
  return deler.join(' · ');
}

// Tidsforslag med kontekst: hendelsene fra maskinens dag når maskin er
// valgt (hva som skjedde på hvert klokkeslett), ellers vanlige tider
function vvTider(vv, forSlutt) {
  const standard = () => (forSlutt
    ? ['14:00', '14:30', '15:00', '15:30', '16:00', '17:00', '19:00']
    : ['06:00', '06:30', '07:00', '07:30', '08:00']);
  const kart = new Map();
  if (vv.machine) {
    const ik = infrakitEntryFor(vv.date, vv.machine);
    if (ik) {
      for (const s of ik.sessions || []) {
        if (s.from) kart.set(s.from, 'maskinen startet');
        if (s.to) kart.set(s.to, 'maskinen stoppet');
      }
      for (const m of ik.models || []) {
        if (!m.from) continue;
        const tekst = `${m.name}${m.hours ? ' · ' + d.fmtHours(m.hours) + ' t' : ''}`;
        kart.set(m.from, kart.has(m.from) ? `${kart.get(m.from)} · ${tekst}` : tekst);
      }
    }
  }
  const fraMaskin = kart.size > 0;
  if (!fraMaskin) for (const t of standard()) kart.set(t, '');
  let liste = [...kart.entries()].map(([tid, tekst]) => ({ tid, tekst }))
    .sort((a, b) => a.tid.localeCompare(b.tid));
  if (forSlutt && vv.start) {
    liste = liste.filter((x) => x.tid > vv.start);
    // Om maskindagen ikke har noe etter starten, tilby vanlige tider i stedet
    if (!liste.length) {
      liste = standard().filter((t) => t > vv.start).map((tid) => ({ tid, tekst: '' }));
    }
  }
  return liste;
}

function renderVeiviser() {
  const vv = ui.vv;
  if (!vv) return;
  let inner = '';

  if (vv.steg === 1) {
    inner = `<span class="field-label">Hvilket prosjekt jobbet du på?</span>
      <div class="vvalg">
        ${state.projects.map((p) => `<button type="button" class="btn" data-action="vv-prosjekt" data-id="${p.id}"><span class="dot" style="background:${projectColor(p)}"></span>${esc(p.name)}</button>`).join('')}
        <button type="button" class="btn ghost" data-action="vv-prosjekt" data-id="">Uten prosjekt</button>
      </div>`;
  } else if (vv.steg === 2 && vv.oppgave !== 'Maskinfører') {
    inner = `<span class="field-label">Hva var oppgaven din?</span>
      <div class="vvalg">
        <button type="button" class="btn" data-action="vv-oppgave" data-oppgave="Maskinfører">Maskinfører</button>
        <button type="button" class="btn" data-action="vv-oppgave" data-oppgave="Hjelpemann">Hjelpemann</button>
        <button type="button" class="btn" data-action="vv-oppgave" data-oppgave="Annet">Annet arbeid</button>
      </div>`;
  } else if (vv.steg === 2) {
    const pnavn = vv.projectId ? (store.projectById(vv.projectId)?.name || null) : null;
    const maskiner = store.machinesForProject(pnavn);
    inner = `<span class="field-label">Hvilken maskin kjørte du?</span>
      <div class="vvalg">
        ${maskiner.map((m) => {
          const hvem = maskinOpptattAv(m, vv.date);
          if (hvem) return `<button type="button" class="btn" disabled>${esc(m)} – opptatt (${esc(hvem)})</button>`;
          const minEgen = state.entries.some((e) => !e.id.startsWith('ik-') && e.machine === m && e.date === vv.date);
          return `<button type="button" class="btn" data-action="vv-maskin" data-navn="${esc(m)}">${esc(m)}${minEgen ? ' – ført av deg' : ''}</button>`;
        }).join('') || '<p class="empty">Fant ingen maskiner på prosjektet. Prøv «Oppdater maskiner og timer» under Mer.</p>'}
      </div>`;
  } else {
    const forSlutt = vv.steg === 4;
    const tider = vvTider(vv, forSlutt);
    const medTekst = tider.some((x) => x.tekst);
    inner = `<span class="field-label">${forSlutt ? 'Når ga du deg?' : 'Når begynte du?'}</span>
      ${medTekst
    ? `<p class="muted small" style="margin:0">Hendelsene er hentet fra maskinens dag i Infrakit.</p>
      <div class="tidslinje">${tider.map((x) => `<button type="button" data-action="vv-tid" data-tid="${x.tid}"><strong>${x.tid}</strong>${esc(x.tekst)}</button>`).join('')}</div>`
    : `<div class="okter">${tider.map((x) => `<button type="button" class="btn ghost small" data-action="vv-tid" data-tid="${x.tid}">${x.tid}</button>`).join('')}</div>`}
      <label class="field-label" for="vvTid">Eller velg klokkeslett selv</label>
      <div class="btnrow" style="margin:0">
        <input class="input" type="time" id="vvTid" style="flex:1">
        <button type="button" class="btn" data-action="vv-tid-manuell">Bruk</button>
      </div>`;
  }

  modal.innerHTML = `
    <h2>Ny timeføring</h2>
    <p class="muted small" style="margin:0">${esc(vvUndertekst(vv))}</p>
    ${inner}
    <div class="btnrow">
      ${vv.steg > 1 || vv.oppgave ? '<button type="button" class="btn ghost" data-action="vv-tilbake">‹ Tilbake</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-action="close-modal">Avbryt</button>
    </div>`;
  if (!modal.open) modal.showModal();
}

function vvSettTid(tid) {
  const vv = ui.vv;
  if (!vv || !/^\d{2}:\d{2}$/.test(tid || '')) return;
  if (vv.steg === 3) {
    vv.start = tid;
    vv.steg = 4;
    renderVeiviser();
    return;
  }
  if (tid <= vv.start) return;
  // Ferdig: åpne det vanlige skjemaet med alt utfylt for en siste sjekk
  const ms = new Date(`2000-01-01T${tid}:00`) - new Date(`2000-01-01T${vv.start}:00`);
  const timer = Math.round((ms / 3600000) * 100) / 100;
  const forslag = {
    projectId: vv.projectId || '',
    task: vv.oppgave || '',
    machine: vv.machine || '',
    start: vv.start,
    end: tid,
    hours: timer,
  };
  const dato = vv.date;
  ui.vv = null;
  openEntryModal(null, dato, forslag);
}

// Systemene et nytt prosjekt kan opprettes i samtidig. Kun koordinatorer,
// og kun systemer bedriften faktisk er koblet til, kan hukes av.
const EKSTERNE_SYSTEMER = [
  { id: 'infrakit', navn: 'Infrakit' },
  { id: 'tripletex', navn: 'Tripletex' },
  { id: 'xsite', navn: 'Xsite MANAGE', hvorfor: 'kommer – krever API-tilgang fra Novatron' },
  { id: 'trimble', navn: 'Trimble Connect', hvorfor: 'kommer – krever API-app hos Trimble' },
  { id: 'makin', navn: 'Makin’', hvorfor: 'følger Infrakit-prosjektet automatisk' },
];

function sysValg() {
  const i = ui.integrasjoner || {};
  return `
    <span class="field-label">Opprett også i</span>
    ${EKSTERNE_SYSTEMER.map((s) => {
      const pa = !s.hvorfor && !!i[s.id];
      const hint = s.hvorfor || 'ikke koblet til – se Mer';
      return `<label class="sysrad${pa ? '' : ' av'}">
        <input type="checkbox" name="sys" value="${s.id}"${pa ? '' : ' disabled'}>
        <span>${s.navn}${pa ? '' : ` <small class="muted">– ${hint}</small>`}</span>
      </label>`;
    }).join('')}`;
}

function openProjectModal(project) {
  const isEdit = !!project;
  const slot = isEdit ? project.color : store.nextFreeSlot();
  modal.innerHTML = `
    <form id="projectForm"${isEdit ? ` data-edit-id="${project.id}"` : ''} novalidate>
      <h2>${isEdit ? 'Endre prosjekt' : 'Nytt prosjekt'}</h2>
      <label class="field-label" for="pfName">Navn</label>
      <input class="input" id="pfName" name="name" value="${isEdit ? esc(project.name) : ''}" maxlength="60" placeholder="F.eks. Kunde A" autocomplete="off">
      <span class="field-label">Farge</span>
      <div class="swatches" role="radiogroup" aria-label="Farge">
        ${PALETTE.map((c, i) => `<label class="swatch"><input type="radio" name="color" value="${i}"${i === slot ? ' checked' : ''} aria-label="${c.name}"><span style="background:${isDark() ? c.dark : c.light}"></span></label>`).join('')}
      </div>
      ${!isEdit && erKoordinator() ? sysValg() : ''}
      <p class="form-error" id="formError" hidden></p>
      <div class="btnrow">
        ${isEdit ? `<button type="button" class="btn ghost danger-text" data-action="delete-project" data-id="${project.id}">Slett</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-action="close-modal">Avbryt</button>
        <button type="submit" class="btn primary">Lagre</button>
      </div>
    </form>`;
  modal.showModal();
}

// Lar notatboksen vokse med innholdet (opp til et tak).
function autosizeNote() {
  const t = document.getElementById('efNote');
  if (!t) return;
  t.style.height = 'auto';
  t.style.height = Math.min(440, t.scrollHeight + 2) + 'px';
}

// Slår opp synkede Infrakit-timer for maskin + dato og fyller skjemaet automatisk.
function infrakitEntryFor(date, machine) {
  return state.entries.find((e) => e.machine === machine && e.date === date && e.id.startsWith('ik-')) || null;
}

// Hvem i bedriften som har ført timer på hvilken maskin (siste 30 dager),
// slik at velgeren kan gråe ut maskiner som alt er tatt den dagen.
async function fetchMaskinbruk() {
  if (!auth()) return;
  if (ui.henterBruk) return;
  if (ui.maskinbruk && Date.now() - ui.maskinbruk.ts < 60000) return;
  ui.henterBruk = true;
  try {
    const data = await api('api/timer/maskinbruk');
    ui.maskinbruk = { ts: Date.now(), rows: data.bruk || [] };
  } catch { /* uten svar vises alt som ledig - serveren stopper uansett */ }
  finally {
    ui.henterBruk = false;
    if (document.getElementById('entryForm')) refreshMachineSelect();
  }
}

// Maskinen er opptatt denne dagen hvis en ANNEN har ført timer på den
function maskinOpptattAv(machine, date) {
  const minEpost = (auth()?.user?.email) || '';
  const treff = ((ui.maskinbruk && ui.maskinbruk.rows) || [])
    .find((b) => b.date === date && b.machine === machine && b.email !== minEpost);
  return treff ? (treff.name || treff.email) : null;
}

// Nedtrekksvalg for maskin: kun faktiske maskiner fra valgt prosjekt,
// og maskiner andre alt har ført timer på denne dagen er grået ut.
function machineOptions(projectName, selected, date) {
  const names = store.machinesForProject(projectName);
  if (selected && !names.includes(selected)) names.unshift(selected);
  return ['<option value="">Ingen maskin (arbeidstimer)</option>']
    .concat(names.map((m) => {
      const hvem = date ? maskinOpptattAv(m, date) : null;
      if (hvem && m !== selected) {
        return `<option value="${esc(m)}" disabled>${esc(m)} – opptatt (${esc(hvem)})</option>`;
      }
      // Egen maskin er fortsatt valgbar, men merkes saa man ser at vernet virker
      const minEgen = date && state.entries.some((e) => !e.id.startsWith('ik-') && e.machine === m && e.date === date);
      return `<option value="${esc(m)}"${m === selected ? ' selected' : ''}>${esc(m)}${minEgen ? ' – ført av deg' : ''}</option>`;
    }))
    .join('');
}

// Bygger maskinvelgeren på nytt når prosjektet i skjemaet endres.
function refreshMachineSelect() {
  const form = document.getElementById('entryForm');
  const sel = document.getElementById('efMachine');
  if (!form || !sel || !form.projectId) return;
  const project = form.projectId.value ? store.projectById(form.projectId.value) : null;
  sel.innerHTML = machineOptions(project ? project.name : null, sel.value, form.dataset.date);
  maybePrefillMachineHours();
}

// Setter et felt fra Infrakit, men rører aldri noe brukeren har skrevet selv.
// Tom verdi rydder bort en tidligere auto-utfylling.
function settAutoFelt(felt, verdi) {
  if (!felt) return;
  const forrige = felt.dataset.auto || '';
  if (felt.value && felt.value !== forrige) return;
  felt.value = verdi;
  felt.dataset.auto = verdi;
}

function maybePrefillMachineHours() {
  const form = document.getElementById('entryForm');
  if (!form || !form.machine) return;
  const hint = document.getElementById('machineHint');
  const machine = form.machine.value.trim();
  const isNew = !form.dataset.editId;
  // Ny maskin = ny tidslinje: neste trykk skal settes som start igjen
  if (form.dataset.sisteMaskin !== machine) {
    form.dataset.sisteMaskin = machine;
    delete form.dataset.tidTrykk;
  }
  const hit = machine ? infrakitEntryFor(form.dataset.date, machine) : null;

  if (isNew) {
    // Uten treff tømmes det vi selv fylte inn, så tall fra forrige maskin ikke blir stående
    settAutoFelt(form.hours, hit ? d.fmtHours(hit.hours) : '');
    settAutoFelt(form.timeStart, hit && hit.start ? d.fmtTime(hit.start) : '');
    settAutoFelt(form.timeEnd, hit && hit.end ? d.fmtTime(hit.end) : '');
    settAutoFelt(form.note, hit ? (hit.note || '') : '');
    autosizeNote();
    if (hit && hit.projectId && form.projectId) form.projectId.value = hit.projectId;
  }

  // Maskinens dag som tidslinje: økter og modellbytter er holdepunktene som
  // gjør det lett å huske når man selv gikk av og en annen tok over
  const tl = document.getElementById('maskinOkter');
  if (tl) {
    const okter = (hit && Array.isArray(hit.sessions) && hit.sessions) || [];
    const rader = [];
    for (const s of okter) {
      rader.push({ tid: s.from, tekst: 'maskinen startet' });
      rader.push({ tid: s.to, tekst: 'maskinen stoppet' });
    }
    for (const m of (hit && hit.models) || []) {
      if (m && m.from) rader.push({ tid: m.from, tekst: `${m.name}${m.hours ? ' · ' + d.fmtHours(m.hours) + ' t' : ''}` });
    }
    rader.sort((a, b) => String(a.tid).localeCompare(String(b.tid)));
    if (rader.length) {
      // Sammenlagt til én linje som standard, og husk om brukeren har åpnet den
      const varAapen = !!tl.querySelector('details[open]');
      const spennFra = rader[0].tid;
      const spennTil = rader[rader.length - 1].tid;
      tl.innerHTML = `
        <details class="dagdetalj"${varAapen ? ' open' : ''}>
          <summary>Maskinens dag · ${esc(spennFra)}–${esc(spennTil)} <span class="muted">– trykk for tider</span></summary>
          ${okter.length > 1 ? `<div class="okter">${okter.map((s) => `<button type="button" class="btn ghost small" data-action="bruk-okt" data-fra="${esc(s.from)}" data-til="${esc(s.to)}">${esc(s.from)}–${esc(s.to)}</button>`).join('')}</div>` : ''}
          <p class="muted small" style="margin:6px 0 0">Trykk når du begynte, så når du ga deg – timene regnes ut.</p>
          <div class="tidslinje">${rader.map((r) => `<button type="button" data-action="bruk-tid" data-tid="${esc(r.tid)}"><strong>${esc(r.tid)}</strong>${esc(r.tekst)}</button>`).join('')}</div>
        </details>`;
      tl.hidden = false;
    } else {
      tl.innerHTML = '';
      tl.hidden = true;
    }
  }

  if (!machine) {
    if (hint) hint.hidden = true;
    return;
  }

  if (hit) {
    if (hint) {
      hint.textContent = `Infrakit: ${d.fmtHours(hit.hours)} t på denne maskinen denne dagen${isNew ? ' – fylt inn automatisk.' : '.'}`;
      hint.hidden = false;
    }
  } else if (hint) {
    // Fortell hvilke dager maskinen faktisk har timer, så det er lett å finne dem
    const andre = state.entries
      .filter((e) => e.machine === machine && e.id.startsWith('ik-'))
      .map((e) => e.date)
      .sort();
    if (andre.length) {
      const vis = andre.slice(-5).map((dato) => d.dayMonth(dato)).join(', ');
      hint.innerHTML = `Ingen Infrakit-timer denne dagen. Maskinen har timer ${andre.length > 5 ? 'bl.a. ' : ''}${esc(vis)}.`;
    } else {
      hint.textContent = 'Ingen Infrakit-timer registrert på denne maskinen. Prøv «Oppdater maskiner og timer» under Mer.';
    }
    hint.hidden = false;
  }
}

function showFormError(msg) {
  const el = modal.querySelector('#formError');
  if (el) {
    el.textContent = msg;
    el.hidden = false;
  }
}

function saveEntryForm(form) {
  const date = form.dataset.date;
  const hours = d.parseHours(form.hours.value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showFormError('Fant ikke dagen – lukk og prøv igjen.');
    return;
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    showFormError('Timer må være et tall mellom 0 og 24, f.eks. 7,5.');
    return;
  }
  const data = {
    date,
    projectId: form.projectId.value || null,
    hours: Math.round(hours * 100) / 100,
    note: form.note.value.trim(),
  };
  if (form.task && form.task.value.trim()) data.task = form.task.value.trim().slice(0, 40);
  if (form.machine) data.machine = form.machine.value.trim();
  if (data.machine) {
    const hvem = maskinOpptattAv(data.machine, date);
    if (hvem) {
      showFormError(`${data.machine} er allerede ført av ${hvem} denne dagen.`);
      return;
    }
  }
  if (form.timeStart && form.timeEnd) {
    const ts = form.timeStart.value;
    const te = form.timeEnd.value;
    data.start = ts && te ? `${date}T${ts}:00` : null;
    data.end = ts && te ? `${date}T${te}:00` : null;
  }
  const id = form.dataset.editId;
  ui.date = date;
  let lagret = null;
  if (id) {
    lagret = store.updateEntry(id, data);
  } else {
    // Unngå duplikat blant DINE føringer (aldri rør de auto-synkede ik-oppføringene)
    const dup = data.machine
      ? state.entries.find((e) => !e.id.startsWith('ik-') && e.machine === data.machine && e.date === data.date && (e.projectId || null) === data.projectId)
      : null;
    lagret = dup ? store.updateEntry(dup.id, data) : store.addEntry(data);
  }
  if (lagret && !lagret.id.startsWith('ik-')) skyLagre(lagret);
  modal.close();
}

function saveProjectForm(form) {
  const name = form.name.value.trim();
  if (!name) {
    showFormError('Gi prosjektet et navn.');
    return;
  }
  const color = Number(form.color.value);
  const id = form.dataset.editId;
  const systemer = [...form.querySelectorAll('input[name="sys"]:checked')].map((c) => c.value);
  if (id) store.updateProject(id, { name, color });
  else store.addProject(name, color);
  modal.close();
  if (!id && systemer.length) opprettEksternt(name, systemer);
}

// Oppretter prosjektet i valgte eksterne systemer via skyen, og melder fra
// per system. Det lokale prosjektet er allerede lagret uansett utfall.
async function opprettEksternt(navn, systemer) {
  const visNavn = (id) => (EKSTERNE_SYSTEMER.find((s) => s.id === id) || { navn: id }).navn;
  try {
    const svar = await api('api/prosjekt/opprett', { method: 'POST', body: { name: navn, systems: systemer } });
    const linjer = Object.entries(svar.resultat || {}).map(([s, r]) => r.ok
      ? `✓ ${visNavn(s)}: opprettet${r.nummer ? ' (prosjektnr. ' + r.nummer + ')' : ''}`
      : `✗ ${visNavn(s)}: ${r.feil}`);
    alert(`«${navn}»\n${linjer.join('\n')}`);
    if (svar.resultat?.infrakit?.ok) {
      fetchMachineList();
      fetchInfrakitStatus();
    }
  } catch (err) {
    alert(`Fikk ikke opprettet «${navn}» i andre systemer: ${String(err.message || err)}`);
  }
}

/* ---------- Hjelpere ---------- */

// Setter start/slutt fra tidslinja og regner timer når begge er der
function settTidsrom(form, fra, til) {
  if (fra) {
    form.timeStart.value = fra;
    form.timeStart.dataset.auto = fra;
  }
  if (til) {
    form.timeEnd.value = til;
    form.timeEnd.dataset.auto = til;
  }
  const s = form.timeStart.value;
  const e = form.timeEnd.value;
  if (s && e && e > s) {
    const ms = new Date(`2000-01-01T${e}:00`) - new Date(`2000-01-01T${s}:00`);
    const t = d.fmtHours(Math.round((ms / 3600000) * 100) / 100);
    form.hours.value = t;
    form.hours.dataset.auto = t;
  }
}

function bumpHours(delta) {
  const inp = document.getElementById('efHours');
  if (!inp) return;
  const cur = d.parseHours(inp.value);
  const base = Number.isFinite(cur) ? cur : 0;
  const next = Math.max(0.5, Math.round((base + delta) * 100) / 100);
  inp.value = d.fmtHours(next);
}

/* --- Sky: innlogging, brukere og Infrakit-data (cloud/worker.js) --- */

// Holdes i takt med VERSJON i cloud/worker.js ved hver utrulling
const APP_VERSJON = 18;
const DEFAULT_PROXY = 'https://timeapp-proxy.magnus-k.workers.dev';
const PBKDF2_RUNDER = 300000;

function proxyConf() {
  try {
    return JSON.parse(localStorage.getItem('timeapp:proxy') || '{}');
  } catch {
    return {};
  }
}

function apiUrl(path) {
  const base = String(proxyConf().url || DEFAULT_PROXY).trim().replace(/\/+$/, '');
  return base + '/' + path;
}

/* --- Innlogging --- */

function auth() {
  try {
    return JSON.parse(localStorage.getItem('timeapp:auth') || 'null');
  } catch {
    return null;
  }
}

function lagreAuth(data) {
  try {
    if (data) localStorage.setItem('timeapp:auth', JSON.stringify(data));
    else localStorage.removeItem('timeapp:auth');
  } catch { /* lagring utilgjengelig */ }
}

function apiHeaders() {
  const a = auth();
  return a && a.token ? { Authorization: 'Bearer ' + a.token } : {};
}

// Kall mot skyen. Kaster feil med serverens melding, og logger ut ved 401.
async function api(path, { method = 'GET', body } = {}) {
  const headers = { ...apiHeaders() };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(apiUrl(path), { method, headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth() && !path.startsWith('api/auth/')) {
      lagreAuth(null);
      render();
    }
    const feil = new Error(data.error || 'Noe gikk galt (HTTP ' + res.status + ')');
    feil.status = res.status;
    throw feil;
  }
  return data;
}

const b64Til = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const tilB64 = (bytes) => btoa(String.fromCharCode(...bytes));

// Passordet forlater aldri telefonen – serveren får kun den avledede nøkkelen.
async function avledNokkel(passord, saltB64) {
  const grunn = await crypto.subtle.importKey('raw', new TextEncoder().encode(passord), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64Til(saltB64), iterations: PBKDF2_RUNDER, hash: 'SHA-256' },
    grunn, 256
  );
  return tilB64(new Uint8Array(bits));
}

const nyttSalt = () => tilB64(crypto.getRandomValues(new Uint8Array(16)));

// Henter den faktiske maskinlista fra Infrakit via proxyen.
async function fetchMachineList() {
  if (!auth()) return;
  try {
    const data = await api('api/infrakit/machines');
    if (Array.isArray(data.projects)) store.ensureProjects(data.projects);
    if (Array.isArray(data.machines)) {
      store.saveMachineList(
        data.machines
          .map((m) => ({ name: String(m.name || '').trim(), projects: Array.isArray(m.projects) ? m.projects : [] }))
          .filter((m) => m.name.length > 1)
      );
    }
  } catch { /* offline eller proxy uten nøkkel – cachen brukes */ }
}

// Koordinator kobler bedriften til med bedriftens egen Infrakit-bruker.
function openConnectModal() {
  modal.innerHTML = `
    <form id="connectForm" novalidate>
      <h2>Koble til Infrakit</h2>
      <p class="muted small" style="margin:0">Bruk bedriftens Infrakit-innlogging. Passordet sendes kun videre til Infrakit for innlogging, og lagres ingen steder – vi tar kun vare på en fornybar tilgang.</p>
      <label class="field-label" for="cfUser">Infrakit-brukernavn</label>
      <input class="input" id="cfUser" name="username" type="email" autocomplete="username" spellcheck="false">
      <label class="field-label" for="cfPass">Infrakit-passord</label>
      <input class="input" id="cfPass" name="password" type="password" autocomplete="current-password">
      <p class="form-error" id="formError" hidden></p>
      <div class="btnrow">
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-action="close-modal">Avbryt</button>
        <button type="submit" class="btn primary">Koble til</button>
      </div>
    </form>`;
  modal.showModal();
}

async function submitConnect(form) {
  const knapp = form.querySelector('button[type="submit"]');
  knapp.disabled = true;
  knapp.textContent = 'Kobler til …';
  try {
    const data = await api('api/infrakit/connect', {
      method: 'POST',
      body: { username: form.username.value.trim(), password: form.password.value },
    });
    modal.close();
    alert(`Koblet til Infrakit – fant ${data.projects} prosjekt${data.projects === 1 ? '' : 'er'}.`);
    fetchInfrakitStatus();
    fetchMachineList();
    fetchMachineHours(false);
  } catch (err) {
    knapp.disabled = false;
    knapp.textContent = 'Koble til';
    showFormError(String(err.message || err));
  }
}

// Andre fagsystemer bedriften kan koble til for prosjektoppretting.
function renderIntegrasjonerKort() {
  const i = ui.integrasjoner || {};
  const rad = (navn, innhold) => `<div class="integrad"><strong>${navn}</strong><span class="muted small">${innhold}</span></div>`;
  return `
    <section class="card">
      <h2>Andre systemer</h2>
      <p class="muted small" style="margin:0 0 4px">Huk av når du lager et nytt prosjekt, så opprettes det samtidig i systemene under.</p>
      ${rad('Tripletex', i.tripletex
        ? `<strong style="color:var(--good)">✓ Tilkoblet</strong>${i.tripletexBy ? ' (av ' + esc(i.tripletexBy) + ')' : ''}`
        : 'Ikke koblet til ennå')}
      ${erKoordinator() ? `<button class="btn${i.tripletex ? '' : ' primary'}" data-action="connect-tripletex" style="width:100%;margin-bottom:4px">${i.tripletex ? 'Koble til Tripletex på nytt …' : 'Koble til Tripletex …'}</button>` : ''}
      ${rad('Xsite MANAGE', 'Kommer – krever API-tilgang fra Novatron (manage@novatron.fi)')}
      ${rad('Trimble Connect', 'Kommer – krever API-app hos Trimble Developer')}
      ${rad('Makin’', 'Maskinene følger Infrakit-prosjektene automatisk')}
    </section>`;
}

// Koordinator kobler bedriften til Tripletex med API-tokens.
function openTripletexModal() {
  modal.innerHTML = `
    <form id="tripletexForm" novalidate>
      <h2>Koble til Tripletex</h2>
      <p class="muted small" style="margin:0">Bruk integrasjonens consumer token og et employee token fra Tripletex (Min profil → API-tilgang). Tokenene lagres kryptert og brukes kun til å opprette prosjekter. Den ansatte tokenet tilhører blir prosjektleder for nye prosjekter.</p>
      <label class="field-label" for="ttCons">Consumer token</label>
      <input class="input" id="ttCons" name="consumerToken" type="password" autocomplete="off" spellcheck="false">
      <label class="field-label" for="ttEmp">Employee token</label>
      <input class="input" id="ttEmp" name="employeeToken" type="password" autocomplete="off" spellcheck="false">
      <p class="form-error" id="formError" hidden></p>
      <div class="btnrow">
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-action="close-modal">Avbryt</button>
        <button type="submit" class="btn primary">Koble til</button>
      </div>
    </form>`;
  modal.showModal();
}

async function submitTripletex(form) {
  const knapp = form.querySelector('button[type="submit"]');
  knapp.disabled = true;
  knapp.textContent = 'Kobler til …';
  try {
    const data = await api('api/integrasjoner/tripletex', {
      method: 'POST',
      body: { consumerToken: form.consumerToken.value.trim(), employeeToken: form.employeeToken.value.trim() },
    });
    modal.close();
    alert(`Koblet til Tripletex – nye prosjekter får ${data.ansatt} som prosjektleder.`);
    fetchIntegrasjoner();
  } catch (err) {
    knapp.disabled = false;
    knapp.textContent = 'Koble til';
    showFormError(String(err.message || err));
  }
}

async function fetchIntegrasjoner() {
  if (!auth()) return;
  try {
    ui.integrasjoner = await api('api/integrasjoner');
  } catch {
    ui.integrasjoner = null;
  }
  if (ui.tab === 'more') render();
}

/* --- Timeføringer i skyen: utboks med ett forsøk per synk --- */

function lesUtboks() {
  try {
    return JSON.parse(localStorage.getItem('timeapp:utboks') || '[]');
  } catch {
    return [];
  }
}

function skrivUtboks(u) {
  try {
    localStorage.setItem('timeapp:utboks', JSON.stringify(u.slice(-200)));
  } catch { /* lagring utilgjengelig */ }
}

// Legger føringen i utboksen og prøver å sende med en gang. Feiler nettet,
// blir den liggende og går opp ved neste synk.
function skyLagre(entry) {
  if (!entry || entry.id.startsWith('ik-')) return;
  const p = entry.projectId ? store.projectById(entry.projectId) : null;
  const u = lesUtboks().filter((x) => !(x.op === 'lagre' && x.entry.id === entry.id));
  u.push({ op: 'lagre', entry: {
    id: entry.id, date: entry.date, project: p ? p.name : null,
    machine: entry.machine || null, task: entry.task || null, hours: entry.hours, note: entry.note || '',
    start: entry.start || null, end: entry.end || null,
  } });
  skrivUtboks(u);
  flushUtboks();
}

function skySlett(id) {
  if (!id || id.startsWith('ik-')) return;
  const u = lesUtboks().filter((x) => !(x.op === 'lagre' && x.entry.id === id));
  u.push({ op: 'slett', id });
  skrivUtboks(u);
  flushUtboks();
}

let utboksSender = false;
async function flushUtboks() {
  if (utboksSender || !auth()) return;
  utboksSender = true;
  try {
    let x;
    while ((x = lesUtboks()[0])) {
      if (x.op === 'lagre') {
        const svar = await api('api/timer', { method: 'POST', body: { entries: [x.entry] } });
        if (svar.avvist && svar.avvist.length) {
          // F.eks. maskinen ble tatt av en annen mens vi var uten nett
          alert('Ikke lagret i skyen: ' + svar.avvist.map((a) => a.feil).join('; '));
          ui.maskinbruk = null;
          fetchMaskinbruk();
        }
      } else {
        await api('api/timer/slett', { method: 'POST', body: { id: x.id } });
      }
      skrivUtboks(lesUtboks().slice(1));
    }
  } catch { /* proever igjen ved neste synk */ } finally {
    utboksSender = false;
  }
}

// Henter egne føringer fra skyen (f.eks. ført på en annen enhet)
async function hentSkyTimer() {
  if (!auth()) return;
  try {
    const data = await api('api/timer');
    if (store.mergeSkyEntries(data.entries || [])) render();
  } catch { /* skyen er kjekk aa ha, ikke maa ha */ }
}

// Koordinator oppretter bruker til en ansatt og får en engangskode.
function openInviteUserModal() {
  modal.innerHTML = `
    <form id="inviteUserForm" novalidate>
      <h2>Legg til ansatt</h2>
      <p class="muted small" style="margin:0">Den ansatte får en engangskode og velger sitt eget passord i appen.</p>
      <label class="field-label" for="iuName">Navn</label>
      <input class="input" id="iuName" name="name" autocomplete="name">
      <label class="field-label" for="iuEmail">E-post</label>
      <input class="input" id="iuEmail" name="email" type="email" autocomplete="off" spellcheck="false">
      <span class="field-label">Rolle</span>
      <select class="select" name="role">
        <option value="employee">Ansatt</option>
        <option value="coordinator">Koordinator</option>
      </select>
      <p class="form-error" id="formError" hidden></p>
      <div class="btnrow">
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-action="close-modal">Avbryt</button>
        <button type="submit" class="btn primary">Opprett</button>
      </div>
    </form>`;
  modal.showModal();
}

async function submitInviteUser(form) {
  const knapp = form.querySelector('button[type="submit"]');
  knapp.disabled = true;
  try {
    const data = await api('api/users/invite', {
      method: 'POST',
      body: { name: form.name.value.trim(), email: form.email.value.trim(), role: form.role.value },
    });
    modal.innerHTML = `
      <h2>Engangskode klar</h2>
      <p class="small" style="margin:0 0 12px">Gi denne koden til ${esc(data.email)}. De åpner appen, velger «Jeg har fått en engangskode» og setter sitt eget passord. Koden varer i 14 dager.</p>
      <p class="kode">${esc(data.code)}</p>
      <div class="btnrow">
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-action="close-modal">Ferdig</button>
      </div>`;
    hentBrukere();
  } catch (err) {
    knapp.disabled = false;
    showFormError(String(err.message || err));
  }
}

async function hentBrukere() {
  if (!erKoordinator()) return;
  try {
    ui.brukere = await api('api/users');
  } catch {
    ui.brukere = { users: [], pending: [] };
  }
  if (ui.tab === 'more') render();
}

async function fetchInfrakitStatus() {
  if (!auth()) return;
  try {
    ui.infrakit = await api('api/infrakit/status');
  } catch {
    ui.infrakit = null;
  }
  if (ui.tab === 'more') render();
}

// Timene hentes per prosjekt, ellers sprenger store maskinparker Cloudflares
// grense på 50 utgående kall per forespørsel. Puljer på tre for fartens skyld.
async function fetchMachineHours(showResult) {
  if (!auth()) return;
  // Aldri to synk-runder samtidig - aktivt prosjekt i Infrakit er delt tilstand
  if (ui.henterTimer) return;
  ui.henterTimer = true;
  try {
    let dager = [];
    let prosjekter = [];
    try {
      const pr = await api('api/infrakit/projects');
      if (Array.isArray(pr.projects)) prosjekter = pr.projects;
    } catch { /* eldre server – faller tilbake til ett samlet kall */ }

    let hentet = [];
    let feilet = 0;
    if (prosjekter.length) {
      store.ensureProjects(prosjekter.map((p) => p.name));
      // Ett om gangen: Infrakit har ett aktivt prosjekt per bruker, og serveren
      // bytter fram og tilbake for å få tak i kalenderdataene.
      for (let i = 0; i < prosjekter.length; i++) {
        const p = prosjekter[i];
        if (showResult) {
          ui.synkStatus = `Henter ${i + 1} av ${prosjekter.length}: ${p.name}`;
          if (ui.tab === 'more') render();
        }
        try {
          const s = await api('api/infrakit/hours?projectId=' + encodeURIComponent(p.id));
          if (Array.isArray(s.days)) {
            dager.push(...s.days);
            hentet.push(p.name);
          } else {
            feilet++;
          }
        } catch {
          feilet++;
        }
      }
      ui.synkStatus = '';
    } else {
      const data = await api('api/infrakit/hours');
      if (Array.isArray(data.days)) dager = data.days;
    }

    const changed = store.syncMachineHours(dager, hentet.length ? { scopeProjects: hentet } : {});
    if (showResult) {
      const feilTekst = feilet ? ` (${feilet} prosjekt${feilet === 1 ? '' : 'er'} svarte ikke)` : '';
      alert(dager.length
        ? `Maskintimer oppdatert – ${dager.length} maskindager fra ${hentet.length || 1} prosjekt${hentet.length === 1 ? '' : 'er'}${feilTekst}.`
        : `Fant ingen maskintimer${feilTekst}.`);
    }
  } catch (err) {
    if (showResult) alert(String(err.message || err));
  } finally {
    ui.henterTimer = false;
    ui.synkStatus = '';
    if (ui.tab === 'more') render();
  }
}

function downloadExport() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `timeapp-backup-${d.todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- Live-klokke ---------- */

let timerId = null;

function tick() {
  if (!state.active) return;
  const t = d.fmtElapsed(Date.now() - Date.parse(state.active.start));
  const node = document.getElementById('liveTimer');
  if (node) node.textContent = t;
  document.title = `⏱ ${t.slice(0, 5)} · Timeapp`;
}

function syncTimer() {
  if (state.active) {
    tick();
    if (!timerId) timerId = setInterval(tick, 1000);
  } else {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    document.title = 'Timeapp';
  }
}

/* ---------- Hendelser ---------- */

const actions = {
  tab(el) { ui.tab = el.dataset.tab; render(); },
  'clock-in'() {
    const sel = document.getElementById('clockProject');
    store.clockIn(sel ? sel.value : null);
  },
  'clock-out'() { store.clockOut(); },
  'cancel-active'() {
    if (confirm('Forkaste stemplingen uten å lagre timene?')) store.cancelActive();
  },
  'day-prev'() { ui.date = d.addDays(ui.date, -1); render(); },
  'day-next'() { ui.date = d.addDays(ui.date, 1); render(); },
  'day-today'() { ui.date = d.todayISO(); render(); },
  'pick-date'() {
    const inp = document.getElementById('datePicker');
    if (!inp) return;
    try { inp.showPicker(); } catch { inp.focus(); }
  },
  'dash-prev'() { ui.dashUke = d.addDays(ui.dashUke, -7); render(); },
  'dash-next'() { ui.dashUke = d.addDays(ui.dashUke, 7); render(); },
  'dash-current'() { ui.dashUke = d.mondayOf(d.todayISO()); render(); },
  'dash-project'(el) { ui.dashProsjekt = el.dataset.navn; render(); },
  'dash-back'() { ui.dashProsjekt = null; render(); },
  'week-prev'() { ui.weekStart = d.addDays(ui.weekStart, -7); render(); },
  'week-next'() { ui.weekStart = d.addDays(ui.weekStart, 7); render(); },
  'week-current'() { ui.weekStart = d.mondayOf(d.todayISO()); render(); },
  'open-day'(el) { ui.date = el.dataset.date; ui.tab = 'day'; render(); },
  'new-entry'() { startVeiviser(ui.date); },
  'vv-prosjekt'(el) {
    ui.vv.projectId = el.dataset.id || null;
    ui.vv.steg = 2;
    renderVeiviser();
  },
  'vv-oppgave'(el) {
    ui.vv.oppgave = el.dataset.oppgave;
    if (el.dataset.oppgave === 'Maskinfører') {
      renderVeiviser();
    } else {
      ui.vv.machine = null;
      ui.vv.steg = 3;
      renderVeiviser();
    }
  },
  'vv-maskin'(el) {
    ui.vv.machine = el.dataset.navn;
    ui.vv.steg = 3;
    renderVeiviser();
  },
  'vv-tid'(el) { vvSettTid(el.dataset.tid); },
  'vv-tid-manuell'() {
    const felt = document.getElementById('vvTid');
    if (felt && felt.value) vvSettTid(felt.value);
  },
  'vv-tilbake'() {
    const vv = ui.vv;
    if (!vv) return;
    if (vv.steg === 4) {
      vv.slutt = null;
      vv.steg = 3;
    } else if (vv.steg === 3) {
      vv.start = null;
      if (vv.oppgave === 'Maskinfører') vv.machine = null;
      else vv.oppgave = null;
      vv.steg = 2;
    } else if (vv.steg === 2) {
      if (vv.oppgave === 'Maskinfører' && !vv.machine) {
        vv.oppgave = null;
      } else {
        vv.oppgave = null;
        vv.machine = null;
        vv.steg = 1;
      }
    }
    renderVeiviser();
  },
  'edit-entry'(el) {
    const entry = state.entries.find((e) => e.id === el.dataset.id);
    if (entry) openEntryModal(entry);
  },
  'delete-entry'(el) {
    if (confirm('Slette denne timeføringen?')) {
      store.deleteEntry(el.dataset.id);
      skySlett(el.dataset.id);
      modal.close();
    }
  },
  'new-project'() { openProjectModal(null); },
  'edit-project'(el) {
    const p = store.projectById(el.dataset.id);
    if (p) openProjectModal(p);
  },
  'delete-project'(el) {
    const p = store.projectById(el.dataset.id);
    if (!p) return;
    const n = state.entries.filter((e) => e.projectId === p.id).length;
    const extra = n ? ` ${n} timeføring${n === 1 ? '' : 'er'} beholdes uten prosjekt.` : '';
    if (confirm(`Slette «${p.name}»?${extra}`)) {
      store.deleteProject(p.id);
      modal.close();
    }
  },
  'bruk-okt'(el) {
    const form = document.getElementById('entryForm');
    if (!form || !form.timeStart) return;
    settTidsrom(form, el.dataset.fra, el.dataset.til);
  },
  'bruk-tid'(el) {
    const form = document.getElementById('entryForm');
    if (!form || !form.timeStart) return;
    const t = el.dataset.tid;
    const start = form.timeStart.value;
    // Første trykk setter start (slutt beholdes), neste trykk med senere
    // klokkeslett setter slutt. Et tidligere klokkeslett flytter starten.
    if (form.dataset.tidTrykk !== '1' || !start || t <= start) {
      settTidsrom(form, t, null);
      form.dataset.tidTrykk = '1';
    } else {
      settTidsrom(form, start, t);
    }
  },
  'hours-minus'() { bumpHours(-0.5); },
  'hours-plus'() { bumpHours(0.5); },
  'sync-machines'() { fetchMachineList(); fetchInfrakitStatus(); fetchMachineHours(true); },
  'save-proxy'() {
    const url = document.getElementById('proxyUrl');
    if (!url) return;
    try {
      localStorage.setItem('timeapp:proxy', JSON.stringify({ url: url.value.trim() }));
    } catch { /* lagring utilgjengelig */ }
    fetchInfrakitStatus();
  },
  'admin-connect'() { openConnectModal(); },
  'connect-tripletex'() { openTripletexModal(); },
  'login-mode'(el) {
    ui.loginModus = el.dataset.mode;
    ui.loginFeil = '';
    render();
  },
  async logout() {
    try { await api('api/auth/logout', { method: 'POST' }); } catch { /* uansett ut lokalt */ }
    lagreAuth(null);
    ui.infrakit = null;
    ui.integrasjoner = null;
    ui.brukere = null;
    ui.alleTimer = null;
    ui.dashProsjekt = null;
    ui.loginModus = 'login';
    render();
  },
  'invite-user'() { openInviteUserModal(); },
  async 'remove-user'(el) {
    const epost = el.dataset.email;
    if (!confirm(`Fjerne ${epost}? Personen mister tilgangen med én gang.`)) return;
    try {
      await api('api/users/remove', { method: 'POST', body: { email: epost } });
      await hentBrukere();
    } catch (err) {
      alert(String(err.message || err));
    }
  },
  'close-modal'() { ui.vv = null; modal.close(); },
  export() { downloadExport(); },
  import() {
    const hasData = state.entries.length || state.projects.length;
    if (hasData && !confirm('Import erstatter alle data på denne enheten med innholdet i filen. Fortsette?')) return;
    document.getElementById('importFile').click();
  },
  reset() {
    if (confirm('Slette ALLE prosjekter og timeføringer på denne enheten?') && confirm('Helt sikker? Dette kan ikke angres.')) {
      store.resetAll();
    }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.id === 'entryForm') { e.preventDefault(); saveEntryForm(f); }
  if (f.id === 'projectForm') { e.preventDefault(); saveProjectForm(f); }
  if (f.id === 'connectForm') { e.preventDefault(); submitConnect(f); }
  if (f.id === 'tripletexForm') { e.preventDefault(); submitTripletex(f); }
  if (f.id === 'inviteUserForm') { e.preventDefault(); submitInviteUser(f); }

  if (f.id === 'loginForm') {
    e.preventDefault();
    const epost = f.email.value.trim();
    const passord = f.password.value;
    loginFlyt(async () => {
      if (!epost || !passord) throw new Error('Fyll inn e-post og passord.');
      const { salt } = await api('api/auth/salt?email=' + encodeURIComponent(epost));
      return api('api/auth/login', { method: 'POST', body: { email: epost, derivedKey: await avledNokkel(passord, salt) } });
    });
  }

  if (f.id === 'inviteForm') {
    e.preventDefault();
    const kode = f.code.value.trim().toUpperCase();
    const navn = f.name.value.trim();
    const p1 = f.password.value;
    const p2 = f.password2.value;
    loginFlyt(async () => {
      if (!kode) throw new Error('Skriv inn engangskoden.');
      sjekkPassord(p1, p2);
      const salt = nyttSalt();
      return api('api/auth/accept', { method: 'POST', body: { code: kode, name: navn, salt, derivedKey: await avledNokkel(p1, salt) } });
    });
  }

  if (f.id === 'registerForm') {
    e.preventDefault();
    const felt = {
      company: f.company.value.trim(),
      setupKey: f.setupKey.value,
      name: f.name.value.trim(),
      email: f.email.value.trim(),
    };
    const p1 = f.password.value;
    const p2 = f.password2.value;
    loginFlyt(async () => {
      if (!felt.company || !felt.name || !felt.email) throw new Error('Fyll inn bedrift, navn og e-post.');
      sjekkPassord(p1, p2);
      const salt = nyttSalt();
      return api('api/auth/register', { method: 'POST', body: { ...felt, salt, derivedKey: await avledNokkel(p1, salt) } });
    });
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'efNote') autosizeNote();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'clockProject') ui.clockProject = e.target.value;
  if (e.target.id === 'efMachine') maybePrefillMachineHours();
  if (e.target.id === 'efProject') refreshMachineSelect();
  if (e.target.id === 'datePicker' && e.target.value) { ui.date = e.target.value; render(); }
  if (e.target.id === 'importFile') {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((text) => {
      try {
        store.importJSON(text);
        alert('Data importert.');
      } catch {
        alert('Kunne ikke lese filen. Er dette en Timeapp-eksport?');
      }
    });
  }
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.close();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    render();
    synkFraSky();
  }
});

function synkFraSky() {
  if (!auth()) return;
  flushUtboks();
  hentSkyTimer();
  fetchMaskinbruk();
  fetchInfrakitStatus();
  fetchIntegrasjoner();
  fetchMachineList();
  fetchMachineHours(false);
  hentBrukere();
}

/* ---------- Oppstart ---------- */

store.subscribe(render);
if (darkQuery.addEventListener) darkQuery.addEventListener('change', render);
render();
synkFraSky();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker feilet', err));
}
