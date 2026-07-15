import {
  decodeTurnActivitySseEvents,
  type TurnActivityStreamEvent,
} from "@side-chat/chat-protocol";

import { openWorkflowActivityStream, type WorkflowChatClient } from "#entities/workflow-chat";
import { decodeSseEventStream } from "#shared/lib/sse/sse-event-stream";

/** Keep subject-wide lifecycle decoding at the widget layer that consumes it. */
export async function subscribeWorkflowActivity(
  client: WorkflowChatClient,
  signal?: AbortSignal,
): Promise<Readonly<{ events: AsyncIterable<TurnActivityStreamEvent> }>> {
  const body = await openWorkflowActivityStream(client, signal);
  return {
    events: decodeSseEventStream(body, () => signal?.throwIfAborted(), decodeTurnActivitySseEvents),
  };
}
