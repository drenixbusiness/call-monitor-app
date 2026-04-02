'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Chip,
  Button,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import { Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { MAX_MAIN_DASH_CUSTOM_DAYS } from '@/lib/mondayDateRange';
import { getClientDeployAccount } from '@/lib/deployAccount';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, LineElement, PointElement, Filler);
ChartJS.defaults.font.family = '"Google Sans", "Helvetica", "Arial", sans-serif';

/** Monday.com-style status colors — distinct reds/oranges so “Not valid lead” ≠ “Rejected” */
const STATUS_COLORS: Record<string, string> = {
  'Not touched': '#5559DF',
  'Follow up': '#FDAB3D',
  Rejected: '#E44258',
  'N/A': '#969696',
  'Not valid lead': '#FF6900',
  Processing: '#00CA72',
  Other: '#9D50DD',
};

function statusColor(s: string): string {
  return STATUS_COLORS[s] || '#6b7280';
}

type Counts = Record<string, number>;

type MainDashPayloadCore = {
  user: string;
  range: { from: string; to: string };
  totalLeads: number;
  statusCounts: Counts;
  statusFirstCounts: Counts;
  statusSecondCounts: Counts;
  trendByDay: {
    labels: string[];
    firstTouchSeries: { status: string; data: number[] }[];
    secondTouchSeries: { status: string; data: number[] }[];
  };
};

/** Full API response for `user=all` includes per-recruiter slices (one Monday fetch). */
type MainDashBundle = MainDashPayloadCore & {
  perUser?: Record<string, MainDashPayloadCore>;
};

const widgetSx = {
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.025) 100%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset',
};

const widgetTitleSx = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--text)',
  letterSpacing: '0.02em',
  mb: 2,
};

