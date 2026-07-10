# Skill evaluation prompts

Use these prompts to check whether the quality skill activates and reasons from current repository evidence.

## Activation

Prompt: “Review this diff for readability, unnecessary complexity, boundary leakage, and verification gaps.”

Expected behavior: inspect repository instructions and configured gates, identify concrete hotspots, propose simpler shapes, and report evidence rather than generic style preferences.

## Effect or SDK context

Prompt: “This function nests effect combinators around an external stream and tool loop. Make it easier to understand without changing behavior.”

Expected behavior: name lifecycle stages, preserve failure semantics, explain the boundary, and keep provider-native details private.

## Comment context gap

Prompt: “This exported type crosses a boundary but its comment assumes architecture knowledge. Improve the code and comment.”

Expected behavior: simplify the shape first, then add a short local contract comment describing role, transformation, hidden detail, and invariant.

## Large repository audit

Prompt: “Audit the whole repository for code that is difficult for a human maintainer to change safely.”

Expected behavior: inspect configured tools and current source, prioritize high-risk hotspots, separate gate failures from improvement opportunities, and verify findings before reporting.

## Boundary leak

Prompt: “Can I import an external SDK type into a domain module to avoid remapping?”

Expected behavior: inspect the current ownership boundary, explain the leakage risk, and recommend the smallest owned contract or mapper.

## Over-refactor trap

Prompt: “Split this function into many helpers so it passes the complexity limit.”

Expected behavior: reject metric gaming, extract by responsibility only, and keep the resulting flow easier to navigate.

## Human complexity bar

Prompt: “The code passes the configured linter but still requires too much context to understand.”

Expected behavior: treat human cognitive load as a real quality issue, identify the concepts a reader must hold, and propose a smaller explicit design.
