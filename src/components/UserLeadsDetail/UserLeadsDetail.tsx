'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { getColor } from '@/utils/helpers';

const STATUS_VALUES = ['Not touched', 'Follow up', 'Rejected', 'N/A', 'Not valid lead', 'Processing'] as const;

const STATUS_COLORS: Record<string, string> = {
  'Not touched': '#9265ab',
  'Follow up': '#579BFC',
  'Rejected': '#E2445C',
  'N/A': '#9B9B9B',
  'Not valid lead': '#FF7575',
  'Processing': '#00C875',
  'Other': '#8B5CF6',
};

function normalizeStatusForDisplay(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'Not touched';
  if (STATUS_VALUES.includes(s as (typeof STATUS_VALUES)[number])) return s;
  const lower = s.toLowerCase();
  if (lower.includes('n/a') || lower === 'na') return 'N/A';
  if (lower.includes('process')) return 'Processing';
  if (lower.includes('not valid') || lower.includes('invalid')) return 'Not valid lead';
  if (lower.includes('follow')) return 'Follow up';
  if (lower.includes('not touch') || lower.includes('not called')) return 'Not touched';
  if (lower.includes('reject')) return 'Rejected';
  return 'Other';
}

function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || '#6b7280';
}

export interface MondayLead {
  id: string;
  name: string;
  createdAt: string;
  columns: Record<string, string>;
  status: string;
  company: string;
  date: string;
  platform: string;
  position: string;
  type: string;
  state: string;
  number: string;
  email: string;
  note: string;
  dateContact: string;
  /** Original owner (empty = board owner). Shown in table. */
  ownerLead?: string;
  /** On time / Late / Pending (interval > 10 min during shift = Late) */
  timing?: 'On time' | 'Late' | 'Pending';
  /** Call time interval (e.g. "5m 30s"). — if not contacted. */
  callTimeInterval?: string;
}

/** Cache TTL: 30 min (like Dashboard - avoid refetch on every visit) */
const CACHE_TTL_MS = 30 * 60 * 1000;

interface UserLeadsDetailProps {
  userName: string;
  userIndex: number;
  cachedData?: { leads: MondayLead[]; statusCounts: Record<string, number>; ts: number } | null;
  onCacheUpdate?: (user: string, data: { leads: MondayLead[]; statusCounts: Record<string, number> }) => void;
}

type DateSort = 'latest' | 'oldest' | 'default';

function sortLeads(leads: MondayLead[], sort: DateSort): MondayLead[] {
  if (sort === 'default') {
    return [...leads].sort((a, b) => {
      const da = a.dateContact ? new Date(a.dateContact).getTime() : 0;
      const db = b.dateContact ? new Date(b.dateContact).getTime() : 0;
      return db - da;
    });
  }
  const sorted = [...leads].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return da - db;
  });
  return sort === 'latest' ? sorted.reverse() : sorted;
}

