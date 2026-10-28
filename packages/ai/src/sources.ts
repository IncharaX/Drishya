import type { MotionPlan } from "@drishya/contracts";
export type SourceDocument = { id: string; name: string; text: string };
export function sourcePassages(sources: SourceDocument[]) {
  return sources.flatMap((source, sourceIndex) => {
    const passages: { passageId: string; sourceId: string; quote: string }[] =
      [];
    // Exact slices are authored by the application, never reconstructed by the LLM.
    for (const paragraph of source.text.split(/\n\s*\n/u)) {
      for (let offset = 0; offset < paragraph.length; ) {
        let end = Math.min(offset + 300, paragraph.length);
        if (end < paragraph.length) {
          const space = paragraph.lastIndexOf(" ", end);
          if (space > offset + 100) end = space;
        }
        const quote = paragraph.slice(offset, end).trim();
        offset = end;
        if (quote.length >= 20)
          passages.push({
            passageId: `s${sourceIndex}p${passages.length}`,
            sourceId: source.id,
            quote,
          });
      }
    }
    return passages;
  });
}
const normalize = (text: string) =>
  text.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
export function sourceGroundingIssues(
  plan: MotionPlan,
  sources: SourceDocument[],
) {
  if (!sources.length) return [];
  const issues: string[] = [];
  for (const beat of plan.beats) {
    if (!beat.evidence?.length) {
      issues.push(
        `${beat.id}: cite a specific passage from the uploaded document.`,
      );
      continue;
    }
    for (const evidence of beat.evidence) {
      const source = sources.find((source) => source.id === evidence.sourceId);
      if (
        !source ||
        !normalize(source.text).includes(normalize(evidence.quote))
      )
        issues.push(
          `${beat.id}: evidence must quote the actual source verbatim.`,
        );
      else if (plan.language === "en") {
        const stop = new Set(
          "about after again also before being could does each from have into more must only other should some than that their them then there these they this those through under very what when where which while with would your".split(
            " ",
          ),
        );
        const terms = new Set(
          normalize(evidence.quote)
            .match(/[a-z][a-z0-9-]{3,}/gu)
            ?.filter((term) => !stop.has(term)) ?? [],
        );
        const narration = normalize(beat.narration);
        if (
          terms.size >= 2 &&
          [...terms].filter((term) => narration.includes(term)).length < 2
        )
          issues.push(
            `${beat.id}: explain the cited source facts instead of a generic definition of the document type.`,
          );
      }
    }
  }
  return issues;
}
