// Datalager: hele tilstanden ligger i localStorage på enheten.
import { isoDate, addDays } from './dates.js?v=16';

const KEY = 'timeapp:data:v1';

// Validert kategorisk palett (lys/mørk variant per plass)
export const PALETTE = [
  { name: 'Blå', light: '#2a78d6', dark: '#3987e5' },
  { name: 'Oransje', light: '#eb6834', dark: '#d95926' },
  { name: 'Sjøgrønn', light: '#1baf7a', dark: '#199e70' },
  { name: 'Gul', light: '#eda100', dark: '#c98500' },
  { name: 'Rosa', light: '#e87ba4', dark: '#d55181' },
  { name: 'Grønn', light: '#008300', dark: '#008300' },
  { name: 'Fiolett', light: '#4a3aa7', dark: '#9085e9' },
  { name: 'Rød', light: '#e34948', dark: '#e66767' },
];
export const NO_PROJECT_COLOR = '#898781';

function defaultState() {
  return { projects: [], entries: [], active: null };
}

function sanitize(raw) {
  const out = defaultState();
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw.projects)) {
    for (const p of raw.projects) {
      if (p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim()) {
        out.projects.push({
          id: p.id,
          name: p.name.slice(0, 60),
          color: Number.isInteger(p.color) ? Math.max(0, Math.min(PALETTE.length - 1, p.color)) : 0,
        });
      }
    }
  }
  if (Array.isArray(raw.entries)) {
    for (const e of raw.entries) {
      if (!e || typeof e.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) continue;
      const hours = Number(e.hours);
      if (!Number.isFinite(hours) || hours <= 0) continue;
      const entry = {
        id: e.id,
        date: e.date,
        projectId: typeof e.projectId === 'string' ? e.projectId : null,
        hours: Math.round(hours * 100) / 100,
        note: typeof e.note === 'string' ? e.note.slice(0, 900) : '',
      };
      if (typeof e.machine === 'string' && e.machine.trim()) entry.machine = e.machine.slice(0, 60);
      if (typeof e.start === 'string' && typeof e.end === 'string') {
        entry.start = e.start;
        entry.end = e.end;
      }
      // Strukturerte maskindata fra Infrakit (brukes i koordinatoroversikten)
      if (Number(e.points) > 0) entry.points = Number(e.points);
      if (e.codes && typeof e.codes === 'object' && !Array.isArray(e.codes)) entry.codes = e.codes;
      if (Array.isArray(e.models)) entry.models = e.models.filter((m) => m && typeof m.name === 'string').slice(0, 40);
      if (Array.isArray(e.sessions)) entry.sessions = e.sessions.filter((s) => s && s.from && s.to).slice(0, 12);
      if (Number(e.noModelHours) > 0) entry.noModelHours = Number(e.noModelHours);
      out.entries.push(entry);
    }
  }
  if (raw.active && typeof raw.active.start === 'string' && !Number.isNaN(Date.parse(raw.active.start))) {
    out.active = {
      start: raw.active.start,
      projectId: typeof raw.active.projectId === 'string' ? raw.active.projectId : null,
    };
  }
  const ids = new Set(out.projects.map((p) => p.id));
  out.entries.forEach((e) => { if (e.projectId && !ids.has(e.projectId)) e.projectId = null; });
  if (out.active && out.active.projectId && !ids.has(out.active.projectId)) out.active.projectId = null;
  return out;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) return sanitize(raw);
  } catch (err) {
    console.warn('Kunne ikke lese lagrede data', err);
  }
  return defaultState();
}

export const state = load();

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
}

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Kunne ikke lagre data', err);
  }
  listeners.forEach((fn) => fn());
}

export function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* --- Stempling --- */

export function clockIn(projectId) {
  if (state.active) return;
  state.active = { start: new Date().toISOString(), projectId: projectId || null };
  commit();
}

