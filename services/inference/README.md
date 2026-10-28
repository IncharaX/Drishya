# Local speech service

Active mode: original male-only Indic Parler profiles and the known-working `test.py` generation settings. Female selection, Whisper verification, chunk-retry synthesis and experimental speech normalization are disabled. Existing uploads, learning/sharing features and saved videos remain intact.

Drishya → authenticated TTS service on localhost:8001 → AI4Bharat Indic Parler → PCM16 mono WAV → the existing audio/video pipeline.

## Existing environment

The launcher uses `~/AI/indic-tts/.venv/bin/python` (Python 3.11), configurable through `TTS_PYTHON`. It does not install packages, recreate the environment, or download weights. Do not run the legacy Piper downloader or requirements files for this integration.

`app/indic_parler.py` reuses model loading, both tokenizers, device selection, descriptions and generation arguments from `~/AI/indic-tts/test.py`. PyTorch uses MPS when available. The model loads once per service process and stays loaded; startup prewarming is enabled by default (or loading is lazy with `TTS_PREWARM=0`); a lock serializes inference across requests. Restart the service after provider changes. The HTTP server uses Python's standard library, requiring no additional packages in the working environment.

| Language | Code | Speaker |
| -------- | ---- | ------- |
| English  | en   | Thoma |
| Hindi    | hi   | Rohit |
| Kannada  | kn   | Suresh |
| Telugu   | te   | Prakash |

The male profiles preserve the working script. Female speakers follow [AI4Bharat's published Indic Parler model card](https://huggingface.co/ai4bharat/indic-parler-tts) and have been synthesized through the application adapter in all four languages. Each requests clear natural teaching speech with no background noise. Speaker selection changes the description, not the installed model or generation arguments.

## Configuration and startup

Match `INFERENCE_SECRET` (at least 32 characters) between the API and this service. Set `DRISHYA_DATA_DIR=../../data` here and `MEDIA_ROOT=../../data` in the API so both resolve to the repository's data directory. The API uses `INFERENCE_URL=http://127.0.0.1:8001`.

Run `pnpm dev` from the repository root, or `pnpm --filter @drishya/inference dev` for speech alone. The launcher sets offline Hugging Face/Transformers flags and disables telemetry; model and tokenizer loads also use `local_files_only=True`. A missing cache is an explicit setup error, never an automatic download.

## API boundary

All routes require `Authorization: Bearer <INFERENCE_SECRET>`.

- `GET /voices`: four configured male voices, model revision and availability.
- `GET /health`: process ID, interpreter, device and model-load count for diagnostics.
- `POST /synthesize`: `{ "text": "Today we learn about light.", "language": "en", "output_path": "/absolute/path/to/drishya/data/audio/example.wav" }`. Optional `voiceId` must match the configured speaker; optional `speed` must be 1.

`output_path` (also accepted as `outputPath`) must resolve inside Drishya's audio directory and end in `.wav`. Responses preserve the existing Node contract: artifact key, measured duration, sample rate, channels, effective settings and cache status. Only the private service response includes the filesystem output path; the Node adapter strips it before app use.

Cache keys include text, language, speaker, exact description, model revision, runtime versions and output settings. Files and manifests are atomically written. New provider IDs prevent reuse of legacy robotic audio. Existing legacy takes remain playable, while corrections create new Indic Parler takes.

Unsupported languages/voices, invalid paths, missing caches, model-load errors and generation failures have structured error codes. Node keeps project ownership checks on audio playback. Model caching avoids repeated loading but is not a multi-machine job queue.

## Verification

Run `pnpm --dir apps/api test:speech`. It uses the application's actual Node speech adapter and known-working sample texts, writes four WAVs under `data/audio/verification`, verifies PCM16 mono non-silent audio and duration metadata, and asserts one model load on MPS in a single persistent process. It also checks unsupported-language/path errors and hashes the original test script, environment configuration and four original WAVs to verify they remain unchanged. Results are saved in `report.json` alongside the generated files.

Audio is measured without truncation or forced acceleration. Timeline fitting and video synchronization remain Phase 4. Inference is local; Neon-backed authentication and persistence still require connectivity. Deployment to AWS needs a separately provisioned compatible model worker; the Mac's existing environment is not packaged or modified.

## Timing and readiness

## Archived narration verification experiment (disabled)

The following describes the previous experiment, not the active path. Its local model files are retained but are not loaded for current narration.

New narration is split into short coherent chunks (at most 22 words and 150 English/110 Indian-script characters). Technical terms such as API, JSON, MP4 and numeric ranges are normalized for speech while displayed captions retain the original wording. Indic Parler stays loaded. Each chunk is checked with local Whisper large-v3-turbo on CPU; word timestamps drive the preview, burned-in captions and SRT/VTT through one shared timing function. The additional verifier runs in the existing interpreter without installing or replacing TTS packages. Its model is separate from Indic Parler.

The one-time explicit model preparation command is `~/AI/indic-tts/.venv/bin/python services/inference/scripts/prepare-quality.py` from the repository root. Runtime uses only local files under `data/models/whisper-large-v3-turbo`. The verifier and original models remain offline after preparation. Reference: [Whisper documentation](https://huggingface.co/docs/transformers/model_doc/whisper).

Missing English words, materially different recognized speech, missing endings, long internal pauses, excessive clipping and near-limit chunks trigger bounded synthesis retries. A difficult chunk is then split once; if it still cannot be verified, the service returns `SPEECH_QUALITY_FAILED` (422) rather than publishing unchecked narration. Indian-language verification compares normalized characters to reduce word-segmentation differences. Recognition is itself imperfect; this is a quality gate, not a guarantee of flawless pronunciation. Some earlier voice samples were rejected by the stronger verifier, so four-language narration quality is not universally established by WAV validity alone.

Verified chunk audio and timestamp manifests are cached independently. Old unchecked audio is not accepted as verified; narration/voice/translation edits invalidate its captions and verification together. Timing fitting limits acceleration to 1.08×, and music/effects duck further during speech. Short checks run with `~/AI/indic-tts/.venv/bin/python -B services/inference/scripts/check-quality.py`. Verification adds CPU work and retries may increase generation time; no new speed benchmark is claimed.

The adapter now prewarms the same cached model once at service startup. Set `TTS_PREWARM=0` to retain lazy loading. The authenticated `/health` response exposes `modelLoaded`, `modelLoadCount`, `modelLoadMs`, device and interpreter. No generation arguments or installed packages are changed by prewarming.

Synthesis responses include separate cache, lock-wait, model-loading, tokenization, synchronized inference, output-writing and audio-duration measurements. Fresh calls and failures are also appended to Drishya's `data/audio/synthesis-metrics.jsonl`; narration text and credentials are omitted. Cached audio reports the current lookup time rather than claiming its historical inference time as current work.
