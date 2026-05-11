/**
 * ML Forecasting Service Bridge
 *
 * Calls the Python FastAPI prediction microservice (port 5001) and
 * provides helpers for enriching player projections with ML predictions.
 *
 * Architecture:
 *   Node (tRPC) → mlService.ts → Python FastAPI (port 5001) → LightGBM models
 *
 * The Python service is started by server/index.ts on startup.
 * If the service is unavailable, all helpers return graceful fallbacks.
 */

import { spawn, ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:5001";
const ML_TIMEOUT_MS = 8000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MLPredictRequest {
  playerName: string;
  position: string;
  // Historical stats (oldest→newest, excluding current week)
  historicalPoints: number[];
  historicalSnaps: number[];
  historicalTargets: number[];
  historicalRushAtt: number[];
  // Vegas context
  impliedTeamTotal?: number;
  gameTotal?: number;
  spread?: number;
  isHome?: boolean;
  vegasAdjustment?: number;
  // Beat reporter signals
  beatNetImpact?: number;
  beatConfidence?: number;
  beatSignalCount?: number;
  beatTopSignalType?: string;
  // Injury context
  injuryRiskScore?: number;
  daysSinceLastGame?: number;
  // Context
  weekNum?: number;
  season?: number;
}

export interface MLPrediction {
  playerName: string;
  predictedPoints: number;
  floor: number;
  ceiling: number;
  confidenceBand: number;
  dataQuality: "rich" | "sparse" | "cold_start";
  featuresUsed: number;
  modelMae: number;
  available: true;
}

export interface MLPredictionUnavailable {
  playerName: string;
  available: false;
  reason: string;
}

export type MLPredictionResult = MLPrediction | MLPredictionUnavailable;

export interface MLModelMetadata {
  trainedAt: string;
  nTrainingRows: number;
  mae: number;
  rmse: number;
  topFeatures: [string, number][];
  dataSource: "synthetic" | "real";
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Prediction helpers ───────────────────────────────────────────────────────

/**
 * Get ML prediction for a single player.
 * Returns MLPredictionUnavailable if the service is down or times out.
 */
export async function getMLPrediction(req: MLPredictRequest): Promise<MLPredictionResult> {
  try {
    const body = {
      player_name: req.playerName,
      position: req.position,
      historical_points: req.historicalPoints,
      historical_snaps: req.historicalSnaps,
      historical_targets: req.historicalTargets,
      historical_rush_att: req.historicalRushAtt,
      implied_team_total: req.impliedTeamTotal ?? null,
      game_total: req.gameTotal ?? null,
      spread: req.spread ?? null,
      is_home: req.isHome ?? false,
      vegas_adjustment: req.vegasAdjustment ?? 0,
      beat_net_impact: req.beatNetImpact ?? 0,
      beat_confidence: req.beatConfidence ?? 0,
      beat_signal_count: req.beatSignalCount ?? 0,
      beat_top_signal_type: req.beatTopSignalType ?? null,
      injury_risk_score: req.injuryRiskScore ?? 0,
      days_since_last_game: req.daysSinceLastGame ?? 7,
      week_num: req.weekNum ?? 1,
      season: req.season ?? 2025,
    };

    const res = await fetchWithTimeout(
      `${ML_SERVICE_URL}/predict`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      ML_TIMEOUT_MS
    );

    if (!res.ok) {
      const text = await res.text();
      return { playerName: req.playerName, available: false, reason: `HTTP ${res.status}: ${text.slice(0, 100)}` };
    }

    const data = await res.json() as {
      player_name: string;
      predicted_points: number;
      floor: number;
      ceiling: number;
      confidence_band: number;
      data_quality: string;
      features_used: number;
      model_mae: number;
    };

    return {
      playerName: data.player_name,
      predictedPoints: data.predicted_points,
      floor: data.floor,
      ceiling: data.ceiling,
      confidenceBand: data.confidence_band,
      dataQuality: data.data_quality as "rich" | "sparse" | "cold_start",
      featuresUsed: data.features_used,
      modelMae: data.model_mae,
      available: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { playerName: req.playerName, available: false, reason: msg };
  }
}

/**
 * Get ML predictions for multiple players in a single batch call.
 */
export async function getMLPredictionBatch(
  players: MLPredictRequest[]
): Promise<MLPredictionResult[]> {
  if (players.length === 0) return [];

  try {
    const body = {
      players: players.map((req) => ({
        player_name: req.playerName,
        position: req.position,
        historical_points: req.historicalPoints,
        historical_snaps: req.historicalSnaps,
        historical_targets: req.historicalTargets,
        historical_rush_att: req.historicalRushAtt,
        implied_team_total: req.impliedTeamTotal ?? null,
        game_total: req.gameTotal ?? null,
        spread: req.spread ?? null,
        is_home: req.isHome ?? false,
        vegas_adjustment: req.vegasAdjustment ?? 0,
        beat_net_impact: req.beatNetImpact ?? 0,
        beat_confidence: req.beatConfidence ?? 0,
        beat_signal_count: req.beatSignalCount ?? 0,
        beat_top_signal_type: req.beatTopSignalType ?? null,
        injury_risk_score: req.injuryRiskScore ?? 0,
        days_since_last_game: req.daysSinceLastGame ?? 7,
        week_num: req.weekNum ?? 1,
        season: req.season ?? 2025,
      })),
    };

    const res = await fetchWithTimeout(
      `${ML_SERVICE_URL}/predict/batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      ML_TIMEOUT_MS * 2
    );

    if (!res.ok) {
      return players.map((p) => ({ playerName: p.playerName, available: false as const, reason: `HTTP ${res.status}` }));
    }

    const data = await res.json() as { predictions: Array<{
      player_name: string;
      predicted_points: number;
      floor: number;
      ceiling: number;
      confidence_band: number;
      data_quality: string;
      features_used: number;
      model_mae: number;
    }> };

    return data.predictions.map((p) => ({
      playerName: p.player_name,
      predictedPoints: p.predicted_points,
      floor: p.floor,
      ceiling: p.ceiling,
      confidenceBand: p.confidence_band,
      dataQuality: p.data_quality as "rich" | "sparse" | "cold_start",
      featuresUsed: p.features_used,
      modelMae: p.model_mae,
      available: true as const,
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return players.map((p) => ({ playerName: p.playerName, available: false as const, reason: msg }));
  }
}

/**
 * Get ML model health and metadata.
 */
export async function getMLHealth(): Promise<{ available: boolean; metadata?: MLModelMetadata }> {
  try {
    const res = await fetchWithTimeout(`${ML_SERVICE_URL}/health`, {}, 3000);
    if (!res.ok) return { available: false };
    const data = await res.json() as {
      status: string;
      model_loaded: boolean;
      metadata: {
        trained_at: string;
        n_training_rows: number;
        mae: number;
        rmse: number;
        top_features: [string, number][];
        data_source: string;
      };
    };
    if (!data.model_loaded) return { available: false };
    return {
      available: true,
      metadata: {
        trainedAt: data.metadata.trained_at,
        nTrainingRows: data.metadata.n_training_rows,
        mae: data.metadata.mae,
        rmse: data.metadata.rmse,
        topFeatures: data.metadata.top_features,
        dataSource: data.metadata.data_source as "synthetic" | "real",
      },
    };
  } catch {
    return { available: false };
  }
}

/**
 * Trigger model retraining (owner-only).
 */
export async function triggerMLRetrain(): Promise<{ success: boolean; metadata?: MLModelMetadata; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${ML_SERVICE_URL}/retrain`,
      { method: "POST" },
      300_000 // 5 min timeout for retraining
    );
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text.slice(0, 200) };
    }
    const data = await res.json() as { status: string; metadata: MLModelMetadata };
    return { success: true, metadata: data.metadata };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Process management ───────────────────────────────────────────────────────

let mlProcess: ChildProcess | null = null;

/**
 * Start the Python ML microservice as a child process.
 * Called from server/index.ts on startup.
 */
export function startMLService(): void {
  const scriptPath = path.resolve(__dirname, "../ml/prediction_service.py");

  try {
    mlProcess = spawn("python3.11", [scriptPath], {
      env: { ...process.env, ML_PORT: "5001" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    mlProcess.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[ML] ${msg}`);
    });

    mlProcess.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes("INFO:")) console.error(`[ML] ${msg}`);
    });

    mlProcess.on("exit", (code) => {
      if (code !== 0) console.error(`[ML] Service exited with code ${code}`);
      mlProcess = null;
    });

    console.log("[ML] Prediction service starting on port 5001...");
  } catch (err) {
    console.error("[ML] Failed to start prediction service:", err);
  }
}

/**
 * Stop the ML microservice gracefully.
 */
export function stopMLService(): void {
  if (mlProcess) {
    mlProcess.kill("SIGTERM");
    mlProcess = null;
  }
}
