import type { MotionPlan } from "@drishya/contracts";

// Compile supported Python teaching examples into a code demonstration rather
// than letting a generic node graph stand in for execution. Never execute LLM code.
export function prepareProgrammingScenes(plan: MotionPlan, request = "") {
  if (!/python/iu.test(`${request} ${plan.title} ${plan.summary}`)) return;
  if (!/loops?|iteration|iterate|for-loop|while-loop/iu.test(`${request} ${plan.title} ${plan.beats.map(b => b.title).join(" ")}`)) return;
  for (const beat of plan.beats) {
    if (beat.visual.kind === "code" && beat.visual.code.trim()) continue;
    const text = `${beat.id} ${beat.title} ${beat.narration}`;
    let code: string;
    if (/while/iu.test(text)) {
      code = /input|valid|answer/iu.test(text)
        ? 'answer = ""\nwhile answer != "yes":\n    answer = input("Ready? ")\nprint("Let’s go!")'
        : 'count = 0\nwhile count < 3:\n    print(count)\n    count += 1';
    } else if (/for[ -]loop|list|sequence|numbers/iu.test(text)) {
      code = 'for number in [1, 2, 3]:\n    print(number)';
    } else if (/repeat|loop/iu.test(text)) {
      code = /cookies?|ingredients?|mix/iu.test(text)
        ? 'for step in range(3):\n    print("Mix ingredients")'
        : 'for step in range(3):\n    print("Hello")';
    } else continue;
    beat.visual.kind = "code";
    beat.visual.code = code;
    beat.visual.dimension = "2d";
    beat.visual.nodes = [{id:"execution",label:"Python",detail:"Illustrative execution",icon:"label",shape:"cube"}];
    beat.visual.links = [];
    delete beat.visual.actions;
  }
}
