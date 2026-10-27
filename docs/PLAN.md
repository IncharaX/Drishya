# Drishya architecture and implementation plan

## Architecture

### Product flow

Topic → scope assessment → editable chapter outline → selected chapter → script and storyboard → localized narration → measured audio timeline → animated video → chapter/course export.

Each chapter teaches one bounded learning objective in a 30–90 second video. This limit applies to the finished chapter, not generation time. A merged course can be longer. Broad topics produce an outline first; they do not automatically launch an entire course render.

### Monorepo

```text
apps/
  web/                 Next.js frontend
  api/                 Node.js/Express API and Better Auth
  worker/              Durable generation and rendering jobs (later)
services/
  inference/           Local Python speech service and offline voice registry
packages/
  ui/                  Shared shadcn components and Medvai theme
  db/                  Drizzle schema, PostgreSQL client and migrations
  contracts/           Shared Zod request/response and scene schemas
  ai/                  Model/provider adapters (later)
  renderer/            Authored scene templates; audio-driven timeline later
  storage/             Local/S3 artifact storage adapters (later)
```

### Stack and boundaries

| Layer                        | Responsibility                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Next.js + shadcn             | Landing, credentials forms, studio, outline/script editor, player and library       |
| Shared UI package            | Medvai palette, typography, borders, shadows and reusable components                |
| Zustand                      | Transient editor/player state and local drafts                                      |
| Axios + React Query          | API requests, persisted server data, job progress and cache invalidation            |
| Better Auth                  | Email/password authentication, cookie sessions and password changes                 |
| Node.js/Express              | Authorization, input validation, orchestration and job endpoints                    |
| Drizzle + PostgreSQL         | Users, projects, chapters, lesson versions, localizations, jobs and export metadata |
| Ollama + local Qwen 8B       | Topic interpretation, scope assessment, outlines and structured lesson content      |
| Python inference service     | Offline speech and translation through interchangeable providers                    |
| Authored React/SVG templates | Deterministic title, diagram and code walkthrough scenes                            |
| Local browser + FFmpeg       | Frame rendering, audio composition, captions and MP4 encoding                       |
| Generation worker            | Retryable stages, duration fitting, cancellation and artifact reuse                 |
| Storage adapter              | WAVs, rendered assets, captions, manifests and MP4s                                 |

The browser calls same-origin `/api/*`; Next.js proxies these requests to the Node API. Better Auth runs in the API, with Drizzle-backed tables in the `drishya` PostgreSQL schema. Protected frontend routes validate the session on the server; protected API routes independently enforce authentication and resource ownership.

React Query owns server state, Zustand owns UI state, and Better Auth owns session state. Media files live in file/object storage; the database stores their metadata and references.

### Runtime profiles

| Component              | Local/offline profile                 | Hosted profile                                 |
| ---------------------- | ------------------------------------- | ---------------------------------------------- |
| Frontend               | Local Next.js server                  | Vercel                                         |
| API and workers        | Local Node processes                  | AWS API and separate worker services           |
| Database               | Local PostgreSQL                      | Neon PostgreSQL                                |
| Authentication         | Local Better Auth with local database | Better Auth with Neon                          |
| LLM                    | Local Ollama                          | Self-hosted inference on suitable AWS hardware |
| Speech and translation | Local downloaded models               | Self-hosted inference workers                  |
| Media                  | Local filesystem                      | S3                                             |
| Rendering              | Local browser and FFmpeg              | Dedicated render workers                       |

The current development profile uses Neon. Fully offline operation requires the local database profile as well as downloaded models, fonts, dependencies and rendering binaries. AWS-hosted inference is self-hosted but requires connectivity.

### Generation contracts and guardrails

- The planner returns validated JSON: interpreted subject, learner level, objective, prerequisites, scope decision, rationale and bounded chapter proposals.
- A lesson contains 3–6 scenes. Initial scene types are title, labelled-arrow diagram and code walkthrough.
- The LLM selects authored templates and supplies data. Never execute generated HTML, SVG markup, JavaScript, TSX or Python.
- Validate scene IDs, diagram references, code line references, text/layout budgets, output size and scene counts. Use bounded repair attempts and explicit failure states.
- Separate canonical lesson semantics from localized display text and narration. Preserve code identifiers, equations, units and names during translation.
- Estimate speech duration for planning, then synthesize audio and measure it. Actual audio determines each localized timeline.
- Include pauses and transitions in the duration budget. If a chapter exceeds 90 seconds, shorten and resynthesize within a retry limit, or propose splitting it. Do not truncate speech to meet the limit.
- Structural validation does not establish factual correctness. Use bundled trusted references for offline grounding, then add source uploads/retrieval and claim-to-source references.
- Preview and export share scene layouts and timeline logic. Export at 1280×720 with H.264 video, AAC audio and captions.

