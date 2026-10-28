# Performance measurement report — October 28

## Scope and method

Measurements use the existing M5 Mac development workload, Qwen 8B and the unchanged Indic Parler model, Python environment and generation arguments. These are real local outputs, not fixtures marked as generated. Short four-language speech probes and real worker generations are separate experiments. Development processes and memory pressure remain potential sources of variation. No claim of a universal timing guarantee follows from one successful prompt.

The saved photosynthesis video was not changed. New semantic/layout fixtures were rendered separately and visually inspected.

## Historical evidence

The historical 25-second request had **1,249.345 seconds** from job creation to completion and one **228.013-second** recorded execution: **1,021.332 seconds outside that execution**. There are no historic enqueue/claim/worker-availability transitions to split that remainder exactly into queue contention and downtime. Calling it inference time would be incorrect. New telemetry distinguishes eligibility, claim/database time, worker lifecycle, active attempts, retries and lease recovery.

The 277.913-second and 317.084-second speech stages both recorded **zero fitting rewrites**. Their historic per-call/load timings were not recorded, so raw synthesis versus loading cannot be recovered exactly. Recovered records may retain stage values from different attempts; their sums are not clean profiles.

## Four-language speech probes

| Language | Generated audio | Model loading | Raw inference | Lock wait |
| --- | ---: | ---: | ---: | ---: |
| English | 6.095 s | 14.838 s | 14.479 s | <1 ms |
| Hindi | 6.455 s | 0 | 13.674 s | <1 ms |
| Kannada | 7.094 s | 0 | 17.552 s | <1 ms |
| Telugu | 6.490 s | 0 | 23.118 s | <1 ms |

One model load, MPS throughout. Tokenization took 3–89 ms; output conversion/writing took 19–29 ms. Thus request overhead is small relative to raw autoregressive inference. These short probes are not full-video generation timings. Calls after Qwen inference were slower in full runs; memory pressure is a plausible cause, not yet proven by an isolated experiment.

## Real 30-second worker runs

Preview time below is the persisted readiness event relative to job creation; final time is relative to the same creation timestamp. Polling can display the result slightly later. Setup of a disposable benchmark account is excluded.

| Run | Narrated preview | Final job completion | Qwen calls | Fresh speech calls / cache hits | Raw speech inference | Fitting rewrites | Render stage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 232.2 s | 304.0 s | 2 | 7 / 1 | 132.4 s | 1 | 70.4 s |
| 2 | 182.2 s | 252.8 s | 4 | 3 / 6 | 75.0 s | 2 | 69.4 s |
| 3 | 157.5 s | 238.4 s | 1 | 3 / 0 | 99.4 s | 0 | 79.6 s |

Runs 1–2 used the browser/server-response explanation. Run 3 used a fresh rain explanation so previous speech cache entries could not artificially improve timing. They are not an identical-content before/after study. Later runs progressively include fixes discovered in earlier runs. Full traces are saved under `data/v2/benchmarks/` and `data/v2/metrics/`.

The first run generated an approximately 18-second first narration for a 30-second request. A later timing rewrite generated more speech, causing eight synthesis requests (seven fresh, one cache hit). The next run exposed identical no-op timing rewrites; those now stop without another synthesis pass. The third run used three fresh speech calls and no fitting rewrite, demonstrating that raw inference remains a substantial bottleneck even after loop removal.

### Every measured speech request


Run 1:

| Beat | Fitting attempt | Request elapsed | Audio produced | Cache hit | Model load | Raw inference |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| introduction | 0 | 28.006 s | 4.574 s | False | 0.000 s | 27.771 s |
| request | 0 | 8.690 s | 3.831 s | False | 0.000 s | 8.650 s |
| response | 0 | 8.381 s | 3.878 s | False | 0.000 s | 8.345 s |
| display | 0 | 14.755 s | 4.214 s | False | 0.000 s | 14.685 s |
| introduction | 1 | 0.048 s | 4.574 s | True | 0.000 s | 0.000 s |
| request | 1 | 36.746 s | 7.488 s | False | 0.000 s | 36.597 s |
| response | 1 | 21.007 s | 6.792 s | False | 0.000 s | 20.923 s |
| display | 1 | 15.474 s | 7.221 s | False | 0.000 s | 15.407 s |

Run 2:

