'use client';

import { useRouter, usePathname } from 'next/navigation';
import {
  Drawer,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Avatar,
  Divider,
} from '@mui/material';
import { useGlobalContext } from './GlobalContext';

const drawerWidth = 300;

const avatarColors = ['#00d9f5', '#ff4566', '#9b7dff', '#00e09a', '#ffcc44', '#ff8c42', '#4db8ff', '#ff6b9d'];

export default function NavSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { users, selectedUser, setSelectedUser } = useGlobalContext();

  const handleNavClick = (path: string) => {
    router.push(path);
  };

  const handleUserClick = (user: any) => {
    setSelectedUser(user);
    router.push('/users');
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: '#0e1118',
          borderRight: '1px solid #1e2436',
          height: 'fit-content',
          borderRadius: '0 0 12px 0',
        }
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid #1e2436' }}>
        <Typography variant="h6" sx={{ color: '#dde2f0', fontFamily: 'inherit', fontWeight: 'bold' }}>
          RingCentral Monitor
        </Typography>
      </Box>

      <List>
        <ListItemButton
          selected={pathname === '/' || pathname === '/dashboard'}
          onClick={() => handleNavClick('/dashboard')}
          sx={{
            '&.Mui-selected': {
              borderLeft: '4px solid #00d9f5',
              backgroundColor: 'rgba(0, 217, 245, 0.1)',
            },
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            },
          }}
        >
          <ListItemText
            primary="Dashboard"
            sx={{
              '& .MuiListItemText-primary': {
                color: '#dde2f0',
                fontFamily: 'inherit',
              },
            }}
          />
        </ListItemButton>
        <ListItemButton
          selected={pathname === '/users'}
          onClick={() => handleNavClick('/users')}
          sx={{
            '&.Mui-selected': {
              borderLeft: '4px solid #00d9f5',
              backgroundColor: 'rgba(0, 217, 245, 0.1)',
            },
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            },
          }}
        >
          <ListItemText
            primary="Users"
            sx={{
              '& .MuiListItemText-primary': {
                color: '#dde2f0',
                fontFamily: 'inherit',
              },
            }}
          />
        </ListItemButton>
      </List>

      <Divider sx={{ backgroundColor: '#1e2436' }} />

      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ color: '#8892b0', mb: 1 }}>
          Quick Access
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {users.slice(0, 4).map((user, index) => (
            <Avatar
              key={user.id}
              sx={{
                width: 40,
                height: 40,
                bgcolor: avatarColors[index % avatarColors.length],
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: 'bold',
              }}
              onClick={() => handleUserClick(user)}
            >
              {user.name.split(' ').map(n => n[0]).join('')}
            </Avatar>
          ))}
        </Box>
      </Box>
    </Drawer>
  );
}