### Persistence and jobs

Core entities: auth tables, projects, chapters, lesson versions, localizations, generation jobs, artifacts and exports. Store MVP scene plans as versioned JSONB rather than normalizing every visual element into a table.

Generation returns a job ID immediately. Persist stage transitions and outputs:

`queued → planning → localizing → synthesizing → fitting → rendering → complete`

Jobs also support failure and cancellation. Retries resume from valid persisted artifacts. Local execution initially limits heavy jobs to one at a time; durable queueing and independently scalable workers follow later.

Cache keys include content, language/script, provider, model revision, voice, speed/style, normalization version and all effective generation settings. Editing a scene invalidates affected downstream artifacts without regenerating unchanged chapters.

Each chapter export records its lesson version, language, model/voice revisions, measured duration, output profile and asset manifest. Course exports reference an ordered list of chapter versions.

## Phased implementation plan

### Phase 0 — Application foundation

- Set up the pnpm/Turborepo monorepo, Next.js frontend and Express backend.
- Configure shared shadcn components with Medvai's design tokens and locally bundled fonts.
- Configure Neon, Drizzle schema/migrations and environment files.
- Integrate Better Auth credentials, sign-up/sign-in/sign-out, password changes and protected routes.
- Add the landing page, starter studio, per-user local drafts and API health endpoint.

**Deliverable:** A runnable authenticated application shell. This foundation is implemented; lesson generation starts in Phase 1.

### Phase 1 — Topic scoping and chapter planning

- Connect the Node backend to the user's installed Ollama/Qwen 8B model through a provider adapter. Configure the exact installed model tag through the environment.
- Add topic, learner level, language and target-duration inputs.
- Detect ambiguous subjects and request clarification when necessary.
- Decide whether the topic supports one bounded lesson or needs a chapter outline. Distinguish a short overview from teaching an entire subject.
- Return schema-validated JSON with objectives, prerequisites, scope rationale and a bounded chapter list.
- Add editable chapter titles/objectives, ordering and chapter selection.
- Persist projects and chapter outlines in PostgreSQL, with ownership checks.
- Show progress and actionable model/validation failures. Bound repair attempts and chapter counts.

**Deliverable:** “Python” produces an editable outline; a narrow question produces one focused chapter. A selected chapter is ready for scripting.

**Implementation status:** Implemented. The provider is configured for local `qwen3:8b`; projects, ordered chapters and selection persist through Drizzle. Planning runs one request at a time in the API process, with persisted progress and explicit retry after interruption. Testing is handled by the user.

### Phase 2 — Script and visual storyboard

- Define shared discriminated scene schemas for title, diagram and code walkthrough templates.
- Generate 3–6 scenes for the selected chapter, including narration and visual data.
- Add script/storyboard editing and versioned persistence.
- Validate visual references, text budgets, instructional scope and scene consistency.
- Introduce bundled reference material for supported demonstration domains and preserve source references.
- Build authored scene components and a static/interactive storyboard preview.

**Deliverable:** A selected chapter becomes an editable, valid visual lesson plan without executing model-generated code.

**Implementation status:** Implemented. Selected chapters can generate 3–6 narrated scene drafts, with title, diagram and code templates in a shared renderer. Storyboards have append-only versions, editable narration/visual data, a static scene preview, bundled reference notes and stale-input checks. Canonical content is English; localization and audio follow in Phase 3. Testing is handled by the user.

### Phase 3 — Offline speech and localization

- Add a local Python speech service and provider registry.
- Reuse the existing AI4Bharat Indic Parler environment with one persistent MPS model for English, Hindi, Kannada and Telugu.
- Download and package required weights, tokenizers, phonemizers and voice assets.
- Generate per-scene WAV files and cache them with complete generation settings.
- Localize narration and display text while protecting technical tokens.
- Bundle appropriate fonts and handle text shaping, wrapping and RTL where applicable.
- Start with English plus two Indian languages; keep the language registry extensible.

