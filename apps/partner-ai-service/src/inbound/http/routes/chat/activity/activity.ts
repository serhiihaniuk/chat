import type { SidechatRepositories } from "@side-chat/db";
import type { Hono } from "hono";

import type { AuthContextVariables } from "../../../middleware/auth-context.js";
import { streamActivitySseResponse } from "../../../response/sse.js";
import { requireContextAuth } from "../../types.js";
import { createActivitySubscriptionStream } from "#inbound/turn-stream/activity/activity-subscription-stream";
import type { TurnActivityDispatcher } from "#inbound/turn-stream/activity/turn-activity-dispatcher";

export type ActivityRouteDependencies = {
  readonly repositories: SidechatRepositories;
  readonly dispatcher: TurnActivityDispatcher;
};

/**
 * Add `GET /chat/activity`.
 *
 * A subject-scoped SSE stream of turn lifecycle: a snapshot of currently-running
 * turns on connect, then live transitions, so the widget can show a "generating"
 * dot on every conversation with an in-flight turn — even ones the user is not
 * viewing. Scope comes from the auth context, never the URL, so a client only ever
 * sees its own turns. The stream stays open until the browser disconnects, which
 * cancels the response and releases the dispatcher subscription.
 */
export const registerActivityRoutes = (
  app: Hono<AuthContextVariables>,
  dependencies: ActivityRouteDependencies,
) => {
  app.get("/chat/activity", (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const events = createActivitySubscriptionStream(
      { dispatcher: dependencies.dispatcher, repositories: dependencies.repositories },
      { workspaceId: authContext.workspaceId, subjectId: authContext.subject.subjectId },
    );
    return streamActivitySseResponse(events, `activity_${authContext.subject.subjectId}`);
  });
};
