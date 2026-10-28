# Uploaded sources, learning, sharing and duplication

## User flows

- New chat accepts up to three text-based PDF, DOCX, TXT, Markdown or CSV files. Each file is at most 10 MB; extracted source text is limited to 12,000 characters across a conversation. Scanned PDFs need OCR elsewhere. Unsupported, encrypted, empty and oversized files show errors instead of silently omitting content.
- Preferences infer language, narrator gender, duration, audience and supported visual/output choices from the prompt. The existing preference card remains editable before generation.
- Narration uses the original male Indic Parler speaker for English, Hindi, Kannada or Telugu. Female selection and the later Whisper verification experiment have been disabled; the existing Python environment is unchanged.
- Ready library videos expose Q&A/quiz generation, sharing, duplication and participant results. Shared links can include either, both or neither learning section. Links can be revoked.
- A guest enters a name, completes a multiple-choice quiz, submits it, and sees a scored review. Reloading the same browser resumes its saved attempt. Owners see participant names, scores, completion state and timestamps, with pagination.
- Duplicate creates a separate persisted chat and video in the chosen language with the original male voice. It preserves the source visual plan; translation and new narration run only where required. Chapter collections retain their chapter structure.
- Ready videos request a one-to-five-star rating and optional message. Feedback is saved per owner/video and can be edited. This supplies future admin reporting without adding an admin interface.

## Architecture

`POST /api/projects/uploads` authenticates, extracts and saves private source text. Conversation creation atomically binds owned, unused source IDs. Persisted messages retain attachment names. The generation pipeline reads bound sources as reference data, with explicit untrusted-source delimiters; existing video planning, speech and rendering services remain the boundary.

Source documents are passed separately to assessment and script writing. Saving/reloading metadata cannot discard them, including with Automatic duration. The application splits source text into exact passages; the writer selects constrained passage IDs and the application resolves them to stored quotes. The model never has to reproduce long quotations or document UUIDs. English narration unrelated to its cited passage is still rejected before synthesis. This is a provenance guard, not a general semantic fact checker.

Workflow action scenes support typing, transfer, transformation, reveal and comparison. If the model omits or supplies invalid actions, the application compiles the existing artifact graph into operations, retaining every connection and branch label. Narration-relative timings drive deterministic Remotion animation; these approximate spoken-word positions rather than forced phoneme alignment. Only the active artifacts and nearby context appear in the rail, and moving objects stay outside text panels. Existing saved videos are unchanged. Run `node --env-file=.env --import tsx scripts/check-document-grounding.ts` from `apps/api` for source/animation regression checks; `RENDER_ACTIONS=1` also renders three synthetic stills without model calls or queued jobs.

`video_learning` stores validated Q&A and quiz content generated from the final narration by a durable `learning` job. Failed learning generation is retryable independently of video rendering.

`video_share` stores only a SHA-256 token hash plus immutable learning snapshots and visibility settings. Public `/api/shared/:token` returns only enabled sections and allowed video URLs. Media access is restricted to that shared revision or its direct chapters; revoked links stop serving media. Public pages do not require a Drishya account.

`quiz_attempt` freezes questions per attempt. Questions/options are sent after name entry; correct indexes are withheld until submission. The server validates the attempt secret, grades answers and locks the row so repeated submission cannot replace a saved score. Owner results require ownership of the underlying video. Guest names are self-reported.

`video_feedback` has a unique user/revision key. `source_upload`, learning, shares, attempts and feedback use Drizzle migrations 0007–0008 and existing owner/cascade relationships. Original document binaries are not retained.

Duplication uses request IDs for idempotency and queues normal generation jobs. Translation sends only unique text fields in a fixed-length array; the application preserves geometry, IDs and connections, validates narration script/numbers and invalidates the old audio. Local TTS still uses `~/AI/indic-tts/.venv`; a single persistent model serves all eight voice profiles and inference remains offline.

## Validation

- `pnpm -r typecheck`
- From `apps/api`: `pnpm exec tsx --env-file=.env scripts/smoke-video-features.ts`; set `FEATURE_BROWSER=1` for Chrome verification of guest quizzes, reload persistence, owner results and prefilled preferences. Uses disposable accounts and small local fixtures.
- `pnpm exec tsx --env-file=.env scripts/check-female-voices.ts` verifies non-silent WAVs for all four female speakers against the running local speech service.
- `pnpm exec tsx --env-file=.env scripts/smoke-live-features.ts` exercises uploaded text through actual local planning, female narration and MP4 rendering, then learning generation and a Hindi/male duplicate. Failed diagnostic accounts are retained for investigation; successful disposable accounts are deleted.

Share URLs use the current app origin. Sharing with another machine requires a reachable deployed app/backend and its media; localhost links remain local to this computer.
