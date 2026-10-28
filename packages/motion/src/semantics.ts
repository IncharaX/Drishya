import type { ExplanationBeat } from "@drishya/contracts";

type Node = ExplanationBeat["visual"]["nodes"][number];
// Literal subject recognition overrides a model's unrelated decorative icon.
// Unknown concepts stay labelled concepts instead of becoming invented objects.
export function semanticAsset(node: Node): string {
  const name = `${node.id} ${node.label}`.toLowerCase();
  for (const [asset, pattern] of [
    ["roots", /\broot(?:s)?\b|जड़|ಬೇರು|వేరు/u],
    ["soil", /\bsoil\b|मिट्टी|ಮಣ್ಣು|నేల/u],
    ["leaf", /\bleaf\b|\bleaves\b|पत्त|ಎಲೆ|ఆకు/u],
    ["plant", /\bplant(?:s)?\b|पौध|ಸಸ್ಯ|ಮొక్క/u],
    ["sun", /\bsun(?:light)?\b|सूर्य|ಸೂರ್ಯ|సూర్య/u],
    ["water", /\bwater\b|पानी|ನೀರು|నీరు/u],
    ["air", /\bair\b|carbon.?dioxide|oxygen|हवा|ಗಾಳಿ|గాలి/u],
    ["food", /\bfood\b|\bsugar\b|\bglucose\b|भोजन|ಆಹಾರ|ఆహారం/u],
  ] as const)
    if (pattern.test(name)) return asset;
  for (const [asset, pattern] of [
    ["person", /customer|person|user|team|support|manager|human/u],
    ["document", /request|form|document|submit/u],
    ["check", /approve|success|complete|confirm|ready/u],
    ["question", /review|question|decision|detail/u],
    ["coins", /refund|payment|finance|money|cost/u],
    ["server", /server|api|database|computer/u],
    ["planet", /planet|earth|mars|saturn|jupiter/u],
    ["atom", /atom|molecule|electron/u],
    ["gear", /gear|machine|engine/u],
    ["package", /ship|order|product|package/u],
  ] as const)
    if (pattern.test(name)) return asset;

  return "label";
}
