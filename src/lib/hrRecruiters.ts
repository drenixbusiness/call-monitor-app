/**
 * HR recruiters (Monday sidebar / legacy naming).
 * Safety users are not on Monday — see `telegramReport.ts` for Telegram RC lists.
 */

export const HR_RECRUITERS = [
  'Alex Chester',
  'Fred',
  'Ethan',
  'Winston',
  'Jessica',
] as const;

/** Monday API user param -> RC full name (for extension lookup) */
export const MONDAY_TO_RC_NAME: Record<string, string> = {
  'Alex Chester': 'Alex Chester',
  'Fred': 'Fred Royce',
  'Ethan': 'Ethan Parker',
  'Winston': 'Winston Smith',
  'Jessica': 'Jessica Miller',
};
