/**
 * HR recruiters for daily Telegram report.
 * 5 users (excludes Tony Safety Department, Henry Safety Department).
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
