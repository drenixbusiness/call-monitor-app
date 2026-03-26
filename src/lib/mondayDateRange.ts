/** This month's range in US Central (same as /api/monday/leads). */
export function getThisMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(Date.UTC(y, m, 1, 6, 0, 0, 0));
  const to = new Date(Date.UTC(y, m + 1, 1, 5, 59, 59, 999));
  return { from, to };
}
