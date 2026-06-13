# Comment Review Rubric

Use this for PR review, bulk comment cleanup, or comment-quality audits.

## Severity labels

- `bug`: comment contradicts behavior and can cause wrong usage or unsafe edits.
- `stale`: comment describes old behavior but likely does not break callers directly.
- `misleading`: comment is technically plausible but omits a critical constraint or non-guarantee.
- `missing-contract`: public/shared API lacks a contract that callers need.
- `redundant`: comment repeats code, name, or type without adding useful knowledge.
- `style`: comment is useful but too vague, too long, misplaced, or inconsistent with repo style.

## Audit sequence

1. Inspect exported/shared symbols first.
2. Inspect comments near complex control flow, async behavior, caching, retries, batching, sorting, rounding, time zones, permissions, security, and external APIs.
3. Compare comments to tests and actual code paths.
4. Identify stale comments before adding new comments.
5. Prefer deleting redundant comments to rewriting them.
6. Add contract comments where lack of information can cause caller misuse.

## Must-fix findings

Flag these strongly:

- comment promises uniqueness, ordering, persistence, sync timing, or idempotency that code does not guarantee;
- comment says no side effects while code mutates state, performs I/O, logs analytics, caches, schedules work, or throws;
- interface comment exposes private details but omits caller-visible contract;
- implementation comment says what happens but not why a fragile constraint exists;
- TODO has no action, no trigger, and no context;
- comment contradicts tests or current behavior.

## Suggested finding format

````md
`src/accounts/getAccountLabel.ts:12` — missing-contract

The function is exported and used by search and navigation, but the comment does
not say whether the label is unique. Callers may accidentally key rows by it.

Suggested replacement:
```ts
/**
 * Returns the account label shown in search results and navigation.
 *
 * The label is display-safe but not guaranteed to be unique. Use account.id for
 * keys, selection, and persistence.
 */
```
````

## Deletion finding format

```md
`src/cart/total.ts:18` — redundant

The comment repeats the expression and does not add contract, rationale, or an
invariant. Delete it.
```

## Bulk cleanup policy

When many comments are weak, prioritize:

1. delete misleading/stale comments;
2. add missing public contracts;
3. add internal rationale for risky logic;
4. leave harmless style preferences alone unless already touching the file.
