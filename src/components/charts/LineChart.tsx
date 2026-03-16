'use client';

import { Box, Typography } from '@mui/material';
import { useGlobalContext } from '../GlobalContext';

const avatarColors = ['#00d9f5', '#ff4566', '#9b7dff', '#00e09a', '#ffcc44', '#ff8c42', '#4db8ff', '#ff6b9d'];

interface LineChartProps {
  data: { date: string; values: number[] }[];
  colors: string[];
  width?: number;
  height?: number;
}

export function LineChart({ data, colors, width = 400, height = 200 }: LineChartProps) {
  if (data.length === 0) {
    return (
      <Box sx={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography>No data available</Typography>
      </Box>
    );
  }

  const maxValue = Math.max(...data.flatMap(d => d.values));
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const getX = (index: number) => padding + (index / Math.max(data.length - 1, 1)) * chartWidth;
  const getY = (value: number) => maxValue > 0 ? padding + (1 - value / maxValue) * chartHeight : padding + chartHeight / 2;

  return (
    <Box sx={{ width, height, position: 'relative' }}>
      <svg width={width} height={height}>
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
          <line
            key={ratio}
            x1={padding}
            y1={padding + ratio * chartHeight}
            x2={width - padding}
            y2={padding + ratio * chartHeight}
            stroke="#1e2436"
            strokeWidth={1}
          />
        ))}

        {colors.map((color, lineIndex) => (
          <g key={lineIndex}>
            {data.map((point, index) => {
              if (index === 0) return null;
              const prevPoint = data[index - 1];
              return (
                <line
                  key={index}
                  x1={getX(index - 1)}
                  y1={getY(prevPoint.values[lineIndex])}
                  x2={getX(index)}
                  y2={getY(point.values[lineIndex])}
                  stroke={color}
                  strokeWidth={2}
                />
              );
            })}
            {data.map((point, index) => (
              <circle
                key={`dot-${index}`}
                cx={getX(index)}
                cy={getY(point.values[lineIndex])}
                r={4}
                fill={color}
              />
            ))}
          </g>
        ))}
        {data.map((point, index) => (
          <text
            key={`x-${index}`}
            x={getX(index)}
            y={height - 10}
            textAnchor="middle"
            fontSize="12"
            fill="#8892b0"
          >
            {new Date(point.date).toLocaleDateString()}
          </text>
        ))}
        {[0, maxValue * 0.25, maxValue * 0.5, maxValue * 0.75, maxValue].map((value, index) => (
          <text
            key={`y-${index}`}
            x={10}
            y={getY(value) + 4}
            textAnchor="start"
            fontSize="12"
            fill="#8892b0"
          >
            {Math.round(value)}
          </text>
        ))}
      </svg>
    </Box>
  );
}

export function CallVolumeOverTimeChart() {
  const { users, allCalls, globalDateFilter } = useGlobalContext();

  const startDate = new Date(globalDateFilter.from);
  const endDate = new Date(globalDateFilter.to);
  const dates = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const data = dates.map(date => {
    const values = users.map(user => {
      const userCalls = allCalls[user.id] || [];
      return userCalls.filter(call => {
        const callDate = new Date(call.startTime).toISOString().split('T')[0];
        return callDate === date;
      }).length;
    });
    return { date, values };
  });

  const colors = users.map((_, index) => avatarColors[index % avatarColors.length]);

  return <LineChart data={data} colors={colors} />;
}