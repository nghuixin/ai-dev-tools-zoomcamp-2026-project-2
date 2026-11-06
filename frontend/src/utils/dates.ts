const pad = (n: number) => String(n).padStart(2, "0");

/** JavaScript's offset in minutes (UTC − local), which the API uses to find local day boundaries. */
export const tzOffset = () => new Date().getTimezoneOffset();

/** Today as YYYY-MM-DD in local time. */
export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Value for <input type="datetime-local">, in local time. */
export function localInputValue(d = new Date()): string {
  return `${todayISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value -> ISO instant with timezone. */
export function localInputToISO(v: string): string {
  return new Date(v).toISOString();
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

/** ISO week like 2026-W45 for a local date. */
export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

/** Monday of an ISO week, as a local Date. */
export function isoWeekMonday(week: string): Date {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = new Date(y, 0, 4);
  const monday1 = new Date(y, 0, 4 - ((jan4.getDay() + 6) % 7));
  return new Date(monday1.getFullYear(), monday1.getMonth(), monday1.getDate() + (w - 1) * 7);
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const TIME_FMT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "5 Nov 2026" from YYYY-MM-DD (local) */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return DATE_FMT.format(new Date(y, m - 1, d));
}

/** "5 Nov 2026, 08:05" from an ISO instant, shown in local time */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${DATE_FMT.format(d)}, ${TIME_FMT.format(d)}`;
}

export function fmtWeek(week: string): string {
  const mon = isoWeekMonday(week);
  return `${week} (w/c ${DATE_FMT.format(mon)})`;
}

export function daysUntil(iso: string, from = todayISO()): number {
  const a = new Date(from + "T00:00:00"), b = new Date(iso + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