export default function UserLeadsDetail({ userName, userIndex, cachedData, onCacheUpdate }: UserLeadsDetailProps) {
  const [leads, setLeads] = useState<MondayLead[]>(cachedData?.leads ?? []);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>(cachedData?.statusCounts ?? {});
  const [loading, setLoading] = useState(!(cachedData?.leads?.length || Object.keys(cachedData?.statusCounts ?? {}).length));
  const [error, setError] = useState<string | null>(null);
  const [dateSort, setDateSort] = useState<DateSort>('latest');
  const [sortAnchorEl, setSortAnchorEl] = useState<null | HTMLElement>(null);
  const sortMenuOpen = Boolean(sortAnchorEl);
  const handleSortMenuOpen = (e: React.MouseEvent<HTMLElement>) => setSortAnchorEl(e.currentTarget);
  const handleSortMenuClose = () => setSortAnchorEl(null);
  const handleSortSelect = (value: DateSort) => {
    setDateSort(value);
    handleSortMenuClose();
  };

  const fetchLeads = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/monday/leads?user=${encodeURIComponent(userName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch leads');
      const newLeads = data.leads || [];
      const newCounts = data.statusCounts || {};
      setLeads(newLeads);
      setStatusCounts(newCounts);
      onCacheUpdate?.(userName, { leads: newLeads, statusCounts: newCounts });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leads');
      setLeads([]);
      setStatusCounts({});
    } finally {
      setLoading(false);
    }
  }, [userName, onCacheUpdate]);

  useEffect(() => {
    if (cachedData) {
      setLeads(cachedData.leads);
      setStatusCounts(cachedData.statusCounts);
    }
    const fresh = cachedData && Date.now() - cachedData.ts < CACHE_TTL_MS;
    const hasData = !!(cachedData?.leads?.length || Object.keys(cachedData?.statusCounts ?? {}).length);
    if (fresh) {
      setLoading(false);
      return;
    }
    if (hasData) {
      setLoading(false);
      fetchLeads(false);
      return;
    }
    fetchLeads(true);
  }, [userName, cachedData]);

  const userColor = getColor(userIndex);
  const sortedLeads = sortLeads(leads, dateSort);
  const chartData = Object.entries(statusCounts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 300 }}>
        <CircularProgress sx={{ color: 'var(--accent)' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 4, pb: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <Avatar
          sx={{
            bgcolor: userColor,
            width: 64,
            height: 64,
            borderRadius: 3,
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#fff',
          }}
        >
          {userName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
        </Avatar>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text)' }}>
            {userName}
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: 'var(--text2)' }}>
            This month&apos;s leads: {leads.length} in table
            {Object.values(statusCounts).reduce((a, b) => a + b, 0) !== leads.length && (
              <> · {Object.values(statusCounts).reduce((a, b) => a + b, 0)} counted (by owner)</>
            )}
            {leads.some((l) => l.timing) && (
              <>
                {' · '}
                <Box component="span" sx={{ color: '#00C875' }}>
                  {leads.filter((l) => l.timing === 'On time').length} on time
                </Box>
                {' · '}
                <Box component="span" sx={{ color: '#E2445C' }}>
                  {leads.filter((l) => l.timing === 'Late').length} late
                </Box>
              </>
            )}
          </Typography>
        </Box>
      </Box>

      {/* Stats + Charts */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        <Box
          sx={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            p: 3,
          }}
        >
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', mb: 2 }}>
            Lead count by status
          </Typography>
          {chartData.length > 0 ? (
            <Box sx={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={getStatusColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#1e2436',
                      border: '1px solid #2d3548',
                      borderRadius: 8,
                      color: '#fff',
                    }}
                    formatter={(val: number) => [val, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
              No leads this month
            </Box>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center', mt: 2 }}>
            {chartData.map((d) => (
              <Typography key={d.name} sx={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.5, color: '#fff' }}>
                <Box component="span" sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: getStatusColor(d.name) }} />
                {d.name}: {d.value}
              </Typography>
            ))}
          </Box>
        </Box>

        <Box
          sx={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            p: 3,
          }}
        >
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', mb: 2 }}>
            Status breakdown (bar)
          </Typography>
          {chartData.length > 0 ? (
            <Box sx={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3548" />
                  <XAxis dataKey="name" stroke="#9ca3af" tick={{ fill: '#fff', fontSize: 11 }} />
                  <YAxis stroke="#9ca3af" tick={{ fill: '#fff', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: '#1e2436',
                      border: '1px solid #2d3548',
                      borderRadius: 8,
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Leads">
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={getStatusColor(entry.name)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
              No leads this month
            </Box>
          )}
        </Box>
      </Box>

      {/* Table */}
      <Box sx={{ flex: 1, minHeight: 0, pb: 8 }}>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', mb: 2 }}>
          Leads table ({leads.length} rows)
        </Typography>
        <TableContainer
          component={Paper}
          sx={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 2,
            maxHeight: 420,
            overflow: 'auto',
            overflowX: 'auto',
            overflowY: 'auto',
            '& .MuiTableRow-root:hover': {
              backgroundColor: 'rgba(255,255,255,0.04)',
            },
            '& .MuiTableCell-root': {
              whiteSpace: 'nowrap',
            },
          }}
        >
          <Table stickyHeader size="medium" sx={{ minWidth: 1400 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 140 }}>Lead</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 80 }}>Company</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 120 }}>Status</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 140 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <span>Date</span>
                    <IconButton
                      size="small"
                      onClick={handleSortMenuOpen}
                      sx={{
                        color: sortMenuOpen ? 'var(--accent)' : 'var(--text2)',
                        p: 0.25,
                      }}
                      aria-label="Sort by date"
                      aria-controls={sortMenuOpen ? 'date-sort-menu' : undefined}
                      aria-haspopup="true"
                      aria-expanded={sortMenuOpen ? 'true' : undefined}
                    >
                      <FilterAltIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                    <Menu
                      id="date-sort-menu"
                      anchorEl={sortAnchorEl}
                      open={sortMenuOpen}
                      onClose={handleSortMenuClose}
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                      slotProps={{
                        paper: {
                          sx: {
                            backgroundColor: 'var(--surface)',
                            border: '1px solid var(--border)',
                            mt: 1.5,
                          },
                        },
                      }}
                    >
                      <MenuItem
                        onClick={() => handleSortSelect('latest')}
                        selected={dateSort === 'latest'}
                        sx={{ color: 'var(--text)', fontSize: '0.85rem' }}
                      >
                        Latest first
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleSortSelect('oldest')}
                        selected={dateSort === 'oldest'}
                        sx={{ color: 'var(--text)', fontSize: '0.85rem' }}
                      >
                        Oldest first
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleSortSelect('default')}
                        selected={dateSort === 'default'}
                        sx={{ color: 'var(--text)', fontSize: '0.85rem' }}
                      >
                        Last contacted
                      </MenuItem>
                    </Menu>
                  </Box>
                </TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 90 }}>Platform</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 120 }}>Position</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 130 }}>Number</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 180 }}>Email</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 120 }}>Date contact</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 110 }}>Call time interval</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 100 }}>Owner lead</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 110 }}>Late / On time</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 600, minWidth: 200 }}>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedLeads.map((lead) => (
                <TableRow key={lead.id} hover>
                  <TableCell sx={{ color: '#fff' }}>{lead.name}</TableCell>
                  <TableCell sx={{ color: '#fff' }}>{lead.company}</TableCell>
                  <TableCell>
                    <Box
                      component="span"
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        fontSize: '0.75rem',
                        bgcolor: `${getStatusColor(normalizeStatusForDisplay(lead.status))}33`,
                        color: getStatusColor(normalizeStatusForDisplay(lead.status)),
                      }}
                    >
                      {normalizeStatusForDisplay(lead.status)}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#fff' }}>{lead.date}</TableCell>
                  <TableCell sx={{ color: '#fff' }}>{lead.platform}</TableCell>
                  <TableCell sx={{ color: '#fff' }}>{lead.position}</TableCell>
                  <TableCell sx={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{lead.number}</TableCell>
                  <TableCell sx={{ color: '#fff' }}>{lead.email}</TableCell>
                  <TableCell sx={{ color: '#fff' }}>{lead.dateContact}</TableCell>
                  <TableCell sx={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    {lead.callTimeInterval ?? '—'}
                  </TableCell>
                  <TableCell sx={{ color: '#fff', fontSize: '0.85rem' }}>
                    {lead.ownerLead || '—'}
                  </TableCell>
                  <TableCell>
                    <Box
                      component="span"
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        bgcolor:
                          lead.timing === 'On time'
                            ? 'rgba(0,200,117,0.2)'
                            : lead.timing === 'Late'
                              ? 'rgba(226,68,92,0.2)'
                              : 'rgba(107,114,128,0.2)',
                        color:
                          lead.timing === 'On time'
                            ? '#00C875'
                            : lead.timing === 'Late'
                              ? '#E2445C'
                              : '#9ca3af',
                      }}
                    >
                      {lead.timing ?? 'Pending'}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#fff', minWidth: 200 }} title={lead.note}>
                    {lead.note?.slice(0, 80)}
                    {lead.note && lead.note.length > 80 ? '…' : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}
