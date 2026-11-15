# Earth Trend Detective

**NASA Space Apps Challenge 2026 — Advanced Level**  
Challenge: *"Be An Earth System Trend Detective!"*  
Team: **TechBitz AI Solutions**

---

## Problem Statement

Earth's climate is changing, but distinguishing a genuine long-term shift from normal year-to-year variability requires rigorous statistical analysis — the kind typically accessible only to climate scientists. Earth Trend Detective makes that analysis available to anyone: pick a location, choose a climate variable, and get an instant, scientifically grounded verdict on whether the trend is real.

---

## What It Does

1. **NASA POWER Mode** — Query any lat/lon on Earth for temperature, precipitation, solar radiation, humidity, wind, or surface pressure going back to 1981. Data is fetched live from the NASA POWER API.

2. **Upload CSV Mode** — Bring your own time-series data exported from Giovanni, AppEEARS, NOAA CDO, SWOT, or any other NASA/partner tool. The system auto-detects date and value columns.

3. **Statistical Trend Engine** — Every dataset runs through three analyses:
   - **Mann-Kendall Test** (non-parametric, primary) — determines whether a monotonic trend is statistically significant at α = 0.05
   - **Sen's Slope Estimator** (robust) — computes the true rate of change per decade
   - **OLS Linear Regression** (parametric, supplementary) — provides R², parametric p-value, and the trend line overlay

4. **Interactive Dashboard** — Recharts time-series with the trend line overlaid, color-coded by direction (red = warming/increasing, blue = cooling/decreasing), and a full Report Card showing all nine statistical metrics.

5. **Resources Panel** — Curated links to all official NASA/partner data portals with one-click access and methodology documentation.

---

## Scientific Methodology

The significance decision follows the World Meteorological Organization (WMO) and KNMI Climate Explorer guidelines for environmental time-series analysis:

```
H₀: No monotonic trend exists in the time series.
H₁: A monotonic trend exists.
α  = 0.05 (95% confidence level)
```

The **Mann-Kendall S statistic** counts concordant minus discordant pairs across all years. The variance is corrected for ties. The resulting p-value determines `is_significant`. Sen's slope provides the actual rate of change, resistant to outliers. OLS slope provides the regression overlay.

---

## Architecture

```
frontend/   Next.js 15.3 + TypeScript + Tailwind CSS + Recharts
backend/    Python 3.9+ (tested on 3.14) + FastAPI + NumPy + SciPy + pandas
data/       NASA POWER API (live) + User-uploaded CSVs
```

See [`SPEC.md`](./SPEC.md) for the complete technical specification including all API contracts and JSON schemas.

---

## Setup & Run

### Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Python | 3.9+ | Tested on 3.14 — no C compiler required |
| Node.js | 18+ | Includes npm |
| Internet | — | Backend fetches from NASA POWER API |

---

### One-Click Startup (Windows)

Two batch scripts in the project root handle everything automatically — dependency checks, installs, and server startup:

**Terminal 1 — Backend:**
```
start-backend.bat
```

**Terminal 2 — Frontend:**
```
start-frontend.bat
```

Both scripts must run simultaneously. Open two separate Command Prompt or PowerShell windows.

---

### Manual Setup

#### Backend

```bat
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

> **Windows note:** Use `python -m uvicorn` instead of bare `uvicorn`. The `uvicorn` executable may not be on the Windows PATH, but it is always reachable via `python -m`.

API root: `http://127.0.0.1:8000/`  
Interactive docs: `http://127.0.0.1:8000/docs`

#### Frontend

```bat
cd frontend
npm install
npm run dev
```

App: `http://localhost:3000`

> The Next.js rewrite in `next.config.ts` proxies all `/api/*` requests to `http://127.0.0.1:8000/api/*` on the server side, so the browser never makes cross-origin requests and no CORS issues occur in development.

---

### Python 3.14 / No C Compiler

`numpy`, `scipy`, and `pandas` are listed without version pins in `requirements.txt` so pip selects the newest release with a pre-built wheel for your Python version. `uvicorn` is listed without the `[standard]` extra (which would pull `httptools`, a C extension) — the plain `uvicorn` package is pure Python and always installs without a compiler.

