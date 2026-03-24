'use client';

import { Box, Typography, Avatar, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { RCUser, CallRecord } from '@/types';
import { getInitials, getColor, getDisplayName } from '@/utils/helpers';
import { useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { format, addDays, startOfDay, eachDayOfInterval } from 'date-fns';
import MiniCharts from '../MiniCharts/MiniCharts';
import CallTable from '../CallTable/CallTable';
import { useGlobalContext } from '@/components/GlobalContext';
import { sortCallsByStartTimeDesc } from '@/utils/callFilters';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);
ChartJS.defaults.font.family = '"Google Sans", "Helvetica", "Arial", sans-serif';

export default function UserDetail({
  user,
  users,
  calls,
  userIndex,
  syncPhase
}: {
  user: RCUser;
  users: RCUser[];
  calls: CallRecord[];
  userIndex: number;
  syncPhase: 'idle' | 'syncing' | 'done';
}) {
  const [activeFilter, setActiveFilter] = useState<'All' | 'Outbound' | 'Inbound' | 'Missed'>('All');
  const { globalDateFilter } = useGlobalContext();
  const timeRange = globalDateFilter.preset === 'today' ? 'Daily'
    : globalDateFilter.preset === 'week' ? 'Weekly'
    : globalDateFilter.preset === 'month' ? 'Monthly'
    : globalDateFilter.preset === 'custom' ? 'Custom'
    : 'All';
  const customDateFrom = globalDateFilter.preset === 'custom' ? globalDateFilter.from : '';
  const customDateTo = globalDateFilter.preset === 'custom' ? globalDateFilter.to : '';

  const historyReady = syncPhase === 'done';

  const filteredCalls = useMemo(() => {
    let result = calls;
    if (activeFilter === 'Missed') result = result.filter(c => c.result === 'Missed');
    else if (activeFilter !== 'All') result = result.filter(c => c.direction === activeFilter);

    const now = new Date();
    const cutoff = new Date(now);
    if (timeRange === 'Daily') {
      cutoff.setDate(now.getDate() - 1);
      result = result.filter(c => new Date(c.startTime) >= cutoff);
    } else if (timeRange === 'Weekly') {
      cutoff.setDate(now.getDate() - 7);
      result = result.filter(c => new Date(c.startTime) >= cutoff);
    } else if (timeRange === 'Monthly') {
      cutoff.setMonth(now.getMonth() - 1);
      result = result.filter(c => new Date(c.startTime) >= cutoff);
    } else if (timeRange === 'All') {
      // no filter - keep all calls
    } else if (timeRange === 'Custom') {
      if (customDateFrom) result = result.filter(c => new Date(c.startTime) >= new Date(customDateFrom));
      if (customDateTo) {
        const to = new Date(customDateTo);
        to.setHours(23, 59, 59, 999);
        result = result.filter(c => new Date(c.startTime) <= to);
      }
    }

    return sortCallsByStartTimeDesc(result);
  }, [calls, activeFilter, timeRange, customDateFrom, customDateTo]);

  const maxDuration = useMemo(() => {
    if (!filteredCalls.length) return 1;
    return Math.max(...filteredCalls.map(c => c.duration));
  }, [filteredCalls]);

  const [missedChartFilter, setMissedChartFilter] = useState<'today' | 'week' | 'month' | 'custom'>('week');
  const missedCallsForChart = useMemo(() => {
    const missed = calls.filter(c => c.result === 'Missed');
    const now = new Date();
    if (missedChartFilter === 'today') {
      const todayStart = startOfDay(now);
      return missed.filter(c => new Date(c.startTime) >= todayStart);
    }
    if (missedChartFilter === 'week') {
      const weekAgo = addDays(now, -7);
      return missed.filter(c => new Date(c.startTime) >= weekAgo);
    }
    if (missedChartFilter === 'month') {
      const monthAgo = addDays(now, -30);
      return missed.filter(c => new Date(c.startTime) >= monthAgo);
    }
    const last500 = calls.slice(-500);
    return last500.filter(c => c.result === 'Missed');
  }, [calls, missedChartFilter]);

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
      const last500 = calls.slice(-500);
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
  }, [missedCallsForChart, missedChartFilter, calls]);

  const handleFilterChange = (event: React.MouseEvent<HTMLElement>, newFilter: typeof activeFilter) => {
    if (newFilter !== null) setActiveFilter(newFilter);
  };

  const phoneNumbersString = user.phoneNumbers
      ? user.phoneNumbers.map(n => n.phoneNumber).filter(Boolean).join(', ')
      : 'No direct number';

  const userColor = getColor(userIndex);

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 4, pb: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <Avatar sx={{ bgcolor: userColor, width: 64, height: 64, borderRadius: 3, fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
            {getInitials(user.name)}
          </Avatar>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text)', mb: 0.5 }}>
              {getDisplayName(user, users)}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text2)' }}>
                {phoneNumbersString}
              </Typography>
              <Typography sx={{ fontSize: '0.95rem', color: 'var(--text3)' }}>
                Ext {user.extensionNumber} &middot; {user.contact?.department || 'Unknown Dept'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <ToggleButtonGroup
          value={activeFilter}
          exclusive
          onChange={handleFilterChange}
          color="primary"
          size="small"
          sx={{
            backgroundColor: 'var(--surface2)',
            '& .MuiToggleButton-root': {
              color: 'var(--text2)',
              border: '1px solid var(--border2)',
              textTransform: 'none',
              fontWeight: 600,
              px: 2,
              '&.Mui-selected': {
                color: '#fff',
                backgroundColor: activeFilter === 'Outbound' ? 'var(--accent)' 
                               : activeFilter === 'Inbound' ? 'var(--purple)' 
                               : activeFilter === 'Missed' ? 'var(--red)' 
                               : 'var(--accent)',
              }
            }
          }}
        >
          <ToggleButton value="All">All</ToggleButton>
          <ToggleButton value="Outbound">Outbound</ToggleButton>
          <ToggleButton value="Inbound">Inbound</ToggleButton>
          <ToggleButton value="Missed">Missed</ToggleButton>
        </ToggleButtonGroup>
        </Box>
      </Box>

      <MiniCharts user={user} calls={filteredCalls} userIndex={userIndex} color={userColor} />

      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Box sx={{ width: '100%', maxWidth: '100%', backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>
              Missed calls over time
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

      <CallTable calls={filteredCalls} maxDuration={maxDuration} />
    </Box>
  );
}
