/**
 * Sprint 10.1 — poll ESPN draft detail and notify RFSN on newly locked picks.
 * Reuses notifyLockedPick; does not touch P3A routing or TTS.
 *
 * RFSN-012 (10.3): connector health / connection-state UX — not in this slice.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { fetchEspnLiveDraftDetail } from "@/lib/espnLiveDraftFetch";
import { isGmWarRoomExtensionPresent } from "@/lib/espnApi";
import {
  buildEspnLiveDraftId,
  diffEspnLiveLockedPicks,
  parseEspnLiveDraftSnapshot,
  selectEspnLivePicksToNotify,
  type EspnLiveLockedPick,
} from "@shared/espnLiveDraftMonitor";

export const ESPN_LIVE_POLL_MS_DEFAULT = 2000;

export type EspnLiveMonitorStatus = {
  active: boolean;
  extensionPresent: boolean;
  lastPollAt: string | null;
  lastError: string | null;
  lockedCount: number;
  notifiedCount: number;
  draftComplete: boolean;
  draftId: string;
};

type Args = {
  enabled: boolean;
  leagueId: string | null | undefined;
  season: number;
  /** Override poll interval (ms). */
  pollMs?: number;
  draftPace?: "broadcast" | "brisk" | "turbo";
  ownerNameByTeamId?: ReadonlyMap<string, string>;
};

export function useEspnLiveDraftMonitor({
  enabled,
  leagueId,
  season,
  pollMs = ESPN_LIVE_POLL_MS_DEFAULT,
  draftPace = "broadcast",
  ownerNameByTeamId,
}: Args): EspnLiveMonitorStatus {
  const _trpc = trpc as any;
  const accessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled,
    staleTime: 60_000,
  });
  const notifyMut = _trpc.rfsnBroadcast.notifyLockedPick.useMutation();

  const draftId = buildEspnLiveDraftId(String(leagueId ?? ""), season);
  const canRun = Boolean(
    enabled &&
      leagueId &&
      accessQ.data?.enabled &&
      accessQ.data?.canAccess,
  );

  const prevPicksRef = useRef<EspnLiveLockedPick[]>([]);
  const notifiedRef = useRef<Set<string>>(new Set());
  const [status, setStatus] = useState<EspnLiveMonitorStatus>({
    active: false,
    extensionPresent: false,
    lastPollAt: null,
    lastError: null,
    lockedCount: 0,
    notifiedCount: 0,
    draftComplete: false,
    draftId,
  });

  useEffect(() => {
    prevPicksRef.current = [];
    notifiedRef.current = new Set();
    setStatus((s) => ({
      ...s,
      draftId,
      lockedCount: 0,
      notifiedCount: 0,
      draftComplete: false,
      lastError: null,
    }));
  }, [draftId]);

  useEffect(() => {
    if (!canRun || !leagueId) {
      setStatus((s) => ({ ...s, active: false, extensionPresent: isGmWarRoomExtensionPresent() }));
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const extensionPresent = isGmWarRoomExtensionPresent();
      try {
        const res = await fetchEspnLiveDraftDetail(leagueId, season);
        if (cancelled) return;
        if (!res.ok) {
          const msg =
            res.kind === "auth"
              ? "League auth required — sign in to your fantasy provider or enable the connector"
              : res.kind === "cors_or_network"
                ? res.message || "Network/CORS — install Fantasy Football Rivals connector"
                : `League fetch failed (${res.kind}${ "status" in res ? ` ${res.status}` : ""})`;
          setStatus((s) => ({
            ...s,
            active: true,
            extensionPresent,
            lastPollAt: new Date().toISOString(),
            lastError: msg,
            draftId,
          }));
          return;
        }

        const snap = parseEspnLiveDraftSnapshot(res.data, { ownerNameByTeamId });
        if (!snap) {
          setStatus((s) => ({
            ...s,
            active: true,
            extensionPresent,
            lastPollAt: new Date().toISOString(),
            lastError: "No draft detail in league payload yet",
            draftId,
          }));
          return;
        }

        const newly = diffEspnLiveLockedPicks(prevPicksRef.current, snap.picks);
        prevPicksRef.current = snap.picks;

        const { toNotify, nextNotified } = selectEspnLivePicksToNotify(
          draftId,
          newly,
          notifiedRef.current,
        );
        notifiedRef.current = nextNotified;
        const notifiedCount = notifiedRef.current.size;

        for (const pick of toNotify) {
          const isLast =
            snap.draftComplete &&
            snap.picks.length > 0 &&
            pick.overallPick === Math.max(...snap.picks.map((p) => p.overallPick));

          void notifyMut
            .mutateAsync({
              leagueId,
              draftId,
              pick: {
                overallPick: pick.overallPick,
                round: pick.round,
                roundPick: pick.roundPick,
                teamId: pick.teamId,
                ownerName: pick.ownerName,
                playerId: pick.playerId,
                playerName: pick.playerName,
                position: pick.position,
                nflTeam: pick.nflTeam,
                adp: pick.adp,
              },
              draftComplete: isLast,
              draftPace,
              teamCount: snap.teamCount,
            })
            .catch((err: unknown) => {
              if (import.meta.env.DEV) {
                console.debug("[espn-live] notifyLockedPick failed", {
                  overallPick: pick.overallPick,
                  message: err instanceof Error ? err.message : "unknown",
                });
              }
            });
        }

        setStatus({
          active: true,
          extensionPresent,
          lastPollAt: new Date().toISOString(),
          lastError: null,
          lockedCount: snap.picks.length,
          notifiedCount,
          draftComplete: snap.draftComplete,
          draftId,
        });
      } catch (e) {
        if (cancelled) return;
        setStatus((s) => ({
          ...s,
          active: true,
          extensionPresent: isGmWarRoomExtensionPresent(),
          lastPollAt: new Date().toISOString(),
          lastError: e instanceof Error ? e.message : String(e),
          draftId,
        }));
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, pollMs);
        }
      }
    };

    setStatus((s) => ({ ...s, active: true, extensionPresent: isGmWarRoomExtensionPresent(), draftId }));
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canRun, draftId, draftPace, leagueId, notifyMut, ownerNameByTeamId, pollMs, season]);

  return status;
}
