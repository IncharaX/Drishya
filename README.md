# Drishya

A chat-first explanation video app. pnpm + Turborepo monorepo with Next.js, Node/Express, Better Auth, Neon/PostgreSQL through Drizzle, local Ollama/Indic Parler inference and Remotion rendering.

## Chat-first workspace

`/workspace` starts a chat. Confirm one preference card to automatically generate narration, animation and a downloadable video. Chats persist at `/workspace/chat/:id`; `/workspace/library` contains ready videos and chapter collections. Follow-up requests create saved revisions and reuse unchanged narration. Chapters require a combined duration exceeding 120 seconds and explicit approval. Selected fixed durations are rendered to the exact frame count.

Apply migration 0006 with `pnpm db:migrate` before starting. Existing Python/model setup is reused. See [the v2 architecture](docs/V2-ARCHITECTURE.md) for the current pipeline and boundaries. The original phase-by-phase studio documentation below describes preserved legacy routes; it no longer describes the workspace entry screen.

## Local development

Use Node.js 24+, pnpm 11.1.3 and the existing Python 3.11 Indic Parler environment for speech.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Set `DATABASE_URL` and a random `BETTER_AUTH_SECRET` of at least 32 characters in `apps/api/.env`. Set `BETTER_AUTH_URL=http://localhost:3000`. The supplied development connection and a generated secret are already configured locally. Environment files are gitignored; never put backend secrets in `NEXT_PUBLIC_*` variables.

For a fresh checkout, complete the [Python speech setup](services/inference/README.md) before `pnpm dev`, including matching inference secrets and pointing to the existing cached Indic Parler environment. This machine is already configured.

```sh
pnpm db:migrate
pnpm dev
```

- Landing: http://localhost:3000
- Sign up / sign in: `/sign-up`, `/sign-in`
- Protected studio / account: `/workspace`, `/account`
- API: http://localhost:4000/api/health

The web app proxies `/api/*` to the API using the server-only `API_URL` environment variable. Keep the frontend open as `localhost:3000` to match the configured auth origin.

## Workspace structure

```text
apps/
  web/           Next.js App Router, React Query, Axios, Zustand
  api/           Express, Better Auth, database connection and job endpoints
  worker/        Independent persistent generation worker
services/
  inference/     Persistent local Indic Parler speech service and WAV cache
packages/
  ui/            Shared shadcn/Radix components and Medvai theme
  db/            Drizzle schema, SQL migrations, PostgreSQL client
  contracts/     Shared Zod contracts
  ai/            Local Ollama planner provider
  renderer/      Shared authored SVG title, diagram and code scenes
```

## Authentication

Better Auth runs in `apps/api/src/auth.ts` using the Drizzle PostgreSQL adapter. Its raw request handler mounts before Express JSON parsing. The Next frontend uses `better-auth/react` through the same-origin rewrite; there is no second auth server in Next.

Email/password sign-up, sign-in, sign-out, seven-day database-backed sessions and authenticated password changes are configured. Passwords are hashed by Better Auth; sessions use HTTP-only, SameSite=Lax cookies, secure on HTTPS. Trusted origins and rate limiting are enabled. No social providers are configured. Email verification and email-based password recovery are not enabled because no mail service is configured.

The four auth tables live in the dedicated `drishya` PostgreSQL schema. Use `pnpm db:generate` after changing the schema, review the generated SQL, and then run `pnpm db:migrate`. Do not use a schema push in place of reviewed migrations.

Workspace routes validate the cookie against the API on the server. API routes must also validate the session; `/api/me` is an example. Zustand holds only local draft UI state, with a separate storage key per user. Better Auth owns session state; React Query owns API state.