| Beat | Fitting attempt | Request elapsed | Audio produced | Cache hit | Model load | Raw inference |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| beat-1 | 0 | 37.958 s | 6.641 s | False | 0.000 s | 37.794 s |
| beat-2 | 0 | 22.166 s | 6.467 s | False | 0.000 s | 21.976 s |
| beat-3 | 0 | 15.230 s | 6.467 s | False | 0.000 s | 15.181 s |
| beat-1 | 1 | 0.035 s | 6.641 s | True | 0.000 s | 0.000 s |
| beat-2 | 1 | 0.013 s | 6.467 s | True | 0.000 s | 0.000 s |
| beat-3 | 1 | 0.011 s | 6.467 s | True | 0.000 s | 0.000 s |
| beat-1 | 2 | 0.017 s | 6.641 s | True | 0.000 s | 0.000 s |
| beat-2 | 2 | 0.005 s | 6.467 s | True | 0.000 s | 0.000 s |
| beat-3 | 2 | 0.009 s | 6.467 s | True | 0.000 s | 0.000 s |

Run 3:

| Beat | Fitting attempt | Request elapsed | Audio produced | Cache hit | Model load | Raw inference |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| evaporation | 0 | 48.079 s | 9.323 s | False | 0.000 s | 47.698 s |
| condensation | 0 | 29.890 s | 8.591 s | False | 0.000 s | 29.552 s |
| rain | 0 | 22.907 s | 7.001 s | False | 0.000 s | 22.185 s |

## Renderer experiment

The same 150-frame 720p 2D fixture, same encoding settings, no inference running:

| Browser | One page | Two pages |
| --- | ---: | ---: |
| Installed Chrome | 11.807 s | 10.506 s |
| Matching Remotion render-only Chromium | 7.177 s | 3.847 s |

The matching browser with two pages is about 63% faster than installed Chrome with two pages on this fixture. This is an isolated render measurement, not a full generation time. Frame output was inspected. It is enabled for 2D only; 3D retains known-working Chrome. Missing prepared browser falls back locally; generation does not download browsers. See [Remotion capture documentation](https://convert.remotion.dev/docs/shared-memory-capture).

## Remaining decision

The 60-second narrated preview and 120-second MP4 targets must be judged from the final full-path run, not projections. Raw speech inference, especially the first call after writer work, remains the main inference cost. No dtype, attention backend, compilation, package, interpreter or model replacement has been made. A proposed next experiment is an isolated precision/attention benchmark within the existing adapter, with four-language pronunciation/audio checks and the original configuration retained as fallback. That experiment should be reviewed before changing inference behavior.

## Final rollout verification

A fresh **30-second, 1280×720 workflow explanation** completed using the final matching-browser configuration and real worker queue. Its text concerned checkout, payment confirmation and dispatch, rather than the browser or rain prompts. The service model was prewarmed; all three narration requests were **uncached**. There were no timing rewrites, rejected speech takes, retries or recoveries. Qwen made one initial plan call and two small link-topology repair calls; “single pass” therefore describes the initial combined planning call, not a claim that validation can never need repairs.

| Component | Time |
| --- | ---: |
| Eligibility/claim wait | 5.919 s |
| Qwen requests including model loading and topology repairs | 49.870 s |
| Raw speech inference, three calls | 68.346 s |
| MP4 rendering/mixing/validation stage | 28.430 s |
| Other worker/service/database overhead | 6.694 s |
| **Queue-inclusive final completion** | **159.258 s** |
| **Narrated preview readiness** | **129.592 s** |

The polling client observed preview at 131.531 s and completion at 161.429 s. Its polling/metadata delay is separate from the persisted readiness events. The final 30-second MP4 passed codec/dimension/frame-rate checks and full-length audible narration validation.

| Speech call | Audio | Request elapsed | Raw inference | Model load in request | Cache hit |
| --- | ---: | ---: | ---: | ---: | --- |
| beat1 | 8.870 s | 33.033 s | 32.835 s | 0 | False |
| beat2 | 8.800 s | 20.908 s | 20.835 s | 0 | False |
| beat3 | 6.664 s | 14.761 s | 14.676 s | 0 | False |

This run meets the broad two-to-three-minute goal for this 30-second 2D example. It **does not** meet the 60-second narrated preview or roughly 120-second 720p targets. The 1080p/180-second and 120-second-video/five-minute benchmarks have not been established. Earlier fresh topics still varied substantially, so this is not a guarantee for every topic or language. Four-language full-video timing needs additional benchmarks; the four-language speech compatibility probes passed.

The next performance work should focus on the measured raw speech cost and Qwen decode time, not more blind render concurrency. A reversible isolated inference-configuration experiment must be reported/reviewed before changing precision, attention, compilation or model behavior. The existing working TTS environment was not modified.
