/**
 * Shift-aware late/on-time logic for leads.
 * All times in US Central. Shift: Mon–Fri 8am–5pm, Sat 8am–4pm, Sunday off.
 * (Converted from Tashkent 7pm–4am / Sat 7pm–2am)
 * SLA: Call within 10 minutes of lead arrival during shift.
 */

const SLA_MINUTES = 10;

/** US Central DST: 2nd Sunday March – 1st Sunday November. Returns offset in hours (e.g. -5 for CDT, -6 for CST). */
function getCentralOffsetHours(year: number, month: number, day: number): number {
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

/**
 * Parse a date string as US Central time. Leads arrive in US Central.
 */
export function parseAsUSCentral(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s) return null;

  let year: number, month: number, day: number, hour: number, min: number, sec: number;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    [, year, month, day, hour, min, sec] = isoMatch.map((x, i) => (i > 0 ? parseInt(x || '0', 10) : 0));
    month -= 1;
  } else {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
    hour = d.getHours();
    min = d.getMinutes();
    sec = d.getSeconds();
  }

  const offset = getCentralOffsetHours(year, month, day);
  const offsetStr = offset >= 0 ? `+${String(offset).padStart(2, '0')}:00` : `-${String(-offset).padStart(2, '0')}:00`;
  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}${offsetStr}`;
  const parsed = new Date(iso);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Get US Central local time components from a Date (UTC) */
function toUSCentral(date: Date): { hours: number; dayOfWeek: number } {
  const utcMs = date.getTime();
  const offset = getCentralOffsetHours(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const centralMs = utcMs + offset * 60 * 60 * 1000;
  const t = new Date(centralMs);
  return {
    hours: t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCMilliseconds() / 3600000,
    dayOfWeek: t.getUTCDay(),
  };
}

/** Shift hours in US Central (converted from Tashkent 7pm–4am). CDT: 9am–6pm, CST: 8am–5pm. Sat ends 4pm/3pm. */
export function getShiftHours(date: Date): { start: number; end: number } {
  const offset = getCentralOffsetHours(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const isCDT = offset === -5;
  return {
    start: isCDT ? 9 : 8,
    end: isCDT ? 18 : 17,
  };
}

function isWithinShift(date: Date): boolean {
  const { hours, dayOfWeek } = toUSCentral(date);
  if (dayOfWeek === 0) return false;
  const { start, end } = getShiftHours(date);
  if (dayOfWeek === 6) return hours >= start && hours < (end - 2);
  return hours >= start && hours < end;
}

/** Get the start of the next shift (US Central) as a Date */
function getNextShiftStart(date: Date): Date {
  if (isWithinShift(date)) return date;

  const { hours, dayOfWeek } = toUSCentral(date);
  const offset = getCentralOffsetHours(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const centralMs = date.getTime() + offset * 60 * 60 * 1000;
  const centralDate = new Date(centralMs);
  const y = centralDate.getUTCFullYear();
  const m = centralDate.getUTCMonth();
  const d = centralDate.getUTCDate();

  const { start, end } = getShiftHours(date);
  const satEnd = end - 2;
  let daysToAdd = 0;
  if (dayOfWeek === 0) daysToAdd = 1;
  else if (hours >= end || (dayOfWeek === 6 && hours >= satEnd)) daysToAdd = 1;

  const utcHour = start - offset;
  return new Date(Date.UTC(y, m, d + daysToAdd, utcHour, 0, 0, 0));
}

function getEffectiveSlaStart(leadArrival: Date): Date {
  if (isWithinShift(leadArrival)) return leadArrival;
  return getNextShiftStart(leadArrival);
}

export type LeadTimingResult = 'On time' | 'Late' | 'Pending';

/**
 * Get call time interval in seconds (from effective SLA start to date contacted).
 * Returns null if no date contacted.
 */
export function getCallTimeIntervalSeconds(
  leadArrival: Date | null,
  dateContacted: Date | null
): number | null {
  if (!leadArrival || isNaN(leadArrival.getTime())) return null;
  if (!dateContacted || isNaN(dateContacted.getTime())) return null;

  const effectiveStart = getEffectiveSlaStart(leadArrival);
  const diffMs = dateContacted.getTime() - effectiveStart.getTime();
  return Math.max(0, Math.round(diffMs / 1000));
}

/** Format seconds as "Xm Ys" (e.g. "5m 30s", "12m 0s") */
export function formatCallTimeInterval(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/**
 * Determine if a lead was called on time or late.
 * All times in US Central. 10 min SLA from effective start during shift.
 * If interval > 10 min during shift = Late.
 */
export function getLeadTiming(
  leadArrival: Date | null,
  dateContacted: Date | null
): LeadTimingResult {
  if (!leadArrival || isNaN(leadArrival.getTime())) return 'Pending';
  if (!dateContacted || isNaN(dateContacted.getTime())) return 'Pending';

  const effectiveStart = getEffectiveSlaStart(leadArrival);
  const deadline = new Date(effectiveStart.getTime() + SLA_MINUTES * 60 * 1000);

  return dateContacted.getTime() <= deadline.getTime() ? 'On time' : 'Late';
}

/**
 * Get shift window (8am–5pm US Central) for a given date as ISO strings.
 * Used for daily report: reportDate = UTC date when cron runs at 23:00.
 */
export function getShiftWindowISO(reportDate: Date): { from: string; to: string } {
  const y = reportDate.getUTCFullYear();
  const m = reportDate.getUTCMonth();
  const d = reportDate.getUTCDate();
  const offset = getCentralOffsetHours(y, m, d);
  const startHour = 8 - offset;
  const endHour = 17 - offset;
  const from = new Date(Date.UTC(y, m, d, startHour, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, d, endHour, 59, 59, 999));
  return { from: from.toISOString(), to: to.toISOString() };
}
