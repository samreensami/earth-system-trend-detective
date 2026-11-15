"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

// ── Types (local — mirrors AnalysisResult shape) ───────────────────────────────

interface TimeSeriesPoint { year: number; value: number; trend: number }

interface AnalysisResult {
  variable: string;
  variable_name: string;
  unit: string;
  time_series: TimeSeriesPoint[];
  trend: {
    direction: "increasing" | "decreasing" | "stable";
    sens_slope_per_decade: number;
    mann_kendall: { p_value: number };
    is_significant: boolean;
    r_squared: number;
  };
  metadata: { start_year: number; end_year: number; data_points: number };
}

export interface MultiVarComparisonProps { results: AnalysisResult[] }

// ── Palette ────────────────────────────────────────────────────────────────────

const PALETTE = ["#38bdf8", "#a78bfa", "#34d399", "#fb923c", "#f472b6"];

// ── Maths ──────────────────────────────────────────────────────────────────────

function normalize(vals: number[]): number[] {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / vals.length);
  if (std === 0) return vals.map(() => 0);
  return vals.map((v) => +((v - mean) / std).toFixed(4));
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(
    xs.reduce((s, x) => s + (x - mx) ** 2, 0) *
    ys.reduce((s, y) => s + (y - my) ** 2, 0)
  );
  return den === 0 ? 0 : +(num / den).toFixed(4);
}

function fmtP(p: number): string { return p < 0.001 ? "< 0.001" : p.toFixed(3); }

// ── Tooltip ────────────────────────────────────────────────────────────────────

function MultiVarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-space-900 border border-violet-900/60 rounded-lg px-4 py-3 shadow-xl text-sm min-w-[170px]">
      <p className="text-violet-400 font-semibold mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-mono text-xs mb-0.5">
          {p.name}: {typeof p.value === "number" ? `${p.value > 0 ? "+" : ""}${p.value.toFixed(3)}` : "—"} σ
        </p>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MultiVarComparison({ results }: MultiVarComparisonProps) {
  const chartData = useMemo(() => {
    const seriesMap = new Map<string, Map<number, number>>();
    results.forEach((r) => {
      const normed = normalize(r.time_series.map((p) => p.value));
      const m = new Map<number, number>();
      r.time_series.forEach((p, i) => m.set(p.year, normed[i]));
      seriesMap.set(r.variable, m);
    });

    const allYearSets = results.map((r) => new Set(r.time_series.map((p) => p.year)));
    const commonYears = [...allYearSets[0]]
      .filter((y) => allYearSets.every((s) => s.has(y)))
      .sort((a, b) => a - b);

    return commonYears.map((year) => {
      const pt: Record<string, number | undefined> = { year };
      results.forEach((r) => { pt[r.variable] = seriesMap.get(r.variable)?.get(year); });
      return pt;
    });
  }, [results]);

  const correlations = useMemo(() => {
    const pairs: { a: AnalysisResult; b: AnalysisResult; r: number }[] = [];
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const ra = results[i], rb = results[j];
        const commonYears = ra.time_series
          .map((p) => p.year)
          .filter((y) => rb.time_series.some((p) => p.year === y));
        const xs = commonYears.map((y) => ra.time_series.find((p) => p.year === y)!.value);
        const ys = commonYears.map((y) => rb.time_series.find((p) => p.year === y)!.value);
        pairs.push({ a: ra, b: rb, r: pearsonR(xs, ys) });
      }
    }
    return pairs;
  }, [results]);

  if (results.length < 2 || chartData.length < 2) return null;

  return (
    <div className="rounded-2xl border border-violet-500/25 bg-space-900/50 p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-200 font-semibold text-sm uppercase tracking-widest">
            Multi-Variable Comparison
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Both series normalised to Z-scores (σ) · {chartData.length} common years
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {correlations.map(({ a, b, r }) => {
            const abs = Math.abs(r);
            const strength = abs > 0.7 ? "Strong" : abs > 0.4 ? "Moderate" : "Weak";
            const dir      = r > 0 ? "positive" : "negative";
            const cls = abs > 0.7
              ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/25"
              : abs > 0.4
              ? "text-amber-300 bg-amber-500/10 border-amber-500/25"
              : "text-slate-400 bg-slate-700/20 border-slate-600/30";
            return (
              <div key={`${a.variable}-${b.variable}`}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border ${cls}`}>
                <span className="font-mono">r = {r >= 0 ? "+" : ""}{r.toFixed(2)}</span>
                <span className="ml-1.5 opacity-75">· {strength} {dir} correlation</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Normalised chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 8, right: 20, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="#1e3a5f" vertical={false} />
          <XAxis dataKey="year" stroke="#475569"
            tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false}
            axisLine={{ stroke: "#1e3a5f" }} />
          <YAxis stroke="#475569"
            tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={false}
            tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}σ`} width={56} />
          <Tooltip content={<MultiVarTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
            formatter={(value: string) => {
              const r = results.find((x) => x.variable === value);
              return (
                <span style={{ color: "#94a3b8" }}>
                  {r?.variable_name ?? value}{r?.unit ? ` (${r.unit})` : ""}
                </span>
              );
            }}
          />
          <ReferenceLine y={0} stroke="#334155" strokeDasharray="2 4" />
          {results.map((r, i) => (
            <Line
              key={r.variable}
              type="monotone"
              dataKey={r.variable}
              name={r.variable}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "#020817", strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Per-variable stats cards */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${results.length}, minmax(0, 1fr))` }}
      >
        {results.map((r, i) => {
          const color = PALETTE[i % PALETTE.length];
          const dirArrow = r.trend.direction === "increasing" ? "↑"
            : r.trend.direction === "decreasing" ? "↓" : "→";
          const dirColor = r.trend.direction === "increasing" ? "#ef4444"
            : r.trend.direction === "decreasing" ? "#38bdf8" : "#a3e635";
          const sign = r.trend.sens_slope_per_decade >= 0 ? "+" : "";
          return (
            <div key={r.variable}
              className="rounded-xl border border-slate-700/40 bg-space-800/60 p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-sm font-semibold text-slate-200 leading-tight truncate">
                  {r.variable_name}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-3 font-mono">{r.unit} · {r.metadata.data_points} years</p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Rate / decade</span>
                  <span className="font-mono font-semibold" style={{ color: dirColor }}>
                    {dirArrow} {sign}{r.trend.sens_slope_per_decade.toFixed(3)} {r.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">MK p-value</span>
                  <span className={`font-mono ${r.trend.is_significant ? "text-emerald-400" : "text-slate-400"}`}>
                    {fmtP(r.trend.mann_kendall.p_value)}{r.trend.is_significant ? " ✓" : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">OLS R²</span>
                  <span className="font-mono text-slate-300">{r.trend.r_squared.toFixed(3)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
