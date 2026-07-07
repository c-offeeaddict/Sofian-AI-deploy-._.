import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

interface DataChartProps {
  data: any[];
  type: 'line' | 'bar' | 'pie' | 'area';
  xKey?: string;
  yKeys?: string[];
  title?: string;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const DataChart: React.FC<DataChartProps> = ({ data, type, xKey = 'name', yKeys = ['value'], title }) => {
  const safeYKeys = Array.isArray(yKeys) && yKeys.length > 0 ? yKeys : ['value'];
  
  const renderChart = () => {
    switch (type) {
      case 'line':
        return (
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
            <XAxis dataKey={xKey} stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: 'var(--text-primary)' }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            {safeYKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3, fill: 'var(--surface-color)', strokeWidth: 2 }} activeDot={{ r: 5 }} />
            ))}
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
            <XAxis dataKey={xKey} stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', borderRadius: '8px', fontSize: '12px' }} cursor={{ fill: 'var(--border-color)', opacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            {safeYKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
            <XAxis dataKey={xKey} stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', borderRadius: '8px', fontSize: '12px' }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            {safeYKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} />
            ))}
          </AreaChart>
        );
      case 'pie':
        return (
          <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', borderRadius: '8px', fontSize: '12px' }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={2}
              dataKey={safeYKeys[0]}
              nameKey={xKey}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full my-4 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-4">
      {title && <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-300 mb-4 uppercase tracking-wider">{title}</h4>}
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart() as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DataChart;
