/**
 * Authenticated WAV delivery for RFSN Live analyst clips.
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { canAccessRfsnLiveBroadcast } from "./services/sofia/liveBroadcastFeature";
import { logRfsnAudio } from "./services/rfsn/rfsnAudioInstrumentation";
import { getStoredAudioClip } from "./services/rfsn/rfsnVoiceAudioCache";
import type { RfsnCommentatorId } from "../client/src/lib/rfsnPresentation";

const VOICES = new Set<RfsnCommentatorId>(["sofia", "coach", "roxanne"]);

function parseIdentity(req: Request): {
  identity: {
    draftId: string;
    pickId: string;
    pickNumber: number;
    voice: RfsnCommentatorId;
  } | null;
  invalid: boolean;
} {
  const draftId = String(req.query.draftId ?? "").trim();
  const pickId = String(req.query.pickId ?? "").trim();
  const pickNumberRaw = String(req.query.pickNumber ?? "").trim();
  const voice = String(req.query.voice ?? "").trim() as RfsnCommentatorId;

  if (!draftId || !pickId || !pickNumberRaw || !voice) {
    return { identity: null, invalid: false };
  }

  const pickNumber = Number(pickNumberRaw);
  if (!Number.isInteger(pickNumber) || pickNumber < 1 || !VOICES.has(voice)) {
    return { identity: null, invalid: true };
  }

  return {
    identity: { draftId, pickId, pickNumber, voice },
    invalid: false,
  };
}

export function registerRfsnAudioRoute(app: Express): void {
  app.get("/api/rfsn/audio/:audioId", async (req: Request, res: Response) => {
    const audioId = String(req.params.audioId ?? "").trim();
    let statusCode = 500;

    try {
      let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        statusCode = 401;
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (!user || !canAccessRfsnLiveBroadcast(user)) {
        statusCode = 403;
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      if (!audioId || audioId.length > 64) {
        statusCode = 400;
        res.status(400).json({ error: "Invalid request" });
        return;
      }

      const { identity, invalid } = parseIdentity(req);
      if (invalid) {
        statusCode = 400;
        res.status(400).json({ error: "Invalid identity" });
        return;
      }
      if (!identity) {
        statusCode = 400;
        res.status(400).json({ error: "Missing identity" });
        return;
      }

      const clip = await getStoredAudioClip(audioId, identity);
      if (!clip) {
        statusCode = 404;
        res.status(404).json({ error: "Not found" });
        return;
      }

      if (!clip.bytes?.length) {
        statusCode = 409;
        res.status(409).json({ error: "Audio not ready" });
        return;
      }

      statusCode = 200;
      res.setHeader("Content-Type", clip.contentType);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(clip.bytes);
    } catch {
      statusCode = 500;
      res.status(500).json({ error: "Audio unavailable" });
    } finally {
      logRfsnAudio("response_status", { audioId, status: statusCode });
    }
  });
}
