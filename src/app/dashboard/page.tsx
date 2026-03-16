'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box, LinearProgress, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import Header from '@/components/Header/Header';
import ConfigPanel from '@/components/ConfigPanel/ConfigPanel';
import Sidebar from '@/components/Sidebar/Sidebar';
import StatsRow from '@/components/StatsRow/StatsRow';
import UserDetail from '@/components/UserDetail/UserDetail';
import DashboardOverview from '@/components/DashboardOverview/DashboardOverview';
import UserLeadsDetail from '@/components/UserLeadsDetail/UserLeadsDetail';
import { RCUser, UserCalls } from '@/types';
import { useGlobalContext } from '@/components/GlobalContext';
import { useRouter } from 'next/navigation';
import { MONDAY_USERS } from '@/components/MondaySidebar/MondaySidebar';

const WHITELIST = ['Ethan Parker', 'Fred Royce', 'Tony Safety Department'];
const WHITELIST2 = ['Winston Smith', 'Alex Chester', 'Henry Safety Department', 'Jessica Miller'];
const ALL_WHITELIST = [...WHITELIST, ...WHITELIST2];

export default function Home() {
  const { users, setUsers, allCalls, setAllCalls, selectedUser, setSelectedUser, globalDateFilter, setGlobalDateFilter } = useGlobalContext();
  const [activeView, setActiveView] = useState<'overview' | 'user' | 'monday-leads'>('overview');
  const [selectedMondayUser, setSelectedMondayUser] = useState<string | null>('Jessica');
  const [mondayLeadsCache, setMondayLeadsCache] = useState<Record<string, { leads: any[]; statusCounts: Record<string, number>; ts: number }>>({});
  const [hasMounted, setHasMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState<boolean | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [syncPhase, setSyncPhase] = useState<'idle' | 'syncing' | 'done'>('idle');
  const router = useRouter();

  const getInitialDate = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  };
  const getToday = () => new Date().toISOString().split('T')[0];

  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: '',
    jwt: '',
    dateFrom: getInitialDate(),
    dateTo: getToday()
  });

  const loadCallsFromDb = useCallback(async (filteredUsers: RCUser[]) => {
    const ids = filteredUsers.map(u => u.id).join(',');
    try {
      const res = await fetch(`/api/calls?range=all&extensionIds=${ids}`);
      const data = await res.json();
      const newMap: UserCalls = {};
      filteredUsers.forEach(u => newMap[u.id] = []);
      (data.records || []).forEach((c: any) => {
        const extId = parseInt(c.extension.id);
        if (newMap[extId] === undefined) return;
        if (c.result === 'Missed') { newMap[extId].push(c); return; }
        if ((c.result === 'Accepted' || c.result === 'Call connected') && c.duration >= 20) {
          newMap[extId].push(c);
        }
      });
      setAllCalls(newMap);
    } catch (e) {
      console.error('Failed to load calls from DB', e);
    }
  }, [setAllCalls]);

  const handleLoad = useCallback(async (savedCreds?: { clientId: string; clientSecret: string; jwt: string }) => {
    const creds = savedCreds || credentials;
    setIsLoading(true);
    setError(null);
    setStatusOk(null);

    try {
      setLoadingMsg('Connecting...');
      const tokenRes = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: creds.clientId, clientSecret: creds.clientSecret, jwt: creds.jwt })
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error || 'Authentication failed');
      const token = tokenData.access_token;
      setStatusOk(true);
      setIsCheckingAuth(false);

      let account1Users: RCUser[] = [];
      let nextUrl = '/api/rc/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1';
      while (nextUrl) {
        const usersRes = await fetch(nextUrl, { headers: { 'x-rc-auth': token } });
        const usersData = await usersRes.json();
        if (!usersRes.ok) throw new Error(usersData.error || 'Failed to load users');
        account1Users = [...account1Users, ...usersData.records];
        nextUrl = usersData.navigation?.nextPage
          ? usersData.navigation.nextPage.uri.replace('https://platform.ringcentral.com/restapi', '/api/rc')
          : '';
      }

      const filteredAccount1 = account1Users.filter(u => WHITELIST.includes(u.name));

      const acc2Res = await fetch('/api/account2/users');
      let filteredAccount2: RCUser[] = [];
      if (acc2Res.ok) {
        const acc2Data = await acc2Res.json();
        filteredAccount2 = (acc2Data.users || []).filter((u: RCUser) => WHITELIST2.includes(u.name));
      }

      const allFilteredUsers = [...filteredAccount1, ...filteredAccount2];
      setUsers(allFilteredUsers);
      if (allFilteredUsers.length > 0) setSelectedUser(allFilteredUsers[0]);

      const ids = allFilteredUsers.map(u => u.id).join(',');
      const cachedRes = await fetch(`/api/calls?range=all&extensionIds=${ids}`);
      const cachedData = await cachedRes.json();
      const hasCachedData = (cachedData.records || []).length > 0;

      if (hasCachedData) {
        await loadCallsFromDb(allFilteredUsers);
        setShowConfig(false);
        setActiveView('overview');
        setIsLoading(false);
        setSyncPhase('done');
        router.push('/dashboard');
      } else {
        setShowConfig(false);
        setActiveView('overview');
        setIsLoading(false);
        setSyncPhase('syncing');
      }

      localStorage.setItem('rc_credentials', JSON.stringify({
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        jwt: creds.jwt
      }));

      const extensionIds = filteredAccount1.map(u => u.id);
      const syncRes = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, extensionIds })
      });

      if (syncRes.ok) {
        await loadCallsFromDb(allFilteredUsers);
        setSyncPhase('done');
      }

      setIsCheckingAuth(false);

    } catch (err: any) {
      setIsCheckingAuth(false);
      setError(err.message || 'An unexpected error occurred');
      setStatusOk(false);
      setIsLoading(false);
      if (err.message?.includes('Authentication failed') || err.message?.includes('Unparseable')) {
        localStorage.removeItem('rc_credentials');
      }
      setShowConfig(true);
    }
  }, [credentials, loadCallsFromDb, setUsers, setSelectedUser, setAllCalls]);

  useEffect(() => {
    setHasMounted(true);
    const saved = localStorage.getItem('rc_credentials');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCredentials(prev => ({ ...prev, ...parsed }));
        handleLoad(parsed);
      } catch {
        localStorage.removeItem('rc_credentials');
        setShowConfig(true);
        setIsCheckingAuth(false);
      }
    } else {
      setShowConfig(true);
      setIsCheckingAuth(false);
    }
  }, []);

  const handleCredentialChange = (field: string, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectUser = (user: RCUser) => {
    setSelectedUser(user);
    setActiveView('user');
  };

  const handleMondayLeadsCacheUpdate = useCallback((user: string, data: { leads: any[]; statusCounts: Record<string, number> }) => {
    setMondayLeadsCache(prev => ({ ...prev, [user]: { ...data, ts: Date.now() } }));
  }, []);

  const status = error ? 'error' : statusOk ? 'connected' : 'idle';

  if (!hasMounted) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Header status={status} />

      {syncPhase === 'syncing' && (
        <Box sx={{ px: 2, py: 0.5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 2 }}>
          <LinearProgress sx={{ flex: 1, height: 3, borderRadius: 2, '& .MuiLinearProgress-bar': { background: 'var(--accent)' } }} />
          <Typography sx={{ fontSize: '0.75rem', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
            Fetching call history… please wait
          </Typography>
        </Box>
      )}

      <Box sx={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
        {isCheckingAuth ? (
          <Box sx={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
            <Typography sx={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>Loading...</Typography>
          </Box>
        ) : showConfig ? (
          <ConfigPanel
            credentials={credentials}
            onChange={handleCredentialChange}
            onLoad={() => handleLoad()}
            isLoading={isLoading}
            loadingMsg={loadingMsg}
            error={error}
          />
        ) : (
          <>
            <Sidebar
              users={users}
              allCalls={allCalls}
              selectedUser={selectedUser}
              onSelect={handleSelectUser}
              activeView={activeView}
              onSelectDashboard={() => setActiveView('overview')}
              onSelectMondayLeads={() => setActiveView('monday-leads')}
              selectedMondayUser={selectedMondayUser}
              onSelectMondayUser={setSelectedMondayUser}
            />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: 6 }}>
              {activeView !== 'monday-leads' && <StatsRow users={users} allCalls={allCalls} />}
              <Box sx={{ px: 3, pt: 2, pb: 1, display: 'flex', justifyContent: activeView === 'monday-leads' ? 'space-between' : 'flex-end', alignItems: 'center' }}>
                {activeView === 'monday-leads' && (
                  <Typography sx={{ fontSize: '0.9rem', color: 'var(--text2)' }}>Monday Leads · This month</Typography>
                )}
                <ToggleButtonGroup
                  value={activeView}
                  exclusive
                  onChange={(_, v) => v && setActiveView(v)}
                  size="small"
                  sx={{
                    backgroundColor: 'var(--surface2)',
                    '& .MuiToggleButton-root': {
                      color: 'var(--text2)',
                      border: '1px solid var(--border2)',
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      px: 2,
                      py: 0.5,
                      '&.Mui-selected': {
                        color: '#fff',
                        backgroundColor: 'var(--surface3)',
                      },
                    },
                  }}
                >
                  <ToggleButton value="overview">Dashboard</ToggleButton>
                  <ToggleButton value="user" disabled={!selectedUser}>
                    User detail
                  </ToggleButton>
                  <ToggleButton value="monday-leads">Monday Leads</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              {activeView === 'overview' && (
                <DashboardOverview users={users} allCalls={allCalls} />
              )}
              {activeView === 'user' && selectedUser && (
                <UserDetail
                  user={selectedUser}
                  users={users}
                  calls={allCalls[selectedUser.id] || []}
                  userIndex={users.findIndex(u => u.id === selectedUser.id)}
                  syncPhase={syncPhase}
                />
              )}
              {activeView === 'monday-leads' && selectedMondayUser && (
                <UserLeadsDetail
                  userName={selectedMondayUser}
                  userIndex={MONDAY_USERS.indexOf(selectedMondayUser as (typeof MONDAY_USERS)[number])}
                  cachedData={mondayLeadsCache[selectedMondayUser]}
                  onCacheUpdate={handleMondayLeadsCacheUpdate}
                />
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
