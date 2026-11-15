"use client";

import { useMemo, useEffect, useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import ReportCard from "./ReportCard";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimeSeriesPoint { year: number; value: number; trend: number; anomalyZ?: number }

interface Narrative {
  headline: string;
  trend_overview: string;
  statistical_verdict: string;
  scientific_context: string;
}

interface AnalysisResult {
  time_series: TimeSeriesPoint[];
  variable: string;
  variable_name: string;
  unit: string;
  trend: {
    direction: "increasing" | "decreasing" | "stable";
    slope: number; slope_per_decade: number;
    sens_slope: number; sens_slope_per_decade: number;
    r_squared: number; p_value_linear: number;
    mann_kendall: { s: number; z: number; p_value: number };
    is_significant: boolean; confidence: string;
  };
  narrative?: Narrative;
  metadata: {
    latitude: number | null; longitude: number | null;
    start_year: number; end_year: number;
    data_points: number; source?: string; original_filename?: string;
  };
  source_format?: string;
}

export interface TrendResultsDashboardProps {
  result: AnalysisResult | null;
  loading: boolean;
  onReset: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  "Querying NASA POWER API for historical records…",
  "Parsing annual time-series data points…",
  "Running Mann-Kendall non-parametric significance test…",
  "Computing Sen's Slope (median of all pairwise slopes)…",
  "Fitting OLS linear regression & calculating R²…",
  "Generating AI climate insights…",
];

const DIRECTION_COLOR = { increasing: "#ef4444", decreasing: "#38bdf8", stable: "#a3e635" };

const CLIMATE_EVENTS: Record<number, string> = {
  1983: "El Niño 1982–83",
  1992: "Mt. Pinatubo cooling",
  1998: "Super El Niño",
  1999: "Strong La Niña",
  2007: "Arctic sea ice record min.",
  2010: "El Niño/La Niña flip",
  2012: "Arctic record melt",
  2016: "Hottest year on record",
  2020: "2nd hottest year",
  2023: "Record global heat",
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function downloadRawData(result: AnalysisResult) {
  const header = ["Year", "Observed_Value", "OLS_Trend", result.unit ? `Unit: ${result.unit}` : ""].filter(Boolean).join(",");
  const rows = result.time_series.map(
    (p) => `${p.year},${p.value},${p.trend}`
  );
  const meta = [
    `# Variable: ${result.variable_name} (${result.variable})`,
    `# Period: ${result.metadata.start_year}–${result.metadata.end_year}`,
    result.metadata.latitude != null ? `# Location: ${result.metadata.latitude}°, ${result.metadata.longitude}°` : null,
    `# Source: ${result.metadata.source ?? "NASA POWER"}`,
    `# Mann-Kendall p-value: ${result.trend.mann_kendall.p_value.toFixed(4)}`,
    `# Sen's Slope/decade: ${result.trend.sens_slope_per_decade.toFixed(4)} ${result.unit}/decade`,
    `# OLS R²: ${result.trend.r_squared.toFixed(4)}`,
    "",
    header,
  ].filter((l) => l !== null).join("\n");
  const csv = [meta, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${result.variable}_${result.metadata.start_year}-${result.metadata.end_year}_raw.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtP(p: number): string { return p < 0.001 ? "< 0.001" : p.toFixed(3); }
function fmtS(n: number, d = 3): string { return `${n > 0 ? "+" : ""}${n.toFixed(d)}`; }

function withAnomalyZ(data: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (data.length < 3) return data;
  const vals = data.map((d) => d.value);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / vals.length);
  if (std === 0) return data;
  return data.map((d) => ({ ...d, anomalyZ: (d.value - mean) / std }));
}

// Client-side narrative fallback (used only if backend didn't return one)
function buildNarrativeFallback(result: AnalysisResult): Narrative {
  const { trend, variable_name, unit, metadata } = result;
  const dur  = metadata.end_year - metadata.start_year;
  const rate = Math.abs(trend.sens_slope_per_decade);
  const sign = trend.direction === "decreasing" ? "−" : "+";
  const dirWord = trend.direction === "increasing" ? "upward"
    : trend.direction === "decreasing" ? "downward" : "no discernible";
  const mkP = fmtP(trend.mann_kendall.p_value);

  const headline = trend.direction === "stable"
    ? `No significant trend detected in ${variable_name} over ${dur} years (p = ${mkP})`
    : `${trend.is_significant ? "Significant" : "Non-significant"} ${trend.direction} trend: ${sign}${rate.toFixed(3)} ${unit}/decade over ${dur} years (p = ${mkP})`;

  const trend_overview = `Analysis of ${variable_name} data over a ${dur}-year window (${metadata.start_year}–${metadata.end_year}) reveals a ${dirWord} trend at ${sign}${rate.toFixed(3)} ${unit}/decade by Sen's robust slope — a rank-based estimator resistant to outliers and recommended by the WMO for environmental time-series.`;

  const statistical_verdict = trend.is_significant
    ? `The Mann-Kendall non-parametric test returns p = ${mkP} (Z = ${trend.mann_kendall.z.toFixed(2)}), conclusively rejecting the null hypothesis of no trend at the 95% confidence level; OLS regression corroborates the finding with R² = ${trend.r_squared.toFixed(2)}.`
    : `The Mann-Kendall test returns p = ${mkP} (Z = ${trend.mann_kendall.z.toFixed(2)}), which does not reach the α = 0.05 threshold — the observed pattern cannot be statistically distinguished from inter-annual natural variability (OLS R² = ${trend.r_squared.toFixed(2)}).`;

  const vl = variable_name.toLowerCase();
  let scientific_context: string;
  if (vl.includes("temperature") || vl.includes("t2m")) {
    if (trend.direction === "increasing" && trend.is_significant) {
      const proj = ((rate * (2100 - metadata.end_year)) / 10).toFixed(1);
      scientific_context = `A warming rate of ${rate.toFixed(3)} ${unit}/decade is consistent with IPCC AR6 anthropogenic climate change signals; extrapolating this trend suggests approximately +${proj} ${unit} of additional warming by 2100.`;
    } else if (trend.direction === "decreasing" && trend.is_significant) {
      scientific_context = "A significant cooling trend is atypical in the global warming context and may reflect localized land-surface feedback, aerosol loading, or shifts in large-scale circulation; cross-referencing with MODIS land-cover and MERRA-2 aerosol optical depth products is recommended.";
    } else {
      scientific_context = `The absence of a significant trend may reflect natural multi-decadal oscillations (ENSO, PDO, AMO) masking the forced signal, or the ${dur}-year window may be insufficient to statistically isolate a trend above the noise floor of natural variability.`;
    }
  } else if (vl.includes("precip") || vl.includes("rain")) {
    scientific_context = trend.is_significant
      ? "Statistically significant precipitation changes have direct implications for flood frequency, groundwater recharge, and agricultural planning — this signal should be integrated into regional water resource management frameworks."
      : `Precipitation datasets exhibit higher inter-annual variance than temperature, and ${dur}-year records are often insufficient to isolate forced trends from ENSO or monsoon teleconnections.`;
  } else {
    scientific_context = trend.is_significant
      ? `With OLS R² = ${trend.r_squared.toFixed(2)}, approximately ${(trend.r_squared * 100).toFixed(0)}% of variance is explained by the linear temporal trend — suggesting a systematic rather than purely stochastic driver.`
      : `With OLS R² = ${trend.r_squared.toFixed(2)}, the linear model explains only ${(trend.r_squared * 100).toFixed(0)}% of variance, indicating non-linear dynamics or natural oscillations dominate the signal.`;
  }

  return { headline, trend_overview, statistical_verdict, scientific_context };
}

// ── Export Functions ───────────────────────────────────────────────────────────

function exportExecutiveSummary(result: AnalysisResult, narrative: Narrative): void {
  const { trend, variable_name, unit, metadata } = result;
  const dur = metadata.end_year - metadata.start_year;
  const isCSV = metadata.source === "csv";

  const rows = [
    ["Earth Trend Detective — Executive Summary Report"],
    ["Generated", new Date().toISOString().split("T")[0]],
    [],
    ["== ANALYSIS PARAMETERS =="],
    ["Variable", variable_name],
    ["Unit", unit],
    ["Period", `${metadata.start_year}–${metadata.end_year}`],
    ["Duration (years)", dur],
    ["Observations", metadata.data_points],
    ["Data Source", isCSV ? `CSV Upload: ${metadata.original_filename ?? "unknown"}` : "NASA POWER API"],
    ...(!isCSV && metadata.latitude !== null
      ? [["Latitude", metadata.latitude], ["Longitude", metadata.longitude]]
      : []),
    [],
    ["== TREND VERDICT =="],
    ["Direction", trend.direction],
    ["Statistically Significant", trend.is_significant ? "Yes (95% confidence)" : "No"],
    [],
    ["== SEN'S SLOPE (ROBUST NON-PARAMETRIC) =="],
    ["Sen's Slope / Year", fmtS(trend.sens_slope, 5)],
    ["Sen's Slope / Decade", fmtS(trend.sens_slope_per_decade, 4)],
    [],
    ["== OLS LINEAR REGRESSION =="],
    ["OLS Slope / Year", fmtS(trend.slope, 5)],
    ["OLS Slope / Decade", fmtS(trend.slope_per_decade, 4)],
    ["R² (OLS)", trend.r_squared.toFixed(4)],
    ["OLS p-value", fmtP(trend.p_value_linear)],
    [],
    ["== MANN-KENDALL NON-PARAMETRIC TEST =="],
    ["MK S Statistic", trend.mann_kendall.s],
    ["MK Z-Score", trend.mann_kendall.z.toFixed(4)],
    ["MK p-value", fmtP(trend.mann_kendall.p_value)],
    ["Significance (α=0.05)", trend.is_significant ? "SIGNIFICANT" : "NOT SIGNIFICANT"],
    [],
    ["== AI CLIMATE INSIGHTS =="],
    ["Headline", narrative.headline],
    ["Trend Overview", narrative.trend_overview],
    ["Statistical Verdict", narrative.statistical_verdict],
    ["Scientific Context", narrative.scientific_context],
    [],
    ["== TIME SERIES DATA =="],
    [`Year,Observed (${unit}),OLS Trend (${unit})`],
    ...result.time_series.map((p) => [p.year, p.value, p.trend]),
  ];

  const csvText = rows
    .map((r) =>
      Array.isArray(r)
        ? r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
        : ""
    )
    .join("\n");

  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csvText], { type: "text/csv" })),
    download: `earth-trend-report_${result.variable}_${metadata.start_year}-${metadata.end_year}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function printPdfReport(result: AnalysisResult, narrative: Narrative): void {
  const { trend, variable_name, unit, metadata } = result;
  const isCSV = metadata.source === "csv";
  const dur = metadata.end_year - metadata.start_year;
  const anomalies = result.time_series.filter((p) => {
    const vals = result.time_series.map((d) => d.value);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / vals.length);
    return std > 0 && Math.abs((p.value - mean) / std) > 1.5;
  });

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<title>Earth Trend Detective — ${variable_name} Executive Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;padding:36px 48px;line-height:1.6}
h1{font-size:20px;font-weight:700;margin-bottom:3px;color:#0c0f17}
.sub{color:#666;font-size:11px;margin-bottom:24px;border-bottom:2px solid #e5e7eb;padding-bottom:12px}
.section{margin-bottom:22px}
.section h2{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:5px;margin-bottom:12px;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.card{border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;background:#fafafa}
.card .lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:3px}
.card .val{font-size:16px;font-family:'Courier New',monospace;font-weight:700;color:#111}
.card .hint{font-size:9.5px;color:#9ca3af;margin-top:3px}
.badge{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:999px;font-size:11px;font-weight:600;margin-right:8px;border:1px solid}
.sig{background:#d1fae5;color:#065f46;border-color:#a7f3d0}
.nosig{background:#fef3c7;color:#92400e;border-color:#fde68a}
.up{background:#fee2e2;color:#991b1b;border-color:#fca5a5}
.dn{background:#dbeafe;color:#1e40af;border-color:#93c5fd}
.st{background:#f0fdf4;color:#166534;border-color:#bbf7d0}
.headline-box{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin-bottom:16px}
.headline-box p{font-size:13px;font-weight:600;color:#0369a1}
.narr-row{margin-bottom:10px;padding-left:12px;border-left:3px solid #e5e7eb}
.narr-row .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:2px;font-weight:600}
.narr-row p{font-size:11px;color:#1f2937;line-height:1.65}
table{width:100%;border-collapse:collapse;font-family:'Courier New',monospace;font-size:10px;margin-top:4px}
th{background:#f3f4f6;text-align:left;padding:5px 8px;border:1px solid #e5e7eb;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#374151}
td{padding:3px 8px;border:1px solid #f3f4f6}
tr:nth-child(even) td{background:#f9fafb}
.footer{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:10px;color:#9ca3af;font-size:9.5px;display:flex;justify-content:space-between}
@media print{body{padding:18px 24px}@page{margin:1.5cm}}
</style></head><body>
<h1>Earth Trend Detective — Executive Report</h1>
<p class="sub">
  <strong>${variable_name}</strong> (${unit}) · ${metadata.start_year}–${metadata.end_year} · ${metadata.data_points} observations ·
  ${isCSV ? `Source: ${metadata.original_filename ?? "CSV upload"}` : `Lat ${metadata.latitude?.toFixed(2)}°, Lon ${metadata.longitude?.toFixed(2)}° · NASA POWER API`}
  · Generated ${new Date().toISOString().split("T")[0]}
</p>

<div class="section">
<h2>Verdict</h2>
<span class="badge ${trend.direction === "increasing" ? "up" : trend.direction === "decreasing" ? "dn" : "st"}">
  ${trend.direction === "increasing" ? "↑ Increasing" : trend.direction === "decreasing" ? "↓ Decreasing" : "→ Stable"} Trend
</span>
<span class="badge ${trend.is_significant ? "sig" : "nosig"}">
  ${trend.is_significant ? "✓ Statistically Significant (95%)" : "✗ Not Significant (95%)"}
</span>
</div>

<div class="section">
<h2>Key Statistics</h2>
<div class="grid">
<div class="card"><div class="lbl">Sen's Slope / Decade</div><div class="val">${fmtS(trend.sens_slope_per_decade, 4)} ${unit}</div><div class="hint">Robust non-parametric rate</div></div>
<div class="card"><div class="lbl">OLS Slope / Decade</div><div class="val">${fmtS(trend.slope_per_decade, 4)} ${unit}</div><div class="hint">Parametric regression rate</div></div>
<div class="card"><div class="lbl">Mann-Kendall p-value</div><div class="val">${fmtP(trend.mann_kendall.p_value)}</div><div class="hint">${trend.is_significant ? "Significant (< 0.05)" : "Not significant (≥ 0.05)"}</div></div>
<div class="card"><div class="lbl">MK Z-Score</div><div class="val">${trend.mann_kendall.z.toFixed(4)}</div><div class="hint">Continuity-corrected statistic</div></div>
<div class="card"><div class="lbl">OLS R²</div><div class="val">${trend.r_squared.toFixed(4)}</div><div class="hint">${(trend.r_squared * 100).toFixed(1)}% variance explained</div></div>
<div class="card"><div class="lbl">Anomalous Years</div><div class="val">${anomalies.length}</div><div class="hint">|Z-score| > 1.5 (detected)</div></div>
</div></div>

<div class="section">
<h2>AI Climate Insights</h2>
<div class="headline-box"><p>${narrative.headline}</p></div>
<div class="narr-row"><div class="lbl">Trend Overview</div><p>${narrative.trend_overview}</p></div>
<div class="narr-row"><div class="lbl">Statistical Verdict</div><p>${narrative.statistical_verdict}</p></div>
<div class="narr-row"><div class="lbl">Scientific Context</div><p>${narrative.scientific_context}</p></div>
</div>

<div class="section">
<h2>Annual Time Series — ${metadata.data_points} data points</h2>
<table>
<thead><tr><th>Year</th><th>Observed (${unit})</th><th>OLS Trend (${unit})</th></tr></thead>
<tbody>
${result.time_series.map((p, i) => `<tr><td>${p.year}</td><td>${p.value.toFixed(4)}</td><td>${p.trend.toFixed(4)}</td></tr>`).join("")}
</tbody></table>
</div>

<div class="footer">
  <span>Earth Trend Detective · NASA Space Apps Challenge 2026 · TechBitz AI Solutions</span>
  <span>Mann-Kendall + Sen's Slope + OLS · ${dur}-year window · ${isCSV ? "CSV upload" : "NASA POWER API"}</span>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Loading Skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % LOADING_STEPS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-sky-500/5 border border-sky-500/20">
        <svg className="animate-spin h-4 w-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-sky-300 font-medium">{LOADING_STEPS[step]}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[48, 36, 40, 32].map((w, i) => (
          <div key={i} className="rounded-xl border border-slate-700/40 bg-space-900/50 p-4 space-y-2.5">
            <div className="h-2.5 bg-slate-700/50 rounded animate-pulse" style={{ width: `${w}%` }} />
            <div className="h-7 w-3/4 bg-slate-700/40 rounded animate-pulse" />
            <div className="h-2 bg-slate-700/30 rounded animate-pulse" style={{ width: `${w + 10}%` }} />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-6 space-y-3">
        <div className="h-4 w-44 bg-slate-700/50 rounded animate-pulse" />
        <div className="h-10 w-full bg-slate-700/25 rounded-lg animate-pulse" />
        {[90, 75, 95, 70, 85].map((w, i) => (
          <div key={i} className="h-2.5 bg-slate-700/20 rounded animate-pulse" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="rounded-2xl border border-slate-700/40 bg-space-900/50 p-6">
        <div className="h-4 w-52 bg-slate-700/50 rounded animate-pulse mb-6" />
        <div className="h-80 w-full rounded-xl bg-slate-700/15 animate-pulse" />
      </div>
    </div>
  );
}

// ── Headline Verdict Banner ────────────────────────────────────────────────────

function HeadlineVerdictBanner({
  narrative, direction, isSignificant,
}: { narrative: Narrative; direction: "increasing" | "decreasing" | "stable"; isSignificant: boolean }) {
  const styles = {
    increasing: {
      wrap: "border-red-500/40 bg-gradient-to-r from-red-950/60 via-red-950/30 to-transparent",
      icon: "bg-red-500/15 border-red-500/35 text-red-400",
      text: "text-red-200",
      sub:  "text-red-300/60",
      dot:  "bg-red-400",
    },
    decreasing: {
      wrap: "border-sky-500/40 bg-gradient-to-r from-sky-950/60 via-sky-950/30 to-transparent",
      icon: "bg-sky-500/15 border-sky-500/35 text-sky-400",
      text: "text-sky-200",
      sub:  "text-sky-300/60",
      dot:  "bg-sky-400",
    },
    stable: {
      wrap: "border-lime-500/40 bg-gradient-to-r from-lime-950/50 via-lime-950/20 to-transparent",
      icon: "bg-lime-500/15 border-lime-500/35 text-lime-400",
      text: "text-lime-200",
      sub:  "text-lime-300/60",
      dot:  "bg-lime-400",
    },
  }[direction];

  const dirIcon = direction === "increasing" ? "↑" : direction === "decreasing" ? "↓" : "→";

  return (
    <div className={`rounded-2xl border p-5 flex items-center gap-5 ${styles.wrap}`}>
      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl font-bold shrink-0 ${styles.icon}`}>
        {dirIcon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold text-base leading-snug ${styles.text}`}>
          {narrative.headline}
        </p>
        <p className={`text-xs mt-1 ${styles.sub}`}>
          WMO-standard Mann-Kendall + Sen's Slope analysis · {isSignificant ? "Trend confirmed at 95% confidence" : "Below 95% significance threshold"}
        </p>
      </div>
      {isSignificant && (
        <div className="shrink-0 flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Significant
        </div>
      )}
    </div>
  );
}

// ── Stat Summary Card ──────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, badge,
}: {
  label: string; value: string; sub: string;
  accent?: "red" | "blue" | "green" | "sky";
  badge?: { text: string; color: string };
}) {
  const borders: Record<string, string> = {
    red:   "border-red-500/40 bg-red-500/5",
    blue:  "border-sky-500/40 bg-sky-500/5",
    green: "border-emerald-500/40 bg-emerald-500/5",
    sky:   "border-sky-400/40 bg-sky-500/8",
  };
  const texts: Record<string, string> = {
    red: "text-red-200", blue: "text-sky-200", green: "text-emerald-200", sky: "text-sky-200",
  };
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${accent ? borders[accent] : "border-slate-700/40 bg-space-900/50"}`}>
      <p className="text-xs text-slate-500 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-mono font-bold leading-tight truncate ${accent ? texts[accent] : "text-slate-100"}`}>
        {value}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {badge && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}>
            {badge.text}
          </span>
        )}
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
    </div>
  );
}

