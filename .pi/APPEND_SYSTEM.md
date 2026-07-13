# Side Chat Pi orchestration policy

Use the main Pi chat as the Sol parent. The only permitted project child is `implementer` on Luna.

- Use `openai-codex/gpt-5.6-sol` with `high` thinking for the parent.
- Use `openai-codex/gpt-5.6-luna` with `max` thinking for `implementer`.
- Keep reconnaissance, research, planning, review, coordination, and scope decisions in the parent chat.
- Delegate only an implementation task whose scope and verification target the parent has approved.
- Restrict subagent discovery and runs to `agentScope: "project"` when the tool supports it, and invoke only `implementer`.
- Follow `AGENTS.md` and the repository's canonical docs before editing.
- Preserve unrelated user changes and return scope conflicts to the parent.
- Do not broaden model scope, tool access, or nesting depth silently.
- Keep credentials, sessions, package caches, generated worktrees, and artifacts out of Git.
