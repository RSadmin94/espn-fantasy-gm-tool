"""
ML Model Training Script

Trains three LightGBM models:
  1. mean_model   — predicts median fantasy points (objective: regression)
  2. low_model    — predicts 10th percentile (floor) (objective: quantile α=0.10)
  3. high_model   — predicts 90th percentile (ceiling) (objective: quantile α=0.90)

Data source: weekly_player_stats table (2018–2025)
Output: models saved to ml/models/ as .pkl files

Usage:
  python3.11 ml/train_model.py

The script generates synthetic training data when the DB is empty
(pre-season / cold-start scenario) and trains on real data when available.
"""

from __future__ import annotations
import os
import sys
import json
import pickle
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Optional

import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.impute import SimpleImputer

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from ml.feature_engineering import (
    FEATURE_COLUMNS,
    build_training_rows_from_player_history,
    build_training_dataframe,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

# ─── LightGBM hyperparameters ─────────────────────────────────────────────────

BASE_PARAMS = {
    "n_estimators": 300,
    "learning_rate": 0.05,
    "num_leaves": 31,
    "max_depth": 6,
    "min_child_samples": 10,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 0.1,
    "random_state": 42,
    "n_jobs": -1,
    "verbose": -1,
}

MEAN_PARAMS = {**BASE_PARAMS, "objective": "regression", "metric": "mae"}
LOW_PARAMS = {**BASE_PARAMS, "objective": "quantile", "alpha": 0.10, "metric": "quantile"}
HIGH_PARAMS = {**BASE_PARAMS, "objective": "quantile", "alpha": 0.90, "metric": "quantile"}


# ─── Synthetic data generator (cold-start) ───────────────────────────────────

def generate_synthetic_training_data(n_players: int = 200, seasons: int = 7) -> list[dict]:
    """
    Generate realistic synthetic fantasy football training data.
    Used when the DB has insufficient real data (< 500 rows).
    """
    rng = np.random.default_rng(42)
    rows = []
    positions = ["QB", "RB", "WR", "TE"]
    pos_base_pts = {"QB": 22.0, "RB": 12.0, "WR": 11.0, "TE": 9.0}
    pos_std = {"QB": 8.0, "RB": 6.0, "WR": 6.0, "TE": 5.0}

    for player_id in range(n_players):
        pos = rng.choice(positions)
        base = pos_base_pts[pos]
        std = pos_std[pos]
        season = int(rng.integers(2018, 2026))
        n_weeks = int(rng.integers(8, 18))

        # Player-level random effects
        player_skill = rng.normal(0, 3)
        snap_base = rng.uniform(50, 95)

        points_history: list[float] = []
        snaps_history: list[float] = []
        targets_history: list[float] = []
        rush_history: list[float] = []

        for week in range(1, n_weeks + 1):
            # Simulate actual points with noise
            implied_total = rng.uniform(17, 30)
            vegas_adj = (implied_total - 22.5) / 22.5 * 0.5
            injury_risk = float(rng.uniform(0, 0.3))
            beat_impact = float(rng.normal(0, 5))
            beat_conf = float(rng.uniform(50, 90))
            is_home = bool(rng.integers(0, 2))

            actual_pts = max(0, rng.normal(
                base + player_skill + vegas_adj * base + beat_impact * 0.1,
                std
            ))

            if len(points_history) >= 1:
                from ml.feature_engineering import build_feature_vector
                fv = build_feature_vector(
                    historical_points=points_history.copy(),
                    historical_snaps=snaps_history.copy(),
                    historical_targets=targets_history.copy(),
                    historical_rush_att=rush_history.copy(),
                    implied_team_total=implied_total,
                    game_total=implied_total * 2 + rng.uniform(-3, 3),
                    spread=float(rng.normal(0, 4)),
                    is_home=is_home,
                    vegas_adjustment=vegas_adj,
                    beat_net_impact=beat_impact,
                    beat_confidence=beat_conf,
                    beat_signal_count=int(rng.integers(0, 4)),
                    injury_risk_score=injury_risk,
                    days_since_last_game=7,
                    position=pos,
                    week_num=week,
                    season=season,
                )
                fv["target"] = float(actual_pts)
                rows.append(fv)

            points_history.append(float(actual_pts))
            snaps_history.append(float(rng.uniform(snap_base - 10, snap_base + 10)))
            targets_history.append(float(rng.integers(0, 12) if pos in ["WR", "TE"] else 0))
            rush_history.append(float(rng.integers(0, 20) if pos == "RB" else 0))

    log.info(f"Generated {len(rows)} synthetic training rows")
    return rows


# ─── Load real data from DB export (JSON) ────────────────────────────────────

def load_real_data_from_json(json_path: str) -> list[dict]:
    """
    Load pre-exported weekly stats from a JSON file.
    The Node server exports this before calling train_model.py.
    """
    with open(json_path) as f:
        raw = json.load(f)

    # Group by player+season
    from collections import defaultdict
    player_seasons: dict[tuple, list] = defaultdict(list)
    for row in raw:
        key = (row["playerId"], row["season"], row["position"])
        player_seasons[key].append(row)

    training_rows = []
    for (player_id, season, position), weeks in player_seasons.items():
        rows = build_training_rows_from_player_history(
            weeks, position=position, season=season
        )
        training_rows.extend(rows)

    log.info(f"Loaded {len(training_rows)} training rows from {len(player_seasons)} player-seasons")
    return training_rows


# ─── Model training ───────────────────────────────────────────────────────────

def train_and_save(training_rows: list[dict]) -> dict:
    """Train mean, low, and high quantile models and save to disk."""
    df = build_training_dataframe(training_rows)

    X = df[FEATURE_COLUMNS].values.astype(np.float32)
    y = df["target"].values.astype(np.float32)

    # Impute NaN with column medians
    imputer = SimpleImputer(strategy="median")
    X = imputer.fit_transform(X)

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    log.info(f"Training on {len(X_train)} rows, validating on {len(X_val)} rows")

    # ── Mean model ────────────────────────────────────────────────────────────
    mean_model = lgb.LGBMRegressor(**MEAN_PARAMS)
    mean_model.fit(X_train, y_train)
    y_pred_mean = mean_model.predict(X_val)
    mae = mean_absolute_error(y_val, y_pred_mean)
    rmse = float(np.sqrt(mean_squared_error(y_val, y_pred_mean)))
    log.info(f"Mean model — MAE: {mae:.2f}, RMSE: {rmse:.2f}")

    # ── Floor model (10th percentile) ─────────────────────────────────────────
    low_model = lgb.LGBMRegressor(**LOW_PARAMS)
    low_model.fit(X_train, y_train)

    # ── Ceiling model (90th percentile) ──────────────────────────────────────
    high_model = lgb.LGBMRegressor(**HIGH_PARAMS)
    high_model.fit(X_train, y_train)

    # ── Feature importances ───────────────────────────────────────────────────
    importances = dict(zip(FEATURE_COLUMNS, mean_model.feature_importances_.tolist()))
    top_features = sorted(importances.items(), key=lambda x: x[1], reverse=True)[:15]

    # ── Save models + imputer ─────────────────────────────────────────────────
    with open(MODELS_DIR / "mean_model.pkl", "wb") as f:
        pickle.dump(mean_model, f)
    with open(MODELS_DIR / "low_model.pkl", "wb") as f:
        pickle.dump(low_model, f)
    with open(MODELS_DIR / "high_model.pkl", "wb") as f:
        pickle.dump(high_model, f)
    with open(MODELS_DIR / "imputer.pkl", "wb") as f:
        pickle.dump(imputer, f)

    # ── Save metadata ─────────────────────────────────────────────────────────
    metadata = {
        "trained_at": pd.Timestamp.now().isoformat(),
        "n_training_rows": len(X_train),
        "n_val_rows": len(X_val),
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "top_features": top_features,
        "feature_columns": FEATURE_COLUMNS,
        "data_source": "synthetic" if len(training_rows) < 500 else "real",
    }
    with open(MODELS_DIR / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    log.info(f"Models saved to {MODELS_DIR}")
    log.info(f"Top 5 features: {top_features[:5]}")

    return metadata


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    real_data_path = MODELS_DIR.parent / "training_data.json"

    if real_data_path.exists():
        log.info(f"Loading real data from {real_data_path}")
        rows = load_real_data_from_json(str(real_data_path))
        if len(rows) < 200:
            log.warning(f"Only {len(rows)} real rows — supplementing with synthetic data")
            rows = rows + generate_synthetic_training_data(150)
    else:
        log.info("No real data found — using synthetic training data")
        rows = generate_synthetic_training_data(300)

    metadata = train_and_save(rows)
    print(json.dumps(metadata, indent=2))
