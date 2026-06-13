## Side Chat code quality gate

Use `.agents/skills/side-chat-code-quality-gate/SKILL.md` when writing, reviewing, or refactoring TypeScript/Node/React code in this repo.

This skill covers the actual repo gate: Oxfmt, Oxlint, strict TypeScript, custom governance lints, package boundaries, widget layers, runtime boundaries, cognitive complexity, source/file budgets, Effect and AI SDK readability, and comment quality.

Treat “clever but hard to understand” as a quality failure even when code passes typecheck. The target is human-level cognitive load, not AI-level comprehension. Comments must lower context requirements; they should not assume the reader already knows the whole architecture.

For test-specific work, also use `.agents/skills/side-chat-testing-architecture/SKILL.md`.
