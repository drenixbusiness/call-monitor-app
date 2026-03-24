import { getClientDeployAccount } from '@/lib/deployAccount';

const LEGACY_KEY = 'rc_credentials';

/** One key per deploy so BP/JDM logins do not overwrite each other on the same origin (e.g. localhost). */
export function getRcCredentialsStorageKey(): string {
  const d = getClientDeployAccount();
  if (d === 'account1') return 'rc_credentials_account1';
  if (d === 'account2') return 'rc_credentials_account2';
  return LEGACY_KEY;
}

export function clearRcCredentialsFromStorage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LEGACY_KEY);
  localStorage.removeItem('rc_credentials_account1');
  localStorage.removeItem('rc_credentials_account2');
}
