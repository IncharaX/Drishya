# Local speech service

Drishya → authenticated TTS service on localhost:8001 → AI4Bharat Indic Parler → PCM16 mono WAV → the existing audio/video pipeline.

## Existing environment

The launcher uses `~/AI/indic-tts/.venv/bin/python` (Python 3.11), configurable through `TTS_PYTHON`. It does not install packages, recreate the environment, or download weights. Do not run the legacy Piper downloader or requirements files for this integration.

`app/indic_parler.py` reuses model loading, both tokenizers, device selection, descriptions and generation arguments from `~/AI/indic-tts/test.py`. PyTorch uses MPS when available. The model loads lazily once per service process and stays loaded; a lock serializes inference across requests. Restart the service after provider changes. The HTTP server uses Python's standard library, requiring no additional packages in the working environment.

| Language | Code | Speaker |
| -------- | ---- | ------- |
| English  | en   | Thoma   |
| Hindi    | hi   | Rohit   |
| Kannada  | kn   | Suresh  |
| Telugu   | te   | Prakash |

These are the exact tested profiles from the working script. Each requests clear natural teaching speech with no background noise. Generation uses the script's natural pace; arbitrary playback-speed processing is not applied.

## Configuration and startup

Match `INFERENCE_SECRET` (at least 32 characters) between the API and this service. Set `DRISHYA_DATA_DIR=../../data` here and `MEDIA_ROOT=../../data` in the API so both resolve to the repository's data directory. The API uses `INFERENCE_URL=http://127.0.0.1:8001`.

Run `pnpm dev` from the repository root, or `pnpm --filter @drishya/inference dev` for speech alone. The launcher sets offline Hugging Face/Transformers flags and disables telemetry; model and tokenizer loads also use `local_files_only=True`. A missing cache is an explicit setup error, never an automatic download.

## API boundary

All routes require `Authorization: Bearer <INFERENCE_SECRET>`.

- `GET /voices`: four configured voices, model revision and availability.
- `GET /health`: process ID, interpreter, device and model-load count for diagnostics.
- `POST /synthesize`: `{ "text": "Today we learn about light.", "language": "en", "output_path": "/absolute/path/to/drishya/data/audio/example.wav" }`. Optional `voiceId` must match the configured speaker; optional `speed` must be 1.

`output_path` (also accepted as `outputPath`) must resolve inside Drishya's audio directory and end in `.wav`. Responses preserve the existing Node contract: artifact key, measured duration, sample rate, channels, effective settings and cache status. Only the private service response includes the filesystem output path; the Node adapter strips it before app use.

Cache keys include text, language, speaker, exact description, model revision, runtime versions and output settings. Files and manifests are atomically written. New provider IDs prevent reuse of legacy robotic audio. Existing legacy takes remain playable, while corrections create new Indic Parler takes.

Unsupported languages/voices, invalid paths, missing caches, model-load errors and generation failures have structured error codes. Node keeps project ownership checks on audio playback. Model caching avoids repeated loading but is not a multi-machine job queue.

## Verification

Run `pnpm --dir apps/api test:speech`. It uses the application's actual Node speech adapter and known-working sample texts, writes four WAVs under `data/audio/verification`, verifies PCM16 mono non-silent audio and duration metadata, and asserts one model load on MPS in a single persistent process. It also checks unsupported-language/path errors and hashes the original test script, environment configuration and four original WAVs to verify they remain unchanged. Results are saved in `report.json` alongside the generated files.

Audio is measured without truncation or forced acceleration. Timeline fitting and video synchronization remain Phase 4. Inference is local; Neon-backed authentication and persistence still require connectivity. Deployment to AWS needs a separately provisioned compatible model worker; the Mac's existing environment is not packaged or modified.
