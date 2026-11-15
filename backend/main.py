from __future__ import annotations

import io
import os
import re
from typing import Optional

import httpx
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from analysis import compute_trend

app = FastAPI(
    title="Earth Trend Detective API",
    description="Analyzes NASA POWER and partner CSV climate data for statistically significant trends.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Constants ──────────────────────────────────────────────────────────────────

POWER_MONTHLY_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
POWER_FILL_VALUE  = -999.0
CSV_FILL_VALUES   = {-999.0, -999, -9999.0, -9999, 9999.0, 9999}
MIN_DATA_POINTS   = 5

_DATE_KEYWORDS  = ["year", "date", "time", "dt", "period", "jahr", "datetime", "timestamp", "periode"]
_VALUE_KEYWORDS = ["temp", "temperature", "value", "val", "anomaly", "data", "deg", "celsius",
                   "precip", "rain", "humidity", "wind", "pressure", "radiation", "ndvi", "evi",
                   "mean", "avg", "measure", "obs", "reading"]
_ENCODINGS      = ["utf-8", "latin1", "cp1252"]
_COMMENT_CHARS  = {"#", "!", ";"}
_YEAR_RE        = re.compile(r"(\d{4})")
_YEAR_MIN, _YEAR_MAX = 1850, 2100

VARIABLE_INFO: dict[str, dict] = {
    # Temperature
    "T2M":               {"name": "Temperature at 2 m",        "unit": "°C",          "category": "Temperature"},
    "T2M_MAX":           {"name": "Max Temperature at 2 m",    "unit": "°C",          "category": "Temperature"},
    "T2M_MIN":           {"name": "Min Temperature at 2 m",    "unit": "°C",          "category": "Temperature"},
    "TS":                {"name": "Earth Skin Temperature",     "unit": "°C",          "category": "Temperature"},
    # Precipitation & Hydrology
    "PRECTOTCORR":       {"name": "Precipitation",             "unit": "mm/day",      "category": "Precipitation"},
    "GWETTOP":           {"name": "Surface Soil Wetness",       "unit": "fraction",    "category": "Soil / Hydrology"},
    "GWETROOT":          {"name": "Root Zone Soil Wetness",     "unit": "fraction",    "category": "Soil / Hydrology"},
    "GWETPROF":          {"name": "Profile Soil Wetness",       "unit": "fraction",    "category": "Soil / Hydrology"},
    # Vegetation
    "EVPTRNS":           {"name": "Plant Transpiration",        "unit": "mm/day",      "category": "Vegetation"},
    "EVLAND":            {"name": "Total Evapotranspiration",   "unit": "mm/day",      "category": "Vegetation"},
    # Radiation & Cloud
    "ALLSKY_SFC_SW_DWN": {"name": "Solar Radiation",           "unit": "kWh/m²/day",  "category": "Radiation"},
    "CLOUD_AMT":         {"name": "Cloud Amount",               "unit": "%",           "category": "Cloud"},
    # Humidity & Moisture
    "RH2M":              {"name": "Relative Humidity at 2 m",  "unit": "%",           "category": "Humidity"},
    "T2MDEW":            {"name": "Dew/Frost Point at 2 m",    "unit": "°C",          "category": "Humidity"},
    "QV2M":              {"name": "Specific Humidity at 2 m",  "unit": "g/kg",        "category": "Humidity"},
    # Wind
    "WS10M":             {"name": "Wind Speed at 10 m",        "unit": "m/s",         "category": "Wind"},
    "WS50M":             {"name": "Wind Speed at 50 m",        "unit": "m/s",         "category": "Wind"},
    # Pressure
    "PS":                {"name": "Surface Pressure",          "unit": "kPa",         "category": "Pressure"},
}

RESOURCES = {
    "disclaimer": (
        "This website provides links to external websites operated by non-U.S. Government entities. "
        "These links are provided solely for informational purposes and do not constitute an endorsement "
        "by NASA or the U.S. Government of any commercial products, services, or other enterprise. "
        "NASA and the U.S. Government are not responsible for the content of external websites linked "
        "herein and are not liable for any inaccuracies, omissions, or errors in those sites. "
        "The inclusion of links to partner agencies (CSA/RADARSAT, CNES/SWOT, NOAA, NRCan/Geo.ca) "
        "does not imply any official relationship beyond the scope of the NASA Space Apps Challenge. "
        "NASA data and imagery used in this application are in the public domain."
    ),
    "datasets": [
        {
            "id": "nasa_power",
            "name": "NASA POWER (Prediction Of Worldwide Energy Resources)",
            "short_name": "NASA POWER",
            "agency": "NASA",
            "description": (
                "Global meteorological and solar energy data derived from satellite observations and "
                "reanalysis models. Provides daily, monthly, and annual data from 1981 to near-present. "
                "Built-in to Earth Trend Detective — no download required."
            ),
            "url": "https://power.larc.nasa.gov/",
            "variables": ["Temperature (T2M, TS)", "Precipitation (PRECTOTCORR)", "Solar Radiation (ALLSKY_SFC_SW_DWN)",
                          "Wind Speed (WS10M, WS50M)", "Soil Moisture (GWETTOP, GWETROOT, GWETPROF)",
                          "Plant Transpiration / NDVI-proxy (EVPTRNS, EVLAND)", "Humidity (RH2M, T2MDEW, QV2M)", "Cloud Amount (CLOUD_AMT)"],
            "export_formats": ["JSON (via API)"],
            "category": "Meteorological",
            "csv_upload_compatible": False,
        },
        {
            "id": "giovanni",
            "name": "NASA Giovanni (GES DISC)",
            "short_name": "Giovanni",
            "agency": "NASA GSFC",
            "description": (
                "Geospatial Interactive Online Visualization ANd aNalysis Infrastructure. "
                "Browse and export time-averaged maps and time-series from MODIS, TRMM/GPM, MERRA-2, "
                "AIRS, and dozens of other satellite missions. Export as CSV for upload here."
            ),
            "url": "https://giovanni.gsfc.nasa.gov/giovanni/",
            "variables": ["Land Surface Temperature", "NDVI", "Precipitation (TRMM/GPM)", "Aerosol Optical Depth",
                          "Sea Surface Temperature", "CO₂ / CO / O₃ (AIRS)", "Soil Moisture"],
            "export_formats": ["CSV", "NetCDF", "GeoTIFF", "KMZ"],
            "category": "Atmospheric / Land / Ocean",
            "csv_upload_compatible": True,
        },
        {
            "id": "appeears",
            "name": "NASA AppEEARS (Application for Extracting and Exploring Analysis Ready Samples)",
            "short_name": "AppEEARS",
            "agency": "NASA LPDAAC",
            "description": (
                "Extract and explore multi-temporal MODIS and VIIRS land-surface products for any "
                "point or area of interest. Ideal for NDVI, EVI, Land Surface Temperature, Snow Cover, "
                "and LAI time series. Download point samples as CSV."
            ),
            "url": "https://appeears.earthdatacloud.nasa.gov/",
            "variables": ["NDVI / EVI (MOD13)", "Land Surface Temperature (MOD11)",
                          "Snow Cover (MOD10)", "Leaf Area Index (MOD15)", "Surface Reflectance"],
            "export_formats": ["CSV", "GeoTIFF", "NetCDF-4"],
            "category": "Land Surface",
            "csv_upload_compatible": True,
        },
        {
            "id": "hydrology",
            "name": "NASA Hydrology Time Series (GES DISC)",
            "short_name": "NASA Hydrology",
            "agency": "NASA GSFC",
            "description": (
                "Access terrestrial water storage anomalies from GRACE-FO, land surface model outputs "
                "from GLDAS (runoff, soil moisture, evapotranspiration), and precipitation from "
                "TRMM/GPM. Time-series subsets can be exported as CSV via the GES DISC Earthdata portal."
            ),
            "url": "https://hydro1.gesdisc.eosdis.nasa.gov/",
            "variables": ["Groundwater Storage Anomaly (GRACE-FO)", "Soil Moisture (GLDAS)",
                          "Runoff (GLDAS)", "Evapotranspiration (GLDAS)", "Precipitation (TRMM 3B43)"],
            "export_formats": ["CSV", "NetCDF", "HDF-5"],
            "category": "Hydrology",
            "csv_upload_compatible": True,
        },
        {
            "id": "noaa_cdo",
            "name": "NOAA Climate Data Online (CDO)",
            "short_name": "NOAA CDO",
            "agency": "NOAA NCEI",
            "description": (
                "Global network of surface weather stations providing daily, monthly, and annual "
                "temperature and precipitation observations. Datasets include GHCN-Daily, GSOM "
                "(Global Summary of the Month), and GSOY (Global Summary of the Year). "
                "CSV exports are directly compatible with the Upload CSV mode."
            ),
            "url": "https://www.ncdc.noaa.gov/cdo-web/",
            "variables": ["Maximum Temperature (TMAX)", "Minimum Temperature (TMIN)",
                          "Precipitation (PRCP)", "Snowfall (SNOW)", "Wind Speed"],
            "export_formats": ["CSV"],
            "category": "Meteorological (Station)",
            "csv_upload_compatible": True,
        },
        {
            "id": "ocean_color",
            "name": "NASA Ocean Color Web (SeaWiFS / MODIS / VIIRS Chlorophyll)",
            "short_name": "Ocean Color",
            "agency": "NASA GSFC OB.DAAC",
            "description": (
                "Ocean biological productivity data derived from satellite ocean color sensors. "
                "Chlorophyll-a concentration is a proxy for phytoplankton biomass and is a critical "
                "indicator of ocean ecosystem health. Time-series data is available via the Level-3 "
                "browser and can be exported as comma-separated text."
            ),
            "url": "https://oceancolor.gsfc.nasa.gov/",
            "variables": ["Chlorophyll-a Concentration (mg/m³)", "Remote Sensing Reflectance",
                          "Particulate Organic Carbon", "Sea Surface Salinity"],
            "export_formats": ["CSV (text)", "NetCDF-4", "HDF-5"],
            "category": "Oceanographic",
            "csv_upload_compatible": True,
        },
        {
            "id": "rcm",
            "name": "RADARSAT Constellation Mission (RCM)",
            "short_name": "RCM / CSA",
            "agency": "CSA (Canadian Space Agency)",
            "description": (
                "Canada's C-band synthetic aperture radar (SAR) constellation of three satellites. "
                "Provides all-weather, day-and-night imaging for ice monitoring, soil moisture "
                "estimation, flood extent mapping, and maritime surveillance. "
                "Time-series backscatter data can be exported from the EODMS portal as CSV."
            ),
            "url": "https://www.asc-csa.gc.ca/eng/satellites/radarsat/",
            "variables": ["SAR Backscatter (σ⁰, dB)", "Ice Extent / Concentration",
                          "Surface Soil Moisture", "Flood Extent"],
            "export_formats": ["CSV (time series)", "GeoTIFF", "SAFE (Sentinel-compatible)"],
            "category": "SAR / Land / Ice",
            "csv_upload_compatible": True,
        },
        {
            "id": "geo_ca",
            "name": "Canada's Open Geospatial Data Portal (Geo.ca)",
            "short_name": "Geo.ca",
            "agency": "NRCan / Government of Canada",
            "description": (
                "Canada's national geospatial data portal aggregating Earth observation and "
                "geospatial datasets from federal departments. Includes climate station data, "
                "land cover change, permafrost indicators, glacial retreat records, and more. "
                "Many datasets are available as CSV time-series downloads."
            ),
            "url": "https://geo.ca/",
            "variables": ["Land Cover Change", "Permafrost Temperature", "Glacial Mass Balance",
                          "Forest Fire Area", "Wetland Extent"],
            "export_formats": ["CSV", "GeoJSON", "Shapefile", "GeoTIFF"],
            "category": "Multi-domain (Canada)",
            "csv_upload_compatible": True,
        },
        {
            "id": "knmi_climate_explorer",
            "name": "KNMI Climate Explorer",
            "short_name": "KNMI Climate Explorer",
            "agency": "KNMI (Royal Netherlands Meteorological Institute)",
            "description": (
                "A web-based scientific analysis tool developed and maintained by KNMI. "
                "Provides access to CRU, ERA5 reanalysis, GHCN, HadSST, and dozens of other "
                "global datasets. Generates time series for any location, computes trends, "
                "and exports data as CSV — directly compatible with the Upload CSV mode here."
            ),
            "url": "https://climexp.knmi.nl/",
            "variables": ["Temperature (CRU / ERA5 / GHCN)", "Precipitation",
                          "Sea Surface Temperature (HadSST)", "Sea Level Pressure",
                          "ENSO Indices (Niño 3.4)", "NAO / AO Teleconnection Indices"],
            "export_formats": ["CSV", "ASCII"],
            "category": "Multi-domain Climate Analysis",
            "csv_upload_compatible": True,
        },
        {
            "id": "swot",
            "name": "SWOT (Surface Water and Ocean Topography)",
            "short_name": "SWOT",
            "agency": "NASA / CNES / CSA / UKSA",
            "description": (
                "Launched December 2022, SWOT is the first satellite to measure water surface "
                "elevation and extent globally at high resolution. It tracks river discharge, "
                "lake water levels, and ocean surface topography. Level-3 river and lake "
                "time-series are available as CSV via the PO.DAAC Earthdata portal."
            ),
            "url": "https://swot.jpl.nasa.gov/",
            "variables": ["Water Surface Elevation (m, WSE)", "River Discharge (m³/s)",
                          "Lake Water Level", "Ocean Sea Surface Height"],
            "export_formats": ["CSV (Level-3 river/lake)", "NetCDF-CF", "Shapefile"],
            "category": "Hydrology / Oceanography",
            "csv_upload_compatible": True,
        },
    ],
    "methodology": [
        {
            "id": "mann_kendall",
            "name": "Mann-Kendall Trend Test",
            "type": "primary",
            "description": (
                "A non-parametric rank-based test for monotonic trend in time series. "
                "Makes no assumption of normality, is resistant to outliers, and is robust "
                "to missing values. The S statistic counts all concordant minus discordant pairs. "
                "Variance is corrected for ties. A continuity correction is applied to the "
                "standardized Z statistic. Two-tailed p-value is derived from the standard normal "
                "distribution. Significance decision: p < 0.05 → is_significant = true."
            ),
            "reference": "Mann (1945); Kendall (1975); Gilbert (1987) Statistical Methods for Environmental Pollution Monitoring",
            "alpha": 0.05,
        },
        {
            "id": "sens_slope",
            "name": "Sen's Slope Estimator",
            "type": "supplementary",
            "description": (
                "The median of all pairwise slopes (y_j − y_i) / (t_j − t_i) for all i < j, "
                "where t is the year. This robust estimator is the standard complement to the "
                "Mann-Kendall test. It is far less sensitive to outliers than OLS and provides "
                "the most reliable estimate of the true rate of change per year / per decade."
            ),
            "reference": "Sen (1968) Estimates of the Regression Coefficient Based on Kendall's Tau. JASA.",
            "alpha": None,
        },
        {
            "id": "ols",
            "name": "OLS Linear Regression",
            "type": "supplementary",
            "description": (
                "Ordinary Least Squares regression via scipy.stats.linregress. Provides the slope "
                "coefficient (units/year), R² (fraction of variance explained by the linear trend), "
                "standard error, and a parametric two-tailed p-value. The regression line is used "
                "as the visual trend overlay on the chart. OLS p-value is shown for reference but "
                "Mann-Kendall is authoritative for the significance decision."
            ),
            "reference": "Freedman, Pisani & Purves (2007) Statistics, 4th ed. W.W. Norton.",
            "alpha": None,
        },
    ],
}


# ── Request models ─────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    latitude:   float = Field(..., ge=-90,  le=90,   description="Decimal degrees North")
    longitude:  float = Field(..., ge=-180, le=180,  description="Decimal degrees East")
    start_year: int   = Field(..., ge=1981, le=2023)
    end_year:   int   = Field(..., ge=1982, le=2024)
    variable:   str   = Field(..., description="NASA POWER parameter code")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_narrative(result, variable_name: str, unit: str, start_year: int, end_year: int) -> dict:
    """Generate a structured plain-English narrative from trend statistics."""
    dur  = end_year - start_year
    rate = abs(result.sens_slope_per_decade)
    sign = "+" if result.direction == "increasing" else "−"
    dir_word = (
        "upward" if result.direction == "increasing"
        else "downward" if result.direction == "decreasing"
        else "no discernible"
    )
    mk_p     = result.mk_p_value
    mk_p_str = "< 0.001" if mk_p < 0.001 else f"{mk_p:.3f}"

    # One-line verdict for the headline banner
    if result.direction == "stable":
        headline = (
            f"No significant trend detected in {variable_name} over {dur} years "
            f"(Mann-Kendall p = {mk_p_str})"
        )
    else:
        headline = (
            f"{'Significant' if result.is_significant else 'Non-significant'} "
            f"{result.direction} trend detected: "
            f"{sign}{rate:.3f} {unit}/decade over {dur} years "
            f"(p = {mk_p_str})"
        )

    s1 = (
        f"Analysis of {variable_name} data over a {dur}-year window "
        f"({start_year}–{end_year}) reveals a {dir_word} trend at "
        f"{sign}{rate:.3f} {unit}/decade by Sen's robust slope — "
        "a rank-based estimator resistant to outliers and recommended by the "
        "World Meteorological Organization for environmental time-series."
    )

    if result.is_significant:
        s2 = (
            f"The Mann-Kendall non-parametric test returns p = {mk_p_str} "
            f"(Z = {result.mk_z:.2f}), conclusively rejecting the null hypothesis "
            "of no trend at the 95% confidence level; OLS regression corroborates "
            f"the finding with R² = {result.r_squared:.2f}."
        )
    else:
        s2 = (
            f"The Mann-Kendall test returns p = {mk_p_str} (Z = {result.mk_z:.2f}), "
            "which does not reach the α = 0.05 threshold — the observed pattern cannot "
            "be statistically distinguished from inter-annual natural variability "
            f"(OLS R² = {result.r_squared:.2f})."
        )

    vl = variable_name.lower()
    if any(k in vl for k in ("temperature", "t2m", "temp")):
        if result.direction == "increasing" and result.is_significant:
            proj = rate * (2100 - end_year) / 10
            s3 = (
                f"A warming rate of {rate:.3f} {unit}/decade is consistent with IPCC AR6 "
                "anthropogenic climate change signals; extrapolating this trend suggests "
                f"approximately +{proj:.1f} {unit} of additional warming by 2100 — "
                "with direct consequences for heat-stress risk, agricultural growing seasons, "
                "and urban energy demand."
            )
        elif result.direction == "decreasing" and result.is_significant:
            s3 = (
                "A significant cooling trend is atypical in the global warming context and may "
                "reflect localized land-surface feedback, aerosol loading, or shifts in large-scale "
                "circulation; cross-referencing with MODIS land-cover and MERRA-2 aerosol optical "
                "depth products is recommended to attribute the driver."
            )
        else:
            s3 = (
                f"The absence of a significant trend over {dur} years may reflect natural "
                "multi-decadal oscillations (ENSO, PDO, AMO) masking the forced signal, or "
                "the temporal window may be insufficient to isolate a trend above the noise "
                "floor of natural variability at this location."
            )
    elif any(k in vl for k in ("precip", "rain", "prec")):
        s3 = (
            "Statistically significant precipitation changes have direct implications for flood "
            "frequency, groundwater recharge, and agricultural planning — this signal should be "
            "integrated into regional water resource management frameworks and cross-validated "
            "with NOAA CDO gauge records or GPCC gridded products."
        ) if result.is_significant else (
            f"Precipitation datasets exhibit higher inter-annual variance than temperature, and "
            f"{dur}-year records are often insufficient to isolate forced trends from ENSO or "
            "monsoon teleconnections — extending to 40+ years or using ensemble reanalysis would "
            "increase detection power."
        )
    elif any(k in vl for k in ("solar", "radiation", "sw_dwn", "allsky")):
        s3 = (
            "Changes in downwelling shortwave radiation at this rate affect photovoltaic energy "
            "yield, plant net primary productivity, and surface energy balance — the trend likely "
            "reflects shifts in cloud fraction or aerosol optical depth retrievable from CERES "
            "or MODIS cloud products."
        ) if result.is_significant else (
            "Surface radiation variability falls within the envelope expected from natural cloud "
            "cover fluctuations; a longer temporal baseline or CERES EBAF retrievals would improve "
            "signal-to-noise for detecting a forced solar dimming/brightening signal."
        )
    elif any(k in vl for k in ("humidity", " rh")):
        s3 = (
            f"A {result.direction} relative humidity trend can amplify or dampen heat stress "
            "(via wet-bulb temperature) and affect ecosystem water-use efficiency — contextualizing "
            "against ERA5 reanalysis would help distinguish local from regional moisture dynamics."
        ) if result.is_significant else (
            f"Relative humidity at this site shows no forced trend, suggesting moisture dynamics "
            f"are dominated by synoptic-scale weather variability over this {dur}-year period."
        )
    elif any(k in vl for k in ("wind", " ws")):
        s3 = (
            f"A {result.direction} wind speed trend has practical implications for wind energy "
            "resource assessment — this signal should be compared against ERA5 10 m wind speed "
            "reanalysis to distinguish instrument drift from genuine atmospheric circulation changes."
        ) if result.is_significant else (
            "Wind speed is among the most variable meteorological parameters and typically requires "
            "multi-decadal records to detect statistically robust trends above the noise of natural "
            "synoptic circulation patterns."
        )
    else:
        s3 = (
            f"With OLS R² = {result.r_squared:.2f}, approximately "
            f"{result.r_squared * 100:.0f}% of the variance in {variable_name} is explained by "
            "the linear temporal trend — further attribution using climate model ensembles or "
            "causal discovery methods would help identify the underlying forcing mechanism."
        ) if result.is_significant else (
            f"With OLS R² = {result.r_squared:.2f}, the linear model explains only "
            f"{result.r_squared * 100:.0f}% of variance, indicating non-linear dynamics or "
            f"natural oscillations dominate the {variable_name} signal."
        )

    return {
        "headline":            headline,
        "trend_overview":      s1,
        "statistical_verdict": s2,
        "scientific_context":  s3,
    }


def _build_trend_payload(result, points: list[dict]) -> dict:
    return {
        "direction":              result.direction,
        "slope":                  result.slope,
        "slope_per_decade":       result.slope_per_decade,
        "sens_slope":             result.sens_slope,
        "sens_slope_per_decade":  result.sens_slope_per_decade,
        "r_squared":              result.r_squared,
        "p_value_linear":         result.p_value_linear,
        "mann_kendall": {
            "s":       result.mk_s,
            "z":       result.mk_z,
            "p_value": result.mk_p_value,
        },
        "is_significant": result.is_significant,
        "confidence":     "95%",
    }


def _detect_source_format(columns: list[str]) -> str:
    cols_lower = {c.lower() for c in columns}
    if any("modis" in c or "giovanni" in c or "merra" in c for c in cols_lower):
        return "giovanni"
    if any("appeears" in c or "mcd" in c or "mod1" in c for c in cols_lower):
        return "appeears"
    if "station" in cols_lower or "name" in cols_lower and "prcp" in cols_lower:
        return "noaa_cdo"
    return "generic"


def _parse_csv_to_annual(
    content: bytes,
    date_column: str | None,
    value_column: str | None,
) -> tuple[list[int], list[float], str, str, str]:
    """
    Parse a NASA/partner CSV export into annual (year, mean-value) pairs.

    Returns (years, values, detected_date_col, detected_value_col, source_format).
    """
    # ── 1. Decode with encoding fallback ──
    text: str | None = None
    for enc in _ENCODINGS:
        try:
            text = content.decode(enc)
            break
        except (UnicodeDecodeError, ValueError):
            continue
    if text is None:
        text = content.decode("utf-8", errors="replace")

    # ── 2. Strip comment lines ──
    clean_lines = [
        line for line in text.splitlines()
        if line.strip() and line.strip()[0] not in _COMMENT_CHARS
    ]
    if not clean_lines:
        raise HTTPException(status_code=415, detail="CSV file appears to be empty or all comments.")

    clean_text = "\n".join(clean_lines)

    # ── 3. Parse CSV ──
    try:
        df = pd.read_csv(io.StringIO(clean_text))
    except Exception as exc:
        raise HTTPException(status_code=415, detail=f"File could not be parsed as CSV: {exc}")

    if df.empty or len(df.columns) < 2:
        raise HTTPException(status_code=415, detail="CSV must have at least two columns.")

    # Strip whitespace from all column names
    df.columns = df.columns.str.strip()

    source_format = _detect_source_format(list(df.columns))

    # ── Inner helpers ──
    def _col_has_years(col: str) -> bool:
        """Return True if the column contains mostly valid year integers."""
        numeric = pd.to_numeric(df[col], errors="coerce")
        valid = numeric.dropna()
        return len(valid) > 0 and valid.between(_YEAR_MIN, _YEAR_MAX).mean() > 0.8

    def _find_date_col(hint: str | None) -> str | None:
        if hint:
            if hint in df.columns:
                return hint
            for col in df.columns:
                if col.strip().lower() == hint.strip().lower():
                    return col
        # Keyword match
        for col in df.columns:
            if any(kw in col.lower() for kw in _DATE_KEYWORDS):
                return col
        # Scan all columns for one that actually contains year-range integers
        for col in df.columns:
            if _col_has_years(col):
                return col
        # Last resort: column[0] — may not be a year column
        return df.columns[0]

    def _find_value_col(hint: str | None, date_col: str) -> str | None:
        if hint:
            if hint in df.columns:
                return hint
            for col in df.columns:
                if col.strip().lower() == hint.strip().lower():
                    return col
        # Prefer columns whose name contains a value keyword
        for col in df.columns:
            if col == date_col:
                continue
            if any(kw in col.lower() for kw in _VALUE_KEYWORDS):
                numeric = pd.to_numeric(df[col], errors="coerce")
                if numeric.notna().sum() > 0:
                    return col
        # Fall back to first numeric non-date column
        for col in df.columns:
            if col == date_col:
                continue
            numeric = pd.to_numeric(df[col], errors="coerce")
            if numeric.notna().sum() > 0:
                return col
        return None

    def _extract_year(val) -> int | None:
        # Try numeric bare year first
        try:
            y = int(float(val))
            if _YEAR_MIN <= y <= _YEAR_MAX:
                return y
        except (ValueError, TypeError):
            pass
        # Regex extraction from strings like "2001-07-15", "Jul 2001", "200107"
        m = _YEAR_RE.search(str(val))
        if m:
            y = int(m.group(1))
            if _YEAR_MIN <= y <= _YEAR_MAX:
                return y
        return None

    # ── 4. Detect columns ──
    detected_date = _find_date_col(date_column)
    detected_value = _find_value_col(value_column, detected_date)

    all_col_names = ", ".join(f"'{c}'" for c in df.columns)

    if detected_date is None or not _col_has_years(detected_date):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Could not find a year column in your CSV. "
                f"Available columns: [{all_col_names}]. "
                "Use the 'Date column' field to specify which column holds the year (e.g. 'Year', 'date', 'Time')."
            ),
        )

    if detected_value is None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Could not find a numeric value column in your CSV. "
                f"Available columns: [{all_col_names}]. "
                "Use the 'Value column' field to specify which column holds the observed data."
            ),
        )

    # ── 5. Parse years ──
    # If column holds bare YYYY integers, don't pass through pd.to_datetime
    # (which treats integers as nanoseconds from epoch, collapsing all to 1970).
    numeric_col = pd.to_numeric(df[detected_date], errors="coerce")
    looks_like_years = (
        numeric_col.notna().mean() > 0.8
        and numeric_col.dropna().between(_YEAR_MIN, _YEAR_MAX).all()
    )
    if looks_like_years:
        year_series = numeric_col
    else:
        parsed_dates = pd.to_datetime(df[detected_date], errors="coerce")
        year_series = parsed_dates.dt.year.where(parsed_dates.notna()).astype(float)
        # Regex fallback for rows where datetime parsing failed
        mask_failed = year_series.isna()
        if mask_failed.any():
            fallback_years = df.loc[mask_failed, detected_date].apply(_extract_year)
            year_series = year_series.combine_first(pd.to_numeric(fallback_years, errors="coerce"))

    df["_year"] = pd.to_numeric(year_series, errors="coerce").astype("Int64")

    # ── 6. Parse values ──
    df["_value"] = pd.to_numeric(df[detected_value], errors="coerce")

    # ── 7. Filter fill values and invalid rows ──
    df = df.dropna(subset=["_year", "_value"])
    df = df[~df["_value"].isin(CSV_FILL_VALUES)]
    df = df[df["_value"] > -900]  # large negative sentinel catch-all
    df = df[df["_year"].between(_YEAR_MIN, _YEAR_MAX)]

    n = len(df.groupby("_year"))
    if n < MIN_DATA_POINTS:
        s = "s" if n != 1 else ""
        all_cols = ", ".join(f"'{c}'" for c in df.columns if c not in ("_year", "_value"))
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only {n} valid annual data point{s} found after cleaning "
                f"(need ≥ {MIN_DATA_POINTS}). "
                f"Auto-detected → Date column: '{detected_date}', Value column: '{detected_value}'. "
                f"Available columns in your file: [{all_cols}]. "
                "Use the 'Date column' and 'Value column' fields to specify the correct columns manually, "
                "or ensure the file contains a year column (1850–2100) and a numeric observed-value column."
            ),
        )

    # ── 8. Aggregate to annual means ──
    annual = (
        df.groupby("_year")["_value"]
        .mean()
        .reset_index()
        .sort_values("_year")
    )

    years  = annual["_year"].astype(int).tolist()
    values = annual["_value"].round(4).tolist()

    return years, values, detected_date, detected_value, source_format


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": "Earth Trend Detective API",
        "version": "1.1.0",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
        "endpoints": [
            "POST /api/analyze",
            "POST /api/analyze-csv",
            "GET  /api/variables",
            "GET  /api/resources",
        ],
    }


