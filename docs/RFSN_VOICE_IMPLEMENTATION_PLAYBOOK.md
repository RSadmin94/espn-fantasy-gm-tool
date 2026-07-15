# RFSN Voice Implementation Playbook

Proven Sprint 8 voice path for Fantasy Football Rivals live-draft commentary.

This document describes the **final working system**, not a design proposal. Another engineer should be able to reproduce the same approach in a different application without rediscovering the capability-gate, autoplay, and truncation failures documented here.

**Proven preview deploy:** Railway deployment `e825242e-d564-491b-b833-47b19ea0a609` (SUCCESS) from voice-polish-only commit **`6cbb610`** on top of `afeb2df`.  
**Preview host:** `https://sprint-8-preview.fantasyfootballrivals.com`  
**Production must stay untouched** when activating or polishing voice on preview.

> **Health SHA caveat:** `GET /api/health` `gitSha` on CLI `railway up` deploys still reflects the GitHub-linked env (`afeb2df…`), not the uploaded worktree commit. Trust the Railway deployment record + behavioral verification for CLI uploads.

### Browser-test topology (closure)

| Question | Answer |
|----------|--------|
| Target for ear verification | Deployed Sprint 8 preview after **voice-polish-only** redeploy |
| Deploy commit | `6cbb6107632cf2da982e36ae3a5f37d8b88c894a` |
| Railway deploy id | `e825242e-d564-491b-b833-47b19ea0a609` |
| Topology | Playwright + metrics against **remote preview** (Broadcast pace); favor complete speech over Turbo |
| Local Vitest alone | Not sufficient for ear verification |

> Post-deploy `scripts/runVoicePolishDeployVerify.mts` (Broadcast): long clips finished near duration (≥13s observed), picks advanced while speech continued without truncation, booth stayed up through natural finish, Stop/Replay OK, written `QB|RB|WR|…` preserved, personas Sofia/Coach/Roxanne observed.

---

## 1. Executive summary

### What was built

Optional **spoken broadcast** for RFSN Live Draft War Room:

1. Written analyst commentary is generated for locked picks (booth cards).
2. When voice is capability-enabled, those same lines are synthesized to WAV via **Kokoro TTS**.
3. Clips are stored server-side and delivered through an **authenticated** `/api/rfsn/audio/:audioId` route.
4. The browser polls live snapshot/audio status, shows **Enable Broadcast Audio**, and after a **user gesture** plays clips with `HTMLAudioElement`.
5. If TTS is off or fails, **written commentary continues** and the draft never blocks on audio.

### Where each part runs

| Layer | Responsibility |
|-------|----------------|
| **Browser** | Booth UI, unlock gesture, polling `getLiveSnapshot` / `audioStatus`, `HTMLAudioElement` playback, Replay/Stop, presentation timing |
| **Node server (app)** | Capability flags, pick notify → commentary frame, speech normalization, Kokoro HTTP client, clip cache/store, protected audio endpoint, tRPC access |
| **Kokoro TTS service** | Provider that accepts `{ voice, text }` and returns `audio/wav` (persona → provider voice mapped server-side / by Kokoro) |

### What originally prevented voice from appearing

Audio controls and playback client code were already deployed. Voice did **not** show because **`getAccess.ttsEnabled` was false**.

On preview, `RFSN_TTS_*` was already configured, but **`RFSN_VOICE_BETA` was absent**. Capability math requires all three:

```
ttsEnabled =
  isRfsnVoiceBeta()
  && isRfsnTtsEnabled()
  && isRfsnTtsConfigured();
```

### What configuration finally enabled it

Set **`RFSN_VOICE_BETA=true` on preview only**, with `RFSN_TTS_ENABLED=true`, valid `RFSN_TTS_SERVICE_URL`, and `RFSN_TTS_SERVICE_TOKEN`, then restart/redeploy the preview service. No frontend rebuild was required for controls or playback.

### What was required for real browser playback

1. Authenticated session with Live Broadcast access.
2. `ttsEnabled === true` from `getAccess`.
3. Real user gesture → `unlockAudio()` (browser autoplay policy).
4. Ready clip + fetch of WAV from protected endpoint.
5. `HTMLAudioElement.play()` that resolves **and** `currentTime` advances (not just HTTP 200).

---

## 2. Proven end-to-end flow

