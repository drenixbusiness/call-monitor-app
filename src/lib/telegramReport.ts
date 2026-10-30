import { WHITELIST_ACCOUNT1, WHITELIST_ACCOUNT2 } from '@/lib/whitelist';

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

/** RC name -> Monday user name mapping */
export const RC_TO_MONDAY_USER: Record<string, string | null> = {
  'Fred Royce': 'Fred',
  'Carla Connor': 'Carla',
  'Ethan Parker': 'Ethan',
  'Tony Safety Department': null,
  'Alex Chester': 'Alex Chester',
  'Winston Smith': 'Winston',
  'Isaac Taylor': null,
  'Henry Safety Department': null,
  'Simon Cooper': 'Simon Cooper',
  'Nick Allen': 'Nick',
  'Tim Baker': 'Tim Baker',
  'HR Sam': 'Sam',
  'Oliver Clark': 'Oliver',
  'John Brooks': 'John',
};

/** Full BP roster (admin report includes everyone here). */
export const TELEGRAM_BP_ALL_RC_NAMES = new Set<string>(WHITELIST_ACCOUNT1);

/** Full JM roster (admin report includes everyone here). */
export const TELEGRAM_JM_ALL_RC_NAMES = new Set<string>(WHITELIST_ACCOUNT2);

/** All RC extension names that may appear in the report (must match RingCentral). */
export const HR_REPORT_RC_NAMES = new Set<string>([
  ...WHITELIST_ACCOUNT1,
  ...WHITELIST_ACCOUNT2,
]);

export type TelegramReportRow = { rcName: string; mondayUser: string | null };

/** Full row list (order: BP block then JM). Filter by deploy + whitelist in the route. */
export const TELEGRAM_REPORT_ROWS_ALL: readonly TelegramReportRow[] = [
  ...WHITELIST_ACCOUNT1.map((rcName) => ({
    rcName,
    mondayUser: RC_TO_MONDAY_USER[rcName] ?? null,
  })),
  ...WHITELIST_ACCOUNT2.map((rcName) => ({
    rcName,
    mondayUser: RC_TO_MONDAY_USER[rcName] ?? null,
  })),
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
