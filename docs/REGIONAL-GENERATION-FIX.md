# Regional generation recovery

The former Kannada/Telugu create path generated an entire visual document in native script with a 3,800-token budget. It could take nearly three minutes before truncating. Larger retries then timed out and whole-job retries repeated the work.

The corrected create path persists an English canonical scene plan before translating unique text fields separately. Each request has a field-specific length limit and a bounded token budget. Completed translations are cached under the active media root's v2/translations directory. IDs, geometry and source evidence remain application-controlled. Progress is reported during translation, and retries reuse completed fields.

Spelled-out English counts are normalized to digits and checked for preservation. A small astronomy glossary distinguishes planets from stars. Incorrect required counts or planet terms get one bounded correction. These are targeted guards, not a universal translation-quality guarantee.

Chat detail reflects terminal worker failures even if the revision's last saved state is nonterminal, preventing an endless generation spinner.

Run apps/api/scripts/check-regional-translation.ts with tsx for fixture checks of both canonical language routes, count rejection, cache reuse and node preservation. This check performs no real inference.

The regional submission recovery script uses an authored solar-system visual plan and explicitly authored Kannada/Telugu scripts after a local automatic translation changed eight planets to six. It generates actual local narration and validated MP4s, preserves checkpoints and adds the videos to the local library. This recovery is not presented as universal automatic translation accuracy. The Python environment and speech generation settings are unchanged.