function countsToPieData(counts: Counts): ChartData<'pie'> {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  return {
    labels: entries.map(([k]) => k),
    datasets: [
      {
        data: entries.map(([, v]) => v),
        backgroundColor: entries.map(([k]) => statusColor(k)),
        borderColor: 'rgba(0,0,0,0.45)',
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  };
}

function pieOptionsWithPercentLabels(): ChartOptions<'pie'> {
  return {
    /** Ensures pie legend / plugin text uses light color (Chart.js v4 respects this). */
    color: '#ffffff',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        align: 'center',
        labels: {
          // Canvas does not resolve CSS variables; use a solid color for legend text.
          color: '#ffffff',
          boxWidth: 16,
          boxHeight: 16,
          padding: 18,
          font: { size: 13, weight: 500 },
          usePointStyle: true,
          pointStyle: 'rectRounded',
          generateLabels: (chart) => {
            const d = chart.data;
            const ds = d.datasets[0] as { data: number[]; backgroundColor?: string | string[] };
            if (!d.labels?.length || !ds?.data) return [];
            const total = ds.data.reduce((a, b) => a + b, 0);
            const colors = Array.isArray(ds.backgroundColor) ? ds.backgroundColor : [];
            return d.labels.map((label, i) => {
              const value = ds.data[i] ?? 0;
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              const fill = colors[i] ?? '#888';
              return {
                text: `${String(label)}  ${pct}%`,
                fillStyle: fill,
                /** Required when overriding generateLabels — legend ignores labels.color otherwise */
                fontColor: '#ffffff',
                strokeStyle: 'rgba(0,0,0,0.35)',
                lineWidth: 1,
                hidden: false,
                index: i,
                datasetIndex: 0,
              };
            });
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(20, 24, 32, 0.96)',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        titleColor: '#ffffff',
        bodyColor: 'rgba(255, 255, 255, 0.92)',
        padding: 14,
        cornerRadius: 10,
        callbacks: {
          label(ctx) {
            const v = ctx.parsed;
            const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
            const pct = total > 0 ? (((v as number) / total) * 100).toFixed(1) : '0';
            return ` ${v} (${pct}%)`;
          },
        },
      },
    },
  };
}

function buildLineChartOptions(pointCount: number): ChartOptions<'line'> {
  const maxTicks = pointCount > 20 ? 10 : pointCount > 14 ? 12 : 14;
  return {
    color: '#ffffff',
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        align: 'start',
        labels: {
          color: '#ffffff',
          boxWidth: 10,
          boxHeight: 10,
          padding: 16,
          font: { size: 11 },
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(20, 24, 32, 0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#ffffff',
        bodyColor: 'rgba(255, 255, 255, 0.92)',
        padding: 12,
        cornerRadius: 8,
        itemSort: (a, b) => (b.parsed.y as number) - (a.parsed.y as number),
      },
    },
    scales: {
      x: {
        offset: true,
        grid: { color: 'rgba(148,163,184,0.08)', drawTicks: true },
        ticks: {
          color: 'rgba(255, 255, 255, 0.88)',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: maxTicks,
          padding: 8,
          font: { size: 11 },
        },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148,163,184,0.08)' },
        ticks: {
          color: 'rgba(255, 255, 255, 0.88)',
          precision: 0,
          font: { size: 11 },
        },
        border: { display: false },
      },
    },
  };
}

function buildLineChartData(
  dayLabels: string[],
  series: { status: string; data: number[] }[]
) {
  const displayLabels = dayLabels.map((d) => {
    try {
      return format(parseISO(d), 'MMM d, yy');
    } catch {
      return d;
    }
  });
  return {
    labels: displayLabels,
    datasets: series
      .filter((s) => s.data.some((n) => n > 0))
      .map((s) => ({
        label: s.status,
        data: s.data,
        borderColor: statusColor(s.status),
        backgroundColor: statusColor(s.status),
        fill: false,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBorderWidth: 2,
        pointHoverBackgroundColor: statusColor(s.status),
        borderWidth: 2.5,
      })),
  };
}

const KPI_ORDER = [
  { key: 'Not touched', label: 'Not called' },
  { key: 'Follow up', label: 'Follow up' },
  { key: 'Rejected', label: 'Rejected' },
  { key: 'N/A', label: 'N/A' },
  { key: 'Not valid lead', label: 'Not valid lead' },
  { key: 'Processing', label: 'Processing' },
  { key: 'Other', label: 'Other' },
] as const;

const LINE_CHART_HEIGHT = 400;

const CHICAGO = 'America/Chicago';

/** Calendar day in US Central as a Date (noon) for stable pickers + API strings. */
function dateAtNoonChicago(ymd: string): Date {
  return fromZonedTime(`${ymd}T12:00:00`, CHICAGO);
}

function todayNoonChicago(): Date {
  const ymd = formatInTimeZone(new Date(), CHICAGO, 'yyyy-MM-dd');
  return dateAtNoonChicago(ymd);
}

const pieOpts = pieOptionsWithPercentLabels();

type RangeKey =
  | { kind: 'preset'; v: 'today' | 'week' | 'month' }
  | { kind: 'custom'; from: string; to: string };

function buildRangeQuery(r: RangeKey): string {
  const p = new URLSearchParams();
  if (r.kind === 'custom') {
    p.set('dateFrom', r.from);
    p.set('dateTo', r.to);
  } else {
    p.set('preset', r.v);
  }
  return p.toString();
}

export default function MainDashboard({ mondayUsers }: { mondayUsers: readonly string[] }) {
  const [userFilter, setUserFilter] = useState<string>('all');
  const [bundle, setBundle] = useState<MainDashBundle | null>(null);
  const [legacySlice, setLegacySlice] = useState<MainDashPayloadCore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>({ kind: 'preset', v: 'month' });
  /** User picked "Custom" in the menu but has not applied dates yet. */
  const [pendingCustom, setPendingCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | null>(() => todayNoonChicago());
  const [customTo, setCustomTo] = useState<Date | null>(() => todayNoonChicago());
  const [customError, setCustomError] = useState<string | null>(null);

  const deploy = getClientDeployAccount();
  const companyLabel = deploy === 'account1' ? 'BP' : deploy === 'account2' ? 'JM / JDM' : 'All companies';

  const rangeQuery = useMemo(() => buildRangeQuery(rangeKey), [rangeKey]);

  /** One Monday workspace fetch returns aggregates for all + each recruiter. */
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLegacySlice(null);
    try {
      const res = await fetch(`/api/monday/main-dashboard?user=all&${rangeQuery}`);
      const json: MainDashBundle = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error || 'Failed to load');
      setBundle(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [rangeQuery]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const presetMenuValue = useMemo(() => {
    if (pendingCustom) return 'custom';
    if (rangeKey.kind === 'custom') return 'custom';
    return rangeKey.v;
  }, [pendingCustom, rangeKey]);

  const applyCustomRange = useCallback(() => {
    if (!customFrom || !customTo) {
      setCustomError('Choose start and end dates.');
      return;
    }
    const fromNorm = formatInTimeZone(customFrom, CHICAGO, 'yyyy-MM-dd');
    const toNorm = formatInTimeZone(customTo, CHICAGO, 'yyyy-MM-dd');
    const span = differenceInCalendarDays(parseISO(toNorm), parseISO(fromNorm)) + 1;
    if (span < 1 || span > MAX_MAIN_DASH_CUSTOM_DAYS) {
      setCustomError(`Range must be 1–${MAX_MAIN_DASH_CUSTOM_DAYS} calendar days (US Central).`);
      return;
    }
    setCustomError(null);
    setPendingCustom(false);
    setRangeKey({ kind: 'custom', from: fromNorm, to: toNorm });
  }, [customFrom, customTo]);

  const data = useMemo((): MainDashPayloadCore | null => {
    const legacyOk = legacySlice?.user === userFilter ? legacySlice : null;
    if (!bundle) return legacyOk;
    if (userFilter === 'all') {
      const { perUser: _p, ...agg } = bundle;
      return agg;
    }
    const slice = bundle.perUser?.[userFilter];
    if (slice) return slice;
    return legacyOk;
  }, [bundle, userFilter, legacySlice]);

  /** Older API responses without `perUser`: fetch the selected recruiter once. */
  useEffect(() => {
    if (!bundle || userFilter === 'all' || bundle.perUser?.[userFilter]) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/monday/main-dashboard?user=${encodeURIComponent(userFilter)}&${rangeQuery}`
        );
        const json: MainDashPayloadCore = await res.json();
        if (!res.ok) throw new Error((json as { error?: string }).error || 'Failed to load');
        if (!cancelled) setLegacySlice(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
          setLegacySlice(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bundle, userFilter, rangeQuery]);

  const pieFirst = useMemo(() => (data ? countsToPieData(data.statusFirstCounts) : null), [data]);
  const pieSecond = useMemo(() => (data ? countsToPieData(data.statusSecondCounts) : null), [data]);
  const lineFirst = useMemo(
    () => (data ? buildLineChartData(data.trendByDay.labels, data.trendByDay.firstTouchSeries) : null),
    [data]
  );
  const lineSecond = useMemo(
    () => (data ? buildLineChartData(data.trendByDay.labels, data.trendByDay.secondTouchSeries) : null),
    [data]
  );

  const lineOptsFirst = useMemo(
    () => buildLineChartOptions(data?.trendByDay.labels.length ?? 0),
    [data?.trendByDay.labels.length]
  );
  const lineOptsSecond = useMemo(
    () => buildLineChartOptions(data?.trendByDay.labels.length ?? 0),
    [data?.trendByDay.labels.length]
  );

  if (loading && !data) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 320 }}>
        <CircularProgress sx={{ color: 'var(--accent)' }} />
      </Box>
    );
  }

  if (error && !bundle && !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        px: { xs: 2, sm: 3 },
        py: 2,
        pb: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        maxWidth: 1480,
        mx: 'auto',
        width: '100%',
      }}
    >
      <Box>
        <Typography
          sx={{
            fontSize: { xs: '1.35rem', sm: '1.5rem' },
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
          }}
        >
          Main dashboard
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: 'var(--text)', mt: 0.5 }}>
          Leads · {companyLabel}
          {data?.range && (
            <>
              {' '}
              ·{' '}
              {formatInTimeZone(new Date(data.range.from), CHICAGO, 'MMM d, yyyy')}
              {' – '}
              {formatInTimeZone(new Date(data.range.to), CHICAGO, 'MMM d, yyyy')} (US Central)
            </>
          )}
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          ...widgetSx,
          p: 2,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'var(--text)' }}>
          <PeopleOutlineIcon sx={{ fontSize: 22 }} />
          <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>People</Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 200, flex: { xs: '1 1 100%', sm: '0 1 220px' } }}>
          <InputLabel id="main-dash-range-label" sx={{ color: '#fff' }}>
            Date range
          </InputLabel>
          <Select
            labelId="main-dash-range-label"
            label="Date range"
            value={presetMenuValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'custom') {
                setPendingCustom(true);
                setCustomError(null);
                if (rangeKey.kind === 'custom') {
                  setCustomFrom(dateAtNoonChicago(rangeKey.from));
                  setCustomTo(dateAtNoonChicago(rangeKey.to));
                } else {
                  const t = todayNoonChicago();
                  setCustomFrom(t);
                  setCustomTo(t);
                }
                return;
              }
              setPendingCustom(false);
              setRangeKey({ kind: 'preset', v: v as 'today' | 'week' | 'month' });
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  bgcolor: 'var(--surface2)',
                  '& .MuiMenuItem-root': { color: '#fff' },
                },
              },
            }}
            sx={{
              color: '#fff',
              borderRadius: '8px',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
              '& .MuiSvgIcon-root': { color: '#fff' },
            }}
          >
            <MenuItem value="today">Today</MenuItem>
            <MenuItem value="week">Last 7 days</MenuItem>
            <MenuItem value="month">This month</MenuItem>
            <MenuItem value="custom">Custom (max {MAX_MAIN_DASH_CUSTOM_DAYS} days)</MenuItem>
          </Select>
        </FormControl>

        {presetMenuValue === 'custom' && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1.5,
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            <DatePicker
              timezone={CHICAGO}
              label="From"
              value={customFrom}
              onChange={(d) => {
                setCustomFrom(d);
                setCustomError(null);
              }}
              maxDate={customTo ?? undefined}
              minDate={customTo ? addDays(customTo, -(MAX_MAIN_DASH_CUSTOM_DAYS - 1)) : undefined}
              slotProps={{
                textField: {
                  size: 'small',
                  sx: {
                    width: 160,
                    '& .MuiOutlinedInput-root': { color: '#fff' },
                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
                  },
                },
              }}
            />
            <DatePicker
              timezone={CHICAGO}
              label="To"
              value={customTo}
              onChange={(d) => {
                setCustomTo(d);
                setCustomError(null);
              }}
              minDate={customFrom ?? undefined}
              maxDate={customFrom ? addDays(customFrom, MAX_MAIN_DASH_CUSTOM_DAYS - 1) : undefined}
              slotProps={{
                textField: {
                  size: 'small',
                  sx: {
                    width: 160,
                    '& .MuiOutlinedInput-root': { color: '#fff' },
                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
                  },
                },
              }}
            />
            <Button
              type="button"
              variant="contained"
              size="small"
              onClick={applyCustomRange}
              sx={{ borderRadius: '8px' }}
            >
              Apply
            </Button>
            {customError && (
              <Typography sx={{ color: '#f87171', fontSize: '0.8rem', width: '100%' }}>{customError}</Typography>
            )}
          </Box>
        )}

        <FormControl size="small" sx={{ minWidth: 260, flex: { xs: '1 1 100%', sm: '0 1 280px' } }}>
          <InputLabel id="main-dash-user-label" sx={{ color: '#fff' }}>
            Recruiter
          </InputLabel>
          <Select
            labelId="main-dash-user-label"
            label="Recruiter"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            MenuProps={{
              PaperProps: {
                sx: {
                  bgcolor: 'var(--surface2)',
                  '& .MuiMenuItem-root': { color: '#fff' },
                },
              },
            }}
            sx={{
              color: '#fff',
              borderRadius: '8px',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
              '& .MuiSvgIcon-root': { color: '#fff' },
            }}
          >
            <MenuItem value="all">All</MenuItem>
            {mondayUsers.map((u) => (
              <MenuItem key={u} value={u}>
                {u}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {userFilter !== 'all' && (
          <Chip
            label={`Filtered: ${userFilter}`}
            size="small"
            sx={{
              bgcolor: 'rgba(0, 217, 245, 0.12)',
              color: '#fff',
              border: '1px solid rgba(0, 217, 245, 0.25)',
              fontWeight: 600,
            }}
          />
        )}
        {loading && !data && userFilter !== 'all' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
            <CircularProgress size={18} sx={{ color: 'var(--accent)' }} />
            <Typography sx={{ color: '#fff', fontSize: '0.8rem' }}>Loading recruiter…</Typography>
          </Box>
        )}
      </Paper>

      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Monday-style KPI block: tall total + metric grid (avoids collapsed horizontal flex strip) */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          flexShrink: 0,
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            sm: 'repeat(3, minmax(0, 1fr))',
            md: 'minmax(200px, 240px) repeat(4, minmax(0, 1fr))',
          },
          gridAutoRows: { xs: 'auto', md: 'minmax(104px, auto)' },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            ...widgetSx,
            p: 2.5,
            minHeight: { xs: 120, md: '100%' },
            gridColumn: { xs: 'span 2', sm: 'span 3', md: '1' },
            gridRow: { md: '1 / 3' },
            border: '1px solid rgba(0, 217, 245, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Typography
            sx={{
              fontSize: '0.75rem',
              color: '#fff',
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            TOTAL LEADS
          </Typography>
          <Typography sx={{ fontSize: { xs: '2.25rem', md: '2.75rem' }, fontWeight: 800, color: '#fff', mt: 1, lineHeight: 1 }}>
            {data?.totalLeads ?? 0}
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: '#fff', mt: 0.5 }}>in range</Typography>
        </Paper>

        {KPI_ORDER.map(({ key, label }) => {
          const n = data?.statusCounts[key] ?? 0;
          const c = statusColor(key);
          return (
            <Paper
              key={key}
              elevation={0}
              sx={{
                ...widgetSx,
                p: 2,
                minHeight: 104,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: `4px solid ${c}`,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  color: '#fff',
                  fontWeight: 600,
                  lineHeight: 1.35,
                }}
              >
                {label}
              </Typography>
              <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>{n}</Typography>
            </Paper>
          );
        })}
      </Box>

      {/* Two pie widgets side by side (Monday layout) */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
          alignItems: 'stretch',
          flexShrink: 0,
        }}
      >
        <Paper elevation={0} sx={{ ...widgetSx, p: 2.5, minHeight: 400 }}>
          <Typography sx={widgetTitleSx}>Leads&apos; status at first touch</Typography>
          {pieFirst && pieFirst.labels && pieFirst.labels.length > 0 ? (
            <Box sx={{ height: 340, width: '100%', position: 'relative' }}>
              <Pie data={pieFirst} options={pieOpts} />
            </Box>
          ) : (
            <Box sx={{ py: 10, textAlign: 'center', color: '#ffffff' }}>No data in range</Box>
          )}
        </Paper>

        <Paper elevation={0} sx={{ ...widgetSx, p: 2.5, minHeight: 400 }}>
          <Typography sx={widgetTitleSx}>Leads&apos; status after second touch</Typography>
          {pieSecond && pieSecond.labels && pieSecond.labels.length > 0 ? (
            <Box sx={{ height: 340, width: '100%', position: 'relative' }}>
              <Pie data={pieSecond} options={pieOpts} />
            </Box>
          ) : (
            <Box sx={{ py: 10, textAlign: 'center', color: '#ffffff' }}>No data in range</Box>
          )}
        </Paper>
      </Box>

      <Paper elevation={0} sx={{ ...widgetSx, p: 3 }}>
        <Typography sx={widgetTitleSx}>Leads&apos; status at first touch (by day)</Typography>
        {lineFirst && lineFirst.labels && lineFirst.labels.length > 0 && lineFirst.datasets.length > 0 ? (
          <Box sx={{ height: LINE_CHART_HEIGHT, width: '100%', position: 'relative' }}>
            <Line data={lineFirst} options={lineOptsFirst} />
          </Box>
        ) : (
          <Box sx={{ py: 10, textAlign: 'center', color: 'white' }}>No trend data</Box>
        )}
      </Paper>

      <Paper elevation={0} sx={{ ...widgetSx, p: 3 }}>
        <Typography sx={widgetTitleSx}>Leads&apos; status at second touch (by day)</Typography>
        {lineSecond && lineSecond.labels && lineSecond.labels.length > 0 && lineSecond.datasets.length > 0 ? (
          <Box sx={{ height: LINE_CHART_HEIGHT, width: '100%', position: 'relative' }}>
            <Line data={lineSecond} options={lineOptsSecond} />
          </Box>
        ) : (
          <Box sx={{ py: 10, textAlign: 'center', color: 'white' }}>No trend data</Box>
        )}
      </Paper>
    </Box>
  );
}
