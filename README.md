# Drishya

A visual teaching studio. pnpm + Turborepo monorepo with a Next.js frontend, Node/Express API, shadcn UI, Better Auth credentials, and Neon/PostgreSQL through Drizzle.

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
  api/           Express, Better Auth, database connection
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

Planning returns a persisted project immediately and runs in the API process, with one local generation at a time. The frontend polls for progress. Concurrent planning requests receive an actionable busy response. The `project` and `chapter` tables store owned outlines, ordered chapters, prerequisites and one selected chapter. Outline saves use a revision check to avoid overwriting changes from another tab. An API restart marks interrupted work as retryable; a durable worker queue is deferred to Phase 5.

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

## Offline voiceover and localization

Phase 3 is available below a ready storyboard in **Voiceover & localization**. Choose English, Hindi, Kannada or Telugu, select an available local voice, and generate a take. Qwen translates narration and visual text for Hindi, Kannada and Telugu. Code, scene types/order/IDs, diagram connectivity, references and protected technical tokens are retained. Translation and pronunciation need human review.

All four languages use the existing AI4Bharat Indic Parler model on MPS: Thoma, Rohit, Suresh and Prakash respectively. One model remains loaded across requests. No ElevenLabs or hosted speech API is used. Bundled Devanagari, Kannada and Telugu fonts support localized text.

Each take belongs to an exact immutable storyboard version. Progress, localized content and per-scene audio metadata persist in `drishya.voiceover`. The studio supports audio playback, scene WAV download, localized title/narration/visual-text edits and regeneration as a new take. Unchanged audio is reused by a complete text/voice/settings cache; valid translations are reused for alternate voices/speeds and retries. Audio over the target duration is labelled rather than truncated.

Speech uses port 8001 and is included in `pnpm dev`. The launcher invokes `~/AI/indic-tts/.venv/bin/python` without changing the existing environment. All weights and tokenizers load from local cache with offline mode enforced. Follow [services/inference/README.md](services/inference/README.md) for configuration and the service contract.

Voiceover routes are nested under `/api/projects/:id/chapters/:chapterId/storyboards/:versionId/voiceovers`: GET lists the latest 20 takes; POST creates a take; GET `/:takeId` reads a take; POST `/:takeId/revisions` saves corrected localized text and regenerates speech; GET `/:takeId/audio/:sceneId` serves authorized WAVs. GET `/api/projects/speech/voices` reports local provider availability.

Run `pnpm --dir apps/api test:speech` for four-language speech verification through the Node adapter, including WAV validation, one retained MPS model load and preservation of the original working setup. Translation quality still needs human review. Completely offline operation still needs local PostgreSQL instead of Neon.

## Current scope

Implemented: repo/tooling, themed landing, credentials auth, protected studio, local topic scoping, editable outlines, scripts/storyboards, static previews, bundled references, local localization, offline scene voiceover, saved takes and WAV playback/download.

Not yet implemented: audio-driven timelines, duration fitting, video rendering or merging. The landing example is hand-built; the chapter studio uses locally generated drafts. Neon auth and persistence need a network connection; the later offline runtime needs local PostgreSQL and local auth configuration.

No Git commits or remote repository have been created.
