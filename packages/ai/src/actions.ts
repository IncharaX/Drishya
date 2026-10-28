import type { MotionPlan } from "@drishya/contracts";
/** Compile a valid visual graph into executable operations; never invent facts. */
export function prepareActionScenes(plan: MotionPlan, sourceWorkflow = false) {
  for (const beat of plan.beats) {
    const visual = beat.visual;
    if (
      !["process", "cause"].includes(visual.kind) &&
      !(sourceWorkflow && visual.kind === "concept")
    )
      continue;
    const ids = new Set(visual.nodes.map((node) => node.id));
    const valid = visual.actions?.every(
      (action, index) =>
        ids.has(action.subjectId) &&
        ids.has(action.targetId) &&
        (!["transfer", "transform", "compare"].includes(action.operation) ||
          action.subjectId !== action.targetId) &&
        beat.narration.includes(action.cue) &&
        (index === 0 ||
          beat.narration.indexOf(action.cue) >=
            beat.narration.indexOf(visual.actions![index - 1].cue)),
    );
    if (valid && visual.actions?.length) continue;
    const edges = visual.links.filter(
      (edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to,
    );
    const ordered = edges.length
      ? edges
      : visual.nodes
          .slice(1)
          .map((node, index) => ({
            from: visual.nodes[index].id,
            to: node.id,
            label: "",
          }));
    const first = visual.nodes[0];
    const words = beat.narration.split(/\s+/u);
    const cue = (fraction: number) => {
      const text = words
        .slice(
          Math.floor(words.length * fraction),
          Math.floor(words.length * fraction) + 4,
        )
        .join(" ");
      return text.length >= 3 ? text : beat.narration.slice(0, 180);
    };
    visual.actions = [
      {
        operation: /input|prompt|request|query/iu.test(
          `${first.id} ${first.label}`,
        )
          ? "type"
          : "reveal",
        subjectId: first.id,
        targetId: first.id,
        cue: cue(0),
        at: 0,
      },
      ...ordered.map((edge, index) => ({
        operation: /generat|convert|render|produc|creat|transform/iu.test(
          beat.narration,
        )
          ? ("transform" as const)
          : ("transfer" as const),
        subjectId: edge.from,
        targetId: edge.to,
        cue: cue(((index + 1) / (ordered.length + 1)) * 0.85),
        at: ((index + 1) / (ordered.length + 1)) * 0.85,
        label: edge.label,
      })),
    ];
    if (visual.actions.length === 1)
      visual.actions.push({
        operation: "reveal",
        subjectId: first.id,
        targetId: first.id,
        cue: cue(0.5),
        at: 0.5,
      });
  }
}
