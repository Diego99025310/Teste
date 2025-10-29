import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import Card from './Card.jsx';

const formatCurrency = (value) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-pink-strong">{label}</p>
      <p className="text-sm text-ink/80">{formatCurrency(data.value)}</p>
      <p className="text-xs text-pink-medium">{data.posts} posts aprovados</p>
    </div>
  );
}

export function DashboardChart({ title, subtitle, data }) {
  return (
    <Card className="h-full" padding="p-0">
      <div className="flex flex-col gap-2 border-b border-white/60 p-6 md:p-8">
        <h3 className="text-xl font-semibold text-ink">{title}</h3>
        {subtitle && <p className="text-sm text-ink/60">{subtitle}</p>}
      </div>
      <div className="h-72 w-full p-4 md:p-6">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="pinkGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="10%" stopColor="#e4447a" stopOpacity={0.9} />
                <stop offset="90%" stopColor="#f9e7ed" stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 6" stroke="#fcd0da" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#f07999', fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(value) => `${value / 1000}k`}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#e4447a', fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#f07999', strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#e4447a"
              strokeWidth={3}
              fill="url(#pinkGradient)"
              activeDot={{ r: 7, fill: '#e4447a', stroke: 'white', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default DashboardChart;
