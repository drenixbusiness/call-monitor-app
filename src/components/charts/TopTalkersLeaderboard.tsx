'use client';

import { Box, Typography, LinearProgress, Avatar, List, ListItem, ListItemAvatar, ListItemText } from '@mui/material';
import { useGlobalContext } from '../GlobalContext';
import { getDisplayName } from '@/utils/helpers';

const avatarColors = ['#00d9f5', '#ff4566', '#9b7dff', '#00e09a', '#ffcc44', '#ff8c42', '#4db8ff', '#ff6b9d'];

export function TopTalkersLeaderboard() {
  const { users, allCalls, globalDateFilter } = useGlobalContext();
  const displayName = (u: { name: string; extensionNumber?: string; phoneNumbers?: { phoneNumber: string }[] }) => getDisplayName(u, users);

  const userStats = users.map((user, index) => {
    const userCalls = allCalls[user.id] || [];
    const filteredCalls = userCalls.filter(call => {
      const callDate = new Date(call.startTime).toISOString().split('T')[0];
      return callDate >= globalDateFilter.from && callDate <= globalDateFilter.to;
    });
    const totalTalkTime = filteredCalls.reduce((sum, call) => sum + call.duration, 0);
    return {
      user,
      talkTime: totalTalkTime,
      color: avatarColors[index % avatarColors.length],
    };
  }).sort((a, b) => b.talkTime - a.talkTime);

  const maxTalkTime = Math.max(0, ...userStats.map(s => s.talkTime));

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <List sx={{ width: '100%' }}>
      {userStats.map((stat, index) => (
        <ListItem key={stat.user.id} sx={{ px: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <Typography sx={{ minWidth: 24, fontWeight: 'bold', color: '#8892b0' }}>
              {index + 1}.
            </Typography>
            <ListItemAvatar sx={{ minWidth: 40 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: stat.color, fontSize: '0.95rem' }}>
                {stat.user.name.split(' ').map(n => n[0]).join('')}
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={displayName(stat.user)}
              secondary={formatDuration(stat.talkTime)}
              sx={{
                '& .MuiListItemText-primary': { color: '#dde2f0' },
                '& .MuiListItemText-secondary': { color: '#8892b0' },
              }}
            />
            <Box sx={{ flex: 1, mx: 2 }}>
              <LinearProgress
                variant="determinate"
                value={maxTalkTime > 0 ? (stat.talkTime / maxTalkTime) * 100 : 0}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#1e2436',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: stat.color,
                    borderRadius: 4,
                  },
                }}
              />
            </Box>
          </Box>
        </ListItem>
      ))}
    </List>
  );
}