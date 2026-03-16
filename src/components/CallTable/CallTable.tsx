'use client';

import { Box, Typography, Chip, LinearProgress } from '@mui/material';
import { CallRecord } from '@/types';
import { fmtDate, fmtDuration } from '@/utils/helpers';
import PhoneDisabledIcon from '@mui/icons-material/PhoneDisabled';

export default function CallTable({ calls, maxDuration }: { calls: CallRecord[], maxDuration: number }) {
  if (calls.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 8 }}>
        <PhoneDisabledIcon sx={{ fontSize: 48, color: 'var(--text3)', mb: 2 }} />
        <Typography sx={{ color: 'var(--text2)', fontWeight: 600 }}>No calls matching filter</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, height: '500px', minHeight: '500px' }}>
      <Box sx={{ p: 3, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ fontWeight: 700 }}>Call History</Typography>
        <Typography sx={{ color: 'var(--text2)', fontSize: '0.95rem' }}>{calls.length} records</Typography>
      </Box>

      <Box sx={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <Box component="thead" sx={{ borderBottom: '1px solid var(--border2)', backgroundColor: 'var(--surface2)', position: 'sticky', top: 0, zIndex: 1 }}>
            <Box component="tr">
              <Box component="th" sx={{ p: 2, fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 600 }}>Direction</Box>
              <Box component="th" sx={{ p: 2, fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 600 }}>Number</Box>
              <Box component="th" sx={{ p: 2, fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 600 }}>Contact</Box>
              <Box component="th" sx={{ p: 2, fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 600 }}>Date & Time</Box>
              <Box component="th" sx={{ p: 2, fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 600 }}>Duration</Box>
              <Box component="th" sx={{ p: 2, fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 600 }}>Result</Box>
            </Box>
          </Box>
          <Box component="tbody">
            {calls.map((call, index) => {
              const isOutbound = call.direction === 'Outbound';
              const contactMatch = isOutbound ? call.to : call.from;
              
              const rowDelay = `${Math.min(index * 0.05, 0.5)}s`;

              return (
                <Box 
                  component="tr" 
                  key={call.id} 
                  sx={{ 
                    borderBottom: '1px solid var(--border2)', 
                    animation: 'rowIn 0.3s ease-out forwards',
                    animationDelay: rowDelay,
                    opacity: 0,
                    '&:hover': { backgroundColor: 'var(--surface2)' }
                  }}
                >
                  <Box component="td" sx={{ p: 2 }}>
                    <Chip 
                      label={isOutbound ? '↑ OUT' : '↓ IN'} 
                      size="small"
                      sx={{ 
                          height: 22, 
                          fontSize: '0.9rem', 
                          fontWeight: 700, 
                          backgroundColor: isOutbound ? 'rgba(0, 217, 245, 0.1)' : 'rgba(155, 125, 255, 0.1)',
                          color: isOutbound ? 'var(--accent)' : 'var(--purple)',
                          border: `1px solid ${isOutbound ? 'var(--accent)' : 'var(--purple)'}`
                      }} 
                    />
                  </Box>
                  <Box component="td" sx={{ p: 2, fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>
                    {contactMatch?.phoneNumber || 'Unknown'}
                  </Box>
                  <Box component="td" sx={{ p: 2, fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>
                    {contactMatch?.name || '—'}
                  </Box>
                  <Box component="td" sx={{ p: 2, fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text2)' }}>
                    {fmtDate(call.startTime)}
                  </Box>
                  <Box component="td" sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <LinearProgress 
                        variant="determinate" 
                        value={(call.duration / maxDuration) * 100}
                        sx={{ 
                            width: 70, height: 3, borderRadius: 1.5, 
                            backgroundColor: 'var(--border2)',
                            '& .MuiLinearProgress-bar': { backgroundColor: 'var(--text2)' }
                        }}
                      />
                      <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text)' }}>
                        {fmtDuration(call.duration)}
                      </Typography>
                    </Box>
                  </Box>
                  <Box component="td" sx={{ p: 2 }}>
                    <Typography sx={{ 
                        fontSize: '0.9rem', fontWeight: 600,
                        color: call.result === 'Accepted' ? 'var(--green)' 
                             : call.result === 'Missed' ? 'var(--red)' 
                             : call.result === 'Voicemail' ? 'var(--yellow)' 
                             : 'var(--text2)'
                    }}>
                      {call.result}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
