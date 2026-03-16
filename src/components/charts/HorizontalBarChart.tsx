'use client';

import { Box, Typography } from '@mui/material';
import { useGlobalContext } from '../GlobalContext';

interface HorizontalBarChartProps {
  data: { label: string; value: number }[];
  width?: number;
  height?: number;
}

export function HorizontalBarChart({ data, width = 300, height = 200 }: HorizontalBarChartProps) {
  if (data.length === 0) {
    return (
      <Box sx={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography>No data available</Typography>
      </Box>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));
  const barHeight = height / data.length * 0.8;
  const spacing = height / data.length * 0.2;

  return (
    <Box sx={{ width, height, position: 'relative' }}>
      <svg width={width} height={height}>
        {data.map((item, index) => {
          const barWidth = maxValue > 0 ? (item.value / maxValue) * (width - 60) : 0;
          const y = index * (barHeight + spacing) + spacing / 2;
          const opacity = item.value > 0 ? 0.3 + (item.value / maxValue) * 0.7 : 0.3;

          return (
            <g key={index}>
              <rect
                x={60}
                y={y}
                width={barWidth}
                height={barHeight}
                fill="#00d9f5"
                fillOpacity={opacity}
                rx={2}
              />
              <text
                x={50}
                y={y + barHeight / 2 + 4}
                textAnchor="end"
                fontSize="14"
                fill="#8892b0"
              >
                {item.label}
              </text>
              <text
                x={70 + barWidth}
                y={y + barHeight / 2 + 4}
                textAnchor="start"
                fontSize="14"
                fill="#8892b0"
              >
                {item.value}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

export function BusiestHoursChart() {
  const { allCalls, globalDateFilter } = useGlobalContext();

  const allFilteredCalls = Object.values(allCalls).flat().filter(call => {
    const callDate = new Date(call.startTime).toISOString().split('T')[0];
    return callDate >= globalDateFilter.from && callDate <= globalDateFilter.to;
  });

  const hourCounts = Array.from({ length: 24 }, (_, hour) => {
    const count = allFilteredCalls.filter(call => {
      const callHour = new Date(call.startTime).getHours();
      return callHour === hour;
    }).length;
    return { label: `${hour.toString().padStart(2, '0')}:00`, value: count };
  });

  return <HorizontalBarChart data={hourCounts} />;
}