// ── AI Climate Insights Card ───────────────────────────────────────────────────

function AiInsightsCard({ narrative, aiLoading, aiSource }: {
  narrative: Narrative;
  aiLoading?: boolean;
  aiSource?: "claude" | "backend" | "client"
}) {
  const rows: [string, string, keyof Narrative][] = [
    ["📊", "Trend Overview",      "trend_overview"],
    ["🔬", "Statistical Verdict", "statistical_verdict"],
    ["🌍", "Scientific Context",  "scientific_context"],
  ];
  return (
    <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-indigo-500/15">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-sm select-none">
            🤖
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">AI Climate Insights</h2>
            <p className="text-xs text-slate-500">Plain-English scientific summary · WMO methodology · IPCC AR6 context</p>
          </div>
        </div>
        {aiLoading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-full font-medium">
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Upgrading with Claude…
          </span>
        ) : aiSource === "claude" ? (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            Powered by Claude
          </span>
        ) : (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            AI Generated
          </span>
        )}
      </div>
      {/* Body */}
      <div className="px-6 py-5 space-y-5">
        {rows.map(([icon, label, key]) => (
          <div key={label} className="flex gap-4">
            <span className="text-lg mt-0.5 shrink-0 leading-none">{icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm text-slate-300 leading-relaxed">{narrative[key]}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chart ──────────────────────────────────────────────────────────────────────

interface ProjPoint { year: number; projMid?: number; projLow?: number; projBand?: number }

function buildProjection(timeSeries: TimeSeriesPoint[], slope: number, projToYear = 2060): ProjPoint[] {
  if (timeSeries.length < 2) return [];
  const n = timeSeries.length;
  const last = timeSeries[timeSeries.length - 1];
  const intercept = last.trend - slope * last.year;
  const residuals = timeSeries.map(p => p.value - p.trend);
  const residualStd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(n - 2, 1));
  const meanYear = timeSeries.reduce((s, p) => s + p.year, 0) / n;
  const ssYear = timeSeries.reduce((s, p) => s + (p.year - meanYear) ** 2, 0);
  const out: ProjPoint[] = [];
  for (let y = last.year; y <= projToYear; y++) {
    const mid = intercept + slope * y;
    const se = residualStd * Math.sqrt(1 + 1 / n + (y - meanYear) ** 2 / Math.max(ssYear, 1));
    const margin = 1.96 * se;
    out.push({ year: y, projMid: +mid.toFixed(4), projLow: +(mid - margin).toFixed(4), projBand: +(2 * margin).toFixed(4) });
  }
  return out;
}

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  const z = payload[0]?.payload?.anomalyZ as number | undefined;
  const isAnomaly = z !== undefined && Math.abs(z) > 1.5;
  const event = CLIMATE_EVENTS[label as number];
  return (
    <div className="bg-space-900 border border-sky-900/60 rounded-lg px-4 py-3 shadow-xl text-sm min-w-[180px]">
      <p className="text-sky-400 font-semibold mb-1.5">{label}</p>
      {event && (
        <p className="text-xs text-amber-300 mb-1.5 italic border-b border-amber-500/20 pb-1.5">📅 {event}</p>
      )}
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono text-xs mb-0.5">
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(3) : "—"} {unit}
        </p>
      ))}
      {isAnomaly && (
        <p className={`text-xs mt-1.5 font-semibold ${Math.abs(z!) > 2 ? "text-red-400" : "text-amber-400"}`}>
          ⚠ {Math.abs(z!) > 2 ? "Extreme" : "Notable"} anomaly (Z = {z!.toFixed(2)})
        </p>
      )}
    </div>
  );
}