```
Draft pick locks (War Room)
  → notifyLockedPick (tRPC)
  → buildDraftMomentForLockedPick
  → scheduleLiveBroadcastForDraftMoment
  → commentary frame + persona cards (snapshot primary/secondary/ticker)
  → scheduleLiveFrameAudio
  → normalizeSpeechForTts(text)          // speech only — local working-tree polish; redeploy required for preview
  → synthesizeAnalystSpeech → Kokoro
  → storeVoiceAudioClip + merge audioStatus into live session
  → GET /api/rfsn/audio/:audioId?...     // Clerk + access gated
  → client polls getLiveSnapshot (audioStatus on payload)
  → user clicks Enable Broadcast Audio → unlockAudio()
  → playForCard → fetch WAV → new Audio(objectUrl).play()
  → 'ended' → booth advance / text min-dwell
```

### Key files and functions

| Step | File | Function / symbol |
|------|------|-------------------|
| Pick notify | `client/src/hooks/useRfsnLiveLockedPickNotify.ts` | notify on lock |
| Access / TTS flag | `server/rfsnBroadcastRouter.ts` | `getAccess` |
| Voice beta | `server/services/sofia/liveBroadcastFeature.ts` | `isRfsnVoiceBeta` |
| TTS config | `server/services/rfsn/rfsnTtsConfig.ts` | `isRfsnTtsEnabled`, `isRfsnTtsConfigured`, `getRfsnTtsTimeoutMs` |
| Frame → TTS | `server/services/rfsn/rfsnLiveTtsService.ts` | `scheduleLiveFrameAudio`, `synthesizeOne` |
| Speech normalize | `server/services/rfsn/rfsnSpeechNormalize.ts` | `normalizeSpeechForTts` |
| Kokoro client | `server/services/rfsn/kokoroTtsClient.ts` | `synthesizeAnalystSpeech` |
| Clip store | `server/services/rfsn/rfsnVoiceAudioCache.ts` | `initDraftAudioStatus`, `storeVoiceAudioClip` |
| Shared TTL store | `server/services/rfsn/rfsnAudioSharedStore.ts` | clip + status records |
| Protected delivery | `server/rfsnAudioHandler.ts` | `GET /api/rfsn/audio/:audioId` |
| War Room panel | `client/src/components/rfsn/RfsnBroadcastPanel.tsx` | `ttsAvailable` from `getAccess` |
| Playback | `client/src/hooks/useRfsnAudioPlayback.ts` | `unlockAudio`, `playForCard`, `replayCurrent`, `stopCurrent` |
| Booth timing | `client/src/hooks/useRfsnBoothController.ts` | dwell + defer handoff while playing |
| Display timing | `client/src/lib/rfsnBoothPresentation.ts` | `commentaryDisplayMs`, `RFSN_VOICE_BETA` (waveform only) |
| Controls UI | `client/src/components/rfsn/RfsnAudioControls.tsx` | Enable / Stop / Replay |

Persona assignment comes from the existing written broadcast frame (`buildBoothCommentarySequence` in `rfsnBoothPresentation.ts`). TTS uses each card’s `commentator` id as the logical voice key.

---

## 3. Runtime configuration

All of these are **runtime** env vars on the Node service (Railway). None are Vite/build-time for the audio capability gate.

| Variable | Purpose | Required? | Default | Failure behavior | Secret? |
|----------|---------|-----------|---------|------------------|---------|
| `RFSN_LIVE_BROADCAST_ENABLED` | Master switch for Live Broadcast feature + access | Required for live path | unset/`false` | No live access; notify rejected | No |
| `RFSN_VOICE_BETA` | Voice/TTS product beta; also flips off deterministic-only commentary path | Required for `ttsEnabled` | unset/`false` | `ttsEnabled=false`; written path uses deterministic provider | No |
| `RFSN_TTS_ENABLED` | Explicit TTS enable | Required for `ttsEnabled` | unset/`false` | `ttsEnabled=false`; no synthesis scheduled | No |
| `RFSN_TTS_SERVICE_URL` | Kokoro base URL (no trailing slash needed) | Required for configured TTS | unset | `isRfsnTtsConfigured()=false` → `ttsEnabled=false` | No (URL) |
| `RFSN_TTS_SERVICE_TOKEN` | Bearer token for Kokoro | Required for configured TTS | unset | Not configured → voice off | **Yes** |
| `RFSN_TTS_TIMEOUT_MS` | HTTP timeout for one synthesize call | Optional | **30000** | Upstream abort → `audio_timeout` → clip marked failed → text fallback | No |

**Never log or commit real token values.**

