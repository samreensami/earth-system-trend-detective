from dataclasses import dataclass
import numpy as np
from scipy import stats


@dataclass
class TrendResult:
    slope: float
    intercept: float
    r_squared: float
    p_value_linear: float
    std_err: float
    sens_slope: float
    sens_slope_per_decade: float
    mk_s: int
    mk_z: float
    mk_p_value: float
    direction: str
    is_significant: bool
    slope_per_decade: float


def mann_kendall(data: list[float]) -> tuple[int, float, float]:
    """
    Non-parametric Mann-Kendall trend test (WMO/KNMI recommended).
    Returns (S statistic, Z score, two-tailed p-value).
    Variance includes tie correction per Gilbert (1987).
    """
    n = len(data)
    s = 0
    for k in range(n - 1):
        for j in range(k + 1, n):
            diff = data[j] - data[k]
            if diff > 0:
                s += 1
            elif diff < 0:
                s -= 1

    unique, counts = np.unique(data, return_counts=True)
    tie_correction = sum(c * (c - 1) * (2 * c + 5) for c in counts if c > 1)
    var_s = (n * (n - 1) * (2 * n + 5) - tie_correction) / 18.0

    if s > 0:
        z = (s - 1) / np.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / np.sqrt(var_s)
    else:
        z = 0.0

    p_value = 2.0 * (1.0 - float(stats.norm.cdf(abs(z))))
    return int(s), round(float(z), 4), round(float(p_value), 4)


def compute_sens_slope(years: list[int], values: list[float]) -> float:
    """
    Sen's slope estimator: median of all pairwise slopes.
    Uses actual year differences so the result is in units/year.
    More robust than OLS in the presence of outliers.
    """
    slopes: list[float] = []
    n = len(values)
    for i in range(n):
        for j in range(i + 1, n):
            dx = years[j] - years[i]
            if dx != 0:
                slopes.append((values[j] - values[i]) / dx)
    return round(float(np.median(slopes)), 6) if slopes else 0.0


def compute_trend(years: list[int], values: list[float]) -> TrendResult:
    x = np.array(years, dtype=float)
    y = np.array(values, dtype=float)

    slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)

    mk_s, mk_z, mk_p = mann_kendall(list(y))
    ss = compute_sens_slope(years, list(y))

    # Direction uses OLS slope; ε guards against floating-point noise
    if slope > 1e-5:
        direction = "increasing"
    elif slope < -1e-5:
        direction = "decreasing"
    else:
        direction = "stable"

    return TrendResult(
        slope=round(float(slope), 6),
        intercept=round(float(intercept), 4),
        r_squared=round(float(r_value**2), 4),
        p_value_linear=round(float(p_value), 4),
        std_err=round(float(std_err), 6),
        sens_slope=ss,
        sens_slope_per_decade=round(ss * 10, 4),
        mk_s=mk_s,
        mk_z=mk_z,
        mk_p_value=mk_p,
        direction=direction,
        is_significant=mk_p < 0.05,
        slope_per_decade=round(float(slope * 10), 4),
    )