export function clockOut() {
  const a = state.active;
  if (!a) return null;
  const start = new Date(a.start);
  const end = new Date();
  const hours = Math.max(0.01, Math.round(((end - start) / 3600000) * 100) / 100);
  const entry = {
    id: uid(),
    date: isoDate(start),
    projectId: a.projectId,
    hours,
    note: '',
    start: a.start,
    end: end.toISOString(),
  };
  state.entries.push(entry);
  state.active = null;
  commit();
  return entry;
}

export function cancelActive() {
  state.active = null;
  commit();
}

/* --- Timeføringer --- */

export function addEntry({ date, projectId, hours, note, machine, start, end }) {
  const entry = { id: uid(), date, projectId: projectId || null, hours, note: note || '' };
  if (machine) entry.machine = machine;
  if (start && end) {
    entry.start = start;
    entry.end = end;
  }
  state.entries.push(entry);
  commit();
  return entry;
}

export function updateEntry(id, patch) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return null;
  Object.assign(entry, patch);
  commit();
  return entry;
}

export function deleteEntry(id) {
  const i = state.entries.findIndex((e) => e.id === id);
  if (i >= 0) {
    state.entries.splice(i, 1);
    commit();
  }
}

/* --- Prosjekter --- */

export function addProject(name, color) {
  const project = { id: uid(), name, color };
  state.projects.push(project);
  commit();
  return project;
}

export function updateProject(id, patch) {
  const project = state.projects.find((p) => p.id === id);
  if (!project) return;
  Object.assign(project, patch);
  commit();
}

export function deleteProject(id) {
  const i = state.projects.findIndex((p) => p.id === id);
  if (i < 0) return;
  state.projects.splice(i, 1);
  state.entries.forEach((e) => { if (e.projectId === id) e.projectId = null; });
  if (state.active && state.active.projectId === id) state.active.projectId = null;
  commit();
}

export function projectById(id) {
  return state.projects.find((p) => p.id === id) || null;
}

/* --- Oppslag --- */

// Dine egne føringer – også når du har valgt maskin. Kun de auto-synkede
// Infrakit-oppføringene (ik-…) hører hjemme under Maskintimer.
export function entriesOn(date) {
  return state.entries
    .filter((e) => e.date === date && !e.id.startsWith('ik-'))
    .sort((a, b) => ((a.start || '9999') < (b.start || '9999') ? -1 : 1));
}

export function machineEntriesOn(date) {
  return state.entries
    .filter((e) => e.date === date && e.id.startsWith('ik-'))
    .sort((a, b) => (a.machine < b.machine ? -1 : 1));
}

export function totalOn(date) {
  return entriesOn(date).reduce((sum, e) => sum + e.hours, 0);
}

export function weekTotal(mondayIso) {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += totalOn(addDays(mondayIso, i));
  return sum;
}

/* --- Maskintimer (Infrakit) --- */

export function nextFreeSlot() {
  const used = new Set(state.projects.map((p) => p.color));
  for (let i = 0; i < PALETTE.length; i++) if (!used.has(i)) return i;
  return state.projects.length % PALETTE.length;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9æøå]+/g, '-');

