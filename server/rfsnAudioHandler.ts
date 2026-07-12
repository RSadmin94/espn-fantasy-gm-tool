/**
 * Authenticated WAV delivery for RFSN Live analyst clips.
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { canAccessRfsnLiveBroadcast } from "./services/sofia/liveBroadcastFeature";
import { getStoredAudioClip } from "./services/rfsn/rfsnVoiceAudioCache";

export function registerRfsnAudioRoute(app: Express): void {
  app.get("/api/rfsn/audio/:audioId", async (req: Request, res: Response) => {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!user || !canAccessRfsnLiveBroadcast(user)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const audioId = String(req.params.audioId ?? "").trim();
    if (!audioId || audioId.length > 64) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const clip = getStoredAudioClip(audioId);
    if (!clip) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.setHeader("Content-Type", clip.contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(clip.bytes);
  });
}