If pip still cannot find a wheel for a specific package on your Python version, install it via:

```bat
pip install --only-binary=:all: numpy scipy pandas
```

---

## Supported Data Sources

| Source | Agency | Use Case |
|---|---|---|
| [NASA POWER API](https://power.larc.nasa.gov/) | NASA | Meteorological / solar energy variables (built-in) |
| [Giovanni](https://giovanni.gsfc.nasa.gov/giovanni/) | NASA GSFC | MODIS, TRMM/GPM, MERRA-2, AIRS products |
| [AppEEARS](https://appeears.earthdatacloud.nasa.gov/) | NASA LPDAAC | MODIS land products (NDVI, EVI, LST, Snow) |
| [Hydrology Time Series](https://hydro1.gesdisc.eosdis.nasa.gov/) | NASA GSFC | GRACE-FO, GLDAS, TRMM precipitation |
| [NOAA CDO](https://www.ncdc.noaa.gov/cdo-web/) | NOAA NCEI | Station-based climate observations |
| [Ocean Color Web](https://oceancolor.gsfc.nasa.gov/) | NASA GSFC OB.DAAC | SeaWiFS / MODIS chlorophyll-a |
| [RADARSAT Constellation (RCM)](https://www.asc-csa.gc.ca/eng/satellites/radarsat/) | CSA | SAR — ice, soil moisture, flood mapping |
| [Geo.ca Portal](https://geo.ca/) | NRCan / Canada | Canadian Earth observation datasets |
| [SWOT Mission](https://swot.jpl.nasa.gov/) | NASA / CNES / CSA | Surface water elevation, rivers, lakes, oceans |

All partner datasets are accessible via the **Upload CSV** mode in the dashboard.

---

## Project Structure

```
earth-trend-detective/
├── SPEC.md                       ← Technical specification (SDD)
├── README.md                     ← This file
│
├── backend/
│   ├── main.py                   ← FastAPI app: all four endpoints
│   ├── analysis.py               ← Statistical engine: MK, Sen's, OLS
│   └── requirements.txt
│
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── globals.css
    ├── components/
    │   ├── Dashboard.tsx          ← Main page (API + CSV modes)
    │   ├── TrendChart.tsx         ← Recharts time-series visualization
    │   ├── ReportCard.tsx         ← Significance badge + stat grid
    │   └── ResourcesPanel.tsx     ← Data sources + methodology panel
    ├── next.config.ts
    ├── tailwind.config.js
    └── package.json
```

---

## Team — TechBitz AI Solutions

| Name | Role |
|---|---|
| **Samreen** | Full-Stack Lead — FastAPI backend, Next.js frontend architecture, NASA API integration |
| **Arsalan** | UI/UX Design — Dashboard layout, Recharts visualization, Tailwind design system |
| **Zoha** | Pitch & Video — Presentation narrative, demo walkthrough, submission video |
| **Nida** | Data Analyst — Statistical methodology, Mann-Kendall implementation, dataset selection |
| **Yasmeen** | Documentation & QA — SPEC.md, README, API validation, cross-browser testing |

---

## Disclaimer

> **Non-U.S. Government External Resource Notice**
>
> This website provides links to external websites operated by non-U.S. Government entities. These links are provided solely for informational purposes and do not constitute an endorsement by NASA or the U.S. Government of any commercial products, services, or other enterprise operated by non-U.S. Government entities. NASA and the U.S. Government are not responsible for the content of external websites linked herein and are not liable for any inaccuracies, omissions, or errors in those sites. The inclusion of links to partner agencies (CSA/RADARSAT, CNES/SWOT, NOAA, NRCan/Geo.ca) does not imply any official relationship beyond the scope of the NASA Space Apps Challenge.
>
> NASA data and imagery used in this application are in the public domain and are used with attribution to NASA and the respective data providers.

---

*Built for NASA Space Apps Challenge 2026 · TechBitz AI Solutions*