@app.get("/api/variables")
def get_variables():
    return {
        "variables": [
            {"id": k, "name": v["name"], "unit": v["unit"], "category": v["category"]}
            for k, v in VARIABLE_INFO.items()
        ]
    }


@app.get("/api/resources")
def get_resources():
    return RESOURCES


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    if req.start_year >= req.end_year:
        raise HTTPException(status_code=422, detail="start_year must be less than end_year.")
    if req.variable not in VARIABLE_INFO:
        raise HTTPException(status_code=422, detail=f"Unknown variable '{req.variable}'.")

    params = {
        "parameters": req.variable,
        "community":  "RE",
        "longitude":  req.longitude,
        "latitude":   req.latitude,
        "start":      req.start_year,
        "end":        req.end_year,
        "format":     "JSON",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(POWER_MONTHLY_URL, params=params)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="NASA POWER API timed out. Please try again.")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"NASA POWER API returned {resp.status_code}. Check coordinates and date range.",
        )

    try:
        raw = resp.json()["properties"]["parameter"][req.variable]
    except (KeyError, TypeError):
        raise HTTPException(status_code=502, detail="Unexpected NASA POWER response format.")

    # NASA POWER monthly response uses YYYYMM keys; month=13 is the annual mean.
    points: list[dict] = []
    for key in sorted(raw.keys()):
        if not key.endswith("13"):
            continue
        val = raw[key]
        if val == POWER_FILL_VALUE or val is None:
            continue
        year = int(key[:4])
        points.append({"year": year, "value": round(float(val), 4)})

    if len(points) < MIN_DATA_POINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Only {len(points)} valid data points found. Need at least {MIN_DATA_POINTS}.",
        )

    years  = [p["year"]  for p in points]
    values = [p["value"] for p in points]
    result = compute_trend(years, values)

    for p in points:
        p["trend"] = round(result.intercept + result.slope * p["year"], 4)

    var_meta = VARIABLE_INFO[req.variable]

    return {
        "time_series":    points,
        "variable":       req.variable,
        "variable_name":  var_meta["name"],
        "unit":           var_meta["unit"],
        "trend":          _build_trend_payload(result, points),
        "narrative":      _build_narrative(result, var_meta["name"], var_meta["unit"], req.start_year, req.end_year),
        "metadata": {
            "latitude":    req.latitude,
            "longitude":   req.longitude,
            "start_year":  req.start_year,
            "end_year":    req.end_year,
            "data_points": len(points),
            "source":      "nasa_power",
        },
    }


