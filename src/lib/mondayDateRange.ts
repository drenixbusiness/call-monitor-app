/**
 * Main-dashboard date windows (US Central). Does not import `@/utils/leadShift` — DST offset is inlined below
 * so Turbopack never depends on `getCentralOffsetHours` from that module.
 */
import { differenceInCalendarDays, subDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

const CHICAGO = 'America/Chicago';

/** Same rules as `leadShift.ts` — kept local so this module does not depend on that file (avoids bundler export issues). */
function centralOffsetHoursForYmd(year: number, month: number, day: number): number {
  const getFirstSunday = (y: number, m: number) => {
    const first = new Date(Date.UTC(y, m, 1));
    const firstDow = first.getUTCDay();
    return firstDow === 0 ? 1 : 8 - firstDow;
  };
  const marchSecondSun = getFirstSunday(year, 2) + 7;
  const novFirstSun = getFirstSunday(year, 10);
  const d = new Date(Date.UTC(year, month, day));
  const dstStart = new Date(Date.UTC(year, 2, marchSecondSun));
  const dstEnd = new Date(Date.UTC(year, 10, novFirstSun));
  const inDST = d >= dstStart && d < dstEnd;
  return inDST ? -5 : -6;
}

/** Y/M/D calendar parts for a Date in US Central (America/Chicago). */
export function centralDateParts(d: Date): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = fmt.formatToParts(d);
  let y = 0;
  let m = 0;
  let day = 0;
  for (const p of parts) {
    if (p.type === 'year') y = +p.value;
    if (p.type === 'month') m = +p.value - 1;
    if (p.type === 'day') day = +p.value;
  }
  return { y, m, day };
}

/** Start (00:00) and end (23:59:59.999) of a calendar day in US Central, as UTC Dates. */
export function getCentralDayBounds(y: number, m: number, d: number): { from: Date; to: Date } {
  const offset = centralOffsetHoursForYmd(y, m, d);
  const startHour = 0 - offset;
  const from = new Date(Date.UTC(y, m, d, startHour, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, d + 1, startHour, 0, 0, 0) - 1);
  return { from, to };
}

export function getTodayRangeCentral(): { from: Date; to: Date } {
  const { y, m, day } = centralDateParts(new Date());
  return getCentralDayBounds(y, m, day);
}

/** Today plus the previous six calendar days in US Central (7 days inclusive). */
export function getRollingWeekRangeCentral(): { from: Date; to: Date } {
  const { y, m, day } = centralDateParts(new Date());
  const pad = (n: number) => String(n).padStart(2, '0');
  const noonChicago = fromZonedTime(`${y}-${pad(m + 1)}-${pad(day)}T12:00:00`, CHICAGO);
  const weekStartNoon = subDays(noonChicago, 6);
  const { y: ys, m: ms, day: ds } = centralDateParts(weekStartNoon);
  return {
    from: getCentralDayBounds(ys, ms, ds).from,
    to: getCentralDayBounds(y, m, day).to,
  };
}

/** First through last calendar day of the current month in US Central. */
export function getThisMonthRange(): { from: Date; to: Date } {
  const { y, m } = centralDateParts(new Date());
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    from: getCentralDayBounds(y, m, 1).from,
    to: getCentralDayBounds(y, m, lastDay).to,
  };
}

export const MAX_MAIN_DASH_CUSTOM_DAYS = 30;

export function inclusiveCalendarDaysYmd(fromStr: string, toStr: string): number | null {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const mf = re.exec(fromStr.trim());
  const mt = re.exec(toStr.trim());
  if (!mf || !mt) return null;
  const d1 = new Date(Date.UTC(+mf[1], +mf[2] - 1, +mf[3]));
  const d2 = new Date(Date.UTC(+mt[1], +mt[2] - 1, +mt[3]));
  if (d1 > d2) return null;
  return differenceInCalendarDays(d2, d1) + 1;
}

export function isCustomRangeValid(fromStr: string, toStr: string): boolean {
  const [a, b] = [fromStr.trim(), toStr.trim()].sort();
  const days = inclusiveCalendarDaysYmd(a, b);
  return days !== null && days >= 1 && days <= MAX_MAIN_DASH_CUSTOM_DAYS;
}

/** Parse YYYY-MM-DD as US Central calendar days; returns sorted range. */
export function parseYmdCentralRange(fromStr: string, toStr: string): { from: Date; to: Date } | null {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const mf = re.exec(fromStr.trim());
  const mt = re.exec(toStr.trim());
  if (!mf || !mt) return null;
  const fy = +mf[1];
  const fm = +mf[2] - 1;
  const fd = +mf[3];
  const ty = +mt[1];
  const tm = +mt[2] - 1;
  const td = +mt[3];
  let from = getCentralDayBounds(fy, fm, fd).from;
  let to = getCentralDayBounds(ty, tm, td).to;
  if (from.getTime() > to.getTime()) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  return { from, to };
}

export type MainDashPreset = 'today' | 'week' | 'month';

export function resolveMainDashboardRange(
  preset: string | null,
  dateFrom: string | null,
  dateTo: string | null
): { from: Date; to: Date } {
  if (dateFrom || dateTo) {
    if (!dateFrom || !dateTo) {
      throw new Error('Pass both dateFrom and dateTo for a custom range (YYYY-MM-DD, US Central)');
    }
    const parsed = parseYmdCentralRange(dateFrom, dateTo);
    if (!parsed) throw new Error('Invalid dateFrom or dateTo (use YYYY-MM-DD)');
    if (!isCustomRangeValid(dateFrom, dateTo)) {
      throw new Error(`Custom range must be 1–${MAX_MAIN_DASH_CUSTOM_DAYS} calendar days (US Central)`);
    }
    return parsed;
  }

  const p = (preset || 'month').toLowerCase();
  if (p === 'today') return getTodayRangeCentral();
  if (p === 'week') return getRollingWeekRangeCentral();
  if (p === 'month') return getThisMonthRange();
  throw new Error('Invalid preset (use today, week, or month) or pass dateFrom and dateTo');
}
