# Drishya: chat-first video creation

## Product flow

One persisted chat represents one explanation. The user describes a topic, process or sequence of events. A selection card gathers language, audience, coverage, duration and visual direction. Confirming the card starts one durable job: assess scope, write narration and visual beats, synthesize speech, measure timing, animate, encode and publish the result to the chat and library.

Single videos are the default. A broad topic alone does not require chapters. Only coverage that needs more than 120 seconds produces an approval card; approving it queues every chapter. Actual measured speech is checked again before rendering. Speech is never truncated, and short videos are not padded to 30 seconds.

The library presents ready videos and chapter collections. Standalone videos play immediately. Collections open a chapter selector. Chats, answers, settings, job checkpoints and versions are stored in PostgreSQL. A follow-up creates an immutable revision. Timestamp edits identify the source video and relevant beat; unchanged speech and compatible rendered segments are reused.

## Architecture

```text
Next.js chat / selection cards / library / Remotion Player
                       |
             Same-origin authenticated API
                       |
      Express + Better Auth + Drizzle/PostgreSQL
                       |
             Durable leased generation job
                       |
          Local Ollama director: validated JSON
                       |
       Persistent local Indic Parler TTS service
                       |
           Measured WAVs + semantic motion plan
                       |
       Remotion / React / SVG / Three.js / FFmpeg
                       |
           MP4 + poster + VTT/SRT + manifest
```

`packages/contracts` defines requests, revisions and motion plans. `packages/ai` produces and repairs structured plans. `packages/motion` owns shared preview/export compositions. `apps/api/src/explanations` owns orchestration, ownership checks, media delivery and caching. The independent worker executes jobs; the API remains responsive during inference.

New tables are `conversation`, `conversation_message` and `explanation_revision`; migration 0006 adds them without replacing legacy records. Child revisions reference their collection. Every revision retains its source and generation settings. Database lease fencing prevents stale jobs from publishing changes after cancellation or recovery.

The director selects bounded visual primitives rather than executing model-written code. Visual families include orbital/spatial 3D, processes, cause/effect, comparisons, charts, concepts and code. Motion follows the measured narration timeline. Captions currently use approximate word-chunk timing within each measured beat, not forced alignment.

Narration uses the existing `~/AI/indic-tts/.venv` interpreter and cached model through the existing service boundary. Supported languages are English, Hindi, Kannada and Telugu. The model remains loaded between requests. On memory-constrained Macs the worker unloads Ollama before synthesis. Heavy generation and rendering run serially; frame rendering uses one concurrent task.

Media lives under `data/v2`: content-addressed segments, source-keyed bundles and immutable revision artifacts. Audio uses the existing WAV cache. Every media endpoint independently verifies session and ownership. Delivery supports byte ranges for immediate seeking. New export profile: H.264, 1920×1080, 30 fps, AAC stereo, with locally bundled fonts and procedural geometry.

## Implementation phases

1. Add persistent conversations, message ordering, revision history, ownership and idempotent actions while preserving existing projects.
2. Replace the workspace with the chat shell, preference/clarification cards, sidebar history and video-only library.
3. Orchestrate the complete pipeline as one resumable job; enforce estimated and measured 120-second chapter rules and generate approved collections automatically.
4. Introduce shared Remotion compositions, semantic animation, spatial scenes, captions and cached video exports.
5. Add follow-up intent classification, source/timestamp context, targeted speech/visual invalidation and immutable versions.
6. Verify real creation, authenticated playback/download, narration reuse after visual edits, collection lifecycle, responsive layout and recovery; document operational limits.

## Operational limits and later work

This is a constrained scene engine, not unrestricted cinematic video synthesis. Quality depends on the director's plan and supported visual primitives. General-purpose asset generation, uploaded-reference retrieval, music/SFX, forced-aligned subtitles, arbitrary editable 3D assets and chapter merging need separate work. Generated factual content still requires review.

Default development uses Neon and therefore needs database connectivity. For the local database profile rerun `pnpm offline:prepare` to apply current migrations, stop regular development, then use `pnpm dev:offline`. No model/environment reinstallation is required. Hosted deployment needs persistent worker/media storage and suitable inference hardware; Vercel alone cannot host this pipeline.

Remotion is pinned to 4.0.539 across preview and rendering. Check its license against the deployment organization before commercial rollout. No external artwork is required by the procedural reference scenes.

## Current validation

- A real browser-created English prompt completed through Ollama, the existing Indic Parler service and Remotion. Its valid MP4 was 1080p/30 fps with AAC audio. The short result stayed a single video.
- A background-colour follow-up submitted through the chat composer produced a separate ready revision with identical narration and audio cache keys. Authenticated byte-range delivery, guest rejection and automatic library inclusion passed.
- `pnpm --filter @drishya/api test:explanation:rules` checks the 120-second boundary, overview scoping, style-only edits, single-beat chapter groups and caption timing without inference.
- After `pnpm offline:prepare`, `pnpm --filter @drishya/api test:explanation:state` checks ownership, idempotency, chapter approval/recovery, cancellation/retry, partial collections, targeted chapter context and fallback to playable library versions against only the isolated local database. Planning/render completion in this state test is explicitly fixture data.
- Workspace TypeScript checking and the frontend/API/worker production build passed. Generated content, language pronunciation and bespoke subject-specific illustration quality still need human review.

The original Medvai theme remains the application design: cream/paper surfaces, Instrument Serif headings, Inter body text, IBM Plex Mono labels, pink actions, black borders and offset shadows. The landing page keeps the new conversation-to-video content and animated reference preview in that theme. New workspace routes use the same tokens.

