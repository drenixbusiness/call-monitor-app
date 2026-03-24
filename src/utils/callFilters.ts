/**
 * Rules for which RingCentral results count toward the "last 500" live dashboard bucket.
 * Hangup / voicemail / declined-style results are skipped when building that 500.
 * Voicemail and calls under 30s are never shown or counted anywhere in the dashboard.
 */

import type { CallRecord } from '@/types';
import { startOfMonth, startOfWeek } from 'date-fns';

/** Newest first (fixes TEXT `start_time` DB ordering and merged multi-user fetch order). */
export function sortCallsByStartTimeDesc<T extends { startTime: string }>(calls: T[]): T[] {
  return [...calls].sort((a, b) => {
    const ta = Date.parse(a.startTime);
    const tb = Date.parse(b.startTime);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}

/** Minimum ring duration (seconds) to include a call in any dashboard view or stat. */
export const MIN_CALL_DURATION_SECONDS = 30;

const HANGUP_LIKE = new Set([
  'HungUp',
  'Hang Up',
  'Hang up',
  'Declined',
  'Disconnected',
  'Busy',
  'Rejected',
  'No Answer',
  'NoAnswer',
]);

/** True if this result should be excluded from the 500 qualifying set (not counted, not stored in that set). */
export function isExcludedFromQualified500(result: string): boolean {
  const r = (result || '').trim();
  if (!r) return true;
  if (r === 'Voicemail') return true;
  return HANGUP_LIKE.has(r);
}

/** Missed, Accepted, Call connected — the only results that count toward the 500. */
export function countsTowardQualified500(result: string): boolean {
  if (isExcludedFromQualified500(result)) return false;
  const r = (result || '').trim();
  if (r === 'Missed') return true;
  if (r === 'Accepted') return true;
  if (r === 'Call connected' || r.toLowerCase() === 'call connected') return true;
  return false;
}

export function isVoicemailResult(result: string): boolean {
  return (result || '').trim() === 'Voicemail';
}

/** True if this call may appear in dashboard / user table / stats (excludes voicemail & sub-30s). */
export function callPassesDashboardVisibility(result: string, duration: number | null | undefined): boolean {
  const sec = typeof duration === 'number' && !Number.isNaN(duration) ? duration : 0;
  if (sec < MIN_CALL_DURATION_SECONDS) return false;
  if (isVoicemailResult(result)) return false;
  return true;
}

/** For the 500 qualifying bucket: visible + only missed / accepted / connected (hangups already out). */
export function callQualifiesForTop500(result: string, duration: number | null | undefined): boolean {
  if (!callPassesDashboardVisibility(result, duration)) return false;
  return countsTowardQualified500(result);
}

export type DashboardDatePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

/**
 * Filter calls by the same rules as the dashboard header.
 * - Today: start of local calendar day → now
 * - Weekly: Monday 00:00 (local week, ISO) → now — not the same as Today
 * - Monthly: first day of current calendar month 00:00 → now
 */
export function filterCallsByDashboardPreset(
  calls: CallRecord[],
  preset: DashboardDatePreset,
  customFrom: string,
  customTo: string
): CallRecord[] {
  if (preset === 'all') return calls;
  if (preset === 'custom' && customFrom && customTo) {
    const from = new Date(customFrom);
    const toEnd = new Date(customTo);
    toEnd.setHours(23, 59, 59, 999);
    return calls.filter((c) => {
      const d = new Date(c.startTime);
      return d >= from && d <= toEnd;
    });
  }
  const now = new Date();
  if (preset === 'today') {
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    return calls.filter((c) => new Date(c.startTime) >= cutoff);
  }
  if (preset === 'week') {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    return calls.filter((c) => {
      const t = new Date(c.startTime);
      return t >= weekStart && t <= now;
    });
  }
  if (preset === 'month') {
    const monthStart = startOfMonth(now);
    return calls.filter((c) => {
      const t = new Date(c.startTime);
      return t >= monthStart && t <= now;
    });
  }
  return calls;
}
