import { type MotionPlan, motionPlanSchema } from "@drishya/contracts";
export function examplePlan(kind: "solar" | "process" | "cause"): MotionPlan {
  const entries =
    kind === "solar"
      ? [
          {
            title: "One star. A system in motion.",
            narration:
              "Our solar system is held together by gravity. The Sun sits at its centre, with planets travelling around it.",
            focus: "",
            nodes: [
              { id: "sun", label: "The Sun", detail: "The central star" },
              {
                id: "orbits",
                label: "Orbital motion",
                detail: "Planets follow paths around the Sun",
              },
            ],
          },
          {
            title: "Follow Earth's journey.",
            narration:
              "Earth rotates while it travels around the Sun. These two motions explain different patterns we observe in the sky.",
            focus: "Earth",
            nodes: [
              {
                id: "earth",
                label: "Earth",
                detail: "Rotation and revolution",
              },
              { id: "sun", label: "The Sun", detail: "The reference point" },
            ],
          },
          {
            title: "A shared system. Different worlds.",
            narration:
              "The planets have different sizes and distances from the Sun. This illustration simplifies those scales to make their motion visible.",
            focus: "Jupiter",
            nodes: [
              {
                id: "inner",
                label: "Inner planets",
                detail: "Closer to the Sun",
              },
              { id: "outer", label: "Outer planets", detail: "Farther out" },
            ],
          },
        ]
      : kind === "process"
        ? [
            {
              title: "A request begins its journey.",
              narration:
                "A customer submits a refund request. The support team first checks the details and confirms that the request is complete.",
              nodes: [
                {
                  id: "request",
                  label: "Request",
                  detail: "Customer submits details",
                },
                {
                  id: "review",
                  label: "Support review",
                  detail: "Check the information",
                },
                { id: "ready", label: "Ready", detail: "Continue to approval" },
              ],
            },
            {
              title: "Every decision has a next step.",
              narration:
                "The manager reviews the request. Approved requests move to finance; requests needing more information return to support.",
              nodes: [
                {
                  id: "support",
                  label: "Support",
                  detail: "Prepare the request",
                },
                {
                  id: "approval",
                  label: "Approval",
                  detail: "Manager makes a decision",
                },
                {
                  id: "finance",
                  label: "Finance",
                  detail: "Approved requests continue",
                },
              ],
            },
            {
              title: "Close the loop.",
              narration:
                "Finance issues the refund and sends confirmation. The customer can now see that the process has finished.",
              nodes: [
                {
                  id: "finance",
                  label: "Finance",
                  detail: "Issue the payment",
                },
                {
                  id: "payment",
                  label: "Refund sent",
                  detail: "Payment is processed",
                },
                {
                  id: "complete",
                  label: "Confirmation",
                  detail: "Customer is notified",
                },
              ],
            },
          ]
        : [
            {
              title: "A small change can travel far.",
              narration:
                "Changing one part of a system can influence another. A useful explanation shows the connection rather than just listing the parts.",
              nodes: [
                {
                  id: "input",
                  label: "An input changes",
                  detail: "Begin with one clear action",
                },
                {
                  id: "response",
                  label: "The system responds",
                  detail: "Show what changes next",
                },
              ],
            },
            {
              title: "Make the relationship visible.",
              narration:
                "Compare the system before and after the change. Keep the surrounding context stable so the effect is easy to notice.",
              nodes: [
                { id: "before", label: "Before", detail: "The original state" },
                {
                  id: "after",
                  label: "After",
                  detail: "The result of the change",
                },
              ],
            },
            {
              title: "Explain why, not just what.",
              narration:
                "Finish by connecting the action to its outcome. The viewer should understand what caused the change and what it means.",
              nodes: [
                { id: "action", label: "Action", detail: "What happened" },
                {
                  id: "reason",
                  label: "Connection",
                  detail: "Why the result follows",
                },
                { id: "outcome", label: "Outcome", detail: "What it means" },
              ],
            },
          ];
  return motionPlanSchema.parse({
    version: "motion-v2",
    title:
      kind === "solar"
        ? "Our solar system"
        : kind === "process"
          ? "A refund, explained"
          : "Cause and effect",
    summary: "Authored visual reference for Drishya v2.",
    language: "en",
    theme: {
      background: kind === "solar" ? "#080f23" : "#f3f6fc",
      accent: kind === "solar" ? "#8eb3ff" : "#526ff4",
      ink: "#172033",
    },
    captions: true,
    fps: 30,
    beats: entries.map((entry, i) => ({
      id: `beat-${i + 1}`,
      title: entry.title,
      narration: entry.narration,
      durationInFrames: 240,
      visual: {
        kind,
        nodes: entry.nodes,
        links:
          kind === "process"
            ? entry.nodes.slice(0, -1).map((node, j) => ({
                from: node.id,
                to: entry.nodes[j + 1].id,
                label: "",
              }))
            : [],
        focus: "focus" in entry ? entry.focus : "",
        motion: 1,
        objectScale: 1,
        code: "",
      },
    })),
  });
}