The final Chrome UI review (`apps/api/scripts/review-studio.ts`) also passed with disposable, explicitly seeded media fixtures: desktop/mobile Medvai styling, sidebar navigation, immediate saved-video loading, chapter switching, persistence after reload and inferred Kannada/45-second preferences. This check does not represent a second live model generation. Screenshots are kept locally under `data/v2/ui-review`.


## October 27 refinement: history, exact timing and editing

The current single-video ceiling is 120 seconds. Chapter proposals must contain at least two parts and total strictly more than 120 seconds. Explicit total durations above the ceiling are distributed across bounded chapters. For fixed short durations, the writer fits a conversational explanation to the target; measured speech, bounded wording repairs, modest playback-rate adjustment (at most 1.18×), and allocated visual action time produce an exact frame count. Speech is not cut off. A fit that cannot stay clear asks for a timing choice instead of publishing the wrong duration.

Preference cards remain visible as immutable snapshots after submission. Pre-generation preferences autosave to the owned conversation. Questions, options and responses remain visible after resolution. Sidebar history is paginated and searched on the server. Edits persist a description of actual changes and keep prior revisions.

The edit contract supports bundled typefaces, 2D/3D direction, full per-beat visual replacements, narration changes and sound design. Mixed requests apply multiple changes. A selected moment can scope font/background/3D changes to the corresponding beat. Unsupported fonts prompt a choice of installed faces rather than pretending to apply one. Whole-collection visual edits retain each chapter's duration.

Directed scenes use semantic vector or real Three.js objects (people, documents, checks, coins, servers and other primitives), animated relationship paths and changing emphasis. The exported timeline uses the whole video's frame count, including when cached segments are rendered separately. Numeric chart values remain visible in dimensional mode.

A deterministic local sound module composes original mood-based background music and restrained action cues. It ducks beneath measured speech; narration is normalized during final mixing. No external soundtrack download, music API or TTS-environment change is required. Preview and export share the same soundtrack. Sound can be disabled or edited through follow-ups.

The application retains the Medvai theme. Current workspace dropdowns, checkboxes, sliders and tooltips use styled Radix/shadcn controls; hidden native form elements exist only for accessibility/autofill. Focus uses ink, not blue. Sidebar collapse is saved per user. Playback uses a custom player with seeking, mute and fullscreen controls. Generation estimates are explicitly approximate ranges based on available prior timings, with an initial fallback.

Generation-speed optimization is intentionally pending a separate approval. These functional changes do not promise a five-minute generation time.

The speed proposal is recorded separately in [GENERATION-SPEED-PLAN.md](GENERATION-SPEED-PLAN.md) and remains pending approval. Current generation estimates include queued jobs. A 40-second 1080p/30fps render with dimensional objects, a changed font, procedural sound and a continuous timeline passed media validation. Browser checks passed for custom controls, saved draft preferences, sidebar collapse, playback and collection persistence. The additional full model smoke was cancelled while queued so it would not hold up user chapter jobs; it is not claimed as a completed end-to-end test for this refinement.

## Export audio repair and concrete array demonstrations

The earlier AAC-presence check missed broken audio timestamps: recent exports contained only 9–22 ms of AAC despite healthy cached narration WAVs. The FFmpeg 9 normalization/filter path could truncate audio when normalization and mixing shared a filter graph. `explanations/audio.ts` now materializes normalized 48 kHz stereo PCM per beat, mixes those PCM sources into a verified narration track, encodes AAC independently, then stream-copies it with the rendered video. Each narration section, the voice-only mix and the final export are checked for audible signal; final audio duration must match the exact video timeline. Music cannot mask an empty narration source. Cached final exports must pass the same verification. Silent authored visual references explicitly opt out of the narration requirement; real application exports do not.

Four affected saved exports were repaired from their existing narration, preserving originals in per-revision backup directories. `scripts/check-export-audio.ts` verifies the actual repaired files and rejects the original truncated export. This is stronger evidence than the earlier codec-presence check.

The visual contract now includes indexed arrays with concrete items and build/read/update/iterate/type-comparison operations. The array renderer shows values, zero-based indexes, replacement and sequential traversal instead of decorative atom/package symbols. Its explanatory labels support English, Hindi, Kannada and Telugu. The affected 25-second array video was rebuilt with its existing narration and inspected through frames extracted from the final MP4. Diagram relationships are deduplicated and their routes anchor in their actual direction, including reverse and vertical edges. Solar validation permits nine objects (Sun plus eight planets), and child generation preserves approved chapter titles.

These changes address the reported array and audio defects. They do not establish bespoke cinematic illustration quality for every possible topic: the director still selects from a bounded set of supported visual primitives. Broader visual quality needs review of actual generated examples, not just schema validity.


## October 28: approved speed rollout and semantic identity

The approved speed targets and implementation order are in [GENERATION-SPEED-PLAN.md](GENERATION-SPEED-PLAN.md); measured outcomes and unmet targets are in [PERFORMANCE-REPORT.md](PERFORMANCE-REPORT.md). Short explicit overviews combine ambiguity screening and visual/script planning. Per-call telemetry distinguishes speech inference, loading, cache hits, fitting rewrites and queue/worker lifecycle. New exports default to 720p with an explicit 1080p preference. The narrated Remotion Player remains usable during MP4 rendering. A separately prepared matching Chromium speeds 2D capture; known-working Chrome remains the 3D fallback.

Literal scene identity now overrides inappropriate model-selected icons: plants, roots, soil, leaves, sunlight, water and food have matching render primitives. Unsupported subjects stay labelled rather than becoming a generic lightbulb. Converging-input scenes use dedicated lanes outside the node labels. Fresh authored regression frames were rendered and visually inspected; the saved photosynthesis video was left unchanged.
