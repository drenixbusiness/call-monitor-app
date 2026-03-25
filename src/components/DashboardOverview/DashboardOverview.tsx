'use client';

import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import { Pie, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
} from 'chart.js';
import { RCUser, UserCalls, CallRecord } from '@/types';
import { format, addDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { fmtDuration, getDisplayName, getColor } from '@/utils/helpers';
import { useMemo, useState, useEffect } from 'react';
import { useGlobalContext } from '@/components/GlobalContext';
import WaitingDashboard from './WaitingDashboard';
import { Line } from 'react-chartjs-2';
import { sortCallsByStartTimeDesc } from '@/utils/callFilters';

const normalizeExtKey = (id: string | number) => String(id).replace(/\.0$/, '');

function callsForUser(u: RCUser, allCalls: UserCalls): CallRecord[] {
  const key = normalizeExtKey(u.id);
  return allCalls[key] ?? allCalls[u.id] ?? [];
}

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler
);
ChartJS.defaults.font.family = '"Google Sans", "Helvetica", "Arial", sans-serif';

type TimeRange = 'Daily' | 'Weekly' | 'Monthly' | 'All' | 'Custom';

export default function DashboardOverview({
  users,
  allCalls,
}: {
  users: RCUser[];
  allCalls: UserCalls;
}) {
  const { globalDateFilter, setGlobalDateFilter } = useGlobalContext();
  const [dashTab, setDashTab] = useState<'live' | 'custom'>('live');

  const timeRange: TimeRange =
    globalDateFilter.preset === 'today' ? 'Daily'
      : globalDateFilter.preset === 'week' ? 'Weekly'
        : globalDateFilter.preset === 'month' ? 'Monthly'
          : globalDateFilter.preset === 'custom' ? 'Custom'
            : 'All';

  /** All whitelisted users' calls merged (same keys as dashboard `allCalls`). */
  const allCallsFlat = useMemo(() => {
    const list: CallRecord[] = [];
    users.forEach((u) => {
      list.push(...callsForUser(u, allCalls));
    });
    return sortCallsByStartTimeDesc(list);
  }, [users, allCalls]);

  const [missedChartFilter, setMissedChartFilter] = useState<'today' | 'week' | 'month' | 'custom'>('week');
  const missedCallsForChart = useMemo(() => {
    const missed = allCallsFlat.filter((c) => c.result === 'Missed');
    const now = new Date();
    if (missedChartFilter === 'today') {
      const todayStart = startOfDay(now);
      return missed.filter((c) => new Date(c.startTime) >= todayStart);
    }
    if (missedChartFilter === 'week') {
      const weekAgo = addDays(now, -7);
      return missed.filter((c) => new Date(c.startTime) >= weekAgo);
    }
    if (missedChartFilter === 'month') {
      const monthAgo = addDays(now, -30);
      return missed.filter((c) => new Date(c.startTime) >= monthAgo);
    }
    const asc = [...allCallsFlat].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
    const last500 = asc.slice(-500);
    return last500.filter((c) => c.result === 'Missed');
  }, [allCallsFlat, missedChartFilter]);

  const missedLineData = useMemo(() => {
    const now = new Date();
    let days: Date[] = [];
    if (missedChartFilter === 'today') {
      days = Array.from({ length: 24 }, (_, i) => {
        const d = new Date(now);
        d.setHours(i, 0, 0, 0);
        return d;
      });
    } else if (missedChartFilter === 'week') {
      days = eachDayOfInterval({ start: addDays(now, -7), end: now });
    } else if (missedChartFilter === 'month') {
      days = eachDayOfInterval({ start: addDays(now, -30), end: now });
    } else {
      const asc = [...allCallsFlat].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
      const last500 = asc.slice(-500);
      if (last500.length === 0) return { labels: [] as string[], data: [] as number[] };
      const minDate = startOfDay(new Date(last500[0].startTime));
      const maxDate = new Date(last500[last500.length - 1].startTime);
      days = eachDayOfInterval({ start: minDate, end: maxDate });
    }
    const buckets: { label: string; count: number }[] = days.map((d) => ({
      label: missedChartFilter === 'today' ? `${d.getHours()}:00` : format(d, 'MMM d'),
      count: 0,
    }));
    const keyToIndex: Record<string, number> = {};
    days.forEach((d, i) => {
      keyToIndex[missedChartFilter === 'today' ? String(d.getHours()) : format(d, 'yyyy-MM-dd')] = i;
    });
    missedCallsForChart.forEach((c) => {
      const d = new Date(c.startTime);
      const key = missedChartFilter === 'today' ? String(d.getHours()) : format(d, 'yyyy-MM-dd');
      if (keyToIndex[key] !== undefined) buckets[keyToIndex[key]].count += 1;
    });
    return {
      labels: buckets.map((b) => b.label),
      data: buckets.map((b) => b.count),
    };
  }, [missedCallsForChart, missedChartFilter, allCallsFlat]);

  const filteredByUser = useMemo(() => {
    const result: Record<number, CallRecord[]> = {};
    if (timeRange === 'All') {
      users.forEach((u) => {
        result[u.id] = callsForUser(u, allCalls);
      });
      return result;
    }

    const now = new Date();
    const cutoff = new Date(now);
    if (timeRange === 'Daily') cutoff.setDate(now.getDate() - 1);
    else if (timeRange === 'Weekly') cutoff.setDate(now.getDate() - 7);
    else if (timeRange === 'Monthly') cutoff.setMonth(now.getMonth() - 1);
    else if (timeRange === 'Custom') {
      const from = globalDateFilter.from ? new Date(globalDateFilter.from) : null;
      const to = globalDateFilter.to ? new Date(globalDateFilter.to) : null;
      if (from && to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        users.forEach((u) => {
          const calls = callsForUser(u, allCalls);
          result[u.id] = calls.filter((c) => {
            const d = new Date(c.startTime);
            return d >= from && d <= toEnd;
          });
        });
        return result;
      }
    }

    users.forEach((u) => {
      const calls = callsForUser(u, allCalls);
      result[u.id] = calls.filter((c) => new Date(c.startTime) >= cutoff);
    });
    return result;
  }, [users, allCalls, timeRange, globalDateFilter.from, globalDateFilter.to]);

  const perUserStats = useMemo(() => {
    return users.map((u) => {
      const calls = filteredByUser[u.id] || [];
      let duration = 0, outbound = 0, inbound = 0, missed = 0, connected = 0;
      calls.forEach((c) => {
        duration += c.duration;
        if (c.direction === 'Outbound') outbound += 1;
        if (c.direction === 'Inbound') inbound += 1;
        if (c.result === 'Missed') missed += 1;
        if (c.result === 'Call connected' || c.result === 'Accepted') connected += 1;
      });
      return { id: u.id, name: getDisplayName(u, users), callsCount: calls.length, duration, outbound, inbound, missed, connected };
    });
  }, [users, filteredByUser]);

  const [compareUserId, setCompareUserId] = useState<string>('');

  useEffect(() => {
    if (users.length === 0) return;
    setCompareUserId((prev) =>
      prev && users.some((u) => String(u.id) === prev) ? prev : String(users[0].id)
    );
  }, [users]);

  const compareStats = useMemo(() => {
    if (!compareUserId) return null;
    return perUserStats.find((s) => String(s.id) === compareUserId) ?? null;
  }, [perUserStats, compareUserId]);

  const compareUserIndex = useMemo(
    () => users.findIndex((u) => String(u.id) === compareUserId),
    [users, compareUserId]
  );

  const totalCalls = perUserStats.reduce((acc, u) => acc + u.callsCount, 0) || 1;

  const topCaller = perUserStats.reduce(
    (best, cur) => (cur.callsCount > best.callsCount ? cur : best),
    perUserStats[0] || { id: 0, name: '', callsCount: 0, duration: 0, outbound: 0, inbound: 0, missed: 0, connected: 0 }
  );

  const pieData = {
    labels: perUserStats.map((u) => u.name),
    datasets: [{
      data: perUserStats.map((u) => u.callsCount),
      backgroundColor: perUserStats.map((_, i) => getColor(i)),
      borderColor: 'rgba(0,0,0,0.2)',
      borderWidth: 1,
    }],
  };

  const talkTimeBarData = {
    labels: perUserStats.map((u) => u.name),
    datasets: [{
      label: 'Talk time (minutes)',
      data: perUserStats.map((u) => Math.round(u.duration / 60)),
      backgroundColor: perUserStats.map((_, i) => getColor(i)),
    }],
  };

  const directionBarData = {
    labels: perUserStats.map((u) => u.name),
    datasets: [
      { label: 'Outbound', data: perUserStats.map((u) => u.outbound), backgroundColor: 'rgba(0,217,245,0.7)', stack: 'calls' },
      { label: 'Inbound', data: perUserStats.map((u) => u.inbound), backgroundColor: 'rgba(155,125,255,0.7)', stack: 'calls' },
      { label: 'Missed', data: perUserStats.map((u) => u.missed), backgroundColor: 'rgba(255,69,102,0.8)', stack: 'calls' },
    ],
  };

  const chartLabelFont = { size: 14 };
  const chartTickFont = { size: 13 };
  const talkTimeBarOptions = {
    responsive: true,
    plugins: { legend: { labels: { color: '#ffffff', font: chartLabelFont } }, tooltip: { bodyColor: '#ffffff', titleColor: '#ffffff', bodyFont: { size: 14 }, titleFont: { size: 15 } } },
    scales: { x: { ticks: { color: '#ffffff', font: chartTickFont }, grid: { color: 'var(--border2)' } }, y: { ticks: { color: '#ffffff', font: chartTickFont }, grid: { color: 'var(--border2)' } } },
  };
  const directionBarOptions = {
    responsive: true,
    plugins: { legend: { labels: { color: '#ffffff', font: chartLabelFont } }, tooltip: { bodyColor: '#ffffff', titleColor: '#ffffff', bodyFont: { size: 14 }, titleFont: { size: 15 } } },
    scales: { x: { stacked: true, ticks: { color: '#ffffff', font: chartTickFont }, grid: { color: 'var(--border2)' } }, y: { stacked: true, ticks: { color: '#ffffff', font: chartTickFont }, grid: { color: 'var(--border2)' } } },
  };

  const toggleSx = {
    backgroundColor: 'var(--surface2)',
    '& .MuiToggleButton-root': {
      color: 'var(--text2)',
      border: '1px solid var(--border2)',
      textTransform: 'none',
      fontWeight: 600,
      fontSize: '0.95rem',
      px: 2,
      py: 0.5,
      '&.Mui-selected': { color: '#fff', backgroundColor: 'var(--surface3)' },
    },
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Tab bar */}
      <Box sx={{ px: 3, pt: 2, pb: 1.5, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <ToggleButtonGroup
          value={dashTab}
          exclusive
          onChange={(_, v) => v && setDashTab(v)}
          size="small"
          sx={toggleSx}
        >
          <ToggleButton value="live">Live Overview</ToggleButton>
          <ToggleButton value="custom">Custom Range</ToggleButton>
        </ToggleButtonGroup>

        {/* Time range picker — only shown on live tab */}
        {dashTab === 'live' && (
          <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={(_, v) => {
              if (!v) return;
              const preset = v === 'Daily' ? 'today' : v === 'Weekly' ? 'week' : v === 'Monthly' ? 'month' : 'all';
              const from = new Date();
              if (v === 'Daily') from.setDate(from.getDate() - 1);
              else if (v === 'Weekly') from.setDate(from.getDate() - 7);
              else if (v === 'Monthly') from.setMonth(from.getMonth() - 1);
              else if (v === 'All') from.setFullYear(from.getFullYear() - 10); // arbitrary old date for "all"
              setGlobalDateFilter({ preset, from: from.toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] });
            }}
            size="small"
            sx={toggleSx}
          >
            <ToggleButton value="Daily">Today</ToggleButton>
            <ToggleButton value="Weekly">Weekly</ToggleButton>
            <ToggleButton value="Monthly">Monthly</ToggleButton>
            <ToggleButton value="All">All</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      {/* Scrollable content area */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {dashTab === 'custom' ? (
          <WaitingDashboard />
        ) : (
          <Box sx={{ p: 3, pb: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Subtitle */}
            <Box>
              <Typography sx={{ fontSize: '1.35rem', fontWeight: 700 }}>Team Call Overview</Typography>
              <Typography sx={{ fontSize: '0.9rem', color: 'var(--text2)' }}>
                {timeRange === 'All' ? 'All time' : `Last ${timeRange.toLowerCase()}`} · {totalCalls} calls · Top caller:{' '}
                {topCaller?.name || 'N/A'} ({topCaller?.callsCount || 0} calls,{' '}
                {fmtDuration(topCaller?.duration || 0)})
              </Typography>
            </Box>

            {/* One place: calls count + talk time (+ direction breakdown) for selected user */}
            {users.length > 0 && (
              <Box
                sx={{
                  backgroundColor: 'var(--surface)',
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  borderLeft: '4px solid',
                  borderLeftColor: compareUserIndex >= 0 ? getColor(compareUserIndex) : 'var(--accent)',
                  p: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2.5,
                }}
              >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 2, justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>
                    User snapshot — calls &amp; talk time
                  </Typography>
                  <FormControl size="small" sx={{ minWidth: 260 }}>
                    <InputLabel id="dash-compare-user-label">User</InputLabel>
                    <Select
                      labelId="dash-compare-user-label"
                      label="User"
                      value={compareUserId}
                      onChange={(e) => setCompareUserId(String(e.target.value))}
                      sx={{ color: 'var(--text)', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border2)' } }}
                    >
                      {users.map((u) => (
                        <MenuItem key={String(u.id)} value={String(u.id)}>
                          {getDisplayName(u, users)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>

                {compareStats ? (
                  <>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                        gap: 3,
                      }}
                    >
                      <Box
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          backgroundColor: 'var(--surface2)',
                          border: '1px solid var(--border2)',
                        }}
                      >
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--text3)', fontWeight: 600, mb: 0.5 }}>
                          Calls in range
                        </Typography>
                        <Typography sx={{ fontSize: '2.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                          {compareStats.callsCount}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          backgroundColor: 'var(--surface2)',
                          border: '1px solid var(--border2)',
                        }}
                      >
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--text3)', fontWeight: 600, mb: 0.5 }}>
                          Talk time
                        </Typography>
                        <Typography sx={{ fontSize: '2.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                          {fmtDuration(compareStats.duration)}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.8rem', color: 'var(--text3)', fontWeight: 600, mr: 0.5 }}>
                        By direction
                      </Typography>
                      <Chip
                        size="small"
                        label={`Outbound ${compareStats.outbound}`}
                        sx={{ backgroundColor: 'rgba(0,217,245,0.15)', color: 'var(--accent)', border: '1px solid rgba(0,217,245,0.35)', fontWeight: 600 }}
                      />
                      <Chip
                        size="small"
                        label={`Inbound ${compareStats.inbound}`}
                        sx={{ backgroundColor: 'rgba(155,125,255,0.15)', color: 'var(--purple)', border: '1px solid rgba(155,125,255,0.35)', fontWeight: 600 }}
                      />
                      <Chip
                        size="small"
                        label={`Missed ${compareStats.missed}`}
                        sx={{ backgroundColor: 'rgba(255,69,102,0.12)', color: 'var(--red)', border: '1px solid rgba(255,69,102,0.35)', fontWeight: 600 }}
                      />
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ color: 'var(--text3)', fontSize: '0.9rem' }}>Select a user to see stats.</Typography>
                )}
              </Box>
            )}

            {/* Charts row 1 */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.8fr)', gap: 3 }}>
              <Box sx={{ backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>
                  Calls share by user
                </Typography>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <Pie data={pieData} options={{ plugins: { legend: { labels: { color: '#ffffff', boxWidth: 16, font: { size: 14 } } }, tooltip: { bodyColor: '#ffffff', titleColor: '#ffffff', bodyFont: { size: 14 }, titleFont: { size: 15 } } } }} />
                </Box>
              </Box>

              <Box sx={{ backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>
                  Talk time by user
                </Typography>
                <Bar data={talkTimeBarData} options={talkTimeBarOptions} />
              </Box>
            </Box>

            {/* Charts row 2 */}
            <Box sx={{ backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>
                Inbound / outbound / missed by user
              </Typography>
              <Bar data={directionBarData} options={directionBarOptions} />
            </Box>


            <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <Box sx={{ width: '100%', maxWidth: '100%', backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>
                    Missed calls over time (all users)
                  </Typography>
                  <ToggleButtonGroup
                    value={missedChartFilter}
                    exclusive
                    onChange={(_, v) => v && setMissedChartFilter(v)}
                    size="small"
                    sx={{
                      backgroundColor: 'var(--surface2)',
                      '& .MuiToggleButton-root': {
                        color: 'var(--text2)',
                        border: '1px solid var(--border2)',
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        px: 2,
                        py: 0.5,
                        '&.Mui-selected': { color: '#fff', backgroundColor: 'var(--surface3)' },
                      },
                    }}
                  >
                    <ToggleButton value="today">Today</ToggleButton>
                    <ToggleButton value="week">Week</ToggleButton>
                    <ToggleButton value="month">Month</ToggleButton>
                    <ToggleButton value="custom">Custom (last 500)</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                {missedLineData.labels.length > 0 ? (
                  <Box sx={{ height: 220, width: '100%' }}>
                    <Line
                      data={{
                        labels: missedLineData.labels,
                        datasets: [{
                          label: 'Missed',
                          data: missedLineData.data,
                          borderColor: '#ff4566',
                          backgroundColor: 'rgba(255, 69, 102, 0.15)',
                          fill: true,
                          tension: 0.3,
                        }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { labels: { color: '#ffffff', font: { size: 14 } } },
                          tooltip: { bodyColor: '#ffffff', titleColor: '#ffffff', bodyFont: { size: 14 }, titleFont: { size: 15 } },
                        },
                        scales: {
                          x: {
                            ticks: { color: '#ffffff', font: { size: 13 }, maxRotation: 45 },
                            grid: { color: 'var(--border2)' },
                          },
                          y: {
                            ticks: { color: '#ffffff', font: { size: 13 } },
                            grid: { color: 'var(--border2)' },
                          },
                        },
                      }}
                    />
                  </Box>
                ) : (
                  <Box sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '0.95rem' }}>
                    No missed calls in selected range
                  </Box>
                )}
              </Box>
            </Box>

          </Box>
        )}
      </Box>
    </Box>
  );
}