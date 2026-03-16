'use client';

import { Box, Typography } from '@mui/material';
import { RCUser, CallRecord } from '@/types';
import { fmtDuration } from '@/utils/helpers';
import { useMemo } from 'react';

export default function MiniCharts({ 
    user, calls, userIndex, color 
}: { 
    user: RCUser; 
    calls: CallRecord[]; 
    userIndex: number; 
    color: string;
}) {
  const { dailyCounts, outCount, inCount, missedCount, maxDaily, totalTime } = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    let outCount = 0;
    let inCount = 0;
    let missedCount = 0;
    let totalTime = 0;

    calls.forEach(c => {
      const day = new Date(c.startTime).getDay();
      counts[day]++;
      totalTime += c.duration;
      if (c.direction === 'Outbound') outCount++;
      if (c.direction === 'Inbound') inCount++;
      if (c.result === 'Missed') missedCount++;
    });

    return { 
      dailyCounts: counts, 
      outCount, 
      inCount, 
      missedCount, 
      maxDaily: Math.max(...counts, 1),
      totalTime
    };
  }, [calls]);

  const total = outCount + inCount || 1; 
  const outPercent = (outCount / total) * 100;
  const inPercent = (inCount / total) * 100;
  
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const outDash = (outPercent / 100) * circumference;
  const inDash = (inPercent / 100) * circumference;

  const recentCalls = calls.slice(0, 20);

  const cardStyle = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    p: 3,
    height: '100%',
    display: 'flex',
    flexDirection: 'column'
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, animation: 'fadeUp 0.6s ease-out forwards' }}>
      
      <Box sx={cardStyle}>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text2)', mb: 2 }}>
          CALLS BY DAY
        </Typography>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1, height: 100 }}>
          {dailyCounts.map((count, i) => {
             const heightPct = `${(count / maxDaily) * 100}%`;
             return (
               <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flex: 1 }}>
                 <Box sx={{ 
                     width: '100%', 
                     backgroundColor: count > 0 ? `${color}80` : 'var(--surface3)', 
                     height: heightPct,
                     minHeight: 4,
                     borderRadius: 1,
                     transition: 'height 0.3s'
                 }} />
                 <Typography sx={{ fontSize: '0.85rem', color: 'var(--text3)' }}>
                   {['S','M','T','W','T','F','S'][i]}
                 </Typography>
               </Box>
             );
          })}
        </Box>
      </Box>

      <Box sx={cardStyle}>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text2)', mb: 2 }}>
          DIRECTION SPLIT
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
          <Box sx={{ position: 'relative', width: 54, height: 54 }}>
            <svg width="54" height="54" viewBox="0 0 54 54" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="27" cy="27" r={radius} fill="none" stroke="var(--surface3)" strokeWidth="6" />
              <circle cx="27" cy="27" r={radius} fill="none" stroke="var(--accent)" strokeWidth="6" 
                strokeDasharray={`${outDash} ${circumference}`} />
              <circle cx="27" cy="27" r={radius} fill="none" stroke="var(--purple)" strokeWidth="6" 
                strokeDasharray={`${inDash} ${circumference}`} strokeDashoffset={-outDash} />
            </svg>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--text)' }}><Box component="span" sx={{ color: 'var(--accent)', mr: 1 }}>●</Box>{outCount} Outbound</Typography>
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--text)' }}><Box component="span" sx={{ color: 'var(--purple)', mr: 1 }}>●</Box>{inCount} Inbound</Typography>
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--text3)' }}><Box component="span" sx={{ color: 'var(--red)', mr: 1 }}>●</Box>{missedCount} Missed</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={cardStyle}>
         <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
           <Typography sx={{ fontSize: '1.6rem', fontWeight: 700, color }}>
             {fmtDuration(totalTime)}
           </Typography>
           <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text2)' }}>
             {calls.length} CALLS
           </Typography>
         </Box>
         
         <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
           <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
             {recentCalls.map((c, i) => (
               <Box key={c.id} sx={{ 
                 width: 8, height: 8, borderRadius: '50%',
                 backgroundColor: c.result === 'Missed' ? 'var(--red)' : c.direction === 'Outbound' ? 'var(--accent)' : 'var(--purple)'
               }} title={`${c.direction} - ${c.result}`} />
             ))}
           </Box>
           <Typography sx={{ fontSize: '0.85rem', color: 'var(--text3)' }}>← most recent</Typography>
         </Box>
      </Box>

    </Box>
  );
}
