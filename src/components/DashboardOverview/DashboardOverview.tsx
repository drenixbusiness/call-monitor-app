'use client';

import { Box, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { Pie, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js';
import { RCUser, UserCalls, CallRecord } from '@/types';
import { fmtDuration, getDisplayName, getColor } from '@/utils/helpers';
import { useMemo, useState } from 'react';
import { useGlobalContext } from '@/components/GlobalContext';
import WaitingDashboard from './WaitingDashboard';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);
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

  const filteredByUser = useMemo(() => {
    const result: Record<number, CallRecord[]> = {};
    if (timeRange === 'All') {
      users.forEach((u) => {
        result[u.id] = allCalls[u.id] || [];
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
          const calls = allCalls[u.id] || [];
          result[u.id] = calls.filter((c) => {
            const d = new Date(c.startTime);
            return d >= from && d <= toEnd;
          });
        });
        return result;
      }
    }

    users.forEach((u) => {
      const calls = allCalls[u.id] || [];
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

          </Box>
        )}
      </Box>
    </Box>
  );
}