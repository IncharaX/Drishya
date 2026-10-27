import type { LessonInput, LessonReference } from "@drishya/contracts";

// Curated paraphrases, bundled for offline use. Retrieval never fetches a page.
const python: LessonReference = {
  id: "python-control-flow",
  title: "Python tutorial — More control flow tools",
  url: "https://docs.python.org/3/tutorial/controlflow.html",
  notes: [
    "A for statement visits items from a sequence in their sequence order. The indented body runs for each item.",
    "range(stop) excludes stop; range(start, stop, step) can specify a starting value and increment.",
    "break exits the innermost loop. continue skips the remaining body and proceeds with the next iteration.",
    "An if/elif/else chain selects a branch using conditions. elif branches and else are optional.",
    "def introduces a function definition. Parameters provide inputs; return supplies a result to the caller.",
  ],
};
const water: LessonReference = {
  id: "nasa-water-cycle",
  title: "NASA GPM — The water cycle",
  url: "https://gpm.nasa.gov/education/water-cycle",
  notes: [
    "Water circulates between Earth's surface and atmosphere through processes including evaporation, condensation and precipitation.",
    "Surface water evaporates. Water vapor can cool and condense in clouds, and water returns to the surface as precipitation.",
    "Water reaching land can collect in rivers and lakes, enter soil and porous rock, or flow back toward the ocean.",
    "This cycle is connected to weather. A simple cycle diagram is a teaching simplification, not the only path water can take.",
  ],
};
export function referencesFor(input: LessonInput): LessonReference[] {
  const text =
    `${input.interpretedSubject} ${input.chapter.title} ${input.chapter.objective}`.toLowerCase();
  const result: LessonReference[] = [];
  if (
    /\bpython\b/u.test(text) &&
    /\b(loop|loops|for|while|range|function|functions|condition|conditions|conditional|control|iteration)\b/u.test(
      text,
    )
  )
    result.push(python);
  if (
    /\b(water cycle|hydrologic|hydrological|evaporation|condensation|precipitation)\b/u.test(
      text,
    )
  )
    result.push(water);
  return result;
}
