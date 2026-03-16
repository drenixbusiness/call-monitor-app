'use client';

import { useRouter } from 'next/navigation';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useGlobalContext } from '@/components/GlobalContext';
import NavSidebar from '@/components/NavSidebar';

export default function UsersPage() {
  const { users, allCalls, selectedUser, globalDateFilter } = useGlobalContext();
  const router = useRouter();

  const handleBannerClick = () => {
    router.push('/dashboard');
  };

  return (
    <Box suppressHydrationWarning sx={{ display: 'flex', height: '100vh', backgroundColor: '#07090f', color: '#dde2f0' }}>
      <NavSidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box
          sx={{
            p: 2,
            backgroundColor: '#0e1118',
            borderBottom: '1px solid #1e2436',
            cursor: 'pointer',
            '&:hover': { backgroundColor: '#141720' }
          }}
          onClick={handleBannerClick}
        >
          <Typography sx={{ color: '#8892b0', fontSize: '0.95rem' }}>
            Showing data for: {globalDateFilter.preset} · Change in Dashboard
          </Typography>
        </Box>
        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          {selectedUser ? (
            <Card sx={{ backgroundColor: '#0e1118', border: '1px solid #1e2436' }}>
              <CardContent>
                <Typography variant="h5" sx={{ mb: 2 }}>{selectedUser.name}</Typography>
                <Typography>Calls: {allCalls[selectedUser.id]?.length || 0}</Typography>
              </CardContent>
            </Card>
          ) : (
            <Typography>Select a user from the sidebar</Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
