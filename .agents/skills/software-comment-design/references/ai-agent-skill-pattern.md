# AI-First Agent Skill Pattern

This skill uses a standardized pattern optimized for agents rather than humans.

## 1. Metadata is the trigger surface

The `name` and `description` are operational routing data. They must contain task verbs, domain objects, positive triggers, and negative boundaries. Do not waste the description on branding.

Good description shape:

```yaml
description: <verbs and job>. Use for <specific trigger phrases/domains>. Do not use for <near-miss tasks>.
```

## 2. SKILL.md is the execution contract

The body should tell the agent exactly how to behave after activation:

- activation boundary;
- AI-critical rules;
- decision algorithm;
- output contract;
- quality gate;
- when to read references.

Avoid long explanation. Prefer imperative steps and concrete checks.

## 3. References are on-demand memory

Move detailed principles, examples, rubrics, and eval prompts into `references/` or `assets/`. The main file should stay short enough to load cheaply and reliably.

## 4. Assets are copyable patterns

Put exact templates in `assets/` so the agent can pattern-match and produce consistent output.

## 5. Evals protect behavior

A skill should include small must-pass prompts that test:

- invocation: skill activates for the right tasks;
- non-invocation: skill does not activate for near misses;
- outcome: output changes the right files or reports the right findings;
- style: output follows the desired format;
- efficiency: no unnecessary tools or broad file reads.

## 6. Safety against hallucinated intent

For code-comment skills, the highest-risk failure is inventing design rationale. The skill must force the agent to derive claims from code/tests/context or state uncertainty.