Proven preview pattern: leave production `RFSN_VOICE_BETA` unset; set only on the preview environment.

---

## 4. Capability-gating lesson (critical)

### Exact chain

```ts
// server/rfsnBroadcastRouter.ts — getAccess
ttsEnabled:
  isRfsnVoiceBeta() &&
  isRfsnTtsEnabled() &&
  isRfsnTtsConfigured();
```

```ts
isRfsnTtsConfigured() === Boolean(URL && TOKEN)
```

### What this means in practice

1. **Audio UI code was already deployed** in the SPA.
2. The missing “Enable Broadcast Audio” path was caused by **`ttsEnabled === false` on the server capability response**, not by missing React components.
3. **`client/src/lib/rfsnBoothPresentation.ts` → `RFSN_VOICE_BETA = false`** only gates the **cosmetic waveform** (`RfsnAnalystBoothCard`). It does **not** hide Enable Audio and does **not** control playback.
4. **A frontend rebuild was not required** to turn voice on for preview.
5. **Runtime config + preview service restart** were sufficient once TTS URL/token/enable were already present.

Reusable lesson: ship voice behind a **server capability bit** that the client reads once; do not force a client rebuild to flip environment product switches.

---

## 5. Browser autoplay lesson

### Why a user gesture is required

Browsers block audible autoplay without a prior user activation. Calling `play()` without unlock typically rejects or starts muted.

### How unlock works (proven)

In `useRfsnAudioPlayback`:

- Pref preference: `localStorage` key `rfsn-live-audio-pref`.
- Gesture unlock: `sessionStorage` key `rfsn-live-audio-gesture`.
- `unlockAudio()` sets `userEnabled=true`, `unlocked=true`, persists both, then attempts playback for the active card.

UI: `RfsnAudioControls` shows **Enable Broadcast Audio** / **Tap to Enable Sound** until unlocked.

### WAV alone does not prove audible playback

| Layer | Proves |
|-------|--------|
| Clip generation | Kokoro returned bytes; stored as ready |
| Endpoint delivery | Authenticated GET returns `audio/wav` 200 |
| `play()` resolving | Promise resolved (may still be silent/zero duration in some harnesses) |
| Time advancing | `currentTime > 0` and not paused |
| Human ear | Engineer heard the clip |

Certification must not equate HTTP 200 with “userible.” Prefer `play()` + advancing `currentTime`, then human listen on preview.

### How playback was verified on Sprint 8 preview

1. Auth founder session.
2. Confirm `getAccess.ttsEnabled=true`.
3. Real click on Enable Broadcast Audio.
4. Lock picks → commentary → fetch `/api/rfsn/audio/...` 200.
5. Observe `HTMLAudioElement` play counters / `currentTime`.
6. Unauth audio requests return 401.

---

## 6. Playback lifecycle

### When audio starts

After: `ttsAvailable` from server, `userEnabled` + `unlocked`, active booth card, clip `status === "ready"`, and `evaluatePlaybackGate` returns `play`.

### What owns the active element

`useRfsnAudioPlayback` owns a **detached** `HTMLAudioElement` in a ref (and optional War Room session persistence via `rfsnWarRoomAudioSession.ts`). Do not rely on `document.querySelector("audio")`.

### Surviving rerenders

Poll/re-render with the same pick identity does **not** replay (idempotent gate: `playbackStartedForCardId`).

### New draft pick while speaking (truncation fix)

**Root cause of cut-off (proven analysis of deployed + local code):**  
When `snapshotKey` changed (new commentary frame), `useRfsnBoothController` immediately called `onSnapshotChange()` → `stopCurrent()`, killing in-flight speech. Separately, the audio-status effect could `cleanupAudio()` when `pickId`/`pickNumber` identity advanced while a clip was still playing. Accelerated mock drafts made these races frequent. Separate caps (`RFSN_TTS_MAX_TEXT_LENGTH = 500`, `BOOTH_MAX_DISPLAY_MS = 12000`) truncated synthesis input / display scaling.

**Exact correction (deployed as `6cbb610`):**

1. **Defer frame apply** while booth is on-air **and** `audio.isPlaying()`; wait for natural end, then apply the pending snapshot (`useRfsnBoothController`).
2. **Dwell exit** already polls `isPlaying()` and must not exit mid-clip.
3. **Do not auto-`cleanupAudio` on `audioStatus` pick-identity change** while a clip is still playing (`useRfsnAudioPlayback` status effect).
4. **Remove TTS character truncation**; send full normalized text.
5. **Remove booth max display clamp**; scale with text length (min dwell retained).
6. Raise default synthesize timeout to **30s**; raise hung-playback watchdog to **120s** so live ESPN pace is not truncated by mock-draft assumptions.

