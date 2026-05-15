/**
 * LeagueConnect — Multi-provider league onboarding flow
 *
 * Step 1: Choose provider (ESPN / Sleeper / coming soon)
 * Step 2: Enter league credentials
 * Step 3: DNA generation progress screen ("Analyzing 18 seasons...")
 * Step 4: Success — league profile summary
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, Circle, Loader2, ChevronRight, ArrowLeft, ExternalLink, Zap, Lock, RefreshCw, Download, Puzzle, ChevronDown } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "choose_provider" | "enter_credentials" | "yahoo_pick_league" | "generating" | "claim_team" | "success";
type Provider = "espn" | "sleeper" | "yahoo" | "nfl" | "fleaflicker" | "fantrax";

interface ProviderCard {
  id: Provider;
  name: string;
  emoji: string;
  description: string;
  authRequired: boolean;
  status: "live" | "coming_soon";
  instructions?: string;
}

const PROVIDERS: ProviderCard[] = [
  {
    id: "sleeper",
    name: "Sleeper",
    emoji: "😴",
    description: "Modern platform with a public API. No login needed — just your league ID.",
    authRequired: false,
    status: "live",
    instructions: "Find your league ID in the Sleeper app: tap your league → Settings → League ID.",
  },
  {
    id: "espn",
    name: "ESPN Fantasy",
    emoji: "🏈",
    description: "The most popular fantasy platform. Requires SWID + espn_s2 cookies.",
    authRequired: true,
    status: "live",
    instructions: "Log into ESPN Fantasy → DevTools (F12) → Application → Cookies → copy SWID and espn_s2.",
  },
  {
    id: "yahoo",
    name: "Yahoo Fantasy",
    emoji: "🟣",
    description: "Yahoo Sports fantasy leagues. Connect via Yahoo OAuth — no cookies needed.",
    authRequired: true,
    status: "live",
    instructions: "Click \"Connect Yahoo\" to authorize via Yahoo. You'll be redirected to Yahoo to grant access, then returned here to pick your league.",
  },
  {
    id: "nfl",
    name: "NFL Fantasy",
    emoji: "🏟️",
    description: "The official NFL fantasy platform. Coming soon.",
    authRequired: true,
    status: "coming_soon",
  },
  {
    id: "fleaflicker",
    name: "Fleaflicker",
    emoji: "🦟",
    description: "Highly customizable platform with a public API. Coming soon.",
    authRequired: false,
    status: "coming_soon",
  },
  {
    id: "fantrax",
    name: "Fantrax",
    emoji: "🎯",
    description: "Advanced scoring and deep customization. Coming soon.",
    authRequired: true,
    status: "coming_soon",
  },
];

// ─── DNA progress steps ───────────────────────────────────────────────────────

const DNA_STEPS = [
  "Reading 9 seasons of league history…",
  "Profiling 14 managers…",
  "Computing rivalries and trade patterns…",
  "Generating your League DNA…",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeagueConnect() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("choose_provider");
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [leagueId, setLeagueId] = useState("");
  const [username, setUsername] = useState("");
  const [sleeperLeagues, setSleeperLeagues] = useState<Array<{ leagueId: string; name: string; season: string; teamCount: number; status: string }>>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const [progressStep, setProgressStep] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [result, setResult] = useState<{
    leagueName: string;
    teamCount: number;
    scoringType: string;
    matchupCount: number;
    transactionCount: number;
    dnaProfile: unknown;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Yahoo state
  const [yahooLeagues, setYahooLeagues] = useState<Array<{ leagueKey: string; leagueId: string; name: string; season: string; teamCount: number }>>([]);
  const [selectedYahooLeagueId, setSelectedYahooLeagueId] = useState("");
  const [selectedYahooLeagueName, setSelectedYahooLeagueName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  // ESPN state
  const [espnLeagueId, setEspnLeagueId] = useState("");
  const [espnSwid, setEspnSwid] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [showManualEspn, setShowManualEspn] = useState(false);
  // Pre-fill from URL params (e.g. ?leagueId=158918&teamId=6)
  // Also handle ?step=claim_team from extension success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lid = params.get("leagueId");
    if (lid) setEspnLeagueId(lid);
    // If mode=manual is in URL, open manual form immediately
    if (params.get("mode") === "manual") setShowManualEspn(true);
    // Extension success redirect: jump straight to claim-team step
    if (params.get("step") === "claim_team") {
      setStep("claim_team");
    }
  }, []);
  // Check if Yahoo OAuth is configured
  const yahooConfigured = trpc.providers.isYahooConfigured.useQuery();
  // Check if we have a pending Yahoo auth (post-callback)
  const yahooPendingAuth = trpc.providers.getYahooPendingAuth.useQuery(
    undefined,
    { enabled: !!user }
  );
  // Get Yahoo auth URL
  const yahooAuthUrlQuery = trpc.providers.getYahooAuthUrl.useQuery(
    { origin: typeof window !== "undefined" ? window.location.origin : "" },
    { enabled: !!user && !!yahooConfigured.data?.configured }
  );
  // Get Yahoo leagues (after auth)
  const yahooLeaguesQuery = trpc.providers.getYahooLeagues.useQuery(
    { season: 2025 },
    { enabled: false }
  );
  // Import Yahoo league mutation
  const importYahooMutation = trpc.providers.importYahooLeague.useMutation({
    onSuccess: (data) => {
      setResult({
        leagueName: data.league.leagueName,
        teamCount: data.league.teamCount,
        scoringType: data.league.scoringType,
        matchupCount: data.matchupCount,
        transactionCount: data.transactionCount,
        dnaProfile: data.dnaProfile,
      });
      setProgressPct(100);
      setProgressStep(DNA_STEPS.length - 1);
      setTimeout(() => setStep("claim_team"), 800);
    },
    onError: (err) => {
      setError(err.message);
      setStep("yahoo_pick_league");
    },
  });
  // Detect Yahoo OAuth callback (yahoo_auth=success in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("yahoo_auth") === "success") {
      setSelectedProvider("yahoo");
      setStep("yahoo_pick_league");
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("yahoo_error")) {
      setError(`Yahoo authorization failed: ${params.get("yahoo_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  const handleYahooConnect = () => {
    if (!user) {
      window.location.href = getLoginUrl();
      return;
    }
    const authUrl = yahooAuthUrlQuery.data?.url;
    if (authUrl) {
      window.location.href = authUrl;
    }
  };
  const handleYahooLoadLeagues = async () => {
    const res = await yahooLeaguesQuery.refetch();
    if (res.data?.leagues) {
      setYahooLeagues(res.data.leagues);
    } else if (res.data?.error) {
      setError(res.data.error);
    }
  };
  const handleYahooImport = () => {
    const id = selectedYahooLeagueId;
    if (!id) {
      setError("Please select a league");
      return;
    }
    setError(null);
    setStep("generating");
    setProgressStep(0);
    setProgressPct(0);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < DNA_STEPS.length - 1) {
        setProgressStep(step);
        setProgressPct(Math.round((step / (DNA_STEPS.length - 1)) * 85));
      } else {
        clearInterval(interval);
      }
    }, 900);
    importYahooMutation.mutate({
      leagueId: id,
      leagueName: selectedYahooLeagueName,
      season: 2025,
    });
  };
  // Sleeper username lookupp
  const sleeperUserQuery = trpc.providers.getSleeperLeaguesForUser.useQuery(
    { username, season: 2025 },
    { enabled: false }
  );

  // Sleeper league validation
  const sleeperValidate = trpc.providers.validateSleeperLeague.useQuery(
    { leagueId: selectedLeagueId || leagueId },
    { enabled: false }
  );

  // Import mutation
  const importEspnMutation = trpc.providers.importEspnLeague.useMutation({
    onSuccess: (data) => {
      setResult({
        leagueName: data.league.leagueName,
        teamCount: data.league.teamCount,
        scoringType: "ESPN",
        matchupCount: 0,
        transactionCount: 0,
        dnaProfile: null,
      });
      setStep("claim_team");
    },
    onError: (err) => {
      setError(err.message || "ESPN import failed");
      setStep("enter_credentials");
    },
  });
  const importMutation = trpc.providers.importSleeperLeague.useMutation({
    onSuccess: (data) => {
      setResult({
        leagueName: data.league.leagueName,
        teamCount: data.league.teamCount,
        scoringType: data.league.scoringType,
        matchupCount: data.matchupCount,
        transactionCount: data.transactionCount,
        dnaProfile: data.dnaProfile,
      });
      setProgressPct(100);
      setProgressStep(DNA_STEPS.length - 1);
      setTimeout(() => setStep("claim_team"), 800);
    },
    onError: (err) => {
      setError(err.message);
      setStep("enter_credentials");
    },
  });

  const handleProviderSelect = (provider: ProviderCard) => {
    if (provider.status === "coming_soon") return;
    setSelectedProvider(provider.id);
    setError(null);
    if (provider.id === "yahoo") {
      // Yahoo uses OAuth — redirect to Yahoo authorization
      if (!user) {
        window.location.href = getLoginUrl();
        return;
      }
      const authUrl = yahooAuthUrlQuery.data?.url;
      if (authUrl) {
        window.location.href = authUrl;
      } else if (!yahooConfigured.data?.configured) {
        setError("Yahoo OAuth is not yet configured on this server. Please add YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in Settings.");
      } else {
        setError("Could not get Yahoo authorization URL. Please try again.");
      }
      return;
    }
    setStep("enter_credentials");
  };

  const handleSleeperLookup = async () => {
    if (!username.trim()) return;
    const res = await sleeperUserQuery.refetch();
    if (res.data?.found && res.data.leagues) {
      setSleeperLeagues(res.data.leagues);
    } else {
      setError(res.data?.error || "User not found");
    }
  };

  const handleImport = async () => {
    const id = selectedLeagueId || leagueId;
    if (!id.trim()) {
      setError("Please enter a league ID");
      return;
    }
    setError(null);
    setStep("generating");
    setProgressStep(0);
    setProgressPct(0);

    // Animate progress steps
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < DNA_STEPS.length - 1) {
        setProgressStep(step);
        setProgressPct(Math.round((step / (DNA_STEPS.length - 1)) * 85));
      } else {
        clearInterval(interval);
      }
    }, 900);

    importMutation.mutate({ leagueId: id, season: 2025 });
  };

  // ── Step: Choose provider ──────────────────────────────────────────────────
  if (step === "choose_provider") {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Zap className="w-4 h-4" />
              Multi-Platform Intelligence
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-3">Connect Your League</h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Import your fantasy league to unlock DNA profiling, weekly assessments, trade analysis, and championship equity modeling.
            </p>
          </div>

          {/* Provider grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderSelect(p)}
                disabled={p.status === "coming_soon"}
                className={`
                  relative text-left rounded-xl border p-5 transition-all duration-200
                  ${p.status === "coming_soon"
                    ? "opacity-50 cursor-not-allowed border-border bg-card"
                    : "cursor-pointer border-border bg-card hover:border-primary hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5"
                  }
                `}
              >
                {p.status === "coming_soon" && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="secondary" className="text-xs">Soon</Badge>
                  </div>
                )}
                {p.status === "live" && (
                  <div className="absolute top-3 right-3">
                    <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Live</Badge>
                  </div>
                )}
                <div className="text-3xl mb-3">{p.emoji}</div>
                <div className="font-semibold text-foreground mb-1">{p.name}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{p.description}</div>
                {p.authRequired && p.status === "live" && (
                  <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                    <Lock className="w-3 h-3" />
                    Credentials required
                  </div>
                )}
                {!p.authRequired && p.status === "live" && (
                  <div className="flex items-center gap-1 mt-3 text-xs text-emerald-400">
                    <CheckCircle className="w-3 h-3" />
                    No login needed
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Auth prompt */}
          {!user && (
            <Alert className="mt-8 border-primary/30 bg-primary/5">
              <AlertDescription className="flex items-center justify-between">
                <span className="text-sm">Sign in to save your league connection and access the full intelligence stack.</span>
                <Button size="sm" variant="outline" asChild>
                  <a href={getLoginUrl()}>Sign In</a>
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  // ── Step: Enter credentials (Sleeper) ─────────────────────────────────────
  if (step === "enter_credentials" && selectedProvider === "sleeper") {
    const provider = PROVIDERS.find(p => p.id === "sleeper")!;
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <button
            onClick={() => { setStep("choose_provider"); setError(null); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to providers
          </button>

          <div className="flex items-center gap-3 mb-8">
            <div className="text-4xl">{provider.emoji}</div>
            <div>
              <h2 className="text-2xl font-bold">{provider.name}</h2>
              <p className="text-muted-foreground text-sm">{provider.description}</p>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Import Your Sleeper League</CardTitle>
              <CardDescription>
                {provider.instructions}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Option A: Username lookup */}
              <div>
                <div className="text-sm font-medium mb-2">Option 1 — Find by Sleeper username</div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Your Sleeper username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSleeperLookup()}
                  />
                  <Button
                    variant="outline"
                    onClick={handleSleeperLookup}
                    disabled={sleeperUserQuery.isFetching}
                  >
                    {sleeperUserQuery.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Look up"}
                  </Button>
                </div>
              </div>

              {/* League list from username lookup */}
              {sleeperLeagues.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Select a league:</div>
                  {sleeperLeagues.map((l) => (
                    <button
                      key={l.leagueId}
                      onClick={() => setSelectedLeagueId(l.leagueId)}
                      className={`
                        w-full text-left rounded-lg border p-3 transition-all
                        ${selectedLeagueId === l.leagueId
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                        }
                      `}
                    >
                      <div className="font-medium text-sm">{l.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {l.season} · {l.teamCount} teams · {l.status}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <Separator />

              {/* Option B: Direct league ID */}
              <div>
                <div className="text-sm font-medium mb-2">Option 2 — Enter league ID directly</div>
                <Input
                  placeholder="e.g. 917324820394872832"
                  value={leagueId}
                  onChange={(e) => setLeagueId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleImport()}
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleImport}
                disabled={(!leagueId.trim() && !selectedLeagueId) || importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    Generate League DNA
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Step: ESPN enter credentials ─────────────────────────────────────────
  if (step === "enter_credentials" && selectedProvider === "espn") {
    const handleEspnImport = () => {
      if (!espnLeagueId.trim()) { setError("League ID is required"); return; }
      if (!espnSwid.trim()) { setError("SWID cookie is required"); return; }
      if (!espnS2.trim()) { setError("espn_s2 cookie is required"); return; }
      setError(null);
      importEspnMutation.mutate({
        leagueId: espnLeagueId.trim(),
        swid: espnSwid.trim(),
        espnS2: espnS2.trim(),
        season: 2025,
      });
    };
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <button
            onClick={() => { setStep("choose_provider"); setError(null); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to providers
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="text-4xl">🏈</div>
            <div>
              <h2 className="text-2xl font-bold">Connect ESPN Fantasy</h2>
              <p className="text-muted-foreground text-sm">The easiest way is the browser extension — no cookie hunting required.</p>
            </div>
          </div>

          {(importEspnMutation.error || error) && (
            <Alert variant="destructive" className="mb-6 mt-6">
              <AlertDescription>{importEspnMutation.error?.message || error}</AlertDescription>
            </Alert>
          )}

          {/* ── PRIMARY: Extension path ── */}
          <Card className="mt-6 border-primary/40 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Puzzle className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">Use the Browser Extension</CardTitle>
                <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-auto">Recommended</Badge>
              </div>
              <CardDescription className="text-sm">
                Install the GM Tool Connector extension, navigate to your ESPN league, and click the extension icon. It captures everything automatically — no DevTools, no copy-pasting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { step: "1", label: "Install extension", icon: "⬇️" },
                  { step: "2", label: "Open your ESPN league", icon: "🏈" },
                  { step: "3", label: "Click the extension", icon: "🔌" },
                ].map(s => (
                  <div key={s.step} className="rounded-lg bg-background border border-border p-3">
                    <div className="text-2xl mb-1">{s.icon}</div>
                    <div className="text-xs text-muted-foreground leading-tight">{s.label}</div>
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = "/manus-storage/espn-gm-tool-connector-v1.4.0_969aaa64.zip";
                  a.download = "espn-gm-tool-connector.zip";
                  a.click();
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Extension (.zip)
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Chrome / Edge · Load unpacked from chrome://extensions · Developer mode on
              </p>
            </CardContent>
          </Card>

          {/* ── FALLBACK: Manual cookie entry ── */}
          <div className="mt-4">
            <button
              onClick={() => setShowManualEspn(v => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showManualEspn ? "rotate-180" : ""}`} />
              Advanced: enter cookies manually
            </button>

            {showManualEspn && (
              <Card className="mt-3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Manual Cookie Entry</CardTitle>
                  <CardDescription className="text-xs">
                    Log into <a href="https://fantasy.espn.com" target="_blank" rel="noopener noreferrer" className="underline">fantasy.espn.com</a> → DevTools (F12) → Application → Cookies → copy <code className="font-mono bg-muted px-1 rounded">SWID</code> and <code className="font-mono bg-muted px-1 rounded">espn_s2</code>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">League ID</label>
                    <Input
                      placeholder="e.g. 158918"
                      value={espnLeagueId}
                      onChange={e => setEspnLeagueId(e.target.value)}
                      disabled={importEspnMutation.isPending}
                    />
                    <p className="text-xs text-muted-foreground">Found in your ESPN league URL: ?leagueId=<strong>158918</strong></p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">SWID Cookie</label>
                    <Input
                      placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                      value={espnSwid}
                      onChange={e => setEspnSwid(e.target.value)}
                      disabled={importEspnMutation.isPending}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">espn_s2 Cookie</label>
                    <Input
                      placeholder="AEBxxxxxxxxxxxxxxxxxxxxxxxx..."
                      value={espnS2}
                      onChange={e => setEspnS2(e.target.value)}
                      disabled={importEspnMutation.isPending}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Encrypted with AES-256-GCM before storage. Never shared or logged.
                    </p>
                  </div>
                  <Button
                    onClick={handleEspnImport}
                    disabled={!espnLeagueId.trim() || !espnSwid.trim() || !espnS2.trim() || importEspnMutation.isPending}
                    className="w-full"
                  >
                    {importEspnMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Validating & Connecting...</>
                    ) : (
                      <><Zap className="w-4 h-4 mr-2" />Connect ESPN League</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }
  // ── Step: Yahoo pick league ───────────────────────────────────────────────
  if (step === "yahoo_pick_league") {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <button
            onClick={() => { setStep("choose_provider"); setError(null); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to providers
          </button>
          <div className="flex items-center gap-3 mb-8">
            <div className="text-4xl">🟣</div>
            <div>
              <h2 className="text-2xl font-bold">Yahoo Fantasy</h2>
              <p className="text-muted-foreground text-sm">Select the league you want to import</p>
            </div>
          </div>
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Yahoo Leagues</CardTitle>
              <CardDescription>
                {yahooPendingAuth.data?.hasPendingAuth
                  ? "Yahoo authorization successful. Load your leagues below."
                  : "Authorization complete. Select a league to import."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {yahooLeagues.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Click below to fetch your Yahoo Fantasy leagues for the 2025 season.
                  </p>
                  <Button
                    onClick={handleYahooLoadLeagues}
                    disabled={yahooLeaguesQuery.isFetching}
                    variant="outline"
                  >
                    {yahooLeaguesQuery.isFetching ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading leagues...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4 mr-2" />Load My Yahoo Leagues</>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground mb-3">Select a league to import:</div>
                  {yahooLeagues.map((l) => (
                    <button
                      key={l.leagueKey}
                      onClick={() => { setSelectedYahooLeagueId(l.leagueKey); setSelectedYahooLeagueName(l.name); }}
                      className={`
                        w-full text-left rounded-lg border p-3 transition-all
                        ${selectedYahooLeagueId === l.leagueKey
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                        }
                      `}
                    >
                      <div className="font-medium text-sm">{l.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {l.season} · {l.teamCount} teams
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {yahooLeagues.length > 0 && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleYahooImport}
                  disabled={!selectedYahooLeagueId || importYahooMutation.isPending}
                >
                  {importYahooMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
                  ) : (
                    <>Generate League DNA <ChevronRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  // ── Step: Generating DNA ───────────────────────────────────────────────────
  if (step === "generating") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-lg w-full mx-auto px-4">
          <div className="text-center mb-10">
            <div className="text-5xl mb-4 animate-pulse">🧬</div>
            <h2 className="text-2xl font-bold mb-2">Generating League DNA</h2>
            <p className="text-muted-foreground text-sm">
              Analyzing manager behavior, trade patterns, and roster tendencies...
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <Progress value={progressPct} className="h-2 mb-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progressPct}% complete</span>
              <span>{DNA_STEPS.length} analysis steps</span>
            </div>
          </div>

          {/* Steps list */}
          <div className="space-y-3">
            {DNA_STEPS.map((s, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                  i < progressStep
                    ? "text-emerald-400"
                    : i === progressStep
                    ? "text-foreground"
                    : "text-muted-foreground/40"
                }`}
              >
                {i < progressStep ? (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                ) : i === progressStep ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4 shrink-0" />
                )}
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Step: Claim Team ────────────────────────────────────────────────────────
  const teamsForClaimQuery = trpc.identity.listTeamsForClaim.useQuery(
    { season: 2025 },
    { enabled: step === "claim_team" && !!user }
  );
  const claimTeamMutation = trpc.identity.claimTeam.useMutation({
    onSuccess: () => { navigate("/reveal"); },
    onError: (err) => { setError(err.message); },
  });

  if (step === "claim_team") {
    const teams = teamsForClaimQuery.data ?? [];
    const selectedTeam = teams.find(t => t.teamId === selectedTeamId);
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 mb-4">
              <span className="text-3xl">🏈</span>
            </div>
            <h2 className="text-3xl font-bold mb-2">Which team is yours?</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Select your team so the app can highlight your roster, track your performance, and personalize every analysis to you.
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {teamsForClaimQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2 mb-8">
              {teams.map(t => (
                <button
                  key={t.teamId}
                  onClick={() => setSelectedTeamId(t.teamId)}
                  className={`w-full text-left rounded-xl border p-4 transition-all duration-150 ${
                    selectedTeamId === t.teamId
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">{t.teamName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.owners}</div>
                    </div>
                    {selectedTeamId === t.teamId && (
                      <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              className="flex-1"
              size="lg"
              disabled={!selectedTeam || claimTeamMutation.isPending}
              onClick={() => {
                if (!selectedTeam) return;
                const memberId = selectedTeam.memberIds?.[0] ?? "";
                claimTeamMutation.mutate({
                  season: 2025,
                  espnTeamId: selectedTeam.teamId,
                  espnMemberId: memberId,
                  teamName: selectedTeam.teamName,
                  ownerDisplayName: selectedTeam.owners,
                });
              }}
            >
              {claimTeamMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <>This is my team <ChevronRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => navigate("/reveal")}
            >
              Skip for now
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4">
            You can change this later in Settings.
          </p>
        </div>
      </div>
    );
  }

  // ── Step: Success ──────────────────────────────────────────────────────────
  if (step === "success" && result) {
    const dna = result.dnaProfile as {
      leagueSummary?: string;
      teamProfiles?: Array<{
        ownerName: string;
        archetype: string;
        desperationScore: number;
        exploitabilityScore: number;
        keyTrait: string;
      }>;
    } | null;

    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-12">
          {/* Success header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-3xl font-bold mb-2">League DNA Generated</h2>
            <p className="text-muted-foreground">
              {result.leagueName} · {result.teamCount} teams · {result.scoringType}
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: "Teams Analyzed", value: result.teamCount },
              { label: "Matchups Processed", value: result.matchupCount },
              { label: "Transactions Mapped", value: result.transactionCount },
            ].map((stat) => (
              <Card key={stat.label} className="text-center">
                <CardContent className="pt-4 pb-4">
                  <div className="text-2xl font-bold text-primary">{stat.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* League summary */}
          {dna?.leagueSummary && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">League Intelligence Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{dna.leagueSummary}</p>
              </CardContent>
            </Card>
          )}

          {/* Team DNA profiles */}
          {dna?.teamProfiles && dna.teamProfiles.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Manager DNA Profiles</CardTitle>
                <CardDescription>Behavioral archetypes and exploitability scores</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dna.teamProfiles.map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{t.ownerName}</div>
                        <div className="text-xs text-muted-foreground">{t.keyTrait}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {t.archetype}
                        </Badge>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Exploit</div>
                          <div className={`text-sm font-bold ${
                            t.exploitabilityScore >= 70 ? "text-red-400" :
                            t.exploitabilityScore >= 40 ? "text-amber-400" :
                            "text-emerald-400"
                          }`}>
                            {t.exploitabilityScore}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-8">
            <Button className="flex-1" asChild>
              <a href="/weekly-intelligence">
                Open Weekly Intelligence Hub
                <ChevronRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setStep("choose_provider");
                setResult(null);
                setLeagueId("");
                setUsername("");
                setSelectedLeagueId("");
                setSleeperLeagues([]);
              }}
            >
              Connect Another League
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