References: [Better Auth Express](https://better-auth.com/docs/integrations/express), [Next.js](https://better-auth.com/docs/integrations/next), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [email/password](https://better-auth.com/docs/authentication/email-password).

## Commands

```sh
pnpm check           # Biome lint and formatting
pnpm check:fix       # Apply safe fixes
pnpm typecheck       # All workspace TypeScript checks
pnpm build           # Production API and web builds
pnpm start           # Start both production builds
pnpm db:check        # Read-only SELECT 1
pnpm db:generate     # Generate SQL migrations
pnpm db:migrate      # Apply reviewed SQL migrations
pnpm db:studio       # Local Drizzle Studio
pnpm test:auth       # Integration smoke with both local servers running
pnpm ui:add dialog   # Add shadcn components to the shared UI package
```

Run builds and route-type generation sequentially because both write Next's generated types. The auth smoke uses a uniquely named test account and removes it with its related rows on completion. It does not log passwords, hashes or cookies.

## Theme

The UI follows the local Medvai app: paper `#f4f1ea`, card `#fffdf8`, ink `#1a1a1a`, pink `#f07289`, green `#7ad97a`, yellow `#f6c945`, and purple `#a49ad8`. Instrument Serif, Inter and IBM Plex Mono are packaged locally with Fontsource. Top-level windows use 1.5px black borders and hard offset shadows; nested content uses soft borders. The single source of truth is `packages/ui/src/styles/globals.css`.

## Topic scoping and chapter planning

Phase 1 is implemented at `/workspace`. Choose a topic, learner level, language, target chapter duration and learning goal. Broad subjects produce editable chapter outlines; narrow questions produce a single lesson. Ambiguous topics ask for clarification before planning continues. Planning metadata is currently written in English; the language choice is persisted for later localization.

The configured local provider is `qwen3:8b`, matching the installed model. Open Ollama before using the planner. Backend configuration in `apps/api/.env`:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_TIMEOUT_MS=180000
```

The provider requests schema-constrained JSON, validates cross-field rules and allows one repair attempt. Each attempt has the configured timeout. No hosted AI fallback is used. Duration estimates are provisional; actual narration timing comes in a later phase.

Planning atomically saves a project and queues a job, then returns immediately. A separate worker processes one generation at a time; additional requests remain queued. The frontend polls for progress. The `project` and `chapter` tables store owned outlines, ordered chapters, prerequisites and one selected chapter. Outline saves use a revision check to avoid overwriting changes from another tab. API restarts do not interrupt the worker. Worker restarts recover uncompleted jobs through leased database records.

API routes (all require a session; writes require the configured frontend Origin):

| Method | Path                        | Purpose                                       |
| ------ | --------------------------- | --------------------------------------------- |
| GET    | `/api/projects`             | Most recent 40 owned projects                 |
| POST   | `/api/projects`             | Create a project and start planning           |
| GET    | `/api/projects/:id`         | Project status and ordered outline            |
| POST   | `/api/projects/:id/plan`    | Retry a failed plan or supply a clarification |
| PATCH  | `/api/projects/:id/outline` | Save chapter edits, ordering and selection    |

Apply `pnpm db:migrate` after pulling schema changes. Restart the API after changing its environment file. Architecture and the remaining phases are in [docs/PLAN.md](docs/PLAN.md). The user handles testing; no automated or browser tests were run for Phase 1.

## Script and storyboard studio

Phase 2 is available through **Open script & storyboard** after selecting and saving a chapter in the outline. The chapter studio generates 3–6 scenes with canonical English narration, editable visual data, and an interactive scene-by-scene static preview. This is a storyboard, not a rendered video or synthesized audio.

The shared scene contracts permit only title, labelled-arrow diagram, and code walkthrough templates. Scene IDs, graph endpoints, code line references, layout budgets and narration word budgets are validated. Generated code is escaped display text; nothing is executed. The renderer accepts a normalized progress input for future audio-driven composition.

Each generation or manual save creates a new version in `drishya.lesson_version`. Old ready versions survive failed regeneration. Earlier versions are read-only; the latest ready version can be edited if no new generation is active. A fingerprint of the chapter and settings marks stale storyboards read-only. Outline and storyboard generation share a single local model slot.

Curated reference paraphrases for Python control flow and the water cycle are bundled in `packages/ai/src/references.ts`. Generation does not fetch source URLs. Matching notes are passed to the model and preserved with the draft; scene reference IDs must resolve to that set. These notes are partial grounding, not factual verification. Other topics are labelled as ungrounded drafts requiring review. Source links open externally only when the user follows them.

| Method | Path                                                                     | Purpose                                 |
| ------ | ------------------------------------------------------------------------ | --------------------------------------- |
| GET    | `/api/projects/:id/chapters/:chapterId/storyboards`                      | Latest 30 version records               |
| POST   | `/api/projects/:id/chapters/:chapterId/storyboards`                      | Start a new generated version           |
| GET    | `/api/projects/:id/chapters/:chapterId/storyboards/:versionId`           | Get content, source notes and staleness |
| POST   | `/api/projects/:id/chapters/:chapterId/storyboards/:versionId/revisions` | Save an edited version                  |

All routes inherit project authentication and origin checks, and validate project/chapter ownership. Apply the new migration before restarting the API. No tests, builds, browser checks or sample generations were run for Phase 2, per the user's testing preference.

The storyboard provider enforces a per-scene word budget in its model-facing schema, then converts the result into normal narration strings. Saved objectives are attached by the application. Diagram relationships are generated separately with endpoints restricted to the actual node IDs; self-arrows are excluded by the schema. Validation failures include the specific rule and invalid endpoint rather than a generic suggestion to narrow the topic. The public scene/editor/audio contract is unchanged.

## Offline voiceover and localization

Phase 3 is available below a ready storyboard in **Voiceover & localization**. Choose English, Hindi, Kannada or Telugu, select an available local voice, and generate a take. Qwen translates narration and visual text for Hindi, Kannada and Telugu. Code, scene types/order/IDs, diagram connectivity, references and protected technical tokens are retained. Translation and pronunciation need human review.

All four languages use the existing AI4Bharat Indic Parler model on MPS: Thoma, Rohit, Suresh and Prakash respectively. One model remains loaded across requests. No ElevenLabs or hosted speech API is used. Bundled Devanagari, Kannada and Telugu fonts support localized text.

Each take belongs to an exact immutable storyboard version. Progress, localized content and per-scene audio metadata persist in `drishya.voiceover`. The studio supports audio playback, scene WAV download, localized title/narration/visual-text edits and regeneration as a new take. Unchanged audio is reused by a complete text/voice/settings cache; valid translations are reused for alternate voices/speeds and retries. Audio over the target duration is labelled rather than truncated.

Speech uses port 8001 and is included in `pnpm dev`. The launcher invokes `~/AI/indic-tts/.venv/bin/python` without changing the existing environment. All weights and tokenizers load from local cache with offline mode enforced. Follow [services/inference/README.md](services/inference/README.md) for configuration and the service contract.

Voiceover routes are nested under `/api/projects/:id/chapters/:chapterId/storyboards/:versionId/voiceovers`: GET lists the latest 20 takes; POST creates a take; GET `/:takeId` reads a take; POST `/:takeId/revisions` saves corrected localized text and regenerates speech; GET `/:takeId/audio/:sceneId` serves authorized WAVs. GET `/api/projects/speech/voices` reports local provider availability.

Run `pnpm --dir apps/api test:speech` for four-language speech verification through the Node adapter, including WAV validation, one retained MPS model load and preservation of the original working setup. Translation quality still needs human review. Completely offline operation still needs local PostgreSQL instead of Neon.

## Chapter player and video export

Phase 4 is available inside **Voiceover & localization** after selecting a ready take. Use **Bring it together** to play/pause, seek, replay or jump to a scene. Preview combines the localized storyboard with measured audio, progressive highlights, transitions and estimated narration captions.

Choose **Export MP4** for a locally rendered H.264/AAC 1280×720 video at 24 fps, stereo 48 kHz audio and browser-friendly fast-start metadata. Download the MP4 and separate UTF-8 VTT/SRT captions from the saved export. Caption timing is proportional to narration chunks; it is not word-level forced alignment. Captions are also drawn into the video for predictable Indic-script rendering.

FFprobe measures the WAV files again before export. Scene boundaries include a 250 ms lead-in and at least 417 ms of tail time, quantized to whole output frames. Short chapters receive reading pauses to reach 30 seconds. Narration is never truncated or accelerated. If narration plus transitions exceeds the chapter target, **Shorten narration to fit** creates a new take using Qwen and the existing local TTS service. It makes at most two shortening/synthesis attempts, preserves scene structure, code and visual text, and asks for a smaller chapter objective if it still cannot fit. Review the wording and pronunciation of shortened takes before exporting.

The renderer launches an isolated headless instance of installed Google Chrome through Playwright Core. It captures only authored templates from the shared `VideoFrame` component, with fonts embedded from local packages and network requests blocked. No generated HTML or code executes. FFmpeg encodes the captured frames and mixes the measured WAVs. No additional TTS packages, model downloads or changes to the working Python environment are required.

Required local tools: `ffmpeg`, `ffprobe`, and Google Chrome. Override `FFMPEG_PATH`, `FFPROBE_PATH` or `CHROME_PATH` in `apps/api/.env` if needed. The defaults work with tools on PATH and the installed Chrome channel. These tools are already present on this Mac.

Export routes live under `/api/projects/:id/chapters/:chapterId/storyboards/:versionId/voiceovers/:takeId/exports`: GET lists the latest ten exports; POST starts an export; GET `/:exportId/video.mp4`, `captions.vtt`, `captions.srt` or `manifest.json` serves an owned, ready artifact. `?download=1` requests an attachment. Every route uses the existing session, origin and nested ownership checks. Artifacts live under `data/video/<exportId>` and metadata lives in `drishya.video_export` (migration 0004).

Video renders run in the separate worker alongside the durable generation queue. Progress and failures are saved; cancellation, bounded retries and lease recovery are implemented. Automatic cleanup of abandoned artifacts is deferred. Exports keep the exact selected storyboard and narration version; later edits do not rewrite old video files.

Validation for this phase: TypeScript checks, API production compilation and local API startup. After fixing a missing React runtime import in the server renderer, the previously failed Kannada take was exported successfully: 46.7 seconds, 720p H.264 at 24 fps with 48 kHz stereo AAC, plus VTT/SRT captions. The renderer validates the output media profile with FFprobe. Export failures now retain the actual error and log its stack instead of suggesting disk space for every unexpected failure. Listening and broader UI testing remain with the user.

Implementation references: [Playwright browser launching](https://playwright.dev/docs/api/class-browsertype), [FFmpeg encoding options](https://ffmpeg.org/ffmpeg.html), [FFmpeg concat format](https://ffmpeg.org/ffmpeg-formats.html).

## Durable generation, history and offline profile

`pnpm dev` now launches four independent processes: Next.js, the API, the generation worker and the existing Indic Parler service. API handlers atomically save the target record and a `drishya.generation_job` row. They do not run model inference or rendering in the API process. Apply migration 0005 before startup; its one-time adoption preserves interrupted legacy work and leaves completed lessons intact.

The worker claims one heavy job at a time using a PostgreSQL transaction-level advisory lock and row locking. This works with Neon's transaction pooler. Jobs have a random lease token, a 90-second lease and a five-second heartbeat. SQL fencing prevents a stale or cancelled worker from updating lesson records. A hard-killed worker's job can be reclaimed after the lease expires. Graceful worker shutdown schedules remaining work for retry; restarting only the API leaves running jobs alone.

Transient model/storage failures retry with bounded backoff, at most three worker attempts per job. Invalid model output or bad inputs fail visibly instead of retrying forever. The activity panel supports cancellation and retrying a failed/cancelled job while attempts remain. Cancelling does not delete saved versions. An already dispatched Python synthesis may finish and warm the local WAV cache; subsequent stages and worker writes stop. Shortening attempt state is persisted and retains its separate two-attempt limit across worker restarts.

Recovery reuses saved localization, content-addressed WAVs and validated completed video files. Unchanged translation fields can be reused after visual/text edits when the learning objective and code remain compatible. Edited localized takes synthesize only changed narration through the existing text/voice/settings-aware cache. Interrupted in-progress video frames are rendered again in a unique attempt directory; completed MP4s are reused after profile verification. User-authored versions remain immutable. Stage recovery is not a promise of resuming a model token stream or a partially encoded frame.

Open **Lesson library** at `/workspace/library` to browse saved chapters, storyboard versions, language takes and ready MP4/VTT/SRT downloads. The list is paginated; its search and language filter apply to the displayed page. Opening a saved version passes its exact storyboard/take IDs back to the studio. `/workspace/example` is an explicitly labelled built-in water-cycle demonstration with no generated voice or video; it never silently replaces a failure.

Job endpoints under `/api/projects/jobs` list the signed-in user's latest 50 jobs, optionally filtered by `projectId`. POST `/:jobId/cancel` requests cancellation; POST `/:jobId/retry` resumes an eligible saved job without resetting its attempt budget. The library endpoint is `/api/projects/library?offset=0`. These routes inherit session/origin checks, and cancellation/retry independently check ownership. Private queue payloads and lease tokens are excluded from API responses.

### Fully local PostgreSQL and credentials auth

The offline profile uses installed PostgreSQL tools, the existing Ollama/Indic Parler caches and installed Chrome/FFmpeg. It does not install or modify the Python environment. Its dedicated cluster is under `data/postgres`, listens on `127.0.0.1:55432`, and keeps generated credentials in gitignored `.env.offline` with mode 0600. Offline auth uses a separate secret/cookie prefix and separate accounts; Neon accounts and data are not copied. Offline media lives under `data/offline`.

```sh
pnpm offline:check                       # Local tools, workspace, cached model and Ollama checks
pnpm offline:prepare                     # Create/reuse dedicated local database and apply migrations
pnpm install --offline --frozen-lockfile  # Verify/reuse cached Node dependencies without network
# Stop the normal pnpm dev processes before switching profiles:
pnpm dev:offline                         # Web/API/worker/TTS with the local database
# Stop development processes before stopping the local database:
pnpm offline:stop
```

Preparation is complete on this Mac. The normal running app still uses Neon. To switch, stop the normal dev command, run `pnpm dev:offline`, and sign up for a local account. To return, stop offline development and run `pnpm dev`. Rerunning `offline:prepare` reuses the cluster and applies new migrations; it never resets an existing database. Keep the workspace dependencies and model caches on disk before disconnecting. The profile does not bundle model weights for another machine or make hosted Vercel access possible without a network.

Validation: type checking and separate API/worker production builds passed. A focused test against only the isolated local database verified credentials sign-up/session cookies, authenticated library/job routes, queued work surviving worker startup, expired-lease recovery, ownership, cancellation, idempotent completion and retry limits without model inference. `pnpm --dir apps/api test:jobs` reruns it. Offline dependency installation succeeded from cache. Broader interactive UI/model testing remains with the user.

References: [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html), [PostgreSQL advisory lock functions](https://www.postgresql.org/docs/17/functions-admin.html).

## Current scope

Implemented: repo/tooling, themed landing, credentials auth, protected studio, local topic scoping, editable outlines, scripts/storyboards, static previews, bundled references, local localization, offline scene voiceover, saved takes and WAV playback/download, audio-driven chapter playback, bounded narration fitting, captioned MP4 exports, durable jobs, cancellation/recovery, a lesson library and an offline database/auth profile.

Next: course generation and chapter merging. The default profile uses Neon and needs connectivity; the prepared offline profile uses local PostgreSQL, local credentials auth and cached models.

This phase does not create Git commits or push changes.