@app.post("/api/csv-preview")
async def csv_preview(file: UploadFile = File(...)):
    """Return column names + suggested date/value columns + first 5 rows."""
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")

    content = await file.read()

    text: str | None = None
    for enc in _ENCODINGS:
        try:
            text = content.decode(enc)
            break
        except (UnicodeDecodeError, ValueError):
            continue
    if text is None:
        text = content.decode("utf-8", errors="replace")

    clean_lines = [
        l for l in text.splitlines()
        if l.strip() and l.strip()[0] not in _COMMENT_CHARS
    ]
    if not clean_lines:
        raise HTTPException(status_code=415, detail="CSV file appears to be empty or all comments.")

    try:
        df = pd.read_csv(io.StringIO("\n".join(clean_lines)))
    except Exception as exc:
        raise HTTPException(status_code=415, detail=f"Could not parse as CSV: {exc}")

    df.columns = df.columns.str.strip()
    columns = list(df.columns)

    def _has_years(col: str) -> bool:
        n = pd.to_numeric(df[col], errors="coerce").dropna()
        return len(n) > 0 and n.between(_YEAR_MIN, _YEAR_MAX).mean() > 0.8

    # Suggest date column
    suggested_date: str | None = None
    for col in columns:
        if any(kw in col.lower() for kw in _DATE_KEYWORDS):
            suggested_date = col
            break
    if not suggested_date:
        for col in columns:
            if _has_years(col):
                suggested_date = col
                break

    # Suggest value column
    suggested_value: str | None = None
    for col in columns:
        if col == suggested_date:
            continue
        if any(kw in col.lower() for kw in _VALUE_KEYWORDS):
            if pd.to_numeric(df[col], errors="coerce").notna().sum() > 0:
                suggested_value = col
                break
    if not suggested_value:
        for col in columns:
            if col == suggested_date:
                continue
            if pd.to_numeric(df[col], errors="coerce").notna().sum() > 0:
                suggested_value = col
                break

    preview = df.head(5).fillna("").astype(str).to_dict("records")

    return {
        "columns":            columns,
        "suggested_date_col": suggested_date,
        "suggested_value_col": suggested_value,
        "preview":            preview,
        "row_count":          len(df),
    }