function EnhancedChart({
  data, unit, variableName, direction, slope,
}: { data: TimeSeriesPoint[]; unit: string; variableName: string; direction: "increasing" | "decreasing" | "stable"; slope: number }) {
  const trendColor = DIRECTION_COLOR[direction] ?? "#94a3b8";
  const enriched   = useMemo(() => withAnomalyZ(data), [data]);
  const mean = useMemo(() => {
    const vals = data.map((d) => d.value);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [data]);

  const lastHistYear = data[data.length - 1]?.year ?? 2023;

  const combinedData = useMemo(() => {
    const proj = buildProjection(data, slope);
    const projMap = new Map(proj.map(p => [p.year, p]));
    // historical points — attach projection start values to the last point so lines connect
    const hist = enriched.map((p, i) => ({
      ...p,
      projMid:  i === enriched.length - 1 ? projMap.get(p.year)?.projMid  : undefined,
      projLow:  i === enriched.length - 1 ? projMap.get(p.year)?.projLow  : undefined,
      projBand: i === enriched.length - 1 ? projMap.get(p.year)?.projBand : undefined,
    }));
    // future-only points
    const future = proj
      .filter(p => p.year > data[data.length - 1].year)
      .map(p => ({ year: p.year, value: undefined as unknown as number, trend: undefined as unknown as number, projMid: p.projMid, projLow: p.projLow, projBand: p.projBand }));
    return [...hist, ...future];
  }, [enriched, slope, data]);

  const anomalyDot = (props: any) => {
    const { cx, cy, payload } = props;
    const z = payload?.anomalyZ as number | undefined;
    if (!z || Math.abs(z) <= 1.5)
      return <circle key={`ad-${payload.year}`} r={0} cx={cx} cy={cy} fill="none" />;
    const extreme = Math.abs(z) > 2.0;
    const color = extreme ? "#ef4444" : "#fb923c";
    const event = CLIMATE_EVENTS[payload.year as number];
    if (event) {
      return (
        <g key={`ad-${payload.year}`}>
          <circle cx={cx} cy={cy} r={extreme ? 6 : 5}
            fill={color} stroke="#020817" strokeWidth={1.5} />
          <line x1={cx} y1={cy - 7} x2={cx} y2={cy - 20}
            stroke={color} strokeWidth={1} strokeOpacity={0.7} />
          <text
            x={cx} y={cy - 23}
            textAnchor="end"
            fill={color}
            fontSize={9}
            fontFamily="ui-monospace, monospace"
            transform={`rotate(-40, ${cx}, ${cy - 23})`}
          >
            {String(payload.year)}
          </text>
        </g>
      );
    }
    return (
      <circle key={`ad-${payload.year}`} cx={cx} cy={cy}
        r={extreme ? 5 : 4}
        fill={color}
        stroke="#020817" strokeWidth={1.5} />
    );
  };

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-slate-200 font-semibold text-sm uppercase tracking-widest">
            Time Series — {variableName}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mean: {mean.toFixed(3)} {unit} · {data.length} annual data points
          </p>
        </div>
        <div className="flex gap-4 text-xs text-slate-400 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-sky-400 inline-block rounded" />Observed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 inline-block border-t-2 border-dashed" style={{ borderColor: trendColor }} />
            OLS Trend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />Notable anomaly
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Extreme anomaly
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 inline-block border-t border-dashed border-slate-500" />
            2060 Projection
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-3 inline-block rounded-sm bg-slate-400/15 border border-slate-600/30" />
            95% Band
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={combinedData} margin={{ top: 8, right: 20, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id="etcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#1e3a5f" vertical={false} />
          <XAxis dataKey="year" stroke="#475569" tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickLine={false} axisLine={{ stroke: "#1e3a5f" }} />
          <YAxis stroke="#475569" tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(1)} width={54} />
          <Tooltip content={<ChartTooltip unit={unit} />} />
          <ReferenceLine y={mean} stroke="#334155" strokeDasharray="2 4"
            label={{ value: "Mean", fill: "#475569", fontSize: 10, position: "insideTopLeft" }} />
          <Area type="monotone" dataKey="value" name="Observed"
            stroke="#0ea5e9" strokeWidth={2} fill="url(#etcGrad)"
            dot={anomalyDot}
            activeDot={{ r: 4, fill: "#0ea5e9", stroke: "#020817", strokeWidth: 2 }} />
          <Line type="linear" dataKey="trend" name="OLS Trend"
            stroke={trendColor} strokeWidth={2.5} strokeDasharray="6 3"
            dot={false} activeDot={false} />
          {/* Projection uncertainty band */}
          <Area type="linear" dataKey="projLow" fill="transparent" stroke="none" stackId="proj" legendType="none" isAnimationActive={false} />
          <Area type="linear" dataKey="projBand" fill="rgba(148,163,184,0.1)" strokeWidth={0} stroke="none" stackId="proj" legendType="none" isAnimationActive={false} />
          {/* Projection centre line */}
          <Line type="linear" dataKey="projMid" stroke="#64748b" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
          {/* "Now" vertical rule */}
          <ReferenceLine x={lastHistYear} stroke="#334155" strokeDasharray="3 2"
            label={{ value: "Now", fill: "#475569", fontSize: 10, position: "insideTopRight" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Confidence Gauge ───────────────────────────────────────────────────────────

function ConfidenceGauge({ result }: { result: AnalysisResult }) {
  const { trend, metadata } = result;

  const pScore = trend.mann_kendall.p_value < 0.001 ? 100
    : trend.mann_kendall.p_value < 0.01  ? 85
    : trend.mann_kendall.p_value < 0.05  ? 70
    : trend.mann_kendall.p_value < 0.1   ? 45
    : 20;

  const r2Score = Math.round(Math.min(trend.r_squared * 100, 100));

  const nScore = metadata.data_points >= 40 ? 100
    : metadata.data_points >= 30 ? 85
    : metadata.data_points >= 20 ? 70
    : metadata.data_points >= 10 ? 50
    : 25;

  const composite = Math.round((pScore + r2Score + nScore) / 3);

  const color = composite >= 70 ? { bar: "#22c55e", text: "text-emerald-400", label: "High Confidence" }
    : composite >= 45           ? { bar: "#f59e0b", text: "text-amber-400",   label: "Moderate Confidence" }
    :                             { bar: "#ef4444", text: "text-red-400",      label: "Low Confidence" };

  const bars = [
    { label: "Significance (p-value)", score: pScore,   hint: `p = ${fmtP(trend.mann_kendall.p_value)}` },
    { label: "Effect size (R²)",       score: r2Score,  hint: `R² = ${trend.r_squared.toFixed(3)}` },
    { label: "Sample size (n)",        score: nScore,   hint: `n = ${metadata.data_points} years` },
  ];

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-space-900/50 p-6">
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h2 className="text-slate-200 font-semibold text-sm uppercase tracking-widest">
            Detection Confidence
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Composite score across statistical significance, effect size, and sample size
          </p>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className={`text-3xl font-bold font-mono ${color.text}`}>{composite}</span>
          <span className={`text-xs font-semibold ${color.text}`}>{color.label}</span>
        </div>
      </div>

      {/* Composite bar */}
      <div className="mb-5">
        <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${composite}%`, background: color.bar, opacity: 0.85 }}
          />
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-3 gap-4">
        {bars.map(({ label, score, hint }) => {
          const c = score >= 70 ? "#22c55e" : score >= 45 ? "#f59e0b" : "#ef4444";
          return (
            <div key={label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="font-mono" style={{ color: c }}>{score}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${score}%`, background: c, opacity: 0.7 }} />
              </div>
              <span className="text-xs text-slate-600 font-mono">{hint}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Export Toolbar ─────────────────────────────────────────────────────────────

function ExportToolbar({
  result, narrative, onReset,
}: { result: AnalysisResult; narrative: Narrative; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const isNasaSource = result.source_format !== "csv";

  function copyShareLink() {
    const { latitude, longitude, start_year, end_year } = result.metadata;
    const params = new URLSearchParams({
      lat:  String(latitude ?? ""),
      lon:  String(longitude ?? ""),
      var:  result.variable,
      from: String(start_year),
      to:   String(end_year),
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-space-900/50 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Export Report</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Share Link — NASA POWER results only */}
          {isNasaSource && (
            <button
              onClick={copyShareLink}
              className="
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                bg-emerald-600/12 border border-emerald-500/30 text-emerald-300
                hover:bg-emerald-600/22 hover:border-emerald-400/50 hover:text-emerald-200
              "
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </svg>
                  Share Results
                </>
              )}
            </button>
          )}

          {/* PDF */}
          <button
            onClick={() => printPdfReport(result, narrative)}
            className="
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              bg-indigo-600/15 border border-indigo-500/35 text-indigo-300
              hover:bg-indigo-600/28 hover:border-indigo-400/55 hover:text-indigo-200
            "
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Print / Save PDF
          </button>

          {/* Raw Data CSV */}
          <button
            onClick={() => downloadRawData(result)}
            className="
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              bg-teal-600/12 border border-teal-500/30 text-teal-300
              hover:bg-teal-600/22 hover:border-teal-400/50 hover:text-teal-200
            "
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="8 17 12 21 16 17" /><line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29" />
            </svg>
            Download Raw Data
          </button>

          {/* Executive Summary CSV */}
          <button
            onClick={() => exportExecutiveSummary(result, narrative)}
            className="
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              bg-sky-600/12 border border-sky-500/30 text-sky-300
              hover:bg-sky-600/22 hover:border-sky-400/50 hover:text-sky-200
            "
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 17H7A5 5 0 017 7h1" /><path d="M15 7h1a5 5 0 010 10h-1" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Executive Summary CSV
          </button>

          {/* Reset */}
          <button
            onClick={onReset}
            className="
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all
              border border-slate-600/40 text-slate-400
              hover:border-slate-500/60 hover:text-slate-200
            "
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
            New Analysis
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TrendResultsDashboard({
  result, loading, onReset,
}: TrendResultsDashboardProps) {
  // All hooks FIRST (before any early return)
  const [aiNarrative, setAiNarrative] = useState<Narrative | null>(null);
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiSource,    setAiSource]    = useState<"claude" | "backend" | "client">("client");

  useEffect(() => {
    if (!result) { setAiNarrative(null); setAiSource("client"); return; }
    if (result.narrative) setAiSource("backend");
    setAiLoading(true);
    fetch("/api/ai-narrative", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.narrative) { setAiNarrative(d.narrative); setAiSource("claude"); } })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [result]);

  if (loading) return <LoadingSkeleton />;
  if (!result) return null;

  const { trend, variable_name, unit } = result;

  // Use Claude AI narrative if available, then backend narrative, then client-side fallback
  const narrative: Narrative = aiNarrative ?? result.narrative ?? buildNarrativeFallback(result);

  const slopeAccent = trend.direction === "increasing" ? "red"
    : trend.direction === "decreasing" ? "blue" : "sky";

  const r2Label = trend.r_squared > 0.6 ? "Strong fit"
    : trend.r_squared > 0.3 ? "Moderate fit" : "Weak fit";

  const sigBadge = trend.is_significant
    ? { text: "● Significant", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" }
    : { text: "○ Not Significant", color: "text-slate-400 bg-slate-700/30 border-slate-600/40" };

  const dirBadge = {
    increasing: { text: "↑ Increasing", color: "text-red-400 bg-red-500/10 border-red-500/30" },
    decreasing: { text: "↓ Decreasing", color: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
    stable:     { text: "→ Stable",     color: "text-lime-400 bg-lime-500/10 border-lime-500/30" },
  }[trend.direction];

  return (
    <div className="space-y-6">

      {/* ── 1. Headline Verdict Banner ── */}
      <HeadlineVerdictBanner
        narrative={narrative}
        direction={trend.direction}
        isSignificant={trend.is_significant}
      />

      {/* ── 2. Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Sen's Slope / Decade"
          value={`${fmtS(trend.sens_slope_per_decade, 3)} ${unit}`}
          sub="Robust non-parametric rate"
          accent={slopeAccent as "red" | "blue" | "sky"}
          badge={dirBadge}
        />
        <StatCard
          label="Mann-Kendall p-value"
          value={fmtP(trend.mann_kendall.p_value)}
          sub="Non-parametric significance"
          accent={trend.is_significant ? "green" : undefined}
          badge={sigBadge}
        />
        <StatCard
          label="OLS R²"
          value={trend.r_squared.toFixed(3)}
          sub={`${(trend.r_squared * 100).toFixed(1)}% variance explained`}
          badge={{ text: r2Label, color: "text-sky-400 bg-sky-500/10 border-sky-500/20" }}
        />
        <StatCard
          label="MK Z-Score"
          value={trend.mann_kendall.z.toFixed(3)}
          sub={`S = ${trend.mann_kendall.s}`}
          accent={Math.abs(trend.mann_kendall.z) > 1.96 ? "sky" : undefined}
          badge={Math.abs(trend.mann_kendall.z) > 1.96
            ? { text: "|Z| > 1.96", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" }
            : undefined}
        />
      </div>

      {/* ── 3. Detection Confidence Gauge ── */}
      <ConfidenceGauge result={result} />

      {/* ── 4. AI Climate Insights ── */}
      <AiInsightsCard narrative={narrative} aiLoading={aiLoading} aiSource={aiSource} />

      {/* ── 4. Interactive Chart ── */}
      <div className="rounded-2xl border border-slate-700/40 bg-space-900/50 p-6">
        <EnhancedChart
          data={result.time_series}
          unit={unit}
          variableName={variable_name}
          direction={trend.direction}
          slope={trend.slope}
        />
      </div>

      {/* ── 5. Full Statistical Report ── */}
      <div className="rounded-2xl border border-slate-700/40 bg-space-900/50 p-6 space-y-2">
        <h2 className="text-slate-200 font-semibold text-sm uppercase tracking-widest mb-4">
          Full Statistical Report
        </h2>
        <ReportCard
          variableName={result.variable_name}
          unit={result.unit}
          trend={result.trend}
          metadata={result.metadata}
        />
      </div>

      {/* ── 6. Export Toolbar ── */}
      <ExportToolbar result={result} narrative={narrative} onReset={onReset} />

    </div>
  );
}