Manual dismiss still stops immediately.

**Product rule:** Optimize for real ESPN draft timing. Prefer silence or deferred next commentary over truncated speech or overlapping voices. Turbo mocks may skip lines — that is acceptable.

**Ear verification after redeploy:** Broadcast-pace Playwright verify against preview passed cutoff / booth-wait / sequential-start checks (`speechNoCutoffPass`, `longestNaturalFinish`, `pickAdvancedWhilePlaying`, `finishedWhileBoothActive`).

### Booth card visibility vs playback

Cards stay active at least for text min-dwell; if audio is longer, advance waits on `isPlaying`. After `ended`, remaining min-dwell may still apply before exiting.

### Ended-event completion

Listeners attach **before** `play()`. Natural `ended` → cleanup → `onEnded` → booth exit path.

### Stop / Replay / Disable

- **Stop:** `stopCurrent()` pauses/cleans current element; preference can remain enabled.
- **Replay:** `replayCurrent()` uses last playable ready clip; requires unlock. Scope UI clicks to booth Replay — never match **"Replay same seed"** (draft reset control).
- **Disable voice beta / TTS:** no new synthesis; existing written path continues.

### Navigation cleanup

War Room persist key can keep unlock + last playable across remounts. Leaving the Live Draft tab should not reset the draft session.

### Preventing overlapping speech

Only one hook-owned element plays. Starting a new clip cleans up the previous. Booth sequencing waits for `ended` before advancing speakers. Deferred snapshot handoff prevents a faster pick from truncating the active clip.

---

## 7. Speech normalization

> **Deploy status:** Football abbreviations shipped with voice polish (`6cbb610`). Possessive / apostrophe normalization is a TTS-only follow-up on the same `normalizeSpeechForTts` path. Written booth text stays abbreviated and keeps its original apostrophes.

### Why written stays compact

Booth cards remain scannable with standard fantasy shorthand (`WR`, `QB`, …) and natural written possessives (`Rod's roster`).

### Why TTS needs a separate string

Kokoro would otherwise speak letter names (“double-you-are”) and often mangles `'s` / curly `’s` possessives (tokenization / G2P). Normalization expands positions and rewrites possessives **only** on the TTS path.

### Possessives / apostrophes (TTS only)

1. Fold curly apostrophes (`’` / related) → ASCII `'`.
2. Normalize bare plurals (`James'` → `James's`).
3. Rewrite non-contraction possessives to natural of-forms (`Rod's roster` → `the roster of Rod`).
4. Preserve contractions (`don't`, `can't`, `it's`, `they're`, …).
5. Protect `\bS\b` → `safety` from matching the `s` inside `it's` / `he's`.

### Mapping (`normalizeSpeechForTts`)

Longer tokens first, all word-boundary protected (`\b`):

| Abbreviation | Spoken |
|--------------|--------|
| D/ST, DST, DEF | defense |
| QB | quarterback |
| RB | running back |
| WR | wide receiver |
| TE | tight end |
| DL | defensive lineman |
| DE | defensive end |
| DT | defensive tackle |
| LB | linebacker |
| CB | cornerback |
| FS | free safety |
| SS | strong safety |
| K | kicker |
| S | safety |

### Ordering & word boundaries

Multi-letter / slash forms run before single-letter `S` / `K` to avoid partial collisions. `\b` prevents corrupting words like `This` / `class`.

### Tests

`server/services/rfsn/rfsnSpeechNormalize.test.ts` — expansions + false-negative protections.

### Where to add future sports terms

Append to `SPEECH_EXPANSIONS` in `rfsnSpeechNormalize.ts` (longer patterns first). Never mutate display/commentary generation for speech-only terms.

---

## 8. Persona voice mapping

| Persona | Logical voice (app) | Kokoro voice (provider) |
|---------|---------------------|-------------------------|
| Sofia | `sofia` | `af_heart` |
| Coach | `coach` | `am_michael` |
| Roxanne | `roxanne` | `af_bella` |

- Logical ids live in presentation (`RfsnCommentatorId`) and travel through clip metadata / query identity.
- App sends logical `voice` to Kokoro (`synthesizeAnalystSpeech`); provider resolves to concrete Kokoro voices.
- To replace the provider: keep persona ids stable; swap only the HTTP client / provider map. Booth UI and commentary assignment stay provider-neutral.

