/**
 * Single-tenant deploy: set the same value on each Vercel project:
 *   RC_DEPLOY_ACCOUNT=account1 | account2
 *   NEXT_PUBLIC_RC_DEPLOY_ACCOUNT=account1 | account2
 *
 * BP project: account1 + that company's RC_* only (no RC2_*).
 * JDM project: account2 + that company's RC_* only (no RC2_*).
 *
 * Omit both → legacy one-app mode (both accounts, RC2_* for second tenant).
 */

export type RcDeployAccount = 'account1' | 'account2';

function normalize(raw: string | undefined): RcDeployAccount | null {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'account1' || v === '1' || v === 'a' || v === 'bp') return 'account1';
  if (v === 'account2' || v === '2' || v === 'b' || v === 'jdm') return 'account2';
  return null;
}

export function getServerDeployAccount(): RcDeployAccount | null {
  return normalize(process.env.RC_DEPLOY_ACCOUNT || process.env.NEXT_PUBLIC_RC_DEPLOY_ACCOUNT);
}

export function getClientDeployAccount(): RcDeployAccount | null {
  return normalize(process.env.NEXT_PUBLIC_RC_DEPLOY_ACCOUNT);
}

export function deployAccountLabel(a: RcDeployAccount): string {
  return a === 'account1' ? 'BP (RingCentral account 1)' : 'JDM (RingCentral account 2)';
}
