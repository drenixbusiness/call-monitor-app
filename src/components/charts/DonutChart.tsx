'use client';

import { Box, Typography } from '@mui/material';
import { useGlobalContext } from '../GlobalContext';

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  width?: number;
  height?: number;
}

export function DonutChart({ data, width = 200, height = 200 }: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return (
      <Box sx={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography>No data available</Typography>
      </Box>
    );
  }
  const radius = Math.min(width, height) / 2 - 20;
  const centerX = width / 2;
  const centerY = height / 2;

  let currentAngle = -Math.PI / 2;

  return (
    <Box sx={{ width, height, position: 'relative' }}>
      <svg width={width} height={height}>
        {data.map((item, index) => {
          const angle = (item.value / total) * 2 * Math.PI;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;

          const x1 = centerX + radius * Math.cos(startAngle);
          const y1 = centerY + radius * Math.sin(startAngle);
          const x2 = centerX + radius * Math.cos(endAngle);
          const y2 = centerY + radius * Math.sin(endAngle);

          const largeArcFlag = angle > Math.PI ? 1 : 0;

          const pathData = [
            `M ${centerX} ${centerY}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            'Z'
          ].join(' ');

          currentAngle = endAngle;

          return (
            <path
              key={index}
              d={pathData}
              fill={item.color}
            />
          );
        })}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius * 0.6}
          fill="#07090f"
        />
        <text
          x={centerX}
          y={centerY - 10}
          textAnchor="middle"
          fontSize="18"
          fontWeight="bold"
          fill="#dde2f0"
        >
          {total}
        </text>
        <text
          x={centerX}
          y={centerY + 10}
          textAnchor="middle"
          fontSize="14"
          fill="#8892b0"
        >
          Total Calls
        </text>
      </svg>
      <Box sx={{ position: 'absolute', right: 0, top: 0 }}>
        {data.map((item, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Box sx={{ width: 12, height: 12, backgroundColor: item.color, mr: 1, borderRadius: 1 }} />
            <Typography sx={{ fontSize: '0.85rem', color: '#8892b0' }}>
              {item.label}: {item.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function OutboundInboundChart() {
  const { allCalls, globalDateFilter } = useGlobalContext();

  const allFilteredCalls = Object.values(allCalls).flat().filter(call => {
    const callDate = new Date(call.startTime).toISOString().split('T')[0];
    return callDate >= globalDateFilter.from && callDate <= globalDateFilter.to;
  });

  const outbound = allFilteredCalls.filter(call => call.direction === 'Outbound').length;
  const inbound = allFilteredCalls.filter(call => call.direction === 'Inbound').length;

  const data = [
    { label: 'Outbound', value: outbound, color: '#00d9f5' },
    { label: 'Inbound', value: inbound, color: '#9b7dff' },
  ];

  return <DonutChart data={data} />;
}