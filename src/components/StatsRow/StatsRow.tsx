'use client';

import { Box, Typography } from '@mui/material';
import { RCUser, UserCalls, CallRecord } from '@/types';
import { fmtDuration } from '@/utils/helpers';
import { useMemo } from 'react';
import { useGlobalContext } from '@/components/GlobalContext';

function filterCallsByTimeRange(calls: CallRecord[], preset: string): CallRecord[] {
  if (preset === 'all') return calls;
  const now = new Date();
  const cutoff = new Date(now);
  if (preset === 'today') cutoff.setDate(now.getDate() - 1);
  else if (preset === 'week') cutoff.setDate(now.getDate() - 7);
  else if (preset === 'month') cutoff.setMonth(now.getMonth() - 1);
  return calls.filter((c) => new Date(c.startTime) >= cutoff);
}

export default function StatsRow({ users, allCalls }: { users: RCUser[], allCalls: UserCalls }) {
  const { globalDateFilter } = useGlobalContext();

  const { totalCalls, totalDuration, totalOutbound, totalMissed } = useMemo(() => {
    let callsCount = 0;
    let durationSum = 0;
    let outboundCount = 0;
    let missedCount = 0;

    const preset = globalDateFilter.preset;
    const isCustom = preset === 'custom';
    const from = globalDateFilter.from ? new Date(globalDateFilter.from) : null;
    const to = globalDateFilter.to ? new Date(globalDateFilter.to) : null;

    Object.values(allCalls).forEach((calls: CallRecord[]) => {
      let filtered: CallRecord[];
      if (isCustom && from && to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        filtered = calls.filter((c) => {
          const d = new Date(c.startTime);
          return d >= from && d <= toEnd;
        });
      } else {
        filtered = filterCallsByTimeRange(calls, preset);
      }
      callsCount += filtered.length;
      filtered.forEach((c: CallRecord) => {
        durationSum += c.duration;
        if (c.direction === 'Outbound') outboundCount++;
        if (c.result === 'Missed') missedCount++;
      });
    });

    return { totalCalls: callsCount, totalDuration: durationSum, totalOutbound: outboundCount, totalMissed: missedCount };
  }, [allCalls, globalDateFilter]);

  const stats = [
    { label: 'TOTAL USERS', value: users.length.toString(), color: 'var(--accent)' },
    { label: 'TOTAL CALLS', value: totalCalls.toLocaleString(), color: 'var(--red)' },
    { label: 'TALK TIME', value: fmtDuration(totalDuration), color: 'var(--purple)' },
    { label: 'OUTBOUND', value: totalOutbound.toLocaleString(), color: 'var(--green)' },
    { label: 'MISSED', value: totalMissed.toLocaleString(), color: 'var(--yellow)' },
  ];

  return (
    <Box sx={{ 
        display: 'flex', 
        borderBottom: '1px solid var(--border)', 
        animation: 'fadeUp 0.6s ease-out forwards',
        backgroundColor: 'var(--surface)'
    }}>
      {stats.map((stat, i) => (
        <Box key={i} sx={{ 
            flex: 1, 
            p: 3, 
            borderRight: i < stats.length - 1 ? '1px solid var(--border2)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 1
        }}>
          <Typography sx={{ 
              fontSize: '0.95rem', 
              fontFamily: 'var(--font-mono)', 
              color: 'var(--text2)', 
              fontWeight: 600,
              letterSpacing: '0.5px'
          }}>
            {stat.label}
          </Typography>
          <Typography sx={{ 
              fontSize: '2.2rem', 
              fontWeight: 700, 
              color: stat.color,
              lineHeight: 1
          }}>
            {stat.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
