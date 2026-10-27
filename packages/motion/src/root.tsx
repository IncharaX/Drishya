// biome-ignore lint/correctness/noUnusedImports: Required by the export bundler JSX transformation.
import React from "react";
import { Composition, registerRoot } from "remotion";
import { ExplanationComposition, planFrames } from "./composition";
import { examplePlan } from "./examples";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-kannada/400.css";
import "@fontsource/noto-sans-telugu/400.css";

import "@fontsource/instrument-serif/400.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/700.css";

const Root = () => (
  <Composition
    id="Explanation"
    component={ExplanationComposition}
    width={1280}
    height={720}
    fps={30}
    durationInFrames={720}
    defaultProps={{ plan: examplePlan("solar"), muted: true }}
    calculateMetadata={({ props }) => ({
      durationInFrames: planFrames(props.plan),
      fps: props.plan.fps,
    })}
  />
);
registerRoot(Root);