// Fletter inn maskintimer fra machine-hours.json.
// Idempotent: samme dag + maskin + prosjekt oppdateres i stedet for å dupliseres,
// og for datoene fila dekker er fila fasit – maskinføringer som er borte fra
// fila fjernes også fra appen.
// opts.scopeProjects: navn på prosjektene som faktisk ble hentet. Er den satt,
// ryddes kun i disse prosjektene – føringer fra prosjekter vi ikke fikk svar
// for blir stående urørt.
export function syncMachineHours(days, opts = {}) {
  let changed = 0;
  const seenIds = new Set();
  const seenDates = new Set();
  const scope = Array.isArray(opts.scopeProjects)
    ? new Set(opts.scopeProjects.map((n) => String(n).trim().toLowerCase()))
    : null;
  for (const item of days) {
    if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) continue;
    if (typeof item.machine !== 'string' || !item.machine.trim()) continue;
    const hours = Math.round(Number(item.hours) * 100) / 100;
    if (!Number.isFinite(hours) || hours <= 0) continue;

    let projectId = null;
    if (typeof item.project === 'string' && item.project.trim()) {
      let project = state.projects.find((p) => p.name.toLowerCase() === item.project.trim().toLowerCase());
      if (!project) {
        project = { id: uid(), name: item.project.trim().slice(0, 60), color: nextFreeSlot() };
        state.projects.push(project);
        changed++;
      }
      projectId = project.id;
    }

    const machine = item.machine.trim().slice(0, 60);
    const note = typeof item.note === 'string' ? item.note.slice(0, 900) : '';
    const start = typeof item.start === 'string' && typeof item.end === 'string' ? item.start : null;
    const end = start ? item.end : null;
    const id = `ik-${item.date}-${slug(machine)}-${slug(item.project || '')}`;
    seenDates.add(item.date);
    seenIds.add(id);
    const ekstra = {
      points: Number(item.points) > 0 ? Number(item.points) : 0,
      codes: item.codes && typeof item.codes === 'object' ? item.codes : null,
      models: Array.isArray(item.models) ? item.models : null,
      sessions: Array.isArray(item.sessions) ? item.sessions : null,
      noModelHours: Number(item.noModelHours) > 0 ? Number(item.noModelHours) : 0,
    };
    const settEkstra = (e) => {
      if (ekstra.points) e.points = ekstra.points; else delete e.points;
      if (ekstra.codes) e.codes = ekstra.codes; else delete e.codes;
      if (ekstra.models) e.models = ekstra.models; else delete e.models;
      if (ekstra.sessions) e.sessions = ekstra.sessions; else delete e.sessions;
      if (ekstra.noModelHours) e.noModelHours = ekstra.noModelHours; else delete e.noModelHours;
    };
    const existing = state.entries.find((e) => e.id === id);
    if (existing) {
      const ekstraEndret = JSON.stringify([existing.points || 0, existing.codes || null, existing.models || null, existing.sessions || null, existing.noModelHours || 0])
        !== JSON.stringify([ekstra.points, ekstra.codes, ekstra.models, ekstra.sessions, ekstra.noModelHours]);
      if (
        existing.hours !== hours || existing.projectId !== projectId || existing.note !== note ||
        (existing.start || null) !== start || (existing.end || null) !== end || ekstraEndret
      ) {
        existing.hours = hours;
        existing.projectId = projectId;
        existing.note = note;
        if (start) {
          existing.start = start;
          existing.end = end;
        } else {
          delete existing.start;
          delete existing.end;
        }
        settEkstra(existing);
        changed++;
      }
    } else {
      const entry = { id, date: item.date, projectId, hours, note, machine };
      if (start) {
        entry.start = start;
        entry.end = end;
      }
      settEkstra(entry);
      state.entries.push(entry);
      changed++;
    }
  }
  const before = state.entries.length;
  state.entries = state.entries.filter((e) => {
    const foreldet = e.machine && e.id.startsWith('ik-') && seenDates.has(e.date) && !seenIds.has(e.id);
    if (!foreldet) return true;
    if (!scope) return false;
    const p = e.projectId ? state.projects.find((x) => x.id === e.projectId) : null;
    return !scope.has(p ? p.name.trim().toLowerCase() : '');
  });
  changed += before - state.entries.length;
  if (changed) commit();
  return changed;
}

// Maskinlista fra Infrakit-API-et caches lokalt så nedtrekket virker offline.
// Hver maskin lagres som {name, projects: [prosjektnavn, ...]}.
const MACHINES_KEY = 'timeapp:machines:v2';

export function saveMachineList(machines) {
  try {
    localStorage.setItem(MACHINES_KEY, JSON.stringify({ updated: new Date().toISOString(), machines }));
  } catch (err) {
    console.warn('Kunne ikke lagre maskinliste', err);
  }
}

