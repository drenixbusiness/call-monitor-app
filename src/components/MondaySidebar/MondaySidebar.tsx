'use client';

import { Box, Drawer, Typography, List, ListItemButton, Avatar } from '@mui/material';
import { getColor } from '@/utils/helpers';

export const MONDAY_USERS = ['Alex Chester', 'Fred', 'Ethan', 'Winston', 'Jessica'] as const;

interface MondaySidebarProps {
  selectedUser: string | null;
  onSelectUser: (user: string) => void;
}

export default function MondaySidebar({ selectedUser, onSelectUser }: MondaySidebarProps) {
  return (
    <Drawer
      variant="permanent"
      PaperProps={{
        style: {
          top: 56,
        },
      }}
      sx={{
        width: 300,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 300,
          boxSizing: 'border-box',
          backgroundColor: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          top: 56,
          height: 'calc(100vh - 56px)',
          maxHeight: 'calc(100vh - 56px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text2)' }}>
          USERS
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', color: 'var(--text3)' }}>
          Click to view this month&apos;s leads
        </Typography>
      </Box>

      <List sx={{ p: 0, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {MONDAY_USERS.map((user, index) => {
          const isActive = selectedUser === user;
          return (
            <ListItemButton
              key={user}
              onClick={() => onSelectUser(user)}
              selected={isActive}
              sx={{
                py: 2,
                borderBottom: '1px solid var(--border)',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                backgroundColor: isActive ? 'rgba(0, 217, 245, 0.05)' : 'transparent',
                '&.Mui-selected': {
                  backgroundColor: 'rgba(0, 217, 245, 0.05)',
                  '&:hover': { backgroundColor: 'rgba(0, 217, 245, 0.08)' },
                },
                '&:hover': { backgroundColor: 'var(--surface2)' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
                <Avatar
                  sx={{
                    bgcolor: getColor(index),
                    width: 36,
                    height: 36,
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: '#fff',
                  }}
                >
                  {user.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </Avatar>
                <Typography
                  noWrap
                  sx={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    color: isActive ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  {user}
                </Typography>
              </Box>
            </ListItemButton>
          );
        })}
      </List>
    </Drawer>
  );
}
