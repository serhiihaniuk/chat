import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeWidgetConversationTitle,
  type RefreshConversations,
  type WidgetConversationSummary,
} from "#entities/conversation";
import {
  refreshConversationsAfterStream,
  TITLE_REFRESH_MAX_RETRIES,
} from "./widget-title-refresh.js";

const summary = (id: string, title: string): WidgetConversationSummary => ({
  id,
  title,
  status: "active",
  lastMessageAt: "2026-07-05T00:00:00.000Z",
});

// A refresh stub that returns each queued list in turn (repeating the last), and
// reports how many list reads happened.
const stubRefresh = (
  lists: readonly (readonly WidgetConversationSummary[])[],
): { readonly fn: RefreshConversations; readonly calls: () => number } => {
  let call = 0;
  const fn: RefreshConversations = () => {
    const result = lists[Math.min(call, lists.length - 1)] ?? [];
    call += 1;
    return Promise.resolve(result);
  };
  return { fn, calls: () => call };
};

describe("refreshConversationsAfterStream title poll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the list once when the generated title already replaced the fallback", async () => {
    const { fn, calls } = stubRefresh([[summary("c1", "Generated title")]]);

    await refreshConversationsAfterStream({
      activeConversationId: "c1",
      fallbackTitle: "hello there",
      refreshConversations: fn,
      setErrorMessage: vi.fn<(value: unknown) => void>(),
    });

    expect(calls()).toBe(1);
  });

  it("retries once after a delay while the row still shows the fallback title", async () => {
    const fallback = normalizeWidgetConversationTitle("hello there");
    const { fn, calls } = stubRefresh([
      [summary("c1", fallback)], // the async title has not landed yet
      [summary("c1", "Generated title")], // it lands by the delayed re-read
    ]);

    const done = refreshConversationsAfterStream({
      activeConversationId: "c1",
      fallbackTitle: "hello there",
      refreshConversations: fn,
      setErrorMessage: vi.fn<(value: unknown) => void>(),
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await done;

    expect(calls()).toBe(2);
  });

  it("keeps re-reading until the generated title lands mid-poll", async () => {
    const fallback = normalizeWidgetConversationTitle("hello there");
    // Fallback on the first three reads, then the generated title arrives.
    const { fn, calls } = stubRefresh([
      [summary("c1", fallback)],
      [summary("c1", fallback)],
      [summary("c1", fallback)],
      [summary("c1", "Generated title")],
    ]);

    const done = refreshConversationsAfterStream({
      activeConversationId: "c1",
      fallbackTitle: "hello there",
      refreshConversations: fn,
      setErrorMessage: vi.fn<(value: unknown) => void>(),
    });
    await vi.advanceTimersByTimeAsync(TITLE_REFRESH_MAX_RETRIES * 1_500);
    await done;

    // Three fallback reads plus the one that finally sees the title, then it stops.
    expect(calls()).toBe(4);
  });

  it("stops after the bounded retry count when the title never lands", async () => {
    const fallback = normalizeWidgetConversationTitle("hello there");
    const { fn, calls } = stubRefresh([[summary("c1", fallback)]]);

    const done = refreshConversationsAfterStream({
      activeConversationId: "c1",
      fallbackTitle: "hello there",
      refreshConversations: fn,
      setErrorMessage: vi.fn<(value: unknown) => void>(),
    });
    await vi.advanceTimersByTimeAsync(TITLE_REFRESH_MAX_RETRIES * 1_500);
    await done;

    // One initial read plus the bounded retries, and no more.
    expect(calls()).toBe(TITLE_REFRESH_MAX_RETRIES + 1);
  });
});