export function cachedMachineList() {
  try {
    const j = JSON.parse(localStorage.getItem(MACHINES_KEY));
    return j && Array.isArray(j.machines) ? j.machines : [];
  } catch {
    return [];
  }
}

// Maskiner som hører til ett bestemt prosjekt (per Infrakit), pluss maskiner
// som alt er brukt i føringer på prosjektet. Uten prosjekt: alle maskiner.
// Oppretter prosjekter fra Infrakit som ikke finnes lokalt fra før.
// Egne prosjekter røres ikke, og ingenting slettes.
export function ensureProjects(names) {
  let lagt = 0;
  for (const navn of names) {
    const rent = String(navn || '').trim().slice(0, 60);
    if (!rent) continue;
    if (state.projects.some((p) => p.name.trim().toLowerCase() === rent.toLowerCase())) continue;
    state.projects.push({ id: uid(), name: rent, color: nextFreeSlot() });
    lagt++;
  }
  if (lagt) commit();
  return lagt;
}

export function machinesForProject(projectName) {
  const cached = cachedMachineList();
  let names;
  if (projectName) {
    const target = projectName.trim().toLowerCase();
    names = cached
      .filter((m) => (m.projects || []).some((p) => String(p).trim().toLowerCase() === target))
      .map((m) => m.name);
    const project = state.projects.find((p) => p.name.trim().toLowerCase() === target);
    if (project) {
      names.push(...state.entries.filter((e) => e.machine && e.projectId === project.id).map((e) => e.machine));
    }
  } else {
    names = cached.map((m) => m.name);
    names.push(...state.entries.filter((e) => e.machine).map((e) => e.machine));
  }
  return [...new Set(names)].sort();
}

// Fletter inn egne føringer hentet fra skyen (andre enheter). Lokale
// oppføringer vinner – usendte endringer ligger i utboksen og pushes opp.
export function mergeSkyEntries(list) {
  const navn = [...new Set((list || []).map((e) => e && e.project).filter(Boolean))];
  if (navn.length) ensureProjects(navn.map(String));
  const prosjektId = new Map(state.projects.map((p) => [p.name.trim().toLowerCase(), p.id]));
  let endret = 0;
  for (const s of list || []) {
    if (!s || !s.id || !s.date || String(s.id).startsWith('ik-')) continue;
    if (state.entries.some((e) => e.id === s.id)) continue;
    const entry = {
      id: String(s.id),
      date: String(s.date),
      projectId: s.project ? prosjektId.get(String(s.project).trim().toLowerCase()) || null : null,
      hours: Number(s.hours) || 0,
      note: String(s.note || ''),
    };
    if (s.machine) entry.machine = String(s.machine);
    if (s.start && s.end) {
      entry.start = String(s.start);
      entry.end = String(s.end);
    }
    state.entries.push(entry);
    endret++;
  }
  if (endret) commit();
  return endret;
}

export function machinesForWeek(mondayIso) {
  const totals = new Map();
  for (let i = 0; i < 7; i++) {
    for (const e of machineEntriesOn(addDays(mondayIso, i))) {
      totals.set(e.machine, (totals.get(e.machine) || 0) + e.hours);
    }
  }
  return [...totals.entries()]
    .map(([machine, hours]) => ({ machine, hours }))
    .sort((a, b) => b.hours - a.hours);
}

/* --- Sikkerhetskopi --- */

export function exportJSON() {
  return JSON.stringify(
    { app: 'timeapp', version: 1, exportedAt: new Date().toISOString(), data: state },
    null,
    2
  );
}

export function importJSON(text) {
  const raw = JSON.parse(text);
  const next = sanitize(raw && raw.app === 'timeapp' ? raw.data : raw);
  state.projects = next.projects;
  state.entries = next.entries;
  state.active = next.active;
  commit();
}

export function resetAll() {
  state.projects = [];
  state.entries = [];
  state.active = null;
  commit();
}
