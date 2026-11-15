"use client";

interface TrendData {
  direction: "increasing" | "decreasing" | "stable";
  slope: number;
  slope_per_decade: number;
  sens_slope: number;
  sens_slope_per_decade: number;
  r_squared: number;
  p_value_linear: number;
  mann_kendall: { s: number; z: number; p_value: number };
  is_significant: boolean;
  confidence: string;
}

interface Metadata {
  latitude: number | null;
  longitude: number | null;
  start_year: number;
  end_year: number;
  data_points: number;
  source?: string;
  original_filename?: string;
}

interface ReportCardProps {
  variableName: string;
  unit: string;
  trend: TrendData;
  metadata: Metadata;
}

const DIRECTION_CONFIG = {
  increasing: { icon: "↑", label: "Increasing", colors: "text-red-400 bg-red-500/10 border-red-500/30" },
  decreasing: { icon: "↓", label: "Decreasing", colors: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  stable:     { icon: "→", label: "Stable",     colors: "text-lime-400 bg-lime-500/10 border-lime-500/30" },
};

function StatBox({
  label, value, sub, highlight, primary,
}: {
  label: string; value: string; sub?: string; highlight?: boolean; primary?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border ${
      primary
        ? "border-sky-400/50 bg-sky-500/8 ring-1 ring-sky-500/20"
        : highlight
          ? "border-sky-700/40 bg-sky-500/5"
          : "border-slate-700/50 bg-space-900/60"
    }`}>
      <p className="text-xs text-slate-500 uppercase tracking-widest mb-1 leading-tight">{label}</p>
      <p className={`text-lg font-mono font-semibold leading-tight ${
        primary ? "text-sky-200" : highlight ? "text-sky-300" : "text-slate-100"
      }`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1 leading-tight">{sub}</p>}
    </div>
  );
}

export default function ReportCard({ variableName, unit, trend, metadata }: ReportCardProps) {
  const dirCfg = DIRECTION_CONFIG[trend.direction];
  const sigColor = trend.is_significant
    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
    : "text-amber-400 bg-amber-500/10 border-amber-500/30";

  const duration  = metadata.end_year - metadata.start_year;
  const isCSV     = metadata.source === "csv";
  const fmtSlope  = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(3)}`;
  const fmtP      = (p: number) => p < 0.001 ? "< 0.001" : p.toFixed(3);
  const unitSuffix = unit ? ` ${unit}` : "";

  return (
    <div className="space-y-5">
      {/* Headline badges */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold ${dirCfg.colors}`}>
          <span className="text-xl leading-none">{dirCfg.icon}</span>
          <span>{dirCfg.label} Trend</span>
        </div>

        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold ${sigColor}`}>
          {trend.is_significant ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Significant at {trend.confidence}
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              Not Significant at {trend.confidence}
            </>
          )}
        </div>

        <span className="text-xs text-slate-500 ml-auto">
          {metadata.data_points} observations ·{" "}
          {isCSV
            ? `${metadata.start_year}–${metadata.end_year} · source: ${metadata.original_filename ?? "CSV"}`
            : `${duration}-yr window`}
        </span>
      </div>

      {/* Stats grid — 3 × 3 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatBox
          label="Sen's Slope / Decade"
          value={`${fmtSlope(trend.sens_slope_per_decade)}${unitSuffix}`}
          sub="Robust non-parametric rate"
          primary
        />
        <StatBox
          label="OLS Slope / Decade"
          value={`${fmtSlope(trend.slope_per_decade)}${unitSuffix}`}
          sub="Parametric regression rate"
          highlight
        />
        <StatBox
          label="MK p-value"
          value={fmtP(trend.mann_kendall.p_value)}
          sub={trend.is_significant ? "Significant (< 0.05)" : "Not significant"}
          highlight={trend.is_significant}
        />
        <StatBox
          label="Sen's Slope / Year"
          value={`${trend.sens_slope > 0 ? "+" : ""}${trend.sens_slope.toFixed(5)}${unitSuffix}`}
          sub="Median pairwise slope"
        />
        <StatBox
          label="OLS Slope / Year"
          value={`${trend.slope > 0 ? "+" : ""}${trend.slope.toFixed(5)}${unitSuffix}`}
          sub="Least-squares coefficient"
        />
        <StatBox
          label="OLS p-value"
          value={fmtP(trend.p_value_linear)}
          sub="Parametric significance"
        />
        <StatBox
          label="R² (OLS)"
          value={trend.r_squared.toFixed(3)}
          sub={`${(trend.r_squared * 100).toFixed(1)}% variance explained`}
        />
        <StatBox
          label="Mann-Kendall S"
          value={trend.mann_kendall.s.toString()}
          sub="Concordant − discordant pairs"
        />
        <StatBox
          label="MK Z-score"
          value={trend.mann_kendall.z.toFixed(3)}
          sub="Standardized (continuity-corrected)"
        />
      </div>

      {/* Interpretation */}
      <div className="rounded-xl border border-slate-700/40 bg-space-900/40 px-5 py-4 text-sm text-slate-400 leading-relaxed">
        <span className="text-slate-300 font-medium">Interpretation: </span>
        {variableName}{" "}
        {!isCSV && metadata.latitude !== null && metadata.longitude !== null
          ? `at (${metadata.latitude.toFixed(2)}°N, ${metadata.longitude.toFixed(2)}°E) `
          : ""}
        shows a{" "}
        <span className={`${dirCfg.colors.split(" ")[0]} font-semibold`}>{trend.direction}</span>{" "}
        trend of{" "}
        <span className="font-mono text-slate-200">
          {fmtSlope(trend.sens_slope_per_decade)}{unitSuffix}
        </span>{" "}
        per decade (Sen&apos;s slope) over the {duration}-year period ({metadata.start_year}–{metadata.end_year}).{" "}
        {trend.is_significant
          ? `The Mann-Kendall test (p = ${fmtP(trend.mann_kendall.p_value)}) confirms this trend is statistically significant at the ${trend.confidence} confidence level — unlikely to be due to natural variability alone.`
          : `The Mann-Kendall test (p = ${fmtP(trend.mann_kendall.p_value)}) indicates this trend is NOT statistically significant at ${trend.confidence} — observed changes may be within natural variability.`}
      </div>
    </div>
  );
}
