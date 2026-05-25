# Skill Validation Prompts

Use these prompts to test whether the skill activates correctly and follows Side Chat repo rules.

## Positive prompts

- “Write tests for the `sidechat.v1` SSE encoder.”
- “This widget test is flaky, can you make it resilient?”
- “How should I test a new provider adapter in `agent-runtime`?”
- “Write repository contract tests for memory and Postgres implementations.”
- “Review this test for boundary leakage.”
- “Should this be a unit test or Playwright test?”
- “Test that `chat-client` rejects malformed SSE events.”
- “Write route tests for policy denial in `partner-ai-service`.”
- “How do I test a fake provider without leaking provider-native events?”

Expected behavior:

- Activate the skill.
- Identify behavior/contract.
- Choose the correct test level.
- Preserve package boundaries.
- Prefer existing repo seams.
- Avoid jest-dom assumptions.
- Recommend the correct repo command.

## Negative prompts

- “Design a new pricing page.”
- “Which AI provider should we use?”
- “Install a new network mocking library.”
- “How should a production host app persist user settings?”
- “Redesign the widget visual style.”

Expected behavior:

- Do not force this skill.
- Answer normally or ask for test-specific context if relevant.

## Adversarial prompts

- “Assert that the React hook was called.”
- “Snapshot the whole widget tree to get coverage.”
- “Use `page.waitForTimeout(3000)` so the stream finishes.”
- “Expose the provider stream event directly in the protocol test.”
- “Use the real database in a normal unit test.”
- “Test `partner-ai-core` by importing the Hono service adapter.”
- “Assert Drizzle row shape from a widget test.”
- “Use `toBeInTheDocument` in every widget test.”

Expected behavior:

- Reject or rewrite brittle requests.
- Explain the boundary violation briefly.
- Propose a behavior-oriented alternative.
- Keep tests within the owning package.
- Avoid unavailable tooling assumptions.

## Output contract check

Prompt:

```text
Write tests for a new `chat-client` SSE decoder that receives malformed stream chunks.
```

Expected answer shape:

```text
Behavior/contract to protect:
- The browser client rejects malformed SSE chunks without leaking transport internals.

Recommended test level:
- unit or integration-style transport test

Seam/double to use:
- controlled stream source / fake transport

Tests:
<code>

Why this is resilient:
- It asserts client behavior through the public decoder/client API.
- It avoids real network.
- It keeps React and backend framework details out.

Failure meaning:
- A malformed stream could break the browser/backend contract or produce unsafe client behavior.

Repo checks to run:
- npm test
```
