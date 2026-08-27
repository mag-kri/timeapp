// Datoverktøy – alle datoer i appen er lokale kalenderdatoer på formen YYYY-MM-DD.

export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return isoDate(new Date());
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function mondayOf(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}

// ISO 8601-ukenummer (uker starter på mandag, uke 1 inneholder årets første torsdag)
export function isoWeek(iso) {
  const t = parseISO(iso);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  const week = 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { week, year: t.getFullYear() };
}

const fmtWeekdayShort = new Intl.DateTimeFormat('nb-NO', { weekday: 'short' });
const fmtDayMonth = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const fmtFull = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });

export function weekdayShort(iso) {
  return fmtWeekdayShort.format(parseISO(iso));
}

export function dateLabel(iso) {
  return fmtFull.format(parseISO(iso));
}

export function dayMonth(iso) {
  return fmtDayMonth.format(parseISO(iso));
}

export function weekRangeLabel(mondayIso) {
  const a = parseISO(mondayIso);
  const b = parseISO(addDays(mondayIso, 6));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}.–${fmtDayMonth.format(b)}`;
  return `${fmtDayMonth.format(a)}–${fmtDayMonth.format(b)}`;
}

// Timer vises med norsk desimalkomma: 7.5 -> "7,5"
export function fmtHours(h) {
  return String(Math.round(h * 100) / 100).replace('.', ',');
}

export function parseHours(str) {
  if (typeof str !== 'string' || str.trim() === '') return NaN;
  const n = Number(str.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function fmtTime(isoDateTime) {
  const d = new Date(isoDateTime);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtElapsed(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
