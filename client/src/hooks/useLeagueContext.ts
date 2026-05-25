import { useMemo } from "react";
import { useAuth, useUser } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";

export type LeagueContext = {
  leagueId: string;
  season: number;
  teamCount: number;
  scoringType: string;
  playoffTeams: number;
  draftDate: string | null;
  keeperDeadline: string | null;
  myTeamId: number | null;
  myTeamName: string | null;
  myOwnerName: string | null;
  isLoading: boolean;
  isConnected: boolean;
};

function msToIsoString(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function buildOwnerMatchClues(
  user: ReturnType<typeof useUser>["user"]
): string[] {
  if (!user) return [];
  const clues: string[] = [];
  const full = user.fullName?.trim();
  if (full) clues.push(full);
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first || last) clues.push(`${first ?? ""} ${last ?? ""}`.trim());
  if (user.username) clues.push(user.username);
  const email = user.primaryEmailAddress?.emailAddress;
  if (email) {
    const at = email.indexOf("@");
    if (at > 0) clues.push(email.slice(0, at));
    clues.push(email);
  }
  return clues.filter(Boolean) as string[];
}

function resolveMyTeam(
  teams: Array<{ teamId: number; teamName: string; owners: string }>,
  clues: string[]
): { teamId: number; teamName: string; ownerName: string } | null {
  const clean = clues.map((c) => c.trim().toLowerCase()).filter((c) => c.length >= 2);
  if (!clean.length) return null;
  for (const t of teams) {
    const segments = t.owners.split(";").map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      const low = seg.toLowerCase();
      for (const clue of clean) {
        if (low === clue || low.includes(clue) || clue.includes(low)) {
          return { teamId: t.teamId, teamName: t.teamName, ownerName: seg };
        }
      }
    }
  }
  return null;
}

/**
 * League + season context derived from existing tRPC procedures (`league.*`, `espn.*`).
 * Intended as the shared foundation for GM War Room features.
 */
export function useLeagueContext(): LeagueContext {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const activeQ = trpc.league.getActive.useQuery(undefined, { staleTime: 30_000 });
  const leaguesQ = trpc.league.getMyLeagues.useQuery(undefined, { staleTime: 30_000 });
  const cachedQ = trpc.espn.cachedSeasons.useQuery(undefined, { staleTime: 30_000 });

  const season = useMemo(() => {
    const arr = cachedQ.data;
    if (cachedQ.isFetched && arr != null && arr.length > 0) {
      return Math.max(...arr);
    }
    return new Date().getFullYear();
  }, [cachedQ.isFetched, cachedQ.data]);

  const cacheReady = !cachedQ.isLoading;

  const settingsQ = trpc.espn.settings.useQuery(
    { season },
    { enabled: cacheReady, staleTime: 60_000 }
  );
  const teamsQ = trpc.espn.teams.useQuery(
    { season },
    { enabled: cacheReady, staleTime: 60_000 }
  );
  const draftQ = trpc.espn.draftOrder.useQuery(
    { season },
    { enabled: cacheReady, staleTime: 60_000 }
  );

  const settings = settingsQ.data as
    | {
        leagueId?: unknown;
        size?: unknown;
        scoringType?: unknown;
        playoffTeamCount?: unknown;
      }
    | null
    | undefined;

  const teams = (teamsQ.data ?? []) as Array<{
    teamId: number;
    teamName: string;
    owners: string;
  }>;

  const draftOrder = draftQ.data as
    | { draftDate?: unknown; keeperDeadline?: unknown }
    | null
    | undefined;

  const clues = useMemo(
    () => buildOwnerMatchClues(userLoaded ? user : null),
    [user, userLoaded]
  );
  const my = useMemo(() => resolveMyTeam(teams, clues), [teams, clues]);

  const leagueId = useMemo(() => {
    const fromActive = activeQ.data?.leagueId?.trim();
    if (fromActive) return fromActive;
    const fromSettings = settings?.leagueId;
    if (fromSettings != null && String(fromSettings).trim() !== "") {
      return String(fromSettings);
    }
    return "";
  }, [activeQ.data?.leagueId, settings?.leagueId]);

  const isConnected = Boolean(
    (leaguesQ.data?.length ?? 0) > 0 || activeQ.data != null
  );

  const isLoading = useMemo(() => {
    if (!authLoaded || !userLoaded) return true;
    if (authLoaded && userLoaded && !isSignedIn) return false;
    if (activeQ.isLoading || leaguesQ.isLoading || cachedQ.isLoading) return true;
    if (!cacheReady) return true;
    if (settingsQ.isLoading || settingsQ.isFetching) return true;
    if (teamsQ.isLoading || teamsQ.isFetching) return true;
    if (draftQ.isLoading || draftQ.isFetching) return true;
    return false;
  }, [
    authLoaded,
    userLoaded,
    isSignedIn,
    activeQ.isLoading,
    leaguesQ.isLoading,
    cachedQ.isLoading,
    cacheReady,
    settingsQ.isLoading,
    settingsQ.isFetching,
    teamsQ.isLoading,
    teamsQ.isFetching,
    draftQ.isLoading,
    draftQ.isFetching,
  ]);

  return useMemo(
    () => ({
      leagueId,
      season,
      teamCount: Number(settings?.size ?? 0) || 0,
      scoringType:
        settings?.scoringType != null ? String(settings.scoringType) : "",
      playoffTeams: Number(settings?.playoffTeamCount ?? 0) || 0,
      draftDate: msToIsoString(draftOrder?.draftDate),
      keeperDeadline: msToIsoString(draftOrder?.keeperDeadline),
      myTeamId: my?.teamId ?? null,
      myTeamName: my?.teamName ?? null,
      myOwnerName: my?.ownerName ?? null,
      isLoading,
      isConnected,
    }),
    [
      leagueId,
      season,
      settings?.size,
      settings?.scoringType,
      settings?.playoffTeamCount,
      draftOrder?.draftDate,
      draftOrder?.keeperDeadline,
      my?.teamId,
      my?.teamName,
      my?.ownerName,
      isLoading,
      isConnected,
    ]
  );
}
