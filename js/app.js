import * as store from './store.js';
import { state, PALETTE, NO_PROJECT_COLOR } from './store.js';
import * as d from './dates.js';

const app = document.getElementById('app');
const modal = document.getElementById('modal');

const ui = {
  tab: 'clock',
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
};

/* ---------- Render ---------- */

function render() {
  const pages = { clock: renderClock, day: renderDay, week: renderWeek, more: renderMore };
  app.innerHTML = `<main class="page">${pages[ui.tab]()}</main>${renderTabBar()}`;
  syncTimer();
}

function renderTabBar() {
  const tabs = [
    ['clock', 'Stemple', icons.clock],
    ['day', 'Timer', icons.list],
    ['week', 'Uke', icons.week],
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
      if (p) parts.push(esc(p.name));
      meta = parts.length ? parts.join(' · ') : (e.id.startsWith('ik-') ? 'Fra Infrakit' : 'Ført manuelt');
    } else {
      meta = e.start && e.end ? `${d.fmtTime(e.start)}–${d.fmtTime(e.end)}` : 'Ført manuelt';
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
    ${machineEntries.length ? `
    <section class="card">
      <h2>Maskintimer</h2>
      ${entryList(machineEntries)}
      <div class="day-total"><span>Sum maskiner</span><strong>${d.fmtHours(machineEntries.reduce((s, e) => s + e.hours, 0))} t</strong></div>
    </section>` : ''}
    <button class="btn primary big" data-action="new-entry">+ Ny timeføring</button>`;
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
    <section class="card">
      <h2>Infrakit</h2>
      <p class="small" style="margin:0 0 8px">${
        ui.infrakit && ui.infrakit.connected
          ? '<strong style="color:var(--good)">✓ Koblet til Infrakit-API-et</strong> – maskinlista hentes automatisk.'
          : ui.infrakit
            ? '<strong>Ikke koblet.</strong> Kjør <code>scripts\\infrakit-login.ps1</code> på PC-en der serveren kjører, og start serveren på nytt.'
            : 'Infrakit-synk er ikke tilgjengelig på denne serveren – maskindata krever serverdelen (PC-versjonen, eller en skyproxy).'
      }</p>
      <p class="muted small" style="margin:0 0 12px">Maskintimene leses fra <code>machine-hours.json</code> i appmappen. Be Claude oppdatere filen med ferske tall fra Infrakit.</p>
      <button class="btn" data-action="sync-machines" style="width:100%">Oppdater maskiner og timer</button>
    </section>
    <section class="card">
      <h2>Data</h2>
      <p class="muted small" style="margin:0 0 12px">Alt lagres kun lokalt på denne enheten. Ta en sikkerhetskopi med jevne mellomrom.</p>
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
      <p class="muted small" style="margin:0">Timeapp v1 · fungerer offline</p>
    </section>`;
}

/* ---------- Modaler ---------- */

function openEntryModal(entry, date) {
  const isEdit = !!entry;
  const values = entry || { date, projectId: '', hours: '', note: '' };
  modal.innerHTML = `
    <form id="entryForm"${isEdit ? ` data-edit-id="${entry.id}"` : ''} novalidate>
      <h2>${isEdit ? 'Endre timeføring' : 'Ny timeføring'}</h2>
      ${entry && entry.machine && entry.id.startsWith('ik-') ? `<p class="muted small" style="margin:0">Maskin: ${esc(entry.machine)} · hentet fra Infrakit</p>` : ''}
      <label class="field-label" for="efDate">Dato</label>
      <input class="input" type="date" id="efDate" name="date" value="${values.date}" required>
      <div class="timerow">
        <div>
          <label class="field-label" for="efStart">Start <span class="muted">(valgfritt)</span></label>
          <input class="input" type="time" id="efStart" name="timeStart" value="${entry && entry.start ? d.fmtTime(entry.start) : ''}">
        </div>
        <div>
          <label class="field-label" for="efEnd">Slutt</label>
          <input class="input" type="time" id="efEnd" name="timeEnd" value="${entry && entry.end ? d.fmtTime(entry.end) : ''}">
        </div>
      </div>
      <label class="field-label" for="efProject">Prosjekt</label>
      ${projectSelect('id="efProject" name="projectId"', values.projectId || '')}
      ${entry && entry.machine && entry.id.startsWith('ik-') ? '' : `
      <label class="field-label" for="efMachine">Maskin <span class="muted">(valgfritt – la stå tom for arbeidstimer)</span></label>
      <select class="select" id="efMachine" name="machine">${machineOptions(
        values.projectId && store.projectById(values.projectId) ? store.projectById(values.projectId).name : null,
        (entry && entry.machine) || ''
      )}</select>
      <p class="muted small" id="machineHint" style="margin:6px 0 0" hidden></p>`}
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

// Nedtrekksvalg for maskin: kun faktiske maskiner fra valgt prosjekt.
function machineOptions(projectName, selected) {
  const names = store.machinesForProject(projectName);
  if (selected && !names.includes(selected)) names.unshift(selected);
  return ['<option value="">Ingen maskin (arbeidstimer)</option>']
    .concat(names.map((m) => `<option value="${esc(m)}"${m === selected ? ' selected' : ''}>${esc(m)}</option>`))
    .join('');
}

// Bygger maskinvelgeren på nytt når prosjektet i skjemaet endres.
function refreshMachineSelect() {
  const form = document.getElementById('entryForm');
  const sel = document.getElementById('efMachine');
  if (!form || !sel || !form.projectId) return;
  const project = form.projectId.value ? store.projectById(form.projectId.value) : null;
  sel.innerHTML = machineOptions(project ? project.name : null, sel.value);
  maybePrefillMachineHours();
}

function maybePrefillMachineHours() {
  const form = document.getElementById('entryForm');
  if (!form || !form.machine) return;
  const hint = document.getElementById('machineHint');
  const machine = form.machine.value.trim();
  if (!machine) {
    if (hint) hint.hidden = true;
    return;
  }
  const hit = infrakitEntryFor(form.date.value, machine);
  const isNew = !form.dataset.editId;
  if (hit) {
    if (isNew) {
      form.hours.value = d.fmtHours(hit.hours);
      if (form.projectId) form.projectId.value = hit.projectId || '';
      if (form.timeStart && hit.start) form.timeStart.value = d.fmtTime(hit.start);
      if (form.timeEnd && hit.end) form.timeEnd.value = d.fmtTime(hit.end);
      // Fyll notatet automatisk, men aldri over noe brukeren har skrevet selv
      if (form.note && (!form.note.value || form.note.value === (form.note.dataset.auto || ''))) {
        form.note.value = hit.note || '';
        form.note.dataset.auto = hit.note || '';
        autosizeNote();
      }
    }
    if (hint) {
      hint.textContent = `Infrakit: ${d.fmtHours(hit.hours)} t på denne maskinen denne dagen${isNew ? ' – fylt inn automatisk.' : '.'}`;
      hint.hidden = false;
    }
  } else if (hint) {
    hint.textContent = 'Ingen Infrakit-timer registrert på denne maskinen denne dagen.';
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
  const date = form.date.value;
  const hours = d.parseHours(form.hours.value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showFormError('Velg en gyldig dato.');
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
  if (form.machine) data.machine = form.machine.value.trim();
  if (form.timeStart && form.timeEnd) {
    const ts = form.timeStart.value;
    const te = form.timeEnd.value;
    data.start = ts && te ? `${date}T${ts}:00` : null;
    data.end = ts && te ? `${date}T${te}:00` : null;
  }
  const id = form.dataset.editId;
  ui.date = date;
  if (id) {
    store.updateEntry(id, data);
  } else {
    // Unngå duplikat: finnes det alt en føring for samme maskin + dag + prosjekt, oppdater den
    const dup = data.machine
      ? state.entries.find((e) => e.machine === data.machine && e.date === data.date && (e.projectId || null) === data.projectId)
      : null;
    if (dup) store.updateEntry(dup.id, data);
    else store.addEntry(data);
  }
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
  if (id) store.updateProject(id, { name, color });
  else store.addProject(name, color);
  modal.close();
}

/* ---------- Hjelpere ---------- */

function bumpHours(delta) {
  const inp = document.getElementById('efHours');
  if (!inp) return;
  const cur = d.parseHours(inp.value);
  const base = Number.isFinite(cur) ? cur : 0;
  const next = Math.max(0.5, Math.round((base + delta) * 100) / 100);
  inp.value = d.fmtHours(next);
}

// Henter den faktiske maskinlista fra Infrakit via serverens proxy (/api/infrakit/*).
async function fetchMachineList() {
  try {
    const res = await fetch('api/infrakit/machines', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.machines)) {
      store.saveMachineList(
        data.machines
          .map((m) => ({ name: String(m.name || '').trim(), projects: Array.isArray(m.projects) ? m.projects : [] }))
          .filter((m) => m.name.length > 1)
      );
    }
  } catch { /* offline eller proxy uten nøkkel – cachen brukes */ }
}

async function fetchInfrakitStatus() {
  try {
    const res = await fetch('api/infrakit/status', { cache: 'no-store' });
    ui.infrakit = res.ok ? await res.json() : null;
  } catch {
    ui.infrakit = null;
  }
  if (ui.tab === 'more') render();
}

async function fetchMachineHours(showResult) {
  try {
    // Prøv live-tall fra Infrakit-proxyen først, fall tilbake til fila i appmappen.
    let res = await fetch('api/infrakit/hours', { cache: 'no-store' }).catch(() => null);
    if (!res || !res.ok) res = await fetch('machine-hours.json', { cache: 'no-store' });
    if (!res.ok) {
      if (showResult) alert('Fant verken Infrakit-tilkobling eller machine-hours.json.');
      return;
    }
    const data = await res.json();
    let days = Array.isArray(data) ? data : data.days;
    if (days && !Array.isArray(days)) days = [days];
    const changed = Array.isArray(days) ? store.syncMachineHours(days) : 0;
    if (showResult) alert(changed ? `Maskintimer oppdatert (${changed} endring${changed === 1 ? '' : 'er'}).` : 'Ingen nye maskintimer.');
  } catch {
    if (showResult) alert('Kunne ikke hente maskintimer nå.');
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
  'week-prev'() { ui.weekStart = d.addDays(ui.weekStart, -7); render(); },
  'week-next'() { ui.weekStart = d.addDays(ui.weekStart, 7); render(); },
  'week-current'() { ui.weekStart = d.mondayOf(d.todayISO()); render(); },
  'open-day'(el) { ui.date = el.dataset.date; ui.tab = 'day'; render(); },
  'new-entry'() { openEntryModal(null, ui.date); },
  'edit-entry'(el) {
    const entry = state.entries.find((e) => e.id === el.dataset.id);
    if (entry) openEntryModal(entry);
  },
  'delete-entry'(el) {
    if (confirm('Slette denne timeføringen?')) {
      store.deleteEntry(el.dataset.id);
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
  'hours-minus'() { bumpHours(-0.5); },
  'hours-plus'() { bumpHours(0.5); },
  'sync-machines'() { fetchMachineList(); fetchInfrakitStatus(); fetchMachineHours(true); },
  'close-modal'() { modal.close(); },
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
  if (e.target.id === 'entryForm') { e.preventDefault(); saveEntryForm(e.target); }
  if (e.target.id === 'projectForm') { e.preventDefault(); saveProjectForm(e.target); }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'efNote') autosizeNote();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'clockProject') ui.clockProject = e.target.value;
  if (e.target.id === 'efMachine' || e.target.id === 'efDate') maybePrefillMachineHours();
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
    fetchMachineHours(false);
    fetchMachineList();
  }
});

/* ---------- Oppstart ---------- */

store.subscribe(render);
if (darkQuery.addEventListener) darkQuery.addEventListener('change', render);
render();
fetchMachineHours(false);
fetchMachineList();
fetchInfrakitStatus();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker feilet', err));
}
