import type { RcDeployAccount } from '@/lib/deployAccount';

/**
 * Filter leads by Company column for BP vs JDM deployments.
 * Values like "BP", "JDM", "JM" in Monday — adjust if your board uses different text.
 */
export function leadMatchesDeployCompany(companyRaw: string, deploy: RcDeployAccount | null): boolean {
  if (!deploy) return true;
  const c = (companyRaw || '').trim().toLowerCase();
  if (!c) return false;
  if (deploy === 'account1') {
    return (c.includes('bp') || c === 'bp') && !c.includes('jdm') && !/\bjm\b/.test(c);
  }
  return c.includes('jdm') || c.includes('jm') || /\bjm\b/.test(c) || c.includes('jdm/jm');
}
