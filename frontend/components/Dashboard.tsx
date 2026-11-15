"use client";

import { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import ResourcesPanel from "./ResourcesPanel";
import TrendResultsDashboard from "./TrendResultsDashboard";
import MultiVarComparison from "./MultiVarComparison";

const MapPickerModal = dynamic(() => import("./MapPickerModal"), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimeSeriesPoint { year: number; value: number; trend: number }

interface AnalysisResult {
  time_series: TimeSeriesPoint[];
  variable: string;
  variable_name: string;
  unit: string;
  trend: {
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
  };
  metadata: {
    latitude: number | null;
    longitude: number | null;
    start_year: number;
    end_year: number;
    data_points: number;
    source?: string;
    original_filename?: string;
  };
  source_format?: string;
}

// ── Climate Story Cards ────────────────────────────────────────────────────────

const STORY_CARDS = [
  { id: "arctic",    emoji: "🧊", title: "Arctic Warming",     subtitle: "Svalbard, Norway",        desc: "Fastest-warming region on Earth — 3× the global average rate",          lat: 78.22,  lon: 15.65,  variable: "T2M",          start_year: 1990, end_year: 2023, colors: { border: "border-cyan-500/40",    bg: "bg-cyan-500/5",    hover: "hover:border-cyan-400/60 hover:bg-cyan-500/10",    badge: "text-cyan-300 bg-cyan-500/10 border-cyan-500/25",    icon: "bg-cyan-500/15 border-cyan-500/30",    text: "text-cyan-200" } },
  { id: "amazon",    emoji: "🌧️", title: "Amazon Rainfall",    subtitle: "Manaus, Brazil",           desc: "Deforestation-driven precipitation shifts in the world's largest rainforest", lat: -3.10,  lon: -60.02, variable: "PRECTOTCORR",  start_year: 1990, end_year: 2023, colors: { border: "border-emerald-500/40", bg: "bg-emerald-500/5", hover: "hover:border-emerald-400/60 hover:bg-emerald-500/10", badge: "text-emerald-300 bg-emerald-500/10 border-emerald-500/25", icon: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-200" } },
  { id: "sahel",     emoji: "🏜️", title: "Sahel Drought",      subtitle: "Niamey, Niger",            desc: "Critical rainfall variability in Africa's most climate-stressed region",    lat: 13.52,  lon: 2.11,   variable: "PRECTOTCORR",  start_year: 1982, end_year: 2023, colors: { border: "border-amber-500/40",   bg: "bg-amber-500/5",   hover: "hover:border-amber-400/60 hover:bg-amber-500/10",   badge: "text-amber-300 bg-amber-500/10 border-amber-500/25",   icon: "bg-amber-500/15 border-amber-500/30",   text: "text-amber-200" } },
  { id: "maldives",  emoji: "🌊", title: "Maldives Warming",   subtitle: "Malé, Maldives",           desc: "Rising sea temperatures driving coral bleaching and displacement risk",      lat: 4.17,   lon: 73.51,  variable: "T2M",          start_year: 1990, end_year: 2023, colors: { border: "border-teal-500/40",    bg: "bg-teal-500/5",    hover: "hover:border-teal-400/60 hover:bg-teal-500/10",    badge: "text-teal-300 bg-teal-500/10 border-teal-500/25",    icon: "bg-teal-500/15 border-teal-500/30",    text: "text-teal-200" } },
  { id: "himalayas", emoji: "⛰️", title: "Himalayas Meltwater",subtitle: "Everest Region, Nepal",   desc: "Third Pole glacier retreat threatening 2 billion people's freshwater supply",lat: 27.98,  lon: 86.92,  variable: "T2M",          start_year: 1990, end_year: 2023, colors: { border: "border-indigo-500/40",  bg: "bg-indigo-500/5",  hover: "hover:border-indigo-400/60 hover:bg-indigo-500/10",  badge: "text-indigo-300 bg-indigo-500/10 border-indigo-500/25",  icon: "bg-indigo-500/15 border-indigo-500/30",  text: "text-indigo-200" } },
] as const;
type StoryCard = typeof STORY_CARDS[number];

// ── Static data ────────────────────────────────────────────────────────────────

const VARIABLES = [
  // ── Temperature ──────────────────────────────────────────────────────────────
  { id: "T2M",               name: "Temperature at 2 m",        unit: "°C",         category: "Temperature",    source: "NASA POWER / MERRA-2",           desc: "Air temperature 2 m above ground — the primary indicator of surface warming and cooling trends. Driven by solar radiation, greenhouse gases, and land cover change." },
  { id: "T2M_MAX",           name: "Max Temperature at 2 m",    unit: "°C",         category: "Temperature",    source: "NASA POWER / MERRA-2",           desc: "Highest air temperature each day at 2 m. Captures daytime warming and heat-extreme trends. Particularly sensitive to urban heat islands and vegetation change." },
  { id: "T2M_MIN",           name: "Min Temperature at 2 m",    unit: "°C",         category: "Temperature",    source: "NASA POWER / MERRA-2",           desc: "Lowest air temperature each day at 2 m. Night-time warming often outpaces daytime in many regions — a sensitive early-warning signal for climate change." },
  { id: "TS",                name: "Earth Skin Temperature",     unit: "°C",         category: "Temperature",    source: "NASA POWER / MERRA-2 / cf. MODIS LST", desc: "Temperature of Earth's land or ocean surface skin — equivalent to what MODIS thermal sensors measure from space. Responds faster than air temperature to vegetation change, drought, and solar forcing." },
  // ── Precipitation & Hydrology ─────────────────────────────────────────────
  { id: "PRECTOTCORR",       name: "Precipitation",             unit: "mm/day",     category: "Precipitation",    source: "NASA POWER / MERRA-2 / cf. GPM",       desc: "Total precipitation (rain + snowfall) corrected for gauge undercatch. Reflects the hydrological cycle's response to warming — can increase in some regions and decrease in others simultaneously." },
  { id: "GWETTOP",           name: "Surface Soil Wetness",       unit: "fraction",   category: "Soil / Hydrology", source: "NASA POWER / GLDAS",                   desc: "Volumetric water content of the top 5 cm of soil as a fraction of saturation (0 = dry, 1 = saturated). Key indicator for drought onset, wildfire risk, and agricultural stress." },
  { id: "GWETROOT",          name: "Root Zone Soil Wetness",     unit: "fraction",   category: "Soil / Hydrology", source: "NASA POWER / GLDAS",                   desc: "Soil moisture in the root zone (5–100 cm depth) as a fraction of saturation. Tracks plant-available water more accurately than surface measurements — key for agricultural drought and vegetation stress monitoring." },
  { id: "GWETPROF",          name: "Profile Soil Wetness",       unit: "fraction",   category: "Soil / Hydrology", source: "NASA POWER / GLDAS",                   desc: "Soil moisture integrated across the full soil column as a fraction of saturation. A comprehensive indicator of long-term hydrological change, groundwater recharge trends, and large-scale drying or wetting." },
  // ── Vegetation (NDVI proxy) ───────────────────────────────────────────────
  { id: "EVPTRNS",           name: "Plant Transpiration",        unit: "mm/day",     category: "Vegetation",       source: "NASA POWER / MERRA-2 / cf. MODIS NDVI", desc: "Water released directly by plant leaves (transpiration only) in mm/day — the closest POWER proxy to MODIS NDVI. When vegetation thins, transpiration drops; when it greens up, it rises. Pair with soil moisture to separate water-stress from land-cover change." },
  { id: "EVLAND",            name: "Total Evapotranspiration",   unit: "mm/day",     category: "Vegetation",       source: "NASA POWER / MERRA-2 / GLDAS",         desc: "Total evapotranspiration from land (soil evaporation + plant transpiration + interception). Rising trends indicate greening or increasing rainfall; falling trends signal drying, deforestation, or persistent drought." },
  // ── Radiation & Cloud ─────────────────────────────────────────────────────
  { id: "ALLSKY_SFC_SW_DWN", name: "Solar Radiation (All-Sky)", unit: "kWh/m²/day", category: "Radiation",      source: "NASA POWER / MERRA-2",           desc: "Total solar radiation reaching Earth's surface under all-sky (cloudy and clear) conditions. Affected by aerosols and cloud cover — drives agriculture productivity and surface energy balance." },
  { id: "CLOUD_AMT",         name: "Cloud Amount",               unit: "%",          category: "Cloud",          source: "NASA POWER / MERRA-2 / cf. MODIS Cloud", desc: "Fraction of sky covered by cloud (0–100%). Controls solar radiation reaching the surface and outgoing longwave radiation. Cloud trends have complex, region-dependent warming or cooling effects." },
  // ── Humidity & Moisture ───────────────────────────────────────────────────
  { id: "RH2M",              name: "Relative Humidity at 2 m",  unit: "%",          category: "Humidity",       source: "NASA POWER / MERRA-2",           desc: "Fraction of water vapour in air relative to saturation at 2 m. Rising temperatures can lower relative humidity even when absolute moisture increases — key for drought and heat-stress monitoring." },
  { id: "T2MDEW",            name: "Dew/Frost Point at 2 m",    unit: "°C",         category: "Humidity",       source: "NASA POWER / MERRA-2 / cf. AIRS", desc: "Temperature at which air becomes saturated — a direct, temperature-independent measure of atmospheric moisture. Rising dew points signal increasing humidity and latent heat in the lower atmosphere." },
  { id: "QV2M",              name: "Specific Humidity at 2 m",  unit: "g/kg",       category: "Humidity",       source: "NASA POWER / MERRA-2 / cf. AIRS", desc: "Mass of water vapour per kg of moist air at 2 m — an absolute moisture measure unlike relative humidity. Rising values indicate increasing atmospheric water vapour, which amplifies surface warming." },
  // ── Wind ──────────────────────────────────────────────────────────────────
  { id: "WS10M",             name: "Wind Speed at 10 m",        unit: "m/s",        category: "Wind",           source: "NASA POWER / MERRA-2",           desc: "Horizontal wind speed 10 m above ground. Sensitive to changing pressure gradients and surface roughness — relevant for wind energy potential, dust storms, and fire weather risk." },
  { id: "WS50M",             name: "Wind Speed at 50 m",        unit: "m/s",        category: "Wind",           source: "NASA POWER / MERRA-2",           desc: "Wind speed at 50 m hub height — standard reference level for wind turbines. Trends reveal shifts in regional wind energy potential and large-scale atmospheric circulation patterns." },
  // ── Pressure ──────────────────────────────────────────────────────────────
  { id: "PS",                name: "Surface Pressure",           unit: "kPa",        category: "Pressure",       source: "NASA POWER / MERRA-2",           desc: "Atmospheric pressure at Earth's surface. Reflects large-scale circulation patterns — shifts indicate changing storm tracks, monsoon strength, and jet-stream behaviour." },
];

const PRESETS = [
  { label: "New York",   lat: 40.71,  lon: -74.01 },
  { label: "Amazon",     lat: -3.47,  lon: -62.21 },
  { label: "Sahara",     lat: 23.42,  lon: 25.66  },
  { label: "Himalayas",  lat: 28.00,  lon: 86.92  },
  { label: "Antarctica", lat: -90.0,  lon: 0.0    },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface CsvPreview {
  columns: string[];
  suggested_date_col: string | null;
  suggested_value_col: string | null;
  preview: Record<string, string>[];
  row_count: number;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InputField({
  label, type = "text", value, onChange, placeholder, min, max, step,
}: {
  label: string; type?: string; value: string | number;
  onChange: (v: string) => void; placeholder?: string;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400 uppercase tracking-widest">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className="
          bg-space-800 border border-slate-700/60 rounded-lg px-3 py-2.5
          text-slate-100 text-sm font-mono placeholder-slate-600
          focus:outline-none focus:border-sky-500/70 focus:ring-1 focus:ring-sky-500/30
          transition-colors
        "
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400 uppercase tracking-widest">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="
          bg-space-800 border border-slate-700/60 rounded-lg px-3 py-2.5
          text-slate-100 text-sm
          focus:outline-none focus:border-sky-500/70 focus:ring-1 focus:ring-sky-500/30
          transition-colors
        "
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-5 w-5 text-sky-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      className="w-7 h-7 text-sky-400" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  // mode
  const [mode, setMode] = useState<"api" | "csv">("api");

  // API mode state
  const [lat,       setLat]       = useState("40.71");
  const [lon,       setLon]       = useState("-74.01");
  const [startYear, setStartYear] = useState("1990");
  const [endYear,   setEndYear]   = useState("2023");
  const [variable,  setVariable]  = useState("T2M");

  // CSV mode state
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver]         = useState(false);
  const [csvFile,  setCsvFile]          = useState<File | null>(null);
  const [csvPreview, setCsvPreview]     = useState<CsvPreview | null>(null);
  const [csvPreviewLoading, setCsvPreviewLoading] = useState(false);
  const [csvPreviewError,   setCsvPreviewError]   = useState<string | null>(null);
  const [dateCol,  setDateCol]          = useState("");
  const [valueCol, setValueCol]         = useState("");
  const [csvVarName, setCsvVarName]     = useState("Custom Variable");
  const [csvUnit,  setCsvUnit]          = useState("");

  // Shared
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState<string | null>(null);
  const [result,  setResult]    = useState<AnalysisResult | null>(null);

  // Story cards
  const [activeStory, setActiveStory] = useState<string | null>(null);

  // Map picker
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Multi-variable comparison
  const [compareMode,    setCompareMode]    = useState(false);
  const [compareVar,     setCompareVar]     = useState("PRECTOTCORR");
  const [compareResults, setCompareResults] = useState<AnalysisResult[]>([]);
  const [compareError,   setCompareError]   = useState<string | null>(null);

  // ── Keep compareVar ≠ variable ──
  useEffect(() => {
    if (compareVar === variable) {
      const other = VARIABLES.find((v) => v.id !== variable);
      if (other) setCompareVar(other.id);
    }
  }, [variable]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-run from shared URL params ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qLat  = params.get("lat");
    const qLon  = params.get("lon");
    const qVar  = params.get("var");
    const qFrom = params.get("from");
    const qTo   = params.get("to");
    if (!qLat || !qLon || !qVar || !qFrom || !qTo) return;
    setLat(qLat);
    setLon(qLon);
    setVariable(qVar);
    setStartYear(qFrom);
    setEndYear(qTo);
    setMode("api");
    setLoading(true);
    setError(null);
    setResult(null);
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude:   parseFloat(qLat),
        longitude:  parseFloat(qLon),
        start_year: parseInt(qFrom),
        end_year:   parseInt(qTo),
        variable:   qVar,
      }),
    })
      .then((r) => r.json())
      .then((json) => { if (json.detail) setError(json.detail); else setResult(json as AnalysisResult); })
      .catch(() => setError("Could not reach the backend. Is the FastAPI server running on port 8000?"))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mode switch ──
  function switchMode(m: "api" | "csv") {
    setMode(m);
    setResult(null);
    setError(null);
    setCompareResults([]);
    setCompareError(null);
    if (m === "api") {
      setCsvFile(null);
      setCsvPreview(null);
      setCsvPreviewError(null);
    }
  }

  // ── CSV file handling ──
  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setCsvFile(file);
    setCsvPreview(null);
    setCsvPreviewError(null);
    setResult(null);
    setError(null);
    setDateCol("");
    setValueCol("");

    setCsvPreviewLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/csv-preview", { method: "POST", body: form });
      const json = await res.json() as CsvPreview & { detail?: string };
      if (!res.ok) { setCsvPreviewError(json.detail ?? "Could not read columns."); return; }
      setCsvPreview(json);
      setDateCol(json.suggested_date_col ?? json.columns[0] ?? "");
      setValueCol(json.suggested_value_col ?? json.columns[1] ?? "");
      if (csvVarName === "Custom Variable" && json.suggested_value_col) {
        setCsvVarName(json.suggested_value_col.replace(/_/g, " ").replace(/\s*\(\w+\)\s*/, "").trim() || "Custom Variable");
      }
    } catch {
      setCsvPreviewError("Could not reach backend to read columns.");
    } finally {
      setCsvPreviewLoading(false);
    }
  }

  // ── API analyze ──
  async function handleApiAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCompareResults([]);
    setCompareError(null);

    const makeBody = (v: string) => JSON.stringify({
      latitude:   parseFloat(lat),
      longitude:  parseFloat(lon),
      start_year: parseInt(startYear),
      end_year:   parseInt(endYear),
      variable:   v,
    });
    const headers = { "Content-Type": "application/json" };

    try {
      if (compareMode && compareVar !== variable) {
        const [r1, r2] = await Promise.all([
          fetch("/api/analyze", { method: "POST", headers, body: makeBody(variable) }),
          fetch("/api/analyze", { method: "POST", headers, body: makeBody(compareVar) }),
        ]);
        const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
        if (!r1.ok) { setError(j1.detail ?? "Analysis failed."); return; }
        setResult(j1 as AnalysisResult);
        if (r2.ok) setCompareResults([j1 as AnalysisResult, j2 as AnalysisResult]);
        else setCompareError(j2.detail ?? "Compare variable failed.");
      } else {
        const res  = await fetch("/api/analyze", { method: "POST", headers, body: makeBody(variable) });
        const json = await res.json();
        if (!res.ok) { setError(json.detail ?? "Analysis failed."); return; }
        setResult(json as AnalysisResult);
      }
    } catch {
      setError("Could not reach the backend. Is the FastAPI server running on port 8000?");
    } finally {
      setLoading(false);
    }
  }

  // ── CSV analyze ──
  async function handleCsvAnalyze() {
    if (!csvFile) { setError("Please select a CSV file."); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", csvFile);
      if (dateCol)    form.append("date_column",   dateCol);
      if (valueCol)   form.append("value_column",  valueCol);
      if (csvVarName) form.append("variable_name", csvVarName);
      if (csvUnit)    form.append("unit",          csvUnit);

      const res  = await fetch("/api/analyze-csv", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) { setError(json.detail ?? "CSV analysis failed."); return; }
      setResult(json as AnalysisResult);
    } catch {
      setError("Could not reach the backend. Is the FastAPI server running on port 8000?");
    } finally {
      setLoading(false);
    }
  }

  const handleAnalyze = mode === "api" ? handleApiAnalyze : handleCsvAnalyze;

  // ── Story card runner ──
  async function runStoryCard(card: StoryCard) {
    setMode("api");
    setActiveStory(card.id);
    setLat(String(card.lat));
    setLon(String(card.lon));
    setVariable(card.variable);
    setStartYear(String(card.start_year));
    setEndYear(String(card.end_year));
    setResult(null);
    setError(null);
    setCompareResults([]);
    setCompareError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: card.lat, longitude: card.lon, start_year: card.start_year, end_year: card.end_year, variable: card.variable }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.detail ?? "Analysis failed."); return; }
      setResult(json);
    } catch {
      setError("Could not reach the backend. Is the FastAPI server running on port 8000?");
    } finally {
      setLoading(false);
      setActiveStory(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-space-950">

      {/* Header */}
      <header className="border-b border-slate-800/60 bg-space-900/60 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GlobeIcon />
            <div>
              <h1 className="text-lg font-semibold text-slate-100 leading-tight tracking-tight">
                Earth Trend Detective
              </h1>
              <p className="text-xs text-slate-500 leading-none">
                NASA POWER · Climate Analysis · Space Apps 2026
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 border border-slate-700/40 rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live NASA Data
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">

        {/* Hero */}
        <div className="text-center space-y-2 pb-2">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-100 tracking-tight">
            Be an Earth System{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">
              Trend Detective
            </span>
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm leading-relaxed">
            Query NASA POWER for any point on Earth, or upload a CSV from Giovanni, AppEEARS, NOAA CDO,
            SWOT, or any partner dataset. Get a full Mann-Kendall + Sen&apos;s Slope significance analysis.
          </p>
        </div>

        {/* ── How It Works ── */}
        <div className="rounded-2xl border border-slate-700/40 bg-space-900/40 px-6 py-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">How It Works</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                step: "01", icon: "🛰️", title: "NASA POWER API",
                desc: "Annual climate variables pulled directly from NASA's global reanalysis dataset — 40+ years of verified satellite & surface data.",
              },
              {
                step: "02", icon: "📊", title: "Mann-Kendall Test",
                desc: "Non-parametric rank-based significance test (WMO standard). Detects monotonic trends without assuming normal distribution.",
              },
              {
                step: "03", icon: "📐", title: "Sen's Slope + OLS",
                desc: "Sen's Slope gives a robust rate of change resistant to outliers. OLS regression adds R² and linear fit for corroboration.",
              },
              {
                step: "04", icon: "🤖", title: "AI Narrative",
                desc: "Claude AI synthesises the statistics into plain-language insights with IPCC AR6 scientific context — instantly shareable.",
              },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-600">{step}</span>
                  <span className="text-lg leading-none">{icon}</span>
                  <span className="text-sm font-semibold text-slate-200">{title}</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed pl-6">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Climate Stories ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">🌍 Explore Climate Stories</h3>
              <p className="text-xs text-slate-500 mt-0.5">Click any card to instantly analyze — zero configuration needed</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {STORY_CARDS.map((card) => {
              const isActive = activeStory === card.id;
              return (
                <button
                  key={card.id}
                  onClick={() => runStoryCard(card)}
                  disabled={loading}
                  className={`
                    relative text-left rounded-xl border p-4 flex flex-col gap-2.5 transition-all duration-200
                    ${card.colors.border} ${card.colors.bg} ${card.colors.hover}
                    hover:scale-[1.02] hover:shadow-lg
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                    focus:outline-none focus:ring-2 focus:ring-sky-500/40
                  `}
                >
                  {/* Loading overlay */}
                  {isActive && (
                    <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
                      <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  )}
                  {/* Icon + title */}
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center text-lg shrink-0 ${card.colors.icon}`}>
                      {card.emoji}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold leading-tight truncate ${card.colors.text}`}>{card.title}</p>
                      <p className="text-xs text-slate-500 leading-tight truncate">{card.subtitle}</p>
                    </div>
                  </div>
                  {/* Description */}
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{card.desc}</p>
                  {/* Tags */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${card.colors.badge}`}>
                      {card.variable === "T2M" ? "Temperature" : "Precipitation"}
                    </span>
                    <span className="text-xs text-slate-600">{card.start_year}–{card.end_year}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Control Panel */}
        <div className="rounded-2xl border border-slate-700/40 bg-space-900/50 p-6 space-y-5">

          {/* Mode toggle */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex rounded-lg border border-slate-700/50 p-0.5 bg-space-800/60 w-fit">
              {(["api", "csv"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`px-5 py-2 rounded-md text-xs font-semibold tracking-wide transition-all ${
                    mode === m
                      ? "bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m === "api" ? "NASA POWER API" : "Upload NASA/Partner CSV"}
                </button>
              ))}
            </div>

            {mode === "api" && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-slate-500">Quick jump:</span>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => { setLat(String(p.lat)); setLon(String(p.lon)); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-700/50 text-slate-400
                      hover:border-sky-500/50 hover:text-sky-400 transition-colors bg-space-800/50"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── API mode inputs ── */}
          {mode === "api" && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <InputField label="Latitude"   type="number" value={lat}       onChange={setLat}       placeholder="40.71"  min={-90}  max={90}   step={0.01} />
              <InputField label="Longitude"  type="number" value={lon}       onChange={setLon}       placeholder="-74.01" min={-180} max={180}  step={0.01} />
              <div className="flex flex-col gap-1 justify-end">
                <label className="text-xs text-slate-400 uppercase tracking-widest opacity-0 select-none">Map</label>
                <button
                  onClick={() => setShowMapPicker(true)}
                  className="
                    flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm
                    border border-slate-700/60 bg-space-800 text-slate-400
                    hover:border-sky-500/50 hover:text-sky-400 hover:bg-sky-500/5
                    transition-all
                  "
                  title="Pick location on map"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="10" r="3" /><path d="M12 2a8 8 0 018 8c0 5.25-8 14-8 14S4 15.25 4 10a8 8 0 018-8z" />
                  </svg>
                  Map
                </button>
              </div>
              <InputField label="Start Year" type="number" value={startYear} onChange={setStartYear} placeholder="1990"   min={1981} max={2023} />
              <InputField label="End Year"   type="number" value={endYear}   onChange={setEndYear}   placeholder="2023"   min={1982} max={2024} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 uppercase tracking-widest">Variable</label>
                <select
                  value={variable}
                  onChange={(e) => setVariable(e.target.value)}
                  className="bg-space-800 border border-slate-700/60 rounded-lg px-3 py-2.5
                    text-slate-100 text-sm focus:outline-none focus:border-sky-500/70
                    focus:ring-1 focus:ring-sky-500/30 transition-colors"
                >
                  {Array.from(new Set(VARIABLES.map((v) => v.category))).map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {VARIABLES.filter((v) => v.category === cat).map((v) => (
                        <option key={v.id} value={v.id}>{v.name} ({v.unit})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Variable description info bar */}
          {mode === "api" && (() => {
            const meta = VARIABLES.find((v) => v.id === variable);
            if (!meta?.desc) return null;
            return (
              <div className="flex items-start gap-2.5 rounded-lg bg-slate-800/40 border border-slate-700/30 px-3.5 py-2.5 text-xs">
                <svg className="w-3.5 h-3.5 text-sky-400/60 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <div className="text-slate-500 leading-relaxed">
                  <span className="text-slate-300 font-medium">{meta.name}</span>
                  {" — "}{meta.desc}
                  <span className="ml-1.5 text-sky-500/50 font-mono text-[10px]">· {meta.source}</span>
                </div>
              </div>
            );
          })()}

          {/* ── CSV mode inputs ── */}
          {mode === "csv" && (
            <div className="space-y-5">
              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative cursor-pointer rounded-xl border-2 border-dashed p-8
                  flex flex-col items-center gap-3 transition-all select-none
                  ${dragOver
                    ? "border-sky-500 bg-sky-500/5"
                    : csvFile
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-slate-700/60 hover:border-sky-700/60 bg-space-800/30"
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {csvFile ? (
                  <>
                    <svg className="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-center">
                      <p className="text-sm font-medium text-emerald-400">{csvFile.name}</p>
                      <p className="text-xs text-slate-500">
                        {(csvFile.size / 1024).toFixed(1)} KB
                        {csvPreview ? ` · ${csvPreview.columns.length} columns · ${csvPreview.row_count} rows` : ""}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600">Click to change file</p>
                  </>
                ) : (
                  <>
                    <svg className="w-10 h-10 text-slate-600" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <div className="text-center">
                      <p className="text-sm font-medium text-slate-300">
                        Drop a NASA/Partner CSV here
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Giovanni · AppEEARS · NOAA CDO · SWOT · RCM · or any time-series CSV
                      </p>
                    </div>
                    <p className="text-xs text-slate-600">or click to browse · max 10 MB</p>
                  </>
                )}
              </div>

              {/* Column detection loading */}
              {csvPreviewLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-1">
                  <SpinnerIcon />
                  Detecting columns…
                </div>
              )}

              {/* Column detection error */}
              {csvPreviewError && (
                <p className="text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-2.5">
                  {csvPreviewError}
                </p>
              )}

              {/* Column mapping + metadata */}
              {csvPreview && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SelectField
                      label="Date / Year Column"
                      value={dateCol}
                      onChange={setDateCol}
                      options={csvPreview.columns.map((h) => ({ value: h, label: h }))}
                    />
                    <SelectField
                      label="Value Column"
                      value={valueCol}
                      onChange={setValueCol}
                      options={csvPreview.columns.filter((h) => h !== dateCol).map((h) => ({ value: h, label: h }))}
                    />
                    <InputField
                      label="Variable Name"
                      value={csvVarName}
                      onChange={setCsvVarName}
                      placeholder="e.g. NDVI"
                    />
                    <InputField
                      label="Unit"
                      value={csvUnit}
                      onChange={setCsvUnit}
                      placeholder="e.g. index, m, °C"
                    />
                  </div>

                  {/* Preview table */}
                  {csvPreview.preview.length > 0 && (
                    <div className="rounded-lg border border-slate-700/40 overflow-x-auto">
                      <table className="w-full text-xs text-slate-400">
                        <thead>
                          <tr className="border-b border-slate-700/40 bg-space-800/60">
                            {csvPreview.columns.map((col) => (
                              <th
                                key={col}
                                className={`px-3 py-2 text-left font-medium whitespace-nowrap ${
                                  col === dateCol
                                    ? "text-sky-400"
                                    : col === valueCol
                                    ? "text-emerald-400"
                                    : "text-slate-500"
                                }`}
                              >
                                {col === dateCol && <span className="mr-1 opacity-60">📅</span>}
                                {col === valueCol && <span className="mr-1 opacity-60">📊</span>}
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.preview.map((row, i) => (
                            <tr key={i} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                              {csvPreview.columns.map((col) => (
                                <td
                                  key={col}
                                  className={`px-3 py-1.5 font-mono whitespace-nowrap ${
                                    col === dateCol
                                      ? "text-sky-300"
                                      : col === valueCol
                                      ? "text-emerald-300"
                                      : "text-slate-500"
                                  }`}
                                >
                                  {row[col]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="px-3 py-1.5 text-xs text-slate-600 border-t border-slate-800/40">
                        Showing first {csvPreview.preview.length} of {csvPreview.row_count} rows ·{" "}
                        <span className="text-sky-500">blue = date column</span> ·{" "}
                        <span className="text-emerald-500">green = value column</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Compare variable toggle (API mode only) ── */}
          {mode === "api" && (
            <div className="flex items-center gap-4 flex-wrap pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <button
                  type="button"
                  onClick={() => setCompareMode((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none shrink-0
                    ${compareMode ? "bg-violet-600" : "bg-slate-700"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm
                    transition-transform duration-200 ${compareMode ? "translate-x-4" : "translate-x-0"}`}
                  />
                </button>
                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                  Compare with second variable
                </span>
              </label>
              {compareMode && (
                <select
                  value={compareVar}
                  onChange={(e) => setCompareVar(e.target.value)}
                  className="
                    bg-space-800 border border-violet-500/40 rounded-lg px-3 py-2
                    text-slate-100 text-sm focus:outline-none
                    focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/30
                    transition-colors
                  "
                >
                  {VARIABLES.filter((v) => v.id !== variable).map((v) => (
                    <option key={v.id} value={v.id}>{v.name} ({v.unit})</option>
                  ))}
                </select>
              )}
              {compareMode && compareError && (
                <span className="text-xs text-red-400">{compareError}</span>
              )}
            </div>
          )}

          {/* Analyze button */}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleAnalyze}
              disabled={loading || (mode === "csv" && !csvFile)}
              className="
                flex items-center gap-2.5 px-7 py-3 rounded-xl
                bg-gradient-to-r from-sky-600 to-indigo-600
                hover:from-sky-500 hover:to-indigo-500
                disabled:opacity-50 disabled:cursor-not-allowed
                text-white font-semibold text-sm tracking-wide
                shadow-lg shadow-sky-900/30 hover:shadow-sky-800/40
                transition-all duration-200
              "
            >
              {loading ? (
                <><SpinnerIcon /> Analyzing…</>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Detect Trends
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 flex gap-3 items-start text-sm">
            <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Results dashboard + loading skeleton */}
        <TrendResultsDashboard
          result={result}
          loading={loading}
          onReset={() => { setResult(null); setError(null); setCompareResults([]); setCompareError(null); }}
        />

        {/* Multi-variable comparison */}
        {compareResults.length >= 2 && (
          <MultiVarComparison results={compareResults} />
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="text-center py-16 space-y-3">
            <div className="w-16 h-16 rounded-full bg-sky-500/10 border border-sky-500/20
              flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-sky-500/60" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm">
              {mode === "api"
                ? <>Configure a location above, then click <span className="text-sky-400">Detect Trends</span>.</>
                : <>Upload a CSV file above, map the columns, then click <span className="text-sky-400">Detect Trends</span>.</>
              }
            </p>
          </div>
        )}

        {/* Resources Panel */}
        <ResourcesPanel />

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/40 mt-8 py-6">
        <p className="text-center text-xs text-slate-600">
          Data: NASA POWER · Analysis: Mann-Kendall + Sen&apos;s Slope + OLS ·
          Built for NASA Space Apps Challenge 2026 · TechBitz AI Solutions
        </p>
      </footer>

      {showMapPicker && (
        <MapPickerModal
          initialLat={parseFloat(lat) || 40.71}
          initialLon={parseFloat(lon) || -74.01}
          onConfirm={(newLat, newLon) => {
            setLat(newLat.toFixed(4));
            setLon(newLon.toFixed(4));
          }}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </div>
  );
}