### Roxanne presence (selective)

Roxanne is rivalry / entertainment — **not** the default value analyst.

| Gate | Behavior |
|------|----------|
| Live rivalry overlay | `loadLiveRivalryOverlay(userId, leagueId)` maps real rivalryService pairs onto draft `PID_*` owner keys; never fabricates rivals |
| `roxanneEligible` | Rivalry receipt / drama evidence, or major/historic REACH/STEAL |
| Ordinary notable steal / slight reach | Sofia/Coach only |
| `major_reach` | Lead Sofia; optional Coach + Roxanne (`sofia`, `coach`, `roxanne`) |
| `rivalry_receipt` | Lead Roxanne when rivalry receipt is available |

Without grounded rivalry data, shadow Alice rivals remain for offline fixtures only; production notify passes `userId` so real rivals replace the fixture set when available.

---

## 9. Failure and fallback behavior

| Condition | Behavior |
|-----------|----------|
| Voice Beta off | `ttsEnabled=false`; Enable Audio not armed via capability; deterministic written provider preferred |
| TTS disabled | Same capability fail-closed |
| URL/token missing | Not configured → voice off |
| Kokoro unhealthy / synthesis error | Clip `failed`; booth text dwell continues; draft clock unrelated and non-blocking |
| Synthesis timeout | Telemetry `audio_timeout`; mark failed; text path |
| Clip expire / stale epoch | Discard store; no play / fallback |
| Browser `play()` reject | Fallback path / unlock again |
| Commentary without audio | Written booth operates normally |
| LLM provider failure | Written path already tolerates deterministic / silent frames; voice must not block pick notify |

**Invariant:** draft progression and written broadcast never wait on TTS success.

---

## 10. Performance and cost controls

| Control | Where | Role |
|---------|-------|------|
| Synthesize timeout (default 30s) | `getRfsnTtsTimeoutMs` | Safety against hung upstream — **not** a playback cutter |
| Concurrent TTS (`MAX_CONCURRENT = 3`) | `rfsnLiveTtsService` | Cost/load — queues excess work |
| Mem-cache 10 minutes keyed by voice+text | `memCache` in TTS service | Avoid duplicate synthesis |
| Clip TTL 30 minutes | `rfsnVoiceAudioCache` | Storage hygiene |
| Editorial silence / routine picks | Draft moments | Avoid unnecessary synthesis when no booth cards |
| Draft broadcast hold cap (`MAX_BROADCAST_HOLD_MS`) | Draft clock | Prevents draft freeze — **must not** mean “kill audio” |

**Never** use display timers, hold watchdogs, or character caps to stop an **active** `HTMLAudioElement` mid-speech. Playback ends on `ended`, explicit Stop/dismiss, or intentional new-clip start after the prior clip finished.

---

## 11. Preview activation procedure (proven)

### Voice beta gate (env only)

1. Confirm Railway project, environment **`sprint-8-preview`**, service **`espn-fantasy-gm-tool`** (not production).
2. Confirm baseline deployed git SHA (`GET /api/health` → `gitSha`) when using GitHub-linked deploys.
3. Set **`RFSN_VOICE_BETA=true` on preview only**.
4. Confirm `RFSN_TTS_ENABLED=true`, `RFSN_TTS_SERVICE_URL`, `RFSN_TTS_SERVICE_TOKEN`.
5. Restart or redeploy preview (env change takes effect without SPA rebuild).
6. Verify Kokoro health independently if available.
7. Authenticated `rfsnBroadcast.getAccess` → `ttsEnabled: true`.
8. Unlock via real Enable Broadcast Audio click.
9. Generate a live commentary event (**Broadcast pace** preferred over Turbo).
10. Verify WAV 200 + browser `play()` / time advance.
11. Confirm production env still lacks `RFSN_VOICE_BETA` and production deploy timestamp is unchanged.

### Voice-polish-only code deploy (CLI worktree — used for `6cbb610`)

1. Create a clean worktree from the preview baseline (`afeb2df`), not the dirty main Sprint 8 tree.
2. Cherry-pick / copy **only** cutoff + TTS-normalize files; exclude unrelated WIP.
3. Commit on an isolated branch; raise playback watchdog for live pacing if needed.
4. From that worktree: `railway up --service espn-fantasy-gm-tool --environment sprint-8-preview`.
5. Confirm Railway deployment SUCCESS; do **not** deploy production.
6. Prefer behavioral verification over `/api/health` SHA when using CLI upload (health may still show GitHub SHA).
7. Run `scripts/runVoicePolishDeployVerify.mts` against the preview host (Broadcast).

