# Eval Prompts for This Skill

Use these prompts in a scratch repository to test trigger behavior and output quality.

## Should trigger

1. "Add useful comments to this exported utility without over-commenting it."
2. "Review this diff for stale or misleading comments."
3. "Clean up noisy comments in this file."
4. "Add TSDoc to public functions that need caller-visible contracts."
5. "This async code has a race condition guard; add a comment that explains the invariant."
6. "Check whether comments in this PR match the code behavior."

Expected behavior: the agent reads relevant code/tests, edits or reviews comments only, avoids restating code, and reports uncertainty when rationale is not inferable.

## Should not trigger automatically

1. "Write a README for this package."
2. "Summarize the architecture of this service."
3. "Generate release notes from this diff."
4. "Explain this code to a beginner."
5. "Create user-facing API documentation for the website."

Expected behavior: the skill stays inactive unless the user specifically asks for code-level comments/docstrings.

## Must-pass quality checks

- Does not invent rationale that is absent from code/tests/context.
- Deletes or flags redundant comments instead of rewriting all comments.
- Distinguishes interface comments from implementation comments.
- Adds non-guarantees where caller misuse is likely.
- Final response is concise and operational, not a philosophy lesson.
- Does not mention the book or this skill inside code comments.