@app.post("/api/analyze-csv")
async def analyze_csv(
    file:          UploadFile          = File(...),
    date_column:   Optional[str]       = Form(None),
    value_column:  Optional[str]       = Form(None),
    variable_name: str                 = Form("Custom Variable"),
    unit:          str                 = Form(""),
):
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")

    content = await file.read()

    years, values, detected_date, detected_value, source_format = _parse_csv_to_annual(
        content, date_column, value_column
    )

    if len(years) < MIN_DATA_POINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Only {len(years)} annual data points found after aggregation. Need at least {MIN_DATA_POINTS}.",
        )

    result = compute_trend(years, values)

    points = [
        {
            "year":  y,
            "value": v,
            "trend": round(result.intercept + result.slope * y, 4),
        }
        for y, v in zip(years, values)
    ]

    return {
        "time_series":    points,
        "variable":       "CUSTOM",
        "variable_name":  variable_name,
        "unit":           unit,
        "trend":          _build_trend_payload(result, points),
        "narrative":      _build_narrative(result, variable_name, unit, years[0], years[-1]),
        "source_format":  source_format,
        "metadata": {
            "latitude":               None,
            "longitude":              None,
            "start_year":             years[0],
            "end_year":               years[-1],
            "data_points":            len(points),
            "source":                 "csv",
            "original_filename":      file.filename or "unknown.csv",
            "detected_date_column":   detected_date,
            "detected_value_column":  detected_value,
        },
    }


