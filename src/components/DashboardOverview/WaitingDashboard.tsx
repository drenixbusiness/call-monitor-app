'use client';

import React, { useState, useCallback } from 'react';
import {
    Box, Typography, Button, Alert, CircularProgress,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import { Pie, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, BarElement,
} from 'chart.js';
import DownloadIcon from '@mui/icons-material/Download';
import * as XLSX from 'xlsx';
import { useGlobalContext } from '@/components/GlobalContext';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);
ChartJS.defaults.font.family = '"Google Sans", "Helvetica", "Arial", sans-serif';

const USER_COLORS = ['#00d9f5', '#9b7dff', '#00e09a', '#ffcc44', '#ff8c42', '#4db8ff', '#ff6b9d'];

function fmtDuration(sec: number): string {
    if (!sec || sec <= 0) return '0s';
    if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
    if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${sec}s`;
}

export default function WaitingDashboard() {
    const { waitingStats, waitingFetchState, runWaitingFetch } = useGlobalContext();
    const { isFetching, progress, error, hasFetched } = waitingFetchState;

    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    const [fromDate, setFromDate] = useState<Date | null>(oneMonthAgo);
    const [toDate, setToDate] = useState<Date | null>(today);
    const [dateError, setDateError] = useState<string | null>(null);

    const validateDates = useCallback((from: Date | null, to: Date | null): string | null => {
        if (!from || !to) return 'Please select both dates';
        const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 0) return 'End date must be after start date';
        if (diffDays > 31) return 'Date range cannot exceed 1 month';
        return null;
    }, []);

    const handleFromChange = (val: Date | null) => {
        setFromDate(val);
        setDateError(validateDates(val, toDate));
    };

    const handleToChange = (val: Date | null) => {
        setToDate(val);
        setDateError(validateDates(fromDate, val));
    };

    const handleFetch = () => {
        const err = validateDates(fromDate, toDate);
        if (err) { setDateError(err); return; }
        runWaitingFetch(fromDate!, toDate!);
    };

    const handleExportExcel = useCallback(() => {
        if (!waitingStats.length) return;

        const wb = XLSX.utils.book_new();

        const summaryRows = [
            ['Name', 'Total Calls', 'Talk Time (min)', 'Outbound', 'Inbound', 'Missed', 'Voicemail', 'Hangup/Declined', 'Connected'],
            ...waitingStats.map(u => [
                u.name,
                u.totalCalls,
                Math.round(u.talkTime / 60),
                u.outbound,
                u.inbound,
                u.missed,
                u.voicemail,
                u.hangup,
                u.connected,
            ]),
        ];
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
        summarySheet['!cols'] = [
            { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 12 },
            { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

        const callRows: any[][] = [['User', 'Date & Time', 'Direction', 'Duration (s)', 'Result', 'From Number', 'To Number']];
        waitingStats.forEach(u => {
            u.calls.forEach(c => {
                callRows.push([u.name, new Date(c.startTime).toLocaleString(), c.direction, c.duration, c.result, c.from?.phoneNumber || '', c.to?.phoneNumber || '']);
            });
        });
        const callSheet = XLSX.utils.aoa_to_sheet(callRows);
        callSheet['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, callSheet, 'All Calls');

        const dailyMap: Record<string, Record<string, number>> = {};
        waitingStats.forEach(u => {
            u.calls.forEach(c => {
                const day = c.startTime.split('T')[0];
                if (!dailyMap[day]) dailyMap[day] = {};
                dailyMap[day][u.name] = (dailyMap[day][u.name] || 0) + 1;
            });
        });
        const names = waitingStats.map(u => u.name);
        const dailyRows: any[][] = [['Date', ...names]];
        Object.keys(dailyMap).sort().forEach(day => {
            dailyRows.push([day, ...names.map(n => dailyMap[day][n] || 0)]);
        });
        const dailySheet = XLSX.utils.aoa_to_sheet(dailyRows);
        XLSX.utils.book_append_sheet(wb, dailySheet, 'Daily Breakdown');

        const dateFrom = fromDate!.toISOString().split('T')[0];
        const dateTo = toDate!.toISOString().split('T')[0];
        XLSX.writeFile(wb, `RingCentral_${dateFrom}_to_${dateTo}.xlsx`);
    }, [waitingStats, fromDate, toDate]);

    const pieData = {
        labels: waitingStats.map(u => u.name),
        datasets: [{ data: waitingStats.map(u => u.totalCalls), backgroundColor: USER_COLORS, borderColor: 'rgba(0,0,0,0.2)', borderWidth: 1 }],
    };

    const talkTimeBarData = {
        labels: waitingStats.map(u => u.name),
        datasets: [{ label: 'Talk time (minutes)', data: waitingStats.map(u => Math.round(u.talkTime / 60)), backgroundColor: 'rgba(0,217,245,0.7)' }],
    };

    const directionBarData = {
        labels: waitingStats.map(u => u.name),
        datasets: [
            { label: 'Outbound', data: waitingStats.map(u => u.outbound), backgroundColor: 'rgba(0,217,245,0.7)', stack: 'calls' },
            { label: 'Inbound', data: waitingStats.map(u => u.inbound), backgroundColor: 'rgba(155,125,255,0.7)', stack: 'calls' },
            { label: 'Missed', data: waitingStats.map(u => u.missed), backgroundColor: 'rgba(255,69,102,0.8)', stack: 'calls' },
        ],
    };

    const chartOptions = {
        responsive: true,
        plugins: { legend: { labels: { color: '#ffffff', font: { size: 14 } } }, tooltip: { bodyColor: '#ffffff', titleColor: '#ffffff', bodyFont: { size: 14 }, titleFont: { size: 15 } } },
        scales: { x: { ticks: { color: '#ffffff', font: { size: 13 } }, grid: { color: 'var(--border2)' } }, y: { ticks: { color: '#ffffff', font: { size: 13 } }, grid: { color: 'var(--border2)' } } },
    };

    const stackedChartOptions = {
        ...chartOptions,
        scales: {
            x: { stacked: true, ticks: { color: '#ffffff', font: { size: 13 } }, grid: { color: 'var(--border2)' } },
            y: { stacked: true, ticks: { color: '#ffffff', font: { size: 13 } }, grid: { color: 'var(--border2)' } },
        },
    };

    const topCaller = waitingStats.length
        ? waitingStats.reduce((best, cur) => cur.totalCalls > best.totalCalls ? cur : best)
        : null;

    const datepickerSx = {
        width: 150,
        '& .MuiOutlinedInput-root': { color: 'var(--text)', '& fieldset': { borderColor: 'var(--border2)' } },
        '& .MuiInputLabel-root': { color: 'var(--text2)' },
        '& .MuiSvgIcon-root': { color: 'var(--text2)' },
    };

    return (
        <Box sx={{ p: 3, pb: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Header + Controls */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography sx={{ fontSize: '1.35rem', fontWeight: 700 }}>Custom Range Overview</Typography>
                    <Typography sx={{ fontSize: '1rem', color: 'var(--text2)' }}>
                        Select up to 1 month · fetches live · safe to navigate away while fetching
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <DatePicker
                        label="From"
                        value={fromDate}
                        onChange={handleFromChange}
                        maxDate={toDate || today}
                        slotProps={{ textField: { size: 'small', sx: datepickerSx } }}
                    />
                    <DatePicker
                        label="To"
                        value={toDate}
                        onChange={handleToChange}
                        minDate={fromDate || undefined}
                        maxDate={today}
                        slotProps={{ textField: { size: 'small', sx: datepickerSx } }}
                    />
                    <Button
                        variant="contained"
                        onClick={handleFetch}
                        disabled={isFetching || !!dateError}
                        sx={{
                            backgroundColor: 'var(--accent)', color: '#000', fontWeight: 700, textTransform: 'none',
                            '&:hover': { backgroundColor: '#00b8d4' },
                            '&.Mui-disabled': { backgroundColor: 'var(--surface2)', color: 'var(--text3)' },
                        }}
                    >
                        {isFetching ? 'Fetching...' : 'Fetch'}
                    </Button>

                    {hasFetched && (
                        <Button
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                            onClick={handleExportExcel}
                            sx={{ color: 'var(--accent)', borderColor: 'var(--accent)', fontWeight: 700, textTransform: 'none', '&:hover': { borderColor: '#00b8d4', color: '#00b8d4' } }}
                        >
                            Export Excel
                        </Button>
                    )}
                </Box>
            </Box>

            {dateError && (
                <Alert severity="error" sx={{ backgroundColor: 'rgba(255,69,102,0.1)', color: 'var(--red)', border: '1px solid var(--red)' }}>
                    {dateError}
                </Alert>
            )}

            {error && (
                <Alert severity="error" sx={{ backgroundColor: 'rgba(255,69,102,0.1)', color: 'var(--red)', border: '1px solid var(--red)' }}>
                    {error}
                </Alert>
            )}

            {isFetching && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3, backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)' }}>
                    <CircularProgress size={20} sx={{ color: 'var(--accent)' }} />
                    <Box>
                        <Typography sx={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>
                            {progress}
                        </Typography>
                        <Typography sx={{ color: 'var(--text3)', fontSize: '0.82rem', mt: 0.3 }}>
                            1 request per 1.2s to avoid rate limits · you can safely navigate away
                        </Typography>
                    </Box>
                </Box>
            )}

            {hasFetched && !isFetching && (
                <>
                    <Typography sx={{ fontSize: '1rem', color: 'var(--text2)' }}>
                        {fromDate?.toLocaleDateString()} → {toDate?.toLocaleDateString()} ·{' '}
                        {waitingStats.reduce((acc, u) => acc + u.totalCalls, 0)} calls
                        {topCaller && ` · Top caller: ${topCaller.name} (${topCaller.totalCalls} calls, ${fmtDuration(topCaller.talkTime)})`}
                    </Typography>

                    {/* Stat cards */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                        {waitingStats.map((u, i) => (
                            <Box key={u.name} sx={{ backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: USER_COLORS[i] }} />
                                    <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>{u.name}</Typography>
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                    {(
                                        [
                                            ['Total', u.totalCalls],
                                            ['Talk Time', fmtDuration(u.talkTime)],
                                            ['Outbound', u.outbound],
                                            ['Inbound', u.inbound],
                                            ['Missed', u.missed],
                                            ['Voicemail', u.voicemail],
                                            ['Hangup/Declined', u.hangup],
                                            ['Connected', u.connected],
                                        ] as [string, string | number][]).map(([label, val]) => (
                                            <Box key={label}>
                                                <Typography sx={{ fontSize: '0.8rem', color: 'var(--text3)' }}>{label}</Typography>
                                                <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: label === 'Missed' ? 'var(--red)' : 'var(--text)' }}>
                                                    {val}
                                                </Typography>
                                            </Box>
                                        ))}
                                </Box>
                            </Box>
                        ))}
                    </Box>

                    {/* Charts row 1 */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.8fr)', gap: 3 }}>
                        <Box sx={{ backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 3 }}>
                            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)', mb: 2 }}>Calls share by user</Typography>
                            <Pie data={pieData} options={{ plugins: { legend: { labels: { color: '#ffffff', font: { size: 14 } } }, tooltip: { bodyColor: '#ffffff', titleColor: '#ffffff', bodyFont: { size: 14 }, titleFont: { size: 15 } } } }} />
                        </Box>
                        <Box sx={{ backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 3 }}>
                            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)', mb: 2 }}>Talk time by user</Typography>
                            <Bar data={talkTimeBarData} options={chartOptions} />
                        </Box>
                    </Box>

                    {/* Charts row 2 */}
                    <Box sx={{ backgroundColor: 'var(--surface)', borderRadius: 3, border: '1px solid var(--border)', p: 3 }}>
                        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)', mb: 2 }}>Inbound / Outbound / Missed by user</Typography>
                        <Bar data={directionBarData} options={stackedChartOptions} />
                    </Box>
                </>
            )}

            {!hasFetched && !isFetching && !error && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                    <Typography sx={{ color: 'var(--text3)', fontSize: '1rem' }}>
                        Select a date range and click Fetch to load call data
                    </Typography>
                </Box>
            )}
        </Box>
    );
}