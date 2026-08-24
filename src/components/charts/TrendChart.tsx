'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DailyTrendPoint } from '@/modules/analytics/analytics.service';

function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export function TrendChart({ data }: { data: DailyTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="#e1e0d9" strokeWidth={1} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDay}
          tick={{ fill: '#898781', fontSize: 12 }}
          axisLine={{ stroke: '#c3c2b7' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#898781', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={28}
        />
        <Tooltip
          cursor={{ fill: '#f0efec' }}
          formatter={(value: number) => [value, 'Commandes livrées']}
          labelFormatter={(label: string) => formatDay(label)}
          contentStyle={{ border: '1px solid #e1e0d9', borderRadius: 6, fontSize: 13 }}
        />
        <Bar dataKey="delivered" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