@app.post("/api/ai-narrative")
async def ai_narrative(payload: dict):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured on this server.")

    try:
        import anthropic as _anthropic
        client = _anthropic.Anthropic(api_key=api_key)

        t    = payload.get("trend", {})
        meta = payload.get("metadata", {})
        variable_name = payload.get("variable_name", "Climate Variable")
        unit          = payload.get("unit", "")
        is_csv        = meta.get("source") == "csv"
        location      = (
            meta.get("original_filename", "uploaded dataset") if is_csv
            else f"Lat {meta.get('latitude', '?')}°, Lon {meta.get('longitude', '?')}°"
        )
        mk    = t.get("mann_kendall", {})
        dur   = int(meta.get("end_year", 0)) - int(meta.get("start_year", 0))
        rate  = abs(t.get("sens_slope_per_decade", 0))
        sign  = "+" if t.get("direction") == "increasing" else "−"
        mk_p  = mk.get("p_value", 1)

        prompt = f"""You are a senior climate scientist at NASA. Write an authoritative executive summary of this climate trend analysis for a research briefing.

VARIABLE: {variable_name} ({unit})
LOCATION: {location}
PERIOD: {meta.get('start_year')}–{meta.get('end_year')} ({dur} years, {meta.get('data_points')} observations)

STATISTICAL RESULTS:
• Trend: {t.get('direction', 'unknown')} at {sign}{rate:.4f} {unit}/decade (Sen's robust slope)
• Mann-Kendall: p = {mk_p:.4f}, Z = {mk.get('z', 0):.3f}, S = {mk.get('s', 0)}
• OLS: slope = {t.get('slope_per_decade', 0):+.4f} {unit}/decade, R² = {t.get('r_squared', 0):.4f}
• Significant at 95%: {'YES' if t.get('is_significant') else 'NO'}

Write exactly 3 paragraphs (≤75 words each, no bullet points, no markdown headers):
Paragraph 1 — Trend Overview: state the finding, rate, and robustness
Paragraph 2 — Statistical Verdict: interpret p-value, Z-score, and R² for a decision-maker
Paragraph 3 — Scientific Context: cite IPCC AR6 if applicable, name real-world consequences, suggest one specific follow-up dataset or action

Respond with ONLY the 3 paragraphs separated by a blank line. No headings. No lists. No preamble."""

        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        full_text = resp.content[0].text.strip()
        paras = [p.strip() for p in full_text.split("\n\n") if p.strip()]

        headline = (
            f"{'Significant' if t.get('is_significant') else 'Non-significant'} "
            f"{t.get('direction', 'trend')} in {variable_name}: "
            f"{sign}{rate:.3f} {unit}/decade over {dur} years "
            f"(p = {'< 0.001' if mk_p < 0.001 else f'{mk_p:.3f}'})"
        )

        return {
            "narrative": {
                "headline":            headline,
                "trend_overview":      paras[0] if len(paras) > 0 else "",
                "statistical_verdict": paras[1] if len(paras) > 1 else "",
                "scientific_context":  paras[2] if len(paras) > 2 else "",
            },
            "source": "claude",
            "model":  "claude-haiku-4-5",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Claude API error: {str(exc)}")


@app.get("/health")
def health():
    return {"status": "ok"}
