"""
Feature Engineering Pipeline for Fantasy Football ML Forecasting

Converts raw weekly player stats + contextual signals into a normalized
feature vector suitable for LightGBM regression.

Feature groups:
  1. Recent performance (PPG rolling windows)
  2. Usage trends (snap %, targets, rush attempts)
  3. Opponent/game context (Vegas implied total, spread, home/away)
  4. Beat reporter signals (net impact, top signal type, confidence)
  5. Injury context (risk score, days since last game)
  6. Position encoding (one-hot)
  7. Season/week context
"""

from __future__ import annotations
import numpy as np
import pandas as pd
from typing import Optional


# ─── Constants ────────────────────────────────────────────────────────────────

POSITIONS = ["QB", "RB", "WR", "TE", "K", "D/ST"]
SIGNAL_TYPES = [
    "role_up", "role_down", "injury_risk", "workload_risk",
    "hidden_opportunity", "depth_chart_change",
    "coach_trust_up", "coach_trust_down", "return_from_injury", "neutral"
]

LEAGUE_AVG_TEAM_TOTAL = 22.5  # NFL average implied team total

# Feature column names (must match training and inference)
FEATURE_COLUMNS = [
    # Recent performance
    "ppg_last1", "ppg_last3", "ppg_last5", "ppg_season",
    "ppg_std3", "ppg_std5",
    # Usage trends
    "snap_pct_last1", "snap_pct_last3",
    "targets_last1", "targets_last3",
    "rush_att_last1", "rush_att_last3",
    # Game context (Vegas)
    "implied_team_total", "game_total", "spread",
    "is_home", "vegas_adjustment",
    # Beat reporter signals
    "beat_net_impact", "beat_confidence", "beat_signal_count",
    # Beat reporter top signal type (one-hot)
    *[f"beat_sig_{s}" for s in SIGNAL_TYPES],
    # Injury context
    "injury_risk_score", "days_since_last_game",
    # Position (one-hot)
    *[f"pos_{p.replace('/', '_')}" for p in POSITIONS],
    # Season/week context
    "week_num", "season_norm",
]


# ─── Rolling window helpers ───────────────────────────────────────────────────

def rolling_mean(values: list[float], window: int) -> float:
    """Mean of the last `window` values. Returns NaN if insufficient data."""
    if not values:
        return float("nan")
    subset = values[-window:]
    if len(subset) == 0:
        return float("nan")
    return float(np.mean(subset))


def rolling_std(values: list[float], window: int) -> float:
    """Std dev of the last `window` values. Returns 0 if < 2 values."""
    if len(values) < 2:
        return 0.0
    subset = values[-window:]
    if len(subset) < 2:
        return 0.0
    return float(np.std(subset, ddof=1))


def safe_last(values: list[float], default: float = 0.0) -> float:
    """Return the last value or default if empty."""
    return float(values[-1]) if values else default


# ─── Feature vector builder ───────────────────────────────────────────────────

