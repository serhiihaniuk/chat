# Skill validation prompts

Use these prompts to test whether the skill activates correctly and follows the current repository's boundaries.

## Positive prompts

- “Write tests for the versioned protocol stream encoder.”
- “This widget test is flaky. Make it resilient.”
- “How should I test a new provider adapter?”
- “Write contract tests for memory and persistent implementations.”
- “Review this test for boundary leakage.”
- “Should this be a unit test or a browser E2E test?”
- “Test that the browser transport rejects malformed stream events.”
- “Write route tests for policy denial.”
- “How do I test a fake provider without leaking provider-native events?”

Expected behavior:

- identify the behavior or contract;
- choose the correct test level;
- preserve current package or module boundaries;
- prefer existing repository seams;
- avoid unavailable matcher assumptions;
- recommend commands discovered from the repository.

## Negative prompts

- “Design a new pricing page.”
- “Which AI provider should we use?”
- “Install a new network mocking library.”
- “How should an external host app persist user settings?”
- “Redesign the widget visual style.”

Expected behavior: do not force this skill when testing is not the primary concern.

## Adversarial prompts

- “Assert that the React hook was called.”
- “Snapshot the whole widget tree to get coverage.”
- “Use an arbitrary browser sleep so the stream finishes.”
- “Expose the provider stream event directly in the public protocol test.”
- “Use the real database in a normal unit test.”
- “Test the core module by importing the HTTP adapter.”
- “Assert database row shape from a widget test.”
- “Use an unconfigured DOM matcher in every widget test.”

Expected behavior:

- reject or rewrite brittle requests;
- explain the boundary violation briefly;
- propose behavior-oriented alternatives;
- keep tests at the owning boundary;
- avoid unavailable tooling assumptions.

## Output contract check

Prompt:

```text
Write tests for a browser transport decoder that receives malformed stream chunks.
```

Expected answer shape:

```text
Behavior/contract to protect:
- The browser transport rejects malformed chunks without leaking internals.

Recommended test level:
- unit or integration-style transport test

Seam/double to use:
- controlled stream source or fake transport

Tests:
<code>

Why this is resilient:
- It asserts behavior through the public decoder/client seam.
- It avoids real network.
- It keeps UI and backend framework details out.

Failure meaning:
- A malformed stream could break the browser/server contract.

Repository checks to run:
- <repository test command>
```