---

## 12. Verification matrix

| Check | How |
|-------|-----|
| Configuration | Env presence on preview only |
| Capability | `getAccess.ttsEnabled` |
| Control visibility | Enable Broadcast Audio when TTS capability true |
| Browser unlock | Gesture flips unlocked; button hides |
| Commentary generation | Booth card + snapshot |
| Persona assignment | Sofia/Coach/Roxanne cards |
| Clip readiness | `audioStatus.clips[].status === "ready"` |
| Protected endpoint | Auth 200 WAV; unauth 401 |
| Playback start | `play()` + `currentTime > 0` |
| Playback completion | `ended` / booth advance |
| Sequential clips | ≥2 starts without overlap |
| Long commentary | Clip longer than ~10s finishes |
| No overlap | Single playing element |
| Text fallback | Failed clip still shows text / draft continues |
| Production isolation | Prod `RFSN_VOICE_BETA` unset; SHA unchanged during preview-only activation |

Automated anchors:

- Against **deployed preview (post voice-polish)**: `scripts/runVoicePolishDeployVerify.mts` (Broadcast).
- Against **pre-polish voice beta preview**: `runLiveDraftCertSmoke.mts`, `runLiveDraftWarRoomBrowserCert.mts`, `runVoicePolishBrowserProbe.mts`.
- Against **voice-polish tree**: vitest files listed in the appendix (`rfsnSpeechNormalize`, booth presentation/terminal, kokoro client).

---

## 13. What did not work or caused confusion

1. **Assuming deployed source ⇒ UI voice visible** — missing server capability still hid behavior.
2. **Kokoro health ≠ app playback** — health proves provider uptime, not War Room unlock/play.
3. **Automation `play()` ≠ human-audible** — always separate those claims.
4. **Frontend rebuild chase** — actual blocker was `RFSN_VOICE_BETA` / `ttsEnabled`.
5. **Inline playback probes that hang** — prefer harnessed unlock + metrics.
6. **Overclaiming “audible completion” in cert language** — say what was measured.
7. **Timer-based truncation** — 12s booth max + snapshot `stopCurrent` + 500-char TTS slice cut speech; removed/deferred.
8. **Cert harness `/Replay/i` matched “Replay same seed”** — reset drafts mid-cert; always scope booth Replay.
9. **Brisk full-draft cert wall-clock** — use Turbo (or enough timeout) for 196-pick completion tests.

---

## 14. Reusable architecture pattern (provider-neutral)

Separate these concerns deliberately:

```
Written text  ──► Presentation / booth cards
      │
      ├── Spoken text transform (abbrev expand, locale)
      │         │
Persona id ─────┼──► Voice-provider map (sofia → af_heart, …)
                │
           Synthesis client
                │
           Audio storage + TTL
                │
           Secure authenticated delivery
                │
           Playback state machine (unlock, play, ended, replay, stop)
                │
           Presentation timing (min dwell; never cut active audio)
                │
           Capability flags (server) + optional cosmetic client flags
                │
           Failure fallback (text remains; app non-blocking)
```

RFSN is one proven instance of this pattern: fantasy draft booth + Kokoro WAV + Clerk-gated delivery + gesture unlock. Another sport/product should keep the same seams even if personas, provider, or storage differ.

---

## Appendix — local verification commands

```bash
pnpm exec vitest run \
  server/services/rfsn/rfsnSpeechNormalize.test.ts \
  server/services/rfsn/kokoroTtsClient.test.ts \
  server/rfsnBroadcastRouter.test.ts \
  client/src/lib/rfsnBoothPresentation.test.ts \
  client/src/hooks/useRfsnBoothController.activation.test.ts \
  client/src/hooks/rfsnAudioBoothLifecycle.test.ts \
  client/src/hooks/useRfsnAudioPlayback.lifecycle.test.ts \
  client/src/components/rfsn/RfsnAudioControls.production.test.ts

pnpm run check
pnpm run build
```

Browser (preview, Clerk via Railway env):

```bash
railway run --service espn-fantasy-gm-tool --environment sprint-8-preview -- \
  pnpm exec tsx scripts/runLiveDraftWarRoomBrowserCert.mts
```
