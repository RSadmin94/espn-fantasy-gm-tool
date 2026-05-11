"""
ML Prediction Microservice (FastAPI)

Exposes:
  POST /predict        — predict fantasy points for one player-week
  POST /predict/batch  — predict for multiple players at once
  GET  /health         — service health + model metadata
  POST /retrain        — trigger model retraining from latest DB export

Runs on port 5001. Started by the Node server on startup.
"""

from __future__ import annotations
import os
import sys
import json
import pickle
import logging
import subprocess
from pathlib import Path
from typing import Optional, List

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from ml.feature_engineering import (
    FEATURE_COLUMNS,
    build_feature_vector,
    feature_vector_to_array,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "models"
app = FastAPI(title="FF ML Prediction Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Model registry ───────────────────────────────────────────────────────────

class ModelRegistry:
    mean_model = None
    low_model = None
    high_model = None
    imputer = None
    metadata: dict = {}
    loaded: bool = False

    @classmethod
    def load(cls) -> bool:
        try:
            with open(MODELS_DIR / "mean_model.pkl", "rb") as f:
                cls.mean_model = pickle.load(f)
            with open(MODELS_DIR / "low_model.pkl", "rb") as f:
                cls.low_model = pickle.load(f)
            with open(MODELS_DIR / "high_model.pkl", "rb") as f:
                cls.high_model = pickle.load(f)
            with open(MODELS_DIR / "imputer.pkl", "rb") as f:
                cls.imputer = pickle.load(f)
            with open(MODELS_DIR / "metadata.json") as f:
                cls.metadata = json.load(f)
            cls.loaded = True
            log.info(f"Models loaded — MAE: {cls.metadata.get('mae')}, trained: {cls.metadata.get('trained_at')}")
            return True
        except FileNotFoundError:
            log.warning("Models not found — will train on first request")
            return False

    @classmethod
    def ensure_loaded(cls):
        if not cls.loaded:
            # Auto-train if models don't exist
            cls._train()
            cls.load()

    @classmethod
    def _train(cls):
        log.info("Auto-training models...")
        script = Path(__file__).parent / "train_model.py"
        result = subprocess.run(
            ["python3.11", str(script)],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode != 0:
            log.error(f"Training failed: {result.stderr}")
            raise RuntimeError(f"Model training failed: {result.stderr[:500]}")
        log.info("Training complete")


# Load models at startup
ModelRegistry.load()


# ─── Request/Response schemas ─────────────────────────────────────────────────

class PredictRequest(BaseModel):
    player_name: str
    position: str = "WR"
    # Historical stats (sorted oldest→newest, excluding current week)
    historical_points: List[float] = Field(default_factory=list)
    historical_snaps: List[float] = Field(default_factory=list)
    historical_targets: List[float] = Field(default_factory=list)
    historical_rush_att: List[float] = Field(default_factory=list)
    # Vegas context
    implied_team_total: Optional[float] = None
    game_total: Optional[float] = None
    spread: Optional[float] = None
    is_home: bool = False
    vegas_adjustment: float = 0.0
    # Beat reporter signals
    beat_net_impact: float = 0.0
    beat_confidence: float = 0.0
    beat_signal_count: int = 0
    beat_top_signal_type: Optional[str] = None
    # Injury context
    injury_risk_score: float = 0.0
    days_since_last_game: int = 7
    # Context
    week_num: int = 1
    season: int = 2025


class PredictResponse(BaseModel):
    player_name: str
    predicted_points: float
    floor: float           # 10th percentile
    ceiling: float         # 90th percentile
    confidence_band: float # ceiling - floor
    data_quality: str      # "rich" | "sparse" | "cold_start"
    features_used: int
    model_mae: float


class BatchPredictRequest(BaseModel):
    players: List[PredictRequest]


class BatchPredictResponse(BaseModel):
    predictions: List[PredictResponse]
    model_metadata: dict


# ─── Prediction logic ─────────────────────────────────────────────────────────

def _predict_one(req: PredictRequest) -> PredictResponse:
    ModelRegistry.ensure_loaded()

    fv = build_feature_vector(
        historical_points=req.historical_points,
        historical_snaps=req.historical_snaps,
        historical_targets=req.historical_targets,
        historical_rush_att=req.historical_rush_att,
        implied_team_total=req.implied_team_total,
        game_total=req.game_total,
        spread=req.spread,
        is_home=req.is_home,
        vegas_adjustment=req.vegas_adjustment,
        beat_net_impact=req.beat_net_impact,
        beat_confidence=req.beat_confidence,
        beat_signal_count=req.beat_signal_count,
        beat_top_signal_type=req.beat_top_signal_type,
        injury_risk_score=req.injury_risk_score,
        days_since_last_game=req.days_since_last_game,
        position=req.position,
        week_num=req.week_num,
        season=req.season,
    )

    X = feature_vector_to_array(fv).reshape(1, -1)
    X_imp = ModelRegistry.imputer.transform(X)

    # Count non-NaN features before imputation
    features_used = int(np.sum(~np.isnan(feature_vector_to_array(fv))))

    pred_mean = float(ModelRegistry.mean_model.predict(X_imp)[0])
    pred_low = float(ModelRegistry.low_model.predict(X_imp)[0])
    pred_high = float(ModelRegistry.high_model.predict(X_imp)[0])

    # Clamp to reasonable bounds
    pred_mean = max(0.0, round(pred_mean, 2))
    pred_low = max(0.0, round(min(pred_low, pred_mean), 2))
    pred_high = max(pred_mean, round(pred_high, 2))

    # Data quality assessment
    n_history = len(req.historical_points)
    if n_history >= 5:
        quality = "rich"
    elif n_history >= 2:
        quality = "sparse"
    else:
        quality = "cold_start"

    return PredictResponse(
        player_name=req.player_name,
        predicted_points=pred_mean,
        floor=pred_low,
        ceiling=pred_high,
        confidence_band=round(pred_high - pred_low, 2),
        data_quality=quality,
        features_used=features_used,
        model_mae=ModelRegistry.metadata.get("mae", 0.0),
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok" if ModelRegistry.loaded else "no_model",
        "model_loaded": ModelRegistry.loaded,
        "metadata": ModelRegistry.metadata,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    try:
        return _predict_one(req)
    except Exception as e:
        log.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/batch", response_model=BatchPredictResponse)
def predict_batch(req: BatchPredictRequest):
    try:
        predictions = [_predict_one(p) for p in req.players]
        return BatchPredictResponse(
            predictions=predictions,
            model_metadata=ModelRegistry.metadata,
        )
    except Exception as e:
        log.error(f"Batch prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/retrain")
def retrain():
    """Trigger model retraining. Expects training_data.json to exist."""
    try:
        ModelRegistry._train()
        ModelRegistry.load()
        return {"status": "ok", "metadata": ModelRegistry.metadata}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 5001))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
