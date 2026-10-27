# Generation speed plan — pending approval

No speed optimization in this plan has been implemented. The functional history, duration, editing, scene, sound and UI changes are separate.

## Goal

Make a fresh 30–40 second explanation usable within a five-minute presentation window on this M5 MacBook Pro with 16 GiB of memory. Keep Qwen and the existing AI4Bharat Indic Parler installation, all four languages, real animation, exact duration and the standard 1080p export. Measure preview-ready and downloadable-MP4-ready separately. A 120-second video within five minutes is an additional benchmark target, not a promise before measurement.

## Evidence from the current application

Recent completed records contain these stage timings, rounded to seconds:

| Video duration | Writing/planning | Speech and duration fitting | Rendering | Worker total | Wall time including waiting/recovery |
| --- | ---: | ---: | ---: | ---: | ---: |
| 25 s | 83 | 80 | 63 | 228 | 1,249 |
| 60 s | 59 | 131 | 120 | 311 | 1,063 |
| 44 s | 108 | 278 | 96 | 483 | 489 |
| 28.7 s | 81 | 317 | 77 | 478 | 653 |

These are persisted application samples, including warm or recovered work, rather than controlled benchmarks. They show two distinct problems: stage execution costs roughly four to eight minutes, and queueing/recovery can make the wait much longer. Speech is the largest stage in the slower samples; writing and rendering also matter. Raising render concurrency alone will not solve the whole delay.

## Proposed order

### 1. Establish a small repeatable baseline

Use the same 30–40 second explanation in English, Hindi, Kannada and Telugu. Record cold start, warm generation, visual-only edit and one narration edit. Separate model loading, writer inference, synthesis, duration rewrites, rendering and queue wait. Record memory pressure and whether the installed speech runtime stays on MPS. Avoid benchmarking while another generation owns the machine.

### 2. Reduce speech cost while preserving the working setup

Benchmark supported attention and precision configurations in an isolated adapter configuration using the existing interpreter and downloaded model. Keep the current working configuration as the fallback. Compare pronunciation and timing in all four languages before choosing a faster configuration. Do not reinstall Python packages or change the original test.py environment.

Parler documents efficient attention, compilation, streaming and batching, but its GPU examples are not evidence of the same speed-up on this Mac. Check capabilities in the installed runtime; do not assume CUDA-only Flash Attention works on Apple Silicon. Start with safe attention/precision comparisons and cached speaker-description tokenization. Treat compilation as optional if its cold-start cost or MPS support makes it unsuitable for a demo. [Parler inference documentation](https://github.com/huggingface/parler-tts/blob/main/INFERENCE.md).

Benchmark two or three coherent narration groups for a short video instead of many tiny synthesis requests. Maintain stable group-to-scene timing and reuse unchanged groups during edits. Fewer requests may improve continuity and overhead, but decoder time still scales with spoken audio; measure rather than assume a large gain.

### 3. Reduce writer round trips and repeated fitting

For an unambiguous short request with a fixed duration, test one compact structured call that produces the explanation and visual direction together. Keep clarification and chapter planning for cases that need them. Remove redundant schema text and model-generated resource/timing fields from the writer payload; the application should own those values. Keep validation and bounded repair.

Calibrate word budgets from the measured local voice/language so the first script lands near the requested duration. Preserve exact exported timing while reducing complete rewrite-and-resynthesis cycles. Do not solve duration by rushing the voice or adding long empty holds.

### 4. Manage the Mac's memory and warm-up deliberately

Measure retaining both models versus releasing the inactive model between writing and narration. Keep the speech model loaded throughout a narration phase and its multiple requests. Avoid concurrent heavy model work if it causes swapping. Warm cached assets/models before the presentation and display actual readiness. Keep memory limits intact; do not disable safeguards to force a larger working set. [PyTorch MPS memory reporting](https://docs.pytorch.org/docs/stable/generated/torch.mps.recommended_max_memory.html).

### 5. Tune rendering without silently reducing quality

Benchmark render concurrency 1, 2 and 3 on representative 2D and 3D compositions. Keep the best stable setting for this machine rather than using all CPU cores. Reuse existing browser/bundle/scene caches. Evaluate hardware H.264 encoding only after checking the installed encoder and matching visual quality. [Remotion performance guidance](https://www.remotion.dev/docs/performance).

Separate the global timeline overlay from expensive scene footage where practical, so a timing change does not invalidate otherwise reusable animation. Keep soundtrack-only and unchanged-narration edits cheap. An explicitly selected presentation preview at 720p may be offered alongside the standard 1080p export; never downgrade the final file silently.

### 6. Prevent a chapter collection from blocking every new request

Schedule work fairly between conversations rather than placing every chapter of one collection ahead of all interactive work. Show queue position and estimates. Keep one heavy inference workload at a time until memory measurements support more. Never interrupt an active user generation to prioritize a demo or test.

## Acceptance and rollout

- Compare the same inputs before and after; report stage timings and total elapsed time.
- Target a fresh 30–40 second 1080p MP4 within five minutes, then benchmark longer videos separately.
- Retain exact duration, graph/flow meaning, native-language speech and readable visuals.
- Check all four voices and a combined font/3D/narration edit for regressions.
- Keep each change configurable and retain the working inference configuration.
- Do not claim a timing guarantee until repeated runs meet it. If the existing model cannot meet the target on this hardware, report the measured limit before proposing another model or hosted service.

Implementation starts only after approval of this plan.
