'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { RCUser, UserCalls, CallRecord } from '@/types';
import { getClientDeployAccount } from '@/lib/deployAccount';
import { getRcCredentialsStorageKey } from '@/lib/rcCredentialsStorage';
import { WHITELIST_ACCOUNT1, WHITELIST_ACCOUNT2 } from '@/lib/whitelist';

interface GlobalDateFilter {
  preset: 'today' | 'week' | 'month' | 'all' | 'custom';
  from: string;
  to: string;
}

export interface WaitingUserStat {
  name: string;
  calls: WaitingCallRecord[];
  totalCalls: number;
  talkTime: number;
  outbound: number;
  inbound: number;
  missed: number;
  voicemail: number;
  hangup: number;
  connected: number;
}

export interface WaitingCallRecord {
  id: string;
  direction: string;
  duration: number;
  startTime: string;
  result: string;
  from: { phoneNumber?: string; name?: string };
  to: { phoneNumber?: string; name?: string };
}

interface WaitingFetchState {
  isFetching: boolean;
  progress: string;
  error: string | null;
  hasFetched: boolean;
}

interface GlobalContextType {
  accessToken: string | null;
  users: RCUser[];
  allCalls: UserCalls;
  rawCalls: UserCalls;
  selectedUser: RCUser | null;
  globalDateFilter: GlobalDateFilter;
  isBootstrapping: boolean;
  bootstrapProgress: string;
  credentials: { clientId: string; clientSecret: string; jwt: string };
  waitingStats: WaitingUserStat[];
  waitingFetchState: WaitingFetchState;
  setAccessToken: (token: string | null) => void;
  setUsers: (users: RCUser[]) => void;
  setAllCalls: (calls: UserCalls) => void;
  setRawCalls: (calls: UserCalls) => void;
  setSelectedUser: (user: RCUser | null) => void;
  setGlobalDateFilter: (filter: GlobalDateFilter) => void;
  setIsBootstrapping: (bootstrapping: boolean) => void;
  setBootstrapProgress: (progress: string) => void;
  setCredentials: (credentials: { clientId: string; clientSecret: string; jwt: string }) => void;
  runWaitingFetch: (fromDate: Date, toDate: Date) => Promise<void>;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export function useGlobalContext() {
  const context = useContext(GlobalContext);
  if (!context) {
    throw new Error('useGlobalContext must be used within a GlobalProvider');
  }
  return context;
}

/** RingCentral max perPage for call-log; use 1000 to avoid truncating users with 100+ calls */
const CALL_LOG_PER_PAGE = 1000;

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 5): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    await sleep(1200);
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const wait = retryAfter ? parseInt(retryAfter) * 1000 : 60000 * (attempt + 1);
      console.log(`429 hit, waiting ${wait / 1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }
  throw new Error('Max retries exceeded');
}

/** RingCentral returns various result values for hangups; UI shows "Hang Up", API may use "HungUp" or "Hang Up" */
const HANGUP_RESULTS = ['HungUp', 'Hang Up', 'Hang up', 'Declined', 'Disconnected', 'Busy', 'Rejected'];
function isHangupResult(result: string): boolean {
  return HANGUP_RESULTS.includes(result || '');
}

interface GlobalProviderProps {
  children: ReactNode;
}

export function GlobalProvider({ children }: GlobalProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [users, setUsers] = useState<RCUser[]>([]);
  const [allCalls, setAllCalls] = useState<UserCalls>({});
  const [rawCalls, setRawCalls] = useState<UserCalls>({});
  const [selectedUser, setSelectedUser] = useState<RCUser | null>(null);
  const [globalDateFilter, setGlobalDateFilter] = useState<GlobalDateFilter>({
    preset: 'today',
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapProgress, setBootstrapProgress] = useState('');
  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: '',
    jwt: '',
  });

  // Waiting dashboard state
  const [waitingStats, setWaitingStats] = useState<WaitingUserStat[]>([]);
  const [waitingFetchState, setWaitingFetchState] = useState<WaitingFetchState>({
    isFetching: false,
    progress: '',
    error: null,
    hasFetched: false,
  });

  const runWaitingFetch = async (fromDate: Date, toDate: Date) => {
    setWaitingFetchState({ isFetching: true, progress: 'Authenticating...', error: null, hasFetched: false });
    setWaitingStats([]);

    try {
      const saved = localStorage.getItem(getRcCredentialsStorageKey());
      if (!saved) throw new Error('Not logged in. Please log in first.');
      const creds = JSON.parse(saved);

      const tokenRes = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error || 'Auth failed');
      const token = tokenData.access_token;

      const deploy = getClientDeployAccount();
      setWaitingFetchState(prev => ({
        ...prev,
        progress: deploy ? 'Fetching users…' : 'Fetching users from both accounts...',
      }));
      await sleep(1200);

      const usersRes1 = await fetch(
        '/api/rc/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1',
        { headers: { 'x-rc-auth': token } }
      );
      const usersData1 = await usersRes1.json();
      const rcRecords = usersData1.records || [];

      let targetUsers: { id: string; name: string; _account: 'account1' | 'account2' }[] = [];

      if (deploy === 'account2') {
        targetUsers = rcRecords
          .filter((u: any) => WHITELIST_ACCOUNT2.includes(u.name))
          .map((u: any) => ({ ...u, _account: 'account2' as const }));
      } else if (deploy === 'account1') {
        targetUsers = rcRecords
          .filter((u: any) => WHITELIST_ACCOUNT1.includes(u.name))
          .map((u: any) => ({ ...u, _account: 'account1' as const }));
      } else {
        const account1Users = rcRecords.filter((u: any) => WHITELIST_ACCOUNT1.includes(u.name));
        const usersRes2 = await fetch('/api/account2/users');
        const usersData2 = await usersRes2.json();
        const account2Users = usersData2.users || [];
        targetUsers = [
          ...account1Users.map((u: any) => ({ ...u, _account: 'account1' as const })),
          ...account2Users.map((u: any) => ({ ...u, _account: 'account2' as const })),
        ];
      }

      // Use full ISO: dateFrom = start of day, dateTo = end of day (RingCentral interprets date-only as midnight, which excludes the end date)
      const dateFrom = fromDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
      const toEnd = new Date(toDate);
      toEnd.setHours(23, 59, 59, 999);
      const dateTo = toEnd.toISOString();

      const results: WaitingUserStat[] = [];

      for (let i = 0; i < targetUsers.length; i++) {
        const user = targetUsers[i];
        setWaitingFetchState(prev => ({
          ...prev,
          progress: `Fetching calls for ${user.name} (${i + 1}/${targetUsers.length})...`
        }));

        const calls: WaitingCallRecord[] = [];
        const seenSessionIds = new Set<string>();
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          let data: any;
          if (user._account === 'account1' || deploy === 'account2') {
            const url = `/api/rc/v1.0/account/~/extension/${user.id}/call-log?view=Detailed&type=Voice&dateFrom=${dateFrom}&dateTo=${dateTo}&page=${page}&perPage=${CALL_LOG_PER_PAGE}`;
            data = await fetchWithRetry(url, { 'x-rc-auth': token });
          } else {
            await sleep(1200);
            const url = `/api/account2/call-log?extensionId=${encodeURIComponent(user.id)}&dateFrom=${dateFrom}&dateTo=${dateTo}&page=${page}&perPage=${CALL_LOG_PER_PAGE}`;
            const res = await fetch(url);
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || `Account 2 fetch failed for ${user.name}`);
            }
            data = await res.json();
          }

          const records = data.records || [];

          records.forEach((call: any) => {
            const sessionKey = call.sessionId ?? call.id;
            if (seenSessionIds.has(sessionKey)) return;
            seenSessionIds.add(sessionKey);
            calls.push({
              id: call.id,
              direction: call.direction,
              duration: call.duration,
              startTime: call.startTime,
              result: call.result,
              from: call.from,
              to: call.to,
            });
          });

          hasMore = records.length >= CALL_LOG_PER_PAGE;
          page++;
          if (page > 50) break; // safety: max 50k calls per user
        }

        results.push({
          name: user.name,
          calls,
          totalCalls: calls.length,
          talkTime: calls.reduce((acc, c) => acc + c.duration, 0),
          outbound: calls.filter(c => c.direction === 'Outbound').length,
          inbound: calls.filter(c => c.direction === 'Inbound').length,
          missed: calls.filter(c => c.result === 'Missed').length,
          voicemail: calls.filter(c => c.result === 'Voicemail').length,
          hangup: calls.filter(c => isHangupResult(c.result)).length,
          connected: calls.filter(c => c.result === 'Accepted' || c.result === 'Call connected').length,
        });
      }

      setWaitingStats(results);
      setWaitingFetchState({ isFetching: false, progress: '', error: null, hasFetched: true });

    } catch (err: any) {
      setWaitingFetchState({ isFetching: false, progress: '', error: err.message, hasFetched: false });
    }
  };

  return (
    <GlobalContext.Provider
      value={{
        accessToken,
        users,
        allCalls,
        rawCalls,
        selectedUser,
        globalDateFilter,
        isBootstrapping,
        bootstrapProgress,
        credentials,
        waitingStats,
        waitingFetchState,
        setAccessToken,
        setUsers,
        setAllCalls,
        setRawCalls,
        setSelectedUser,
        setGlobalDateFilter,
        setIsBootstrapping,
        setBootstrapProgress,
        setCredentials,
        runWaitingFetch,
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
}