def build_feature_vector(
    *,
    # Historical weekly stats for this player (sorted oldest→newest, EXCLUDING current week)
    historical_points: list[float],       # fantasy points (raw, not *100)
    historical_snaps: list[float],        # snap % (0-100)
    historical_targets: list[float],      # target count
    historical_rush_att: list[float],     # rush attempt count
    # Vegas context
    implied_team_total: Optional[float] = None,
    game_total: Optional[float] = None,
    spread: Optional[float] = None,       # positive = favored
    is_home: bool = False,
    vegas_adjustment: float = 0.0,        # fractional, e.g. 0.12 = +12%
    # Beat reporter signals
    beat_net_impact: float = 0.0,         # sum of weighted projectionImpactPct
    beat_confidence: float = 0.0,         # avg confidence of signals
    beat_signal_count: int = 0,
    beat_top_signal_type: Optional[str] = None,
    # Injury context
    injury_risk_score: float = 0.0,       # 0-1
    days_since_last_game: int = 7,
    # Player metadata
    position: str = "WR",
    week_num: int = 1,
    season: int = 2025,
) -> dict[str, float]:
    """
    Build a single feature vector dict for one player-week prediction.
    All values are floats. Missing data is represented as NaN.
    """

    # ── Recent performance ────────────────────────────────────────────────────
    ppg_last1 = safe_last(historical_points, default=float("nan"))
    ppg_last3 = rolling_mean(historical_points, 3)
    ppg_last5 = rolling_mean(historical_points, 5)
    ppg_season = rolling_mean(historical_points, len(historical_points)) if historical_points else float("nan")
    ppg_std3 = rolling_std(historical_points, 3)
    ppg_std5 = rolling_std(historical_points, 5)

    # ── Usage trends ─────────────────────────────────────────────────────────
    snap_pct_last1 = safe_last(historical_snaps, default=float("nan"))
    snap_pct_last3 = rolling_mean(historical_snaps, 3)
    targets_last1 = safe_last(historical_targets, default=float("nan"))
    targets_last3 = rolling_mean(historical_targets, 3)
    rush_att_last1 = safe_last(historical_rush_att, default=float("nan"))
    rush_att_last3 = rolling_mean(historical_rush_att, 3)

    # ── Vegas context ─────────────────────────────────────────────────────────
    impl_total = implied_team_total if implied_team_total is not None else LEAGUE_AVG_TEAM_TOTAL
    g_total = game_total if game_total is not None else float("nan")
    sprd = spread if spread is not None else 0.0

    # ── Beat reporter signal one-hot ──────────────────────────────────────────
    beat_sig_vec = {f"beat_sig_{s}": 0.0 for s in SIGNAL_TYPES}
    if beat_top_signal_type and beat_top_signal_type in SIGNAL_TYPES:
        beat_sig_vec[f"beat_sig_{beat_top_signal_type}"] = 1.0

    # ── Position one-hot ──────────────────────────────────────────────────────
    pos_vec = {f"pos_{p.replace('/', '_')}": 0.0 for p in POSITIONS}
    pos_key = f"pos_{position.replace('/', '_')}"
    if pos_key in pos_vec:
        pos_vec[pos_key] = 1.0

    # ── Season normalization (2018=0.0, 2025=1.0) ────────────────────────────
    season_norm = (season - 2018) / max(2025 - 2018, 1)

    feature = {
        "ppg_last1": ppg_last1,
        "ppg_last3": ppg_last3,
        "ppg_last5": ppg_last5,
        "ppg_season": ppg_season,
        "ppg_std3": ppg_std3,
        "ppg_std5": ppg_std5,
        "snap_pct_last1": snap_pct_last1,
        "snap_pct_last3": snap_pct_last3,
        "targets_last1": targets_last1,
        "targets_last3": targets_last3,
        "rush_att_last1": rush_att_last1,
        "rush_att_last3": rush_att_last3,
        "implied_team_total": impl_total,
        "game_total": g_total,
        "spread": sprd,
        "is_home": float(is_home),
        "vegas_adjustment": vegas_adjustment,
        "beat_net_impact": beat_net_impact,
        "beat_confidence": beat_confidence,
        "beat_signal_count": float(beat_signal_count),
        **beat_sig_vec,
        "injury_risk_score": injury_risk_score,
        "days_since_last_game": float(days_since_last_game),
        **pos_vec,
        "week_num": float(week_num),
        "season_norm": season_norm,
    }

    return feature


def feature_vector_to_array(fv: dict[str, float]) -> np.ndarray:
    """Convert a feature dict to a numpy array in the canonical column order."""
    return np.array([fv.get(col, float("nan")) for col in FEATURE_COLUMNS], dtype=np.float32)


def build_training_dataframe(rows: list[dict]) -> pd.DataFrame:
    """
    Build a training DataFrame from a list of player-week dicts.

    Each dict must have:
      - all keys from FEATURE_COLUMNS
      - 'target': actual fantasy points for that week (float)
    """
    records = []
    for row in rows:
        record = {col: row.get(col, float("nan")) for col in FEATURE_COLUMNS}
        record["target"] = float(row["target"])
        records.append(record)
    df = pd.DataFrame(records)
    return df


# ─── Historical data → training rows ─────────────────────────────────────────

def build_training_rows_from_player_history(
    player_rows: list[dict],
    *,
    position: str,
    season: int,
) -> list[dict]:
    """
    Given a player's weekly stats for a season (sorted by week ascending),
    produce one training row per week (using prior weeks as history).

    player_rows: list of dicts with keys:
      week, fantasyPoints (int, *100), snapPct, targets, rushingAttempts
    """
    training_rows = []
    points_history: list[float] = []
    snaps_history: list[float] = []
    targets_history: list[float] = []
    rush_history: list[float] = []

    for row in sorted(player_rows, key=lambda r: r["week"]):
        week = row["week"]
        actual_pts = row.get("fantasyPoints", 0) / 100.0  # convert from *100 storage

        # Need at least 1 prior week to make a prediction
        if len(points_history) >= 1:
            fv = build_feature_vector(
                historical_points=points_history.copy(),
                historical_snaps=snaps_history.copy(),
                historical_targets=targets_history.copy(),
                historical_rush_att=rush_history.copy(),
                position=position,
                week_num=week,
                season=season,
            )
            fv["target"] = actual_pts
            training_rows.append(fv)

        # Append current week to history for next iteration
        points_history.append(actual_pts)
        snaps_history.append(float(row.get("snapPct", 0)))
        targets_history.append(float(row.get("targets", 0)))
        rush_history.append(float(row.get("rushingAttempts", 0)))

    return training_rows
