import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { ChartData } from '../types';

interface ChartRendererProps {
  data: ChartData;
}

// Cores baseadas no Brasão de São Gonçalo dos Campos
// Verde, Azul, Amarelo e variações
const COLORS = [
  '#009e49', // Verde Bandeira (Primary)
  '#00b0f0', // Azul Ciano (Secondary)
  '#ffcb05', // Amarelo (Accent)
  '#1e3a8a', // Azul Escuro
  '#f59e0b', // Laranja/Amarelo Escuro
  '#10b981', // Verde Esmeralda
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 p-3 rounded shadow-lg text-sm">
        <p className="font-semibold text-slate-200 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const ChartRenderer: React.FC<ChartRendererProps> = ({ data }) => {
  const xAxisKey = data.xAxisKey || "label";
  
  // Auto-detect data keys if not provided
  // We look at the first data entry and take all keys that are NOT the x-axis label
  let dataKeys = data.dataKeys;
  if (!dataKeys && data.data && data.data.length > 0) {
    dataKeys = Object.keys(data.data[0]).filter(key => key !== xAxisKey);
  }
  // Fallback
  if (!dataKeys || dataKeys.length === 0) {
    dataKeys = ["value"];
  }

  const renderChart = () => {
    switch (data.type) {
      case 'bar':
        return (
          <BarChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey={xAxisKey} stroke="#94a3b8" fontSize={12} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#334155', opacity: 0.2 }} />
            <Legend />
            {dataKeys.map((key, index) => (
              <Bar 
                key={key} 
                dataKey={key} 
                name={key === 'value' ? 'Valor' : key}
                fill={COLORS[index % COLORS.length]} 
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey={xAxisKey} stroke="#94a3b8" fontSize={12} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {dataKeys.map((key, index) => (
              <Line 
                key={key} 
                type="monotone" 
                dataKey={key} 
                name={key === 'value' ? 'Valor' : key}
                stroke={COLORS[index % COLORS.length]} 
                strokeWidth={3}
                dot={{ r: 4, fill: '#1e293b', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey={xAxisKey} stroke="#94a3b8" fontSize={12} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {dataKeys.map((key, index) => (
              <Area 
                key={key} 
                type="monotone" 
                dataKey={key} 
                name={key === 'value' ? 'Valor' : key}
                stroke={COLORS[index % COLORS.length]} 
                fill={COLORS[index % COLORS.length]} 
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        );
      case 'pie':
        const pieDataKey = dataKeys[0];
        return (
          <PieChart>
            <Pie
              data={data.data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey={pieDataKey}
              nameKey={xAxisKey}
            >
              {data.data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );
      default:
        return <div className="text-red-400">Tipo de gráfico desconhecido</div>;
    }
  };

  return (
    <div className="w-full mt-4 mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
      <h3 className="text-lg font-semibold text-slate-100 mb-4 text-center">{data.title}</h3>
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
      {data.description && (
        <p className="text-xs text-slate-400 mt-2 text-center italic">{data.description}</p>
      )}
    </div>
  );
};