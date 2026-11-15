# Earth Trend Detective — Technical Specification

**Version:** 1.0.0  
**Challenge:** NASA Space Apps 2026 — "Be An Earth System Trend Detective!"  
**Organization:** TechBitz AI Solutions  
**Spec Date:** 2026-11-14  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [API Contracts](#3-api-contracts)
   - 3.1 POST /api/analyze
   - 3.2 GET /api/variables
   - 3.3 POST /api/analyze-csv
   - 3.4 GET /api/resources
   - 3.5 GET /health
4. [Error Handling Matrix](#4-error-handling-matrix)
5. [Statistical Engine Specification](#5-statistical-engine-specification)
6. [Data Source Catalog](#6-data-source-catalog)
7. [CSV Format Compatibility](#7-csv-format-compatibility)
8. [Frontend Specification](#8-frontend-specification)
9. [Environment & Configuration](#9-environment--configuration)

---

## 1. System Overview

Earth Trend Detective is a full-stack geospatial climate analytics platform. It ingests historical Earth-system time-series data from NASA and partner agencies, runs a three-method statistical trend-significance pipeline, and returns structured JSON that the frontend renders as an interactive "Trend Detective Report Card."

**Core capability:** Given any location, time window, and climate variable, the system determines — with statistical confidence — whether the variable is **increasing**, **decreasing**, or **stable**, and whether that trend crosses the α = 0.05 significance threshold.

---

## 2. Architecture

```
Browser (Next.js 15)
  │
  ├─ /api/* (Next.js rewrite proxy)
  │
  ▼
FastAPI Backend (port 8000)
  ├─ POST /api/analyze       ← NASA POWER API path
  ├─ POST /api/analyze-csv   ← User-uploaded CSV path
  ├─ GET  /api/variables
  ├─ GET  /api/resources
  └─ GET  /health
        │
        ├─ NASA POWER API  (https://power.larc.nasa.gov/)
        └─ Statistical Engine (analysis.py)
               ├─ Mann-Kendall test
               ├─ Sen's Slope estimator
               └─ OLS linear regression
```

**Technology stack:**

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS 3, Recharts 2 |
| Backend | Python 3.11+, FastAPI 0.115, Uvicorn |
| HTTP client | httpx (async) |
| Statistical | NumPy 2, SciPy 1.14 |
| CSV parsing | pandas 2 |
| File upload | python-multipart |

---

## 3. API Contracts

All endpoints are served under the base path `/api`. All request and response bodies are `application/json` unless noted otherwise. All error responses follow the [§4 Error Handling Matrix](#4-error-handling-matrix).

---

### 3.1 `POST /api/analyze`

Fetches annual time-series data from the NASA POWER API for a given point location and runs the full statistical trend pipeline.

**Request body** (`application/json`):

```
{
  latitude:   number    // Required. -90.0 ≤ value ≤ 90.0 (decimal degrees N)
  longitude:  number    // Required. -180.0 ≤ value ≤ 180.0 (decimal degrees E)
  start_year: integer   // Required. 1981 ≤ value ≤ 2023
  end_year:   integer   // Required. 1982 ≤ value ≤ 2024; must be > start_year
  variable:   string    // Required. NASA POWER parameter code (see §6.1)
}
```

**Response** (`200 OK`, `application/json`):

```
{
  time_series: Array<{
    year:  integer   // Calendar year
    value: number    // Annual mean of the variable (rounded to 4 d.p.)
    trend: number    // OLS regression line value at this year (rounded to 4 d.p.)
  }>

  variable:      string   // NASA POWER parameter code, e.g. "T2M"
  variable_name: string   // Human-readable name, e.g. "Temperature at 2 m"
  unit:          string   // Physical unit string, e.g. "°C"

  trend: {
    direction:              "increasing" | "decreasing" | "stable"
    slope:                  number   // OLS slope coefficient (units/year, 6 d.p.)
    slope_per_decade:       number   // OLS slope × 10 (units/decade, 4 d.p.)
    sens_slope:             number   // Sen's slope estimator (units/year, 6 d.p.)
    sens_slope_per_decade:  number   // Sen's slope × 10 (units/decade, 4 d.p.)
    r_squared:              number   // OLS coefficient of determination, 0–1
    p_value_linear:         number   // OLS parametric two-tailed p-value
    mann_kendall: {
      s:       integer   // MK S statistic (sum of concordant minus discordant pairs)
      z:       number    // Standardized MK test statistic (with continuity correction)
      p_value: number    // Two-tailed p-value derived from Z
    }
    is_significant: boolean   // true if mann_kendall.p_value < 0.05
    confidence:     string    // "95%"
  }

  metadata: {
    latitude:    number
    longitude:   number
    start_year:  integer
    end_year:    integer
    data_points: integer   // Count of non-fill valid annual observations
  }
}
```

**Validation rules:**
- `start_year` must be strictly less than `end_year`
- `variable` must be a key in the supported variables table (§6.1)
- NASA POWER fill values (`-999.0`) are silently dropped before analysis
- At least **5 valid data points** are required; fewer returns HTTP 400

---

### 3.2 `GET /api/variables`

Returns the catalogue of supported NASA POWER parameter codes.

**Response** (`200 OK`):

```
{
  variables: Array<{
    id:       string   // NASA POWER parameter code
    name:     string   // Full human-readable name
    unit:     string   // Physical unit string
    category: string   // "Temperature" | "Precipitation" | "Radiation" | "Humidity" | "Wind" | "Pressure"
  }>
}
```

---

### 3.3 `POST /api/analyze-csv`

Accepts a CSV file exported from any supported NASA/partner tool (Giovanni, AppEEARS, NOAA CDO, SWOT, Hydrology, etc.), parses it into an annual time series, and runs the identical statistical pipeline as `/api/analyze`.

**Request body** (`multipart/form-data`):

```
file:          File     // Required. CSV file (max 10 MB)
date_column:   string?  // Optional. Header name of the date/year column.
                        //   Auto-detected if omitted (searches for "date", "time", "year").
value_column:  string?  // Optional. Header name of the numeric value column.
                        //   Auto-detected if omitted (first numeric non-date column).
variable_name: string?  // Optional. Display name for the variable. Default: "Custom Variable"
unit:          string?  // Optional. Unit label shown in charts. Default: ""
```

**Response** (`200 OK`): Identical schema to `POST /api/analyze` with two additions:

```
  source_format: string   // Auto-detected source hint: "giovanni" | "appeears" |
                          //   "noaa_cdo" | "generic"
  metadata: {
    ...                   // (same fields as /api/analyze)
    source: "csv"         // Always "csv" for this endpoint
    original_filename: string
    detected_date_column:  string
    detected_value_column: string
  }
```

**CSV parsing rules** (see §7 for format-specific guidance):

1. Lines beginning with `#`, `!`, or `;` are treated as comments and skipped.
2. The first non-comment non-empty line is the header row.
3. Date parsing priority: ISO-8601 (`YYYY-MM-DD`) → `YYYYMMDD` → `YYYY-MM` → bare `YYYY` integer.
4. Values equal to `-999`, `-9999`, `-999.0`, `-9999.0`, or non-numeric are treated as fill/missing.
5. All valid rows for the same calendar year are averaged to produce one annual data point.
6. At least **5 annual data points** must remain after filtering; otherwise HTTP 400.

---

### 3.4 `GET /api/resources`

Returns structured metadata for all supported NASA and partner data sources, plus the statistical methodology catalogue and official disclaimer text.

**Response** (`200 OK`):

```
{
  disclaimer: string   // Official NASA non-U.S.-Government disclaimer text

  datasets: Array<{
    id:                      string    // Unique slug, e.g. "nasa_power"
    name:                    string    // Full display name
    short_name:              string    // Abbreviated name
    agency:                  string    // Responsible agency acronym(s)
    description:             string    // One-paragraph description
    url:                     string    // Primary access URL
    variables:               string[]  // Representative variable names
    export_formats:          string[]  // e.g. ["CSV", "NetCDF", "GeoTIFF"]
    category:                string    // Thematic category
    csv_upload_compatible:   boolean   // Whether /api/analyze-csv can accept its CSV exports
  }>

  methodology: Array<{
    id:          string   // e.g. "mann_kendall"
    name:        string
    type:        "primary" | "supplementary"
    description: string
    reference:   string   // Citation or standard reference
    alpha:       number?  // Significance level where applicable
  }>
}
```

---

### 3.5 `GET /health`

Liveness probe.

**Response** (`200 OK`): `{ "status": "ok" }`

---

## 4. Error Handling Matrix

All error responses use FastAPI's default `{ "detail": "<message>" }` schema.

| HTTP Status | Trigger Condition | Example `detail` |
|---|---|---|
| `400 Bad Request` | Insufficient valid data points after filtering | `"Only 3 valid data points found. Need at least 5."` |
| `415 Unsupported Media Type` | Uploaded file is not parseable as CSV | `"File could not be parsed as CSV."` |
| `422 Unprocessable Entity` | Pydantic validation failure (bad type, out-of-range value) | `"start_year must be less than end_year."` |
| `502 Bad Gateway` | NASA POWER API returned non-200 | `"NASA POWER API returned 503."` |
| `502 Bad Gateway` | NASA POWER API returned unexpected JSON structure | `"Unexpected NASA POWER response format."` |
| `504 Gateway Timeout` | NASA POWER API did not respond within 30 s | `"NASA POWER API timed out. Please try again."` |
| `500 Internal Server Error` | Unhandled exception in statistical engine | FastAPI default |

---

## 5. Statistical Engine Specification

The engine is implemented in `backend/analysis.py`. All three methods are always computed; Mann-Kendall is the **authoritative significance test**.

### 5.1 Mann-Kendall Trend Test (Primary — α = 0.05)

The Mann-Kendall (MK) test is a non-parametric rank-based test for monotonic trend. It makes **no assumption of normality**, is resistant to outliers, and is the method endorsed by the World Meteorological Organization (WMO) and KNMI Climate Explorer for environmental time-series significance testing.

**S statistic:**

```
S = Σ_{k=1}^{n-1} Σ_{j=k+1}^{n} sgn(x_j - x_k)

where sgn(θ) = +1 if θ > 0, -1 if θ < 0, 0 if θ = 0
```

**Variance** (with tie correction):

```
Var(S) = [ n(n-1)(2n+5) - Σ_p t_p(t_p-1)(2t_p+5) ] / 18

where t_p is the count of observations in tie group p
```

**Standardized test statistic Z** (with continuity correction):

```
Z = (S - 1) / √Var(S)   if S > 0
Z = 0                    if S = 0
Z = (S + 1) / √Var(S)   if S < 0
```

**Two-tailed p-value:** `p = 2 × (1 - Φ(|Z|))` where Φ is the standard normal CDF.

**Decision rule:** Trend is flagged `is_significant = true` if and only if `p < 0.05`.

### 5.2 Sen's Slope Estimator (Robust Slope)

Sen's slope is the **median of all pairwise slopes** between data points. It is more robust than OLS in the presence of outliers and is the standard companion to the MK test.

```
Q_ij = (x_j - x_i) / (t_j - t_i)   for all i < j

Sen's slope = median(Q_ij)
```

Where `t_i`, `t_j` are the year values (not indices), so the slope is in physical units per year.

### 5.3 OLS Linear Regression (Supplementary)

Ordinary Least Squares regression is computed via `scipy.stats.linregress`. It provides the slope coefficient, R² (variance explained), and parametric p-value. These are shown as supplementary statistics in the Report Card but are **not** used for the significance decision (which belongs to Mann-Kendall).

**Trend line annotation:** Each time-series point is annotated with `trend = intercept + slope × year` for chart overlay.

**Direction rule:** Derived from the OLS slope magnitude against a near-zero threshold (ε = 1×10⁻⁵ units/year) to prevent numerical noise from triggering a direction label.

---

## 6. Data Source Catalog

### 6.1 NASA POWER API — Supported Variables

Data accessed from: `https://power.larc.nasa.gov/api/temporal/annual/point`  
Temporal coverage: **1981–2024** · Community parameter: `RE` (Renewable Energy)

| Code | Variable Name | Unit | Category |
|---|---|---|---|
| `T2M` | Temperature at 2 m | °C | Temperature |
| `T2M_MAX` | Maximum Temperature at 2 m | °C | Temperature |
| `T2M_MIN` | Minimum Temperature at 2 m | °C | Temperature |
| `PRECTOTCORR` | Precipitation Corrected | mm/day | Precipitation |
| `ALLSKY_SFC_SW_DWN` | All-Sky Solar Radiation | kWh/m²/day | Radiation |
| `RH2M` | Relative Humidity at 2 m | % | Humidity |
| `WS10M` | Wind Speed at 10 m | m/s | Wind |
| `PS` | Surface Pressure | kPa | Pressure |

### 6.2 Partner Datasets (CSV Upload Path)

| Dataset | Agency | Category | CSV Compatible |
|---|---|---|---|
| Giovanni (MODIS, TRMM, MERRA-2, AIRS) | NASA GSFC | Atmospheric/Oceanic | Yes |
| AppEEARS (MODIS land products: NDVI, LST, Snow) | NASA LPDAAC | Land Surface | Yes |
| Hydrology Time Series (GRACE-FO, GLDAS, TRMM) | NASA GSFC | Hydrology | Yes |
| Climate Data Online (GHCND, GSOM, GSOY) | NOAA NCEI | Meteorological | Yes |
| Ocean Color Chlorophyll (SeaWiFS, MODIS Aqua/Terra, VIIRS) | NASA GSFC OB.DAAC | Oceanographic | Yes |
| RADARSAT Constellation Mission (RCM) | CSA | SAR/Land/Ice | Yes |
| Canadian Earth Observation Portal | Natural Resources Canada / geo.ca | Multi-domain | Yes |
| SWOT (Surface Water and Ocean Topography) | NASA/CNES/CSA | Hydrology/Oceanography | Yes |

---

## 7. CSV Format Compatibility

The `/api/analyze-csv` endpoint handles these common NASA/partner export formats:

### 7.1 Giovanni

Comments begin with `#`. First data row is the header. Date column is typically named `Date` with format `YYYY-MM-DD`.

```
# Title: MODIS Terra Daily Land Surface Temperature
# Units: Kelvin
Date,MODIS_Terra_L3_LST_Day_1km_mean
2000-02-24,298.5
```

### 7.2 AppEEARS

No comment rows. Header includes `Date` and one or more product columns (e.g., `MOD13Q1_061__250m_16_days_NDVI`). Fill value is typically `-28672` for NDVI — handled by the generic negative-extreme filter.

```
ID,Category,Date,MOD13Q1_061__250m_16_days_NDVI
1,Forest,2000-02-18,0.6523
```

### 7.3 NOAA CDO

Standard CSV with `DATE` column (`YYYY-MM-DD`) and variable columns (`PRCP`, `TMAX`, `TMIN`, etc.). Missing values encoded as empty string or `-9999`.

```
STATION,NAME,DATE,PRCP,TMAX,TMIN
USW00094728,NEW YORK,2000-01-01,0.0,6.1,-0.6
```

### 7.4 SWOT / Generic Annual

Some SWOT Level-3 river products export with a `year` integer column and a measurement column.

```
year,wse_mean_m
2023,142.31
```

---

## 8. Frontend Specification

### 8.1 Pages & Routing

| Route | Component | Purpose |
|---|---|---|
| `/` | `Dashboard` | Main analysis interface |

### 8.2 Component Tree

```
Dashboard (page, "use client")
├─ Header
├─ Hero
├─ ControlPanel
│   ├─ ModeToggle ("NASA POWER API" | "Upload CSV")
│   ├─ [mode=api]  ApiInputPanel
│   │   ├─ LocationPresets
│   │   └─ InputGrid (lat, lon, startYear, endYear, variable)
│   └─ [mode=csv]  CsvInputPanel
│       ├─ FileDropzone
│       ├─ ColumnMapper (dateColumn, valueColumn)
│       └─ MetaInputs (variableName, unit)
├─ ErrorAlert
├─ ResultsSection (conditional)
│   ├─ TrendChart   (Recharts ComposedChart)
│   └─ ReportCard   (significance badge + 9-stat grid)
└─ ResourcesPanel   (collapsible, three tabs)
    ├─ DataSourcesTab
    ├─ MethodologyTab
    └─ DisclaimerTab
```

### 8.3 AnalysisResult TypeScript Interface

```typescript
interface TimeSeriesPoint { year: number; value: number; trend: number }

interface AnalysisResult {
  time_series: TimeSeriesPoint[];
  variable:      string;
  variable_name: string;
  unit:          string;
  trend: {
    direction:             "increasing" | "decreasing" | "stable";
    slope:                 number;
    slope_per_decade:      number;
    sens_slope:            number;
    sens_slope_per_decade: number;
    r_squared:             number;
    p_value_linear:        number;
    mann_kendall:          { s: number; z: number; p_value: number };
    is_significant:        boolean;
    confidence:            string;
  };
  metadata: {
    latitude:    number;
    longitude:   number;
    start_year:  number;
    end_year:    number;
    data_points: number;
    source?:          string;
    original_filename?: string;
  };
  source_format?: string;
}
```

### 8.4 Chart Specification

- Chart type: `ComposedChart` (Recharts)
- Series 1 — **Observed**: `Area`, dataKey `value`, fill gradient `sky-500 → transparent`
- Series 2 — **Trend line**: `Line`, dataKey `trend`, stroke color keyed to direction:
  - `increasing` → `#ef4444` (red-500)
  - `decreasing` → `#38bdf8` (sky-400)
  - `stable`     → `#a3e635` (lime-400)
- Reference line at annual mean value
- Custom tooltip with dark glass background

### 8.5 Report Card Statistic Grid

Nine statistics displayed in a 3×3 or 2×4 responsive grid:

| Stat | Source |
|---|---|
| Slope / Decade (Sen's) | Sen's slope × 10 — **primary rate metric** |
| Slope / Decade (OLS) | OLS slope × 10 — supplementary |
| Sen's Slope | units/year |
| OLS Slope | units/year |
| R² (OLS) | OLS coefficient of determination |
| OLS p-value | Parametric significance |
| Mann-Kendall S | Non-parametric statistic |
| MK Z-score | Standardized test statistic |
| MK p-value | **Primary significance metric** |

---

## 9. Environment & Configuration

### Backend

| Variable | Default | Description |
|---|---|---|
| (none required) | — | All config is hardcoded constants in `main.py` |

**Run (cross-platform):** `python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`

> **Windows requirement:** Use `python -m uvicorn` — the bare `uvicorn` command is not automatically added to the Windows PATH. The `python -m` form always works regardless of PATH configuration.

**Dependency notes (Python 3.14 / no C compiler):**
- `numpy`, `scipy`, `pandas` are unpinned so pip selects the newest wheel for the installed Python version.
- `uvicorn` is listed without the `[standard]` extra to avoid `httptools` (C extension). Hot-reload falls back to file polling, which is functionally identical for development.
- All other dependencies (`fastapi`, `httpx`, `python-multipart`) are pure Python.

### Frontend

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | FastAPI base URL (used in `next.config.ts` rewrite) |

**Run:** `npm run dev` (port 3000)

> **Windows / IPv6 note:** The fallback URL and `.env.local` explicitly use `127.0.0.1` (IPv4) rather than `localhost`. Node.js 18+ on Windows resolves `localhost` to `::1` (IPv6) by default; if uvicorn is only listening on `127.0.0.1`, this causes a connection refused error. Using `127.0.0.1` directly bypasses DNS resolution entirely.

The Next.js rewrite rule proxies all `/api/*` requests to `NEXT_PUBLIC_API_URL/api/*` **on the Next.js server**, so the browser only ever sees same-origin requests to `localhost:3000`. CORS is not exercised in normal development usage.

### One-Click Windows Startup

Two batch scripts in the project root provide automated setup and launch:

| Script | Purpose |
|---|---|
| `start-backend.bat` | Installs dependencies, starts FastAPI on `127.0.0.1:8000` |
| `start-frontend.bat` | Installs npm packages (if needed), starts Next.js on `localhost:3000` |

Run each in a separate terminal window simultaneously.
