'use client';

import { Box, Typography } from '@mui/material';
import { useGlobalContext } from '../GlobalContext';
import { getDisplayName } from '@/utils/helpers';

const avatarColors = ['#00d9f5', '#ff4566', '#9b7dff', '#00e09a', '#ffcc44', '#ff8c42', '#4db8ff', '#ff6b9d'];

interface BarChartProps {
  data: { label: string; value: number; color: string }[];
  width?: number;
  height?: number;
}

export function BarChart({ data, width = 300, height = 200 }: BarChartProps) {
  if (data.length === 0) {
    return (
      <Box sx={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography>No data available</Typography>
      </Box>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = width / data.length * 0.8;
  const spacing = width / data.length * 0.2;

  return (
    <Box sx={{ width, height, position: 'relative' }}>
      <svg width={width} height={height}>
        {data.map((item, index) => {
          const barHeight = maxValue > 0 ? (item.value / maxValue) * (height - 40) : 0;
          const x = index * (barWidth + spacing) + spacing / 2;
          const y = height - barHeight - 20;

          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={item.color}
                rx={2}
              />
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize="14"
                fill="#8892b0"
              >
                {item.value}
              </text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const x = index * (barWidth + spacing) + spacing / 2 + barWidth / 2;
          return (
            <text
              key={`label-${index}`}
              x={x}
              y={height - 5}
              textAnchor="middle"
              fontSize="12"
              fill="#8892b0"
            >
              {item.label.split(' ')[0]}
            </text>
          );
        })}
      </svg>
    </Box>
  );
}

export function CallVolumeByUserChart() {
  const { users, allCalls, globalDateFilter } = useGlobalContext();

  const data = users.map((user, index) => {
    const userCalls = allCalls[user.id] || [];
    const filteredCalls = userCalls.filter(call => {
      const callDate = new Date(call.startTime).toISOString().split('T')[0];
      return callDate >= globalDateFilter.from && callDate <= globalDateFilter.to;
    });
    return {
      label: getDisplayName(user, users),
      value: filteredCalls.length,
      color: avatarColors[index % avatarColors.length],
    };
  });

  return <BarChart data={data} />;
}