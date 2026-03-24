'use client';

import { AppBar, Toolbar, Box, Typography, Chip, Button } from '@mui/material';
import { useEffect, useState } from 'react';
import { clearRcCredentialsFromStorage } from '@/lib/rcCredentialsStorage';

export default function Header({ status }: { status: 'idle' | 'connected' | 'error' }) {
  const [time, setTime] = useState<string | null>(null);

  const handleLogout = () => {
    clearRcCredentialsFromStorage();
    window.location.reload();
  };

  useEffect(() => {
    const fmt = () => new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago',
    });
    setTime(fmt());
    const interval = setInterval(() => setTime(fmt()), 60000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'var(--green)';
      case 'error': return 'var(--red)';
      default: return 'var(--text2)';
    }
  };

  return (
    <AppBar
      position="sticky"
      sx={{
        height: 56,
        backgroundColor: 'rgba(14, 17, 24, 0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'none',
        backgroundImage: 'none',
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ minHeight: '56px !important', height: 56, px: 3, justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{
            width: 32, height: 32,
            borderRadius: 1.5,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--surface2)'
          }}>
            <Box sx={{
              width: 8, height: 8,
              borderRadius: '50%',
              backgroundColor: getStatusColor(),
              animation: status === 'connected' ? 'breathe 2s infinite ease-in-out' : 'none',
              transition: 'background-color 0.3s'
            }} />
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.3rem', letterSpacing: '-0.5px' }}>
            HR<Box component="span" sx={{ color: 'var(--accent)' }}>Monitoring</Box>
          </Typography>

          <Box sx={{ height: 20, width: '1px', backgroundColor: 'var(--border2)' }} />

          <Chip
            label="RingCentral"
            size="small"
            sx={{
              height: 24,
              backgroundColor: 'var(--surface3)',
              color: 'var(--text2)',
              fontSize: '0.95rem',
              fontWeight: 600
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{
              width: 6, height: 6,
              borderRadius: '50%',
              backgroundColor: 'var(--green)',
              animation: 'breathe 2s infinite ease-in-out'
            }} />
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--green)', letterSpacing: '1px' }}>
              LIVE
            </Typography>
          </Box>

          <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text2)' }}>
            {time ?? ''}
          </Typography>

          <Button
            size="small"
            onClick={handleLogout}
            sx={{
              color: 'var(--text3)',
              fontSize: '0.8rem',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { color: 'var(--red)' }
            }}
          >
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}