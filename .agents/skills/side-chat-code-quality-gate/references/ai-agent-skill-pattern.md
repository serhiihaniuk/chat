# AI Agent Skill Pattern Used Here

This skill follows the folder-based agent skill pattern:

```txt
skill-name/
├── SKILL.md              # required routing metadata and operating instructions
├── agents/               # optional agent-specific metadata
├── assets/               # optional templates/snippets/examples
├── references/           # optional deeper guidance loaded when needed
└── scripts/              # optional local scripts
```

## AI-first design rules

The `description` is trigger-heavy because agents see metadata before loading the whole skill.

`SKILL.md` contains:

- activation boundaries;
- non-goals;
- repo truth to inspect first;
- AI-critical behavior rules;
- decision algorithms;
- output contracts;
- references to deeper files.

References are split so the agent loads only what it needs:

- project toolchain;
- readability gate;
- comment rules;
- AI SDK/stream review;
- package boundaries;
- eval prompts.

Scripts are optional and must not replace repo-native checks.

## Quality rule

The skill should make the agent behave better, not just teach a human. That means concrete triggers, commands, thresholds, examples, “do not” rules, and report formats are more important than long background essays.
