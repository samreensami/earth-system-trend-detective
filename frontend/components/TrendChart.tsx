"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface TimeSeriesPoint {
  year: number;
  value: number;
  trend: number;
}

interface TrendChartProps {
  data: TimeSeriesPoint[];
  unit: string;
  variableName: string;
  direction: string;
}

const DIRECTION_COLORS = {
  increasing: "#ef4444",
  decreasing: "#38bdf8",
  stable:     "#a3e635",
};

function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-space-900 border border-sky-900/60 rounded-lg px-4 py-3 shadow-xl text-sm">
      <p className="text-sky-400 font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(3) : "—"} {unit}
        </p>
      ))}
    </div>
  );
}

export default function TrendChart({
  data,
  unit,
  variableName,
  direction,
}: TrendChartProps) {
  const trendColor =
    DIRECTION_COLORS[direction as keyof typeof DIRECTION_COLORS] ?? "#94a3b8";

  const values = data.map((d) => d.value);
  const mean   = values.reduce((a, b) => a + b, 0) / values.length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-slate-200 font-semibold text-sm uppercase tracking-widest">
          Time Series — {variableName}
        </h2>
        <div className="flex gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-0.5 bg-sky-400 inline-block rounded" />
            Observed
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-6 h-0.5 inline-block rounded border-t-2 border-dashed"
              style={{ borderColor: trendColor }}
            />
            Trend
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="4 4" stroke="#1e3a5f" vertical={false} />

          <XAxis
            dataKey="year"
            stroke="#475569"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "#1e3a5f" }}
          />

          <YAxis
            stroke="#475569"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v.toFixed(1)}`}
            width={52}
          />

          <Tooltip content={<CustomTooltip unit={unit} />} />

          <ReferenceLine
            y={mean}
            stroke="#334155"
            strokeDasharray="2 4"
            label={{ value: "Mean", fill: "#475569", fontSize: 10, position: "insideTopLeft" }}
          />

          <Area
            type="monotone"
            dataKey="value"
            name="Observed"
            stroke="#0ea5e9"
            strokeWidth={2}
            fill="url(#areaGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#0ea5e9", stroke: "#020817", strokeWidth: 2 }}
          />

          <Line
            type="linear"
            dataKey="trend"
            name="Trend"
            stroke={trendColor}
            strokeWidth={2.5}
            strokeDasharray="6 3"
            dot={false}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
