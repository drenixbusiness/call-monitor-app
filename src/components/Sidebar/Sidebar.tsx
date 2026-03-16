'use client';

import { Box, Drawer, Typography, TextField, List, ListItemButton, Avatar, InputAdornment, Divider } from '@mui/material';
import { RCUser, UserCalls, CallRecord } from '@/types';
import { getInitials, getColor, fmtDuration, getDisplayName } from '@/utils/helpers';
import { useState, useMemo } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BarChartIcon from '@mui/icons-material/BarChart';
import { MONDAY_USERS } from '@/components/MondaySidebar/MondaySidebar';

export default function Sidebar({
  users,
  allCalls,
  selectedUser,
  onSelect,
  activeView,
  onSelectDashboard,
  onSelectMondayLeads,
  selectedMondayUser,
  onSelectMondayUser,
}: {
  users: RCUser[];
  allCalls: UserCalls;
  selectedUser: RCUser | null;
  onSelect: (user: RCUser) => void;
  activeView: 'overview' | 'user' | 'monday-leads';
  onSelectDashboard: () => void;
  onSelectMondayLeads?: () => void;
  selectedMondayUser?: string | null;
  onSelectMondayUser?: (user: string) => void;
}) {
  const [search, setSearch] = useState('');

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const query = search.toLowerCase();
      const phoneMatch = u.phoneNumbers?.some((p: any) => p.phoneNumber?.toLowerCase().includes(query));
      return u.name.toLowerCase().includes(query) || phoneMatch;
    });
  }, [users, search]);

  const isMondayLeads = activeView === 'monday-leads';

  return (
    <Drawer
      variant="permanent"
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
      {/* Div 1: Nav items - Dashboard, Monday Leads */}
      <Box sx={{ flexShrink: 0 }}>
        <ListItemButton
          onClick={onSelectDashboard}
          selected={activeView === 'overview'}
          sx={{
            py: 4.1,
            px: 2,
            borderBottom: '1px solid var(--border)',
            borderLeft: activeView === 'overview' ? '3px solid var(--accent)' : '3px solid transparent',
            backgroundColor: activeView === 'overview' ? 'rgba(0, 217, 245, 0.05)' : 'transparent',
            '&.Mui-selected': {
              backgroundColor: 'rgba(0, 217, 245, 0.05)',
              '&:hover': { backgroundColor: 'rgba(0, 217, 245, 0.08)' }
            },
            '&:hover': { backgroundColor: 'var(--surface2)' }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'var(--surface3)', width: 36, height: 36, borderRadius: 2 }}>
              <DashboardIcon sx={{ fontSize: '1.2rem', color: activeView === 'overview' ? 'var(--accent)' : 'var(--text2)' }} />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.95rem', color: activeView === 'overview' ? 'var(--accent)' : 'var(--text2)' }}>
                Dashboard
              </Typography>
              <Typography noWrap sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text3)' }}>
                Overview
              </Typography>
            </Box>
          </Box>
        </ListItemButton>

        {onSelectMondayLeads && (
          <ListItemButton
            onClick={onSelectMondayLeads}
            selected={activeView === 'monday-leads'}
            sx={{
              py: 4.1,
              px: 2,
              borderBottom: '1px solid var(--border)',
              borderLeft: activeView === 'monday-leads' ? '3px solid var(--accent)' : '3px solid transparent',
              backgroundColor: activeView === 'monday-leads' ? 'rgba(0, 217, 245, 0.05)' : 'transparent',
              '&.Mui-selected': {
                backgroundColor: 'rgba(0, 217, 245, 0.05)',
                '&:hover': { backgroundColor: 'rgba(0, 217, 245, 0.08)' }
              },
              '&:hover': { backgroundColor: 'var(--surface2)' }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
              <Avatar sx={{ bgcolor: 'var(--surface3)', width: 36, height: 36, borderRadius: 2 }}>
                <BarChartIcon sx={{ fontSize: '1.2rem', color: activeView === 'monday-leads' ? 'var(--accent)' : 'var(--text2)' }} />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.95rem', color: activeView === 'monday-leads' ? 'var(--accent)' : 'var(--text2)' }}>
                  Monday Leads
                </Typography>
                <Typography noWrap sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text3)' }}>
                  By user
                </Typography>
              </Box>
            </Box>
          </ListItemButton>
        )}
      </Box>

      <Divider sx={{ borderColor: 'var(--border)' }} />

      {/* Div 2: Users section - scrollable */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text2)', letterSpacing: '1px' }}>
            USERS &middot; {isMondayLeads ? MONDAY_USERS.length : filteredUsers.length}
          </Typography>
          {!isMondayLeads && (
            <TextField
              variant="outlined"
              placeholder="Search name or phone..."
              size="small"
              fullWidth
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'var(--bg)',
                  '& fieldset': { borderColor: 'var(--border2)' },
                  '&:hover fieldset': { borderColor: 'var(--text3)' },
                },
                input: { color: 'var(--text)', fontSize: '0.95rem' }
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'var(--text3)', fontSize: '1.2rem' }} />
                    </InputAdornment>
                  ),
                }
              }}
            />
          )}
          {isMondayLeads && (
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--text3)' }}>
              Click to view this month&apos;s leads
            </Typography>
          )}
        </Box>

        <List sx={{ p: 0, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', backgroundColor: 'transparent' }}>
          {isMondayLeads ? (
            MONDAY_USERS.map((user, index) => {
              const isActive = selectedMondayUser === user;
              return (
                <ListItemButton
                  key={user}
                  onClick={() => onSelectMondayUser?.(user)}
                  selected={isActive}
                  sx={{
                    flexShrink: 0,
                    py: 2,
                    borderBottom: '1px solid var(--border)',
                    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                    backgroundColor: isActive ? 'rgba(0, 217, 245, 0.05)' : 'transparent',
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(0, 217, 245, 0.05)',
                      '&:hover': { backgroundColor: 'rgba(0, 217, 245, 0.08)' }
                    },
                    '&:hover': { backgroundColor: 'var(--surface2)' }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
                    <Avatar sx={{ bgcolor: getColor(index), width: 36, height: 36, fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                      {user.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </Avatar>
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.95rem', color: isActive ? 'var(--accent)' : 'var(--text)' }}>
                      {user}
                    </Typography>
                  </Box>
                </ListItemButton>
              );
            })
          ) : (
            filteredUsers.map((user) => {
              const calls = allCalls[user.id] || [];
              const talkTime = calls.reduce((acc: number, c: CallRecord) => acc + c.duration, 0);
              const isActive = activeView === 'user' && selectedUser?.id === user.id;
              const userIndex = users.findIndex((u) => u.id === user.id);

              const phoneNumbersString = user.phoneNumbers
                ? user.phoneNumbers.map((n: any) => n.phoneNumber).filter(Boolean).join(', ')
                : '';

              return (
                <ListItemButton
                  key={user.id}
                  onClick={() => onSelect(user)}
                  selected={isActive}
                  sx={{
                    flexShrink: 0,
                    py: 2,
                    borderBottom: '1px solid var(--border)',
                    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                    backgroundColor: isActive ? 'rgba(0, 217, 245, 0.05)' : 'transparent',
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(0, 217, 245, 0.05)',
                      '&:hover': { backgroundColor: 'rgba(0, 217, 245, 0.08)' }
                    },
                    '&:hover': { backgroundColor: 'var(--surface2)' }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
                    <Avatar sx={{ bgcolor: getColor(userIndex >= 0 ? userIndex : 0), width: 36, height: 36, fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                      {getInitials(user.name)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                        {getDisplayName(user, users)}
                      </Typography>
                      <Typography noWrap sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text2)' }}>
                        {phoneNumbersString || 'No direct number'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)' }}>
                        {calls.length}
                      </Typography>
                      <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text3)' }}>
                        {fmtDuration(talkTime)}
                      </Typography>
                    </Box>
                  </Box>
                </ListItemButton>
              );
            })
          )}
        </List>
      </Box>
    </Drawer>
  );
}
