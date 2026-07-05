import { describe, expect, it } from "vitest";

import { defaultWidgetLabels } from "#shared/lib/widget-labels";
import { groupConversationsByDate } from "./conversation-options.js";

// Local noon `daysAgo` days back — avoids DST/midnight edges so the day-bucket is stable.
const dayAt = (daysAgo: number): string => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
};

describe("groupConversationsByDate", () => {
  it("buckets conversations into ordered date groups with Recent first", () => {
    const groups = groupConversationsByDate(
      [
        { id: "a", title: "today", lastMessageAt: dayAt(0) },
        { id: "b", title: "yesterday", lastMessageAt: dayAt(1) },
        { id: "c", title: "week", lastMessageAt: dayAt(3) },
        { id: "d", title: "month", lastMessageAt: dayAt(10) },
        { id: "e", title: "older", lastMessageAt: dayAt(60) },
      ],
      defaultWidgetLabels,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Recent",
      "Yesterday",
      "Previous 7 days",
      "Previous 30 days",
      "Older",
    ]);
    expect(groups.map((group) => group.conversations.map((c) => c.id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
      ["e"],
    ]);
  });

  it("omits empty groups and treats missing timestamps as Older", () => {
    const groups = groupConversationsByDate(
      [
        { id: "x", title: "today", lastMessageAt: dayAt(0) },
        { id: "y", title: "no date" },
      ],
      defaultWidgetLabels,
    );

    expect(groups.map((group) => group.label)).toEqual(["Recent", "Older"]);
  });
});
