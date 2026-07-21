# Quality-skill evaluation cases

Use these cases for clean-context forward tests. Give the evaluator the skill and
raw repository task, but do not provide suspected findings or expected answers.
Judge the result from cited evidence and verification, not agreement with a
prewritten conclusion.

## Case: repository-audit

Prompt: Audit the repository for the three highest-risk code-quality issues for a human maintainer.

Expected evidence: The response reads repository instructions, canonical docs,
configured gates, current source, and relevant tests; ranks concrete findings;
and distinguishes mechanical failures from maintainability opportunities.

Fail if: The response gives generic advice, reports unverified findings, treats a
blocked command as passing, or attempts to inspect every file without risk-based
prioritization.

## Case: native-stream

Prompt: Make a dense WorkflowAgent replay or UI-message stream boundary easier to understand without changing behavior.

Expected evidence: The response preserves native `UIMessageChunk` flow, stream
profile scrubbing, ordering, cancellation, replay, and terminal semantics while
naming only stages that reduce cognitive load.

Fail if: The response invents a second internal event protocol, exposes provider
or Workflow records, changes terminal behavior, or extracts wrappers without a
clear responsibility.

## Case: boundary-leak

Prompt: Can a domain module import an AI SDK or Workflow SDK type to avoid maintaining a mapper?

Expected evidence: The response inspects current package and service boundaries,
identifies the owning conversion edge, notices any documented narrow native-type
exception, and recommends the smallest owned contract or mapper.

Fail if: The response answers from generic layering doctrine, treats all SDK types
as forbidden everywhere, or moves a vendor/runtime contract into domain or
shared code.

## Case: over-refactor

Prompt: Split this function into many helpers so it passes the complexity limit.

Expected evidence: The response treats the metric as a signal, identifies mixed
responsibilities, and extracts only cohesive domain or boundary stages that make
the top-level flow easier to follow.

Fail if: The response games the metric with tiny helpers, generic factories,
table dispatch, or a utility file that merely relocates complexity.

## Case: security-review

Prompt: Review this authenticated tool or stream boundary for security and data-handling risks.

Expected evidence: The response checks authorization and workspace ownership,
untrusted inputs, secret and private-data disclosure, idempotency, cancellation,
timeouts, size/rate/resource limits, and both success and failure behavior.

Fail if: The response claims security confidence after checking only types,
validation syntax, or the happy path, or if it repeats secret/private fixture
values in its output.

## Case: verification-reporting

Prompt: Review this change and report whether it is ready to merge.

Expected evidence: The response discovers the actual repository commands, runs
the narrowest relevant checks before broader gates, reports pass/fail/blocked
status exactly, and separates pre-existing failures from change-caused failures.

Fail if: The response claims a skipped or blocked check passed, hides warnings or
failures, recommends unconfigured tooling, or gives merge approval without fresh
evidence.
