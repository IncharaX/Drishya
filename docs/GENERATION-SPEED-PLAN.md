# Generation speed plan — approved direction

## Targets

For a normal 30–40 second explanation, reduce generation from roughly ten minutes toward two to three minutes. Measure these separately:

- Narrated Remotion preview: within 60 seconds where practical.
- 1280×720 MP4: roughly 120 seconds.
- Optional 1080p MP4: roughly 180 seconds where achievable.
- 120-second explanation: separate five-minute benchmark.

Targets are not timing guarantees. Queue-inclusive wall time, actual worker execution, preview readiness and MP4 readiness must remain distinct. Keep Qwen 8B, the existing AI4Bharat Indic Parler setup and all four languages. Do not require 1080p before a usable result.

## Implementation order

1. **Queue, recovery and wall-time overhead.** Persist enqueue, claim, eligibility, attempt boundaries, worker availability, recovery and failure/retry events. Measure claim/database time separately. Schedule conversations fairly without preempting active jobs. Preserve completed stages on retries.
2. **Speech and fitting.** Record model loading, lock wait, tokenization, each synchronized inference call, audio duration, writing, cache hits, failures, script rewrites and discarded takes. Calibrate the first script before synthesizing. Do not repeat a no-op rewrite. Keep unchanged beat audio. Use the existing modest tempo bounds only where the resulting delivery remains clear; do not trade speed for rushed narration or empty holds.
3. **Qwen round trips.** Benchmark one structured call combining ambiguity screening, script and visual direction for short overviews. Keep selectable clarification cards and full chapter assessment for longer/complete coverage. Remove application-owned timing/resource fields and redundant schema prose from generated output. Measure loading, prompt evaluation, decoding, token count and repairs.
4. **Remotion rendering.** Show the existing Player as soon as narration and exact timing are ready. Default new exports to 720p and offer 1080p explicitly. Benchmark bounded concurrency and the matching render browser on the same scene before rollout. Preserve H.264/AAC, exact frame counts, audio validation and visual meaning.
5. **Cross-generation and revision caching.** Retain the existing content-addressed speech and scene caches. Reuse unchanged narration during edits. Keep cache hits explicit in benchmarks so warm reuse is not presented as fresh-inference performance.

## Safe changes implemented

Per-attempt events are stored in `data/v2/metrics/`; speech timings are in `data/audio/synthesis-metrics.jsonl`. They omit narration text and credentials. Worker lifecycle events allow unavailable time to be distinguished from active work going forward. Historic missing transitions remain unknown.

Explicit short overviews use one ambiguity-aware structured call. Writer output omits audio keys, audio durations, frame counts and unused shape/timing defaults. Short videos use three connected beats with a calibrated narration budget. Obvious text-budget misses are repaired before speech. Identical rewrites stop rather than re-running the same fitting loop; unchanged narration retains its audio. Mildly short speech can use the already supported slower teaching pace, within 0.85×–1×, with visual demonstration time. Oversized speech retains the existing maximum 1.18× and asks for a duration choice when it cannot fit clearly.

Queue scheduling accounts for service already received by the same conversation. New exports default to 720p; additional preferences offer 1080p. Two rendering pages and the separately prepared matching Remotion Chromium are limited to 2D scenes; 3D retains one page in known-working Chrome. Prepare the render-only browser once with `pnpm exec tsx --env-file=.env scripts/prepare-render-browser.ts` from `apps/api`; subsequent generation uses the cached executable without downloading anything. The narrated Player remains available while the MP4 renders.

The speech model remains persistent and uses the same loading, tokenizer and generation arguments. Startup prewarming moves its first load out of the first generation where the app has already been started. No model/package/interpreter/dtype/attention/compilation change is part of this rollout.

## Validation and next decision

Use fresh 30-second prompts through the real worker, with a disposable account. Record every call and cache hit, exact exported duration, readable scene frames, audio duration and audibility. Test all four speech languages separately. Compare identical render fixtures before choosing browser/concurrency settings.

See [PERFORMANCE-REPORT.md](PERFORMANCE-REPORT.md) for the measured breakdown and remaining gaps. Do not claim targets met from an isolated cache replay or from component timings added together. If the unchanged model remains the limiting factor, report that evidence and propose an isolated reversible inference experiment before changing the working setup.
