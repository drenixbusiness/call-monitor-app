/**
 * Telegram HR daily report: RC names, team rosters, and Monday lead mapping.
 * Safety users have no Monday boards — mondayUser is null (leads stay 0).
 *
 * Team vs admin:
 * - "Team" Telegram groups: all company workers except that company's Head HR (BP: Fred, JM: Alex).
 * - "Admin" Telegram groups: same company, full roster including Head HR.
 */

/** Head HR — excluded from BP *team* chat only. */
export const BP_HEAD_HR_RC_NAME = 'Fred Royce';

/** Head HR — excluded from JM *team* chat only. */
export const JM_HEAD_HR_RC_NAME = 'Alex Chester';

/** All RC extension names that may appear in the report (must match RingCentral). */
export const HR_REPORT_RC_NAMES = new Set([
  'Ethan Parker',
  'Fred Royce',
  'Tony Safety Department',
  'Alex Chester',
  'Winston Smith',
  'Isaac Taylor',
  'Nick Allen',
  'Simon Cooper',
  'Henry Safety Department',
  'Tim Baker',
  'Sam Adams'
]);

/** Full BP roster (admin report includes everyone here). */
export const TELEGRAM_BP_ALL_RC_NAMES = new Set([
  'Fred Royce',
  'Ethan Parker',
  'Tony Safety Department',
  'Nick Allen',
  'Sam Adams'
]);

/** Full JM roster (admin report includes everyone here). */
export const TELEGRAM_JM_ALL_RC_NAMES = new Set([
  'Alex Chester',
  'Winston Smith',
  'Isaac Taylor',
  'Henry Safety Department',
  'Simon Cooper',
  'Tim Baker'
]);

export type TelegramReportRow = { rcName: string; mondayUser: string | null };

/** Full row list (order: BP block then JM). Filter by deploy + whitelist in the route. */
export const TELEGRAM_REPORT_ROWS_ALL: readonly TelegramReportRow[] = [
  { rcName: 'Fred Royce', mondayUser: 'Fred' },
  { rcName: 'Ethan Parker', mondayUser: 'Ethan' },
  { rcName: 'Tony Safety Department', mondayUser: null },
  { rcName: 'Alex Chester', mondayUser: 'Alex Chester' },
  { rcName: 'Winston Smith', mondayUser: 'Winston' },
  { rcName: 'Isaac Taylor', mondayUser: null },
  { rcName: 'Henry Safety Department', mondayUser: null },
  { rcName: 'Simon Cooper', mondayUser: 'Simon Cooper' },
  { rcName: 'Nick Allen', mondayUser: 'Nick' },
  { rcName: 'Tim Baker', mondayUser: 'Tim Baker' },
  { rcName: 'Sam Adams', mondayUser: 'Sam' }
];

/** BP team chat: workers only (exclude Head HR Fred). */
export function filterBpTeamGroup<T extends { name: string }>(stats: T[]): T[] {
  return stats.filter((s) => TELEGRAM_BP_ALL_RC_NAMES.has(s.name) && s.name !== BP_HEAD_HR_RC_NAME);
}

/** BP admin chat: full BP including Fred. */
export function filterBpAdminGroup<T extends { name: string }>(stats: T[]): T[] {
  return stats.filter((s) => TELEGRAM_BP_ALL_RC_NAMES.has(s.name));
}

/** JM team chat: workers only (exclude Head HR Alex). */
export function filterJmTeamGroup<T extends { name: string }>(stats: T[]): T[] {
  return stats.filter((s) => TELEGRAM_JM_ALL_RC_NAMES.has(s.name) && s.name !== JM_HEAD_HR_RC_NAME);
}

/** JM admin chat: full JM including Alex. */
export function filterJmAdminGroup<T extends { name: string }>(stats: T[]): T[] {
  return stats.filter((s) => TELEGRAM_JM_ALL_RC_NAMES.has(s.name));
}