**Deliverable:** Offline narration and localized scene text for the three initial languages.

**Implementation status:** Reworked around the existing Python 3.11 AI4Bharat Indic Parler environment, persistent MPS inference, offline cache-only loading, and four languages (English, Hindi, Kannada, Telugu). The Node TTS boundary and saved per-scene WAV pipeline remain intact. Speaker profiles and generation configuration match the known-working test.py. Localized editing, matching fonts, provider-aware caching and authenticated playback are included. Four-language integration verification is available through `pnpm --dir apps/api test:speech`. Audio duration fitting and synchronized video remain Phase 4.

### Phase 4 — Audio timing and video export

- Probe synthesized audio and construct a language-specific scene timeline.
- Add bounded duration repair: shorten/resynthesize oversized scenes or split the chapter.
- Synchronize scene transitions, highlights, captions and narration.
- Implement player controls: play, pause, next scene and replay.
- Render authored templates through a controlled local browser and encode with FFmpeg.
- Export 720p H.264/AAC MP4 and captions using a standardized media profile.
- Reuse the same layout/timing logic for browser preview and export.

**Deliverable:** A selected chapter generates a playable, downloadable 30–90 second narrated video.

### Phase 5 — Durable generation and lesson library

- Move long-running work into a separate worker with persistent job state.
- Add visible stage progress, cancellation, bounded retries and restart recovery.
- Cache stage outputs and regenerate only affected artifacts after edits.
- Add project/chapter history, saved lesson versions, language variants and downloads.
- Provide honest failure states and a clearly labelled built-in example fallback.
- Complete the local PostgreSQL/auth profile and package dependencies for disconnected use.

**Deliverable:** Reliable generation that resumes after failure and a library of versioned lessons.

### Phase 6 — Course generation and chapter merging

- Add editable chapter dependencies and bounded batch generation.
- Allow chapter-level regeneration without replacing the rest of the course.
- Add chapter selection/reordering for course exports.
- Normalize resolution, frame rate, codecs, pixel format, sample rate and channel layout before merging when necessary.
- Combine audio/video, offset caption timestamps and preserve chapter indices.
- Store a course manifest referencing the exact ordered chapter versions.

**Deliverable:** Independently generated chapters can be assembled into a longer downloadable course.

### Phase 7 — All 22 scheduled Indian languages

- Add IndicTrans2 or a suitable offline translation provider behind the localization interface.
- Maintain a capability matrix per language: translation, voice, pronunciation, script/font support, RTL, timing and license readiness.
- Add speech providers as needed rather than assuming one engine covers every language equally well.
- Support required script variants and language-specific pronunciation text separately from display text.
- Regenerate audio, timelines and exports per localization while sharing canonical lesson semantics.
- Require language quality review before advertising a language as supported.

**Deliverable:** Staged support for the 22 scheduled Indian languages plus English, with explicit capability status for each.

### Phase 8 — Hosted deployment and production operations

- Deploy the frontend to Vercel and API/workers to AWS.
- Use Neon for hosted PostgreSQL and S3 for artifacts.
- Separate API, inference and rendering workloads; select instance sizes from observed requirements.
- Configure production auth origins, HTTPS cookies and trusted reverse-proxy handling.
- Add durable distributed queueing, quotas, concurrency limits and fair scheduling.
- Add retention policies, controlled downloads, operational metrics and resource/cost visibility.
- Review model, voice, renderer and asset licenses for the intended hosted deployment.

**Deliverable:** A hosted application with recoverable jobs, controlled resource use and a retained local/offline runtime option.

## Implementation priorities

The product sequence is Phases 1–4 for the first generated lesson, then reliability, courses, language expansion and hosting. Establish offline voice feasibility and one short rendered example early, alongside planning work, so these dependencies do not surface at the end.

For the 24-hour hackathon, prioritize one complete offline path with three visual scene types, English plus two Indian languages, measured audio timing and MP4 export. Full-course batch generation, merging, all-22 coverage and hosted operations follow the core demo.

Implementation proceeds phase by phase with user approval. The user handles testing. Do not commit or push without explicit approval.
