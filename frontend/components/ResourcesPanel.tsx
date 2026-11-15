"use client";

import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Dataset {
  id: string;
  name: string;
  short_name: string;
  agency: string;
  description: string;
  url: string;
  variables: string[];
  export_formats: string[];
  category: string;
  csv_upload_compatible: boolean;
}

interface Method {
  id: string;
  name: string;
  type: "primary" | "supplementary";
  description: string;
  reference: string;
  alpha?: number | null;
}

interface ResourcesData {
  disclaimer: string;
  datasets: Dataset[];
  methodology: Method[];
}

// ── Agency badge colors ────────────────────────────────────────────────────────

const AGENCY_COLORS: Record<string, string> = {
  NASA:         "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "NASA GSFC":  "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "NASA LPDAAC":"bg-blue-500/15 text-blue-300 border-blue-500/30",
  "NOAA NCEI":  "bg-teal-500/15 text-teal-300 border-teal-500/30",
  "CSA (Canadian Space Agency)": "bg-red-500/15 text-red-300 border-red-500/30",
  "NRCan / Government of Canada": "bg-green-500/15 text-green-300 border-green-500/30",
  "NASA / CNES / CSA / UKSA": "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  "NASA GSFC OB.DAAC": "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
};

function agencyColor(agency: string): string {
  return (
    AGENCY_COLORS[agency] ??
    (agency.startsWith("NASA") ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
      : "bg-slate-700/40 text-slate-300 border-slate-600/40")
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DatasetCard({ ds }: { ds: Dataset }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-700/40 bg-space-900/60 p-5 flex flex-col gap-3
      hover:border-slate-600/60 transition-colors">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${agencyColor(ds.agency)}`}>
              {ds.agency}
            </span>
            {ds.csv_upload_compatible && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-500/30
                bg-emerald-500/10 text-emerald-400 font-medium">
                CSV Upload
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-slate-200 leading-snug">{ds.short_name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{ds.category}</p>
        </div>
      </div>

      {/* Description */}
      <p className={`text-xs text-slate-400 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
        {ds.description}
      </p>
      {ds.description.length > 180 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-sky-500 hover:text-sky-400 self-start -mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {/* Variables */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-1.5">Key Variables</p>
        <div className="flex flex-wrap gap-1">
          {ds.variables.slice(0, 4).map((v) => (
            <span key={v} className="text-xs px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/50
              text-slate-400">
              {v.split("(")[0].trim()}
            </span>
          ))}
          {ds.variables.length > 4 && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/50 text-slate-500">
              +{ds.variables.length - 4} more
            </span>
          )}
        </div>
      </div>

      {/* Formats */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-600">
          Exports: {ds.export_formats.join(" · ")}
        </span>
        <a
          href={ds.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
        >
          Explore
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function MethodCard({ m }: { m: Method }) {
  const isPrimary = m.type === "primary";
  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-3 ${
      isPrimary
        ? "border-sky-500/30 bg-sky-500/5"
        : "border-slate-700/40 bg-space-900/60"
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isPrimary ? "bg-sky-500/20" : "bg-slate-700/50"
        }`}>
          <svg className={`w-4 h-4 ${isPrimary ? "text-sky-400" : "text-slate-400"}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            {isPrimary
              ? <><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></>
              : <><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></>
            }
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-200">{m.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
              isPrimary
                ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                : "bg-slate-700/40 text-slate-400 border-slate-600/40"
            }`}>
              {isPrimary ? "Primary" : "Supplementary"}
            </span>
            {m.alpha !== null && m.alpha !== undefined && (
              <span className="text-xs text-slate-500">α = {m.alpha}</span>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{m.description}</p>
      <p className="text-xs text-slate-600 italic border-t border-slate-700/30 pt-2">
        Ref: {m.reference}
      </p>
    </div>
  );
}

const FILTER_OPTIONS = ["All", "CSV Upload", "NASA", "NOAA", "CSA"] as const;
type FilterOption = typeof FILTER_OPTIONS[number];

function matchesFilter(ds: Dataset, f: FilterOption): boolean {
  if (f === "All")        return true;
  if (f === "CSV Upload") return ds.csv_upload_compatible;
  if (f === "NASA")       return ds.agency.includes("NASA");
  if (f === "NOAA")       return ds.agency.includes("NOAA");
  if (f === "CSA")        return ds.agency.includes("CSA") || ds.agency.includes("Canadian");
  return true;
}

function DatasetList({ datasets }: { datasets: Dataset[] }) {
  const [activeFilter, setActiveFilter] = useState<FilterOption>("All");
  const filtered = datasets.filter((ds) => matchesFilter(ds, activeFilter));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-500">Filter:</span>
        {FILTER_OPTIONS.map((f) => {
          const count = f === "All" ? datasets.length : datasets.filter((ds) => matchesFilter(ds, f)).length;
          const active = activeFilter === f;
          return (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                active
                  ? "border-sky-500/60 bg-sky-500/15 text-sky-300"
                  : "border-slate-700/40 bg-slate-800/40 text-slate-400 hover:border-slate-600/60 hover:text-slate-300"
              }`}
            >
              {f}
              <span className={`ml-1.5 ${active ? "text-sky-400/70" : "text-slate-600"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">No datasets match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ds) => (
            <DatasetCard key={ds.id} ds={ds} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type TabId = "datasets" | "methodology" | "disclaimer";

export default function ResourcesPanel() {
  const [isOpen,    setIsOpen]    = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("datasets");
  const [data,      setData]      = useState<ResourcesData | null>(null);
  const [fetchErr,  setFetchErr]  = useState(false);

  useEffect(() => {
    if (isOpen && !data && !fetchErr) {
      fetch("/api/resources")
        .then((r) => r.json())
        .then((d: ResourcesData) => setData(d))
        .catch(() => setFetchErr(true));
    }
  }, [isOpen, data, fetchErr]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "datasets",    label: "Data Sources",       count: data?.datasets.length },
    { id: "methodology", label: "Statistical Methods", count: data?.methodology.length },
    { id: "disclaimer",  label: "Disclaimer" },
  ];

  return (
    <section className="rounded-2xl border border-slate-700/40 bg-space-900/50 overflow-hidden">

      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800/20
          transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25
            flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4
                M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold text-slate-200">Official NASA &amp; Partner Resources</h2>
            <p className="text-xs text-slate-500">
              Data sources · Statistical methodology · Disclaimer
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expandable content */}
      {isOpen && (
        <div className="border-t border-slate-700/40">

          {/* Tabs */}
          <div className="flex border-b border-slate-700/40 px-6 pt-4 gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t-lg
                  border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-sky-500 text-sky-400 bg-sky-500/5"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? "bg-sky-500/20 text-sky-400"
                      : "bg-slate-700/50 text-slate-500"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-6">

            {/* Loading skeleton */}
            {!data && !fetchErr && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="rounded-xl border border-slate-700/30 bg-space-900/60
                    p-5 h-48 animate-pulse">
                    <div className="h-4 bg-slate-700/50 rounded w-20 mb-3" />
                    <div className="h-5 bg-slate-700/40 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-slate-700/30 rounded w-full mb-1" />
                    <div className="h-3 bg-slate-700/30 rounded w-5/6" />
                  </div>
                ))}
              </div>
            )}

            {fetchErr && (
              <p className="text-sm text-slate-500 text-center py-8">
                Could not load resources. Make sure the FastAPI backend is running.
              </p>
            )}

            {/* Data Sources tab */}
            {data && activeTab === "datasets" && (
              <DatasetList datasets={data.datasets} />
            )}

            {/* Methodology tab */}
            {data && activeTab === "methodology" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
                  The statistical significance of a trend is determined exclusively by the{" "}
                  <span className="text-sky-400 font-medium">Mann-Kendall test</span> at α = 0.05.
                  Sen&apos;s slope provides the robust rate-of-change estimate. OLS regression is
                  supplementary, providing the visual trend line, R², and a parametric p-value for reference.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.methodology.map((m) => (
                    <MethodCard key={m.id} m={m} />
                  ))}
                </div>
              </div>
            )}

            {/* Disclaimer tab */}
            {data && activeTab === "disclaimer" && (
              <div className="max-w-3xl space-y-4">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <div>
                      <p className="text-xs font-semibold text-amber-300 mb-2">
                        Non-U.S. Government External Resource Notice
                      </p>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {data.disclaimer}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-700/40 bg-space-900/60 px-5 py-4">
                  <p className="text-xs font-semibold text-slate-300 mb-2">Data Attribution</p>
                  <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                    <li>NASA POWER data: NASA Langley Research Center POWER Project, funded through the NASA Earth Science Directorate Applied Science Program.</li>
                    <li>Giovanni: Goddard Earth Sciences Data and Information Services Center (GES DISC), NASA.</li>
                    <li>AppEEARS: NASA Land Processes Distributed Active Archive Center (LP DAAC) — USGS/Earth Resources Observation and Science (EROS) Center.</li>
                    <li>NOAA CDO: National Centers for Environmental Information (NCEI), NOAA.</li>
                    <li>SWOT: Jointly operated by NASA (Jet Propulsion Laboratory), CNES (France), CSA (Canada), and UKSA (United Kingdom).</li>
                    <li>RCM: Canadian Space Agency (CSA). Image © CSA 2024.</li>
                    <li>Geo.ca: Natural Resources Canada and participating federal departments.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
