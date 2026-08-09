/**
 * advisorStreamHandler.ts
 *
 * Express SSE endpoint for streaming GM Advisor responses.
 * Route: POST /api/advisor/stream
 *
 * Authentication: reads the same session cookie used by tRPC.
 * Body: { message: string, season?: number }
 *
 * Same evidence path as tRPC advisor.chat (RFSN-052E).
 *
 * Response: text/event-stream
 *   data: {"delta":"..."}   — text chunk
 *   data: {"done":true, "meta":{...}} — stream complete (+ evidence telemetry)
 *   data: {"error":"..."}   — error occurred
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import { invokeLLMStream } from "./_core/llm";
import { addChatMessage, getUserMemory, persistLlmUsage, resolveActiveLeagueId, sanitizeAdvisorChatLeagueId } from "./db";
import { checkRateLimit, recordUsage } from "./rateLimiter";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  season: z.number().optional(),
  activeLeagueKey: z.string().optional(),
});

export function registerAdvisorStreamRoute(app: Express) {
  app.post("/api/advisor/stream", async (req: Request, res: Response) => {
    // --- Auth ---
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // --- Validate body ---
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    // --- Rate limit ---
    const rl = checkRateLimit({ userId: user.id, callType: "advisor", isAdmin: user.role === "admin" });
    if (!rl.allowed) {
      res.status(429).json({ error: rl.reason ?? "Rate limit exceeded" });
      return;
    }
    const { message, season: rawSeason, activeLeagueKey } = parsed.data;
    const season = rawSeason ?? 2025;

    const requestedLid =
      activeLeagueKey && !activeLeagueKey.startsWith("__")
        ? activeLeagueKey.trim().slice(0, 32)
        : null;
    const { leagueId: resolvedLid } = await resolveActiveLeagueId(
      { user: { id: user.id } },
      requestedLid,
      undefined,
    );
    const chatLeagueId = sanitizeAdvisorChatLeagueId(String(resolvedLid ?? ""));

    // --- SSE headers ---
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders();

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Persist the user message before answering
      await addChatMessage(user.id, "user", message, season, chatLeagueId);

      const gmMem = await getUserMemory(user.id);
      let gmMemoryBlock: string | undefined;
      if (gmMem) {
        const parts: string[] = [];
        if (gmMem.riskTolerance) parts.push(`Risk Tolerance: ${gmMem.riskTolerance}`);
        if (gmMem.tradePhilosophy) parts.push(`Trade Philosophy: ${gmMem.tradePhilosophy}`);
        if (gmMem.keeperPhilosophy) parts.push(`Keeper Philosophy: ${gmMem.keeperPhilosophy}`);
        if (gmMem.draftStyle) parts.push(`Draft Style: ${gmMem.draftStyle}`);
        if (gmMem.favoritePlayerTypes) parts.push(`Favorite Player Types: ${gmMem.favoritePlayerTypes}`);
        if (gmMem.rivalManagers) parts.push(`Rival Managers to Watch: ${gmMem.rivalManagers}`);
        if (gmMem.notes) parts.push(`GM Notes: ${gmMem.notes}`);
        if (parts.length > 0) gmMemoryBlock = parts.join("\n");
      }

      const { listAdvisorOwnerAliases } = await import("./advisorQuestionClassify");
      const ownerAliases = await listAdvisorOwnerAliases(user.id, season, chatLeagueId);
      const { runAdvisorEvidencePath } = await import("./advisorEvidenceExecutor");
      const path = await runAdvisorEvidencePath({
        message,
        leagueId: chatLeagueId,
        userId: user.id,
        season,
        ownerAliases,
        gmMemoryBlock,
      });

      if (path.kind === "deterministic") {
        const visual = path.visual;
        sendEvent({
          delta: path.message,
          tool: path.tool,
          meta: { ...path.telemetry, ...(visual ? { visual } : {}) },
        });
        await addChatMessage(user.id, "assistant", path.message, season, chatLeagueId);
        recordUsage({ userId: user.id, callType: "advisor", tokensUsed: 0 });
        sendEvent({ done: true, meta: { ...path.telemetry, ...(visual ? { visual } : {}) } });
        return;
      }

      let fullResponse = "";
      for await (const chunk of invokeLLMStream({
        messages: path.messages,
        callType: "advisor",
        persistUsage: (u) => persistLlmUsage({ userId: user!.id, ...u }),
      })) {
        fullResponse += chunk;
        sendEvent({ delta: chunk });
      }

      await addChatMessage(user.id, "assistant", fullResponse || "No response generated.", season, chatLeagueId);
      recordUsage({ userId: user.id, callType: "advisor", tokensUsed: Math.ceil(fullResponse.length / 4) });
      sendEvent({ done: true, meta: path.telemetry });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Stream error";
      console.error("[AdvisorStream] Error:", errMsg);
      sendEvent({ error: errMsg });
    } finally {
      res.end();
    }
  });
}
