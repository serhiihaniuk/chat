/**
 * <TurnTrace /> — an interactive trace of one assistant turn through the current resumable,
 * server-owned pipeline, in the style of a timeline. The reader steps along a hop track (click,
 * Prev/Next, or arrow keys); a large stage card shows the active hop, and a durable-event-log panel
 * fills in with the sidechat.v1 events as the turn streams. A boundary marks where generation forks
 * onto a server-owned fiber — before it a failure is a JSON error; after it, a terminal event.
 */
import {
  Fragment,
  useCallback,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../lib/cn";

type Layer = "Browser" | "Service" | "Core" | "Runtime" | "DB";
type PhaseId = "pre-start" | "generation" | "stream" | "finalize";
type StepState = "active" | "passed" | "future";

interface Phase {
  readonly id: PhaseId;
  readonly label: string;
  readonly blurb: string;
  readonly color: string;
}

interface Step {
  readonly name: string;
  readonly layer: Layer;
  readonly phase: PhaseId;
  readonly file: string;
  readonly detail: string;
}

/** One sidechat.v1 event, shown in the log once the trace passes the step (`at`, 1-based) that emits it. */
interface Frame {
  readonly seq: number;
  readonly ev: string;
  readonly tx: string;
  readonly at: number;
}

const PHASES: readonly Phase[] = [
  {
    id: "pre-start",
    label: "Pre-start",
    color: "#3b82f6",
    blurb: "Runs synchronously inside POST /chat/runs. Any failure here rejects the request as JSON.",
  },
  {
    id: "generation",
    label: "Generation",
    color: "#8b5cf6",
    blurb: "Runs on a server-owned fiber, with no browser attached. It outlives the request.",
  },
  {
    id: "stream",
    label: "Stream",
    color: "#0d9488",
    blurb: "GET …/stream replays the durable log, then tails live events. Reconnect-safe.",
  },
  {
    id: "finalize",
    label: "Finalize",
    color: "#d97706",
    blurb: "Effect.onExit writes the terminal state — even on crash, timeout, or cancel.",
  },
];

const STEPS: readonly Step[] = [
  {
    name: "Parse & brand the request",
    layer: "Service",
    phase: "pre-start",
    file: "inbound/http/routes/chat/runs/chat-runs.ts",
    detail:
      "Validate the ChatStreamRequest JSON and brand its ids. Malformed input is rejected here as a JSON error, before any work begins.",
  },
  {
    name: "Authorize the subject",
    layer: "Core",
    phase: "pre-start",
    file: "partner-ai-core · application/stream-chat",
    detail:
      "Confirm the caller may act in this workspace and conversation before anything else runs.",
  },
  {
    name: "Resolve the turn plan",
    layer: "Core",
    phase: "pre-start",
    file: "stream-chat/turn · profile + model policy",
    detail:
      "Pick the assistant profile, the model policy, and the tool allowlist that govern this turn.",
  },
  {
    name: "Guard the input",
    layer: "Core",
    phase: "pre-start",
    file: "stream-chat · turn guards",
    detail: "Run turn guards on Maya's raw text — before any context or model call exists.",
  },
  {
    name: "Ensure conversation & append the message",
    layer: "DB",
    phase: "pre-start",
    file: "db · records/conversations + messages",
    detail: "Upsert the conversation, then persist Maya's message with role `user`.",
  },
  {
    name: "Start the assistant turn",
    layer: "DB",
    phase: "pre-start",
    file: "db · records/turns.ts → startAssistantTurn",
    detail:
      "Insert the assistant_turns row as `running`, idempotent on requestId. The turn is now durable.",
  },
  {
    name: "Prepare context",
    layer: "Core",
    phase: "pre-start",
    file: "stream-chat · context preparation",
    detail: "Assemble the model-ready message list within the token budget.",
  },
  {
    name: "Emit started (sequence 0)",
    layer: "Core",
    phase: "pre-start",
    file: "stream-chat/protocol/protocol-event-stream.ts",
    detail:
      "Record the first protocol event. This is the fence between pre-start (sync, JSON errors) and generation (async).",
  },
  {
    name: "Fork generation onto a server-owned fiber",
    layer: "Service",
    phase: "pre-start",
    file: "inbound/turn-runner/turn-runner.ts → FiberMap.run",
    detail:
      "Detach generation onto a fiber keyed by assistantTurnId. It now runs to a terminal even if the browser disconnects.",
  },
  {
    name: "Return the turn identity",
    layer: "Service",
    phase: "pre-start",
    file: "inbound/http/routes/chat/runs/chat-runs.ts",
    detail:
      "POST /chat/runs responds 200 with JSON { assistantTurnId, conversationId, requestId, status: 'running' } — never SSE.",
  },
  {
    name: "Acquire the owner lease + heartbeat",
    layer: "Core",
    phase: "generation",
    file: "stream-chat/protocol/lease/turn-lease-heartbeat.ts",
    detail:
      "CAS this instance as the turn's owner with a lease epoch; a heartbeat renews it and self-interrupts if the reaper or a new owner fences it.",
  },
  {
    name: "Run the tool loop",
    layer: "Runtime",
    phase: "generation",
    file: "agent-runtime · runtime/ai-sdk",
    detail:
      "Stream RuntimeEvents from the provider — deltas, reasoning, and tool calls (search Jira) — feeding each tool result back to the model.",
  },
  {
    name: "Map runtime events → protocol events",
    layer: "Core",
    phase: "generation",
    file: "stream-chat/protocol/runtime-event-mapper.ts",
    detail:
      "Convert each RuntimeEvent into a sidechat.v1 event with a sequence number; the state machine rejects illegal transitions.",
  },
  {
    name: "Append each event to the durable log",
    layer: "DB",
    phase: "generation",
    file: "db · records/turn-events.ts → appendStreamEvent",
    detail:
      "Insert every event into turn_events, then pg_notify. The log — not the connection — is the source of truth.",
  },
  {
    name: "Subscribe: replay, then tail",
    layer: "Service",
    phase: "stream",
    file: "inbound/turn-stream/turn-subscription-stream.ts",
    detail:
      "GET /chat/turns/:id/stream?after=<seq> replays the log past `after`, tails live events as SSE, and ends at the terminal event. A reconnect just resumes here.",
  },
  {
    name: "Finalize & persist the terminal",
    layer: "Core",
    phase: "finalize",
    file: "stream-chat/protocol/finalization/finalize-turn-generation.ts",
    detail:
      "Effect.onExit completes or fails the turn and appends a conflict-free synthetic terminal if the fiber died mid-flight. The reaper is the backstop for a dead instance.",
  },
];

const FRAMES: readonly Frame[] = [
  { seq: 0, ev: "sidechat.started", tx: "stream opens", at: 8 },
  { seq: 1, ev: "sidechat.activity", tx: "running · Searching Jira", at: 12 },
  { seq: 2, ev: "sidechat.activity", tx: "completed · 2 results + sources", at: 13 },
  { seq: 3, ev: "sidechat.delta", tx: '"Here are your open tickets:"', at: 14 },
  { seq: 4, ev: "sidechat.completed", tx: "usage · in 312 · out 48", at: 16 },
];

/** Index of the last pre-start step; generation forks right after it. */
const FORK_AFTER_INDEX = 9;

const PHASE_BY_ID = Object.fromEntries(PHASES.map((phase) => [phase.id, phase])) as Record<
  PhaseId,
  Phase
>;

const FUTURE_NODE = "bg-fd-muted text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground";

const nodeStyle = (state: StepState, color: string): CSSProperties | undefined => {
  if (state === "active") {
    return {
      backgroundColor: color,
      color: "#fff",
      boxShadow: `0 0 0 2px var(--color-fd-card), 0 0 0 4px ${color}`,
    };
  }
  if (state === "passed") return { backgroundColor: `${color}26`, color };
  return undefined;
};

export function TurnTrace(): ReactElement {
  const [active, setActive] = useState(0);
  const activeStep = STEPS[active]!;
  const activePhase = PHASE_BY_ID[activeStep.phase];
  const stepState = (index: number): StepState => {
    if (index === active) return "active";
    if (index < active) return "passed";
    return "future";
  };

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setActive((prev) => Math.min(STEPS.length - 1, prev + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((prev) => Math.max(0, prev - 1));
    }
  }, []);

  return (
    <div
      role="group"
      aria-label="Life of a turn — step-by-step trace"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="not-prose my-6 overflow-hidden rounded-xl border border-fd-border bg-fd-card outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
    >
      {/* Hop track — every step as a node; a boundary marks the fork onto the server-owned fiber. */}
      <div className="overflow-x-auto border-b border-fd-border bg-fd-muted/30 px-5 py-3">
        <div className="mb-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {PHASES.map((phase) => (
            <span
              key={phase.id}
              className="inline-flex items-center gap-1.5 text-2xs font-medium text-fd-muted-foreground"
            >
              <span className="size-2 rounded-full" style={{ background: phase.color }} aria-hidden />
              {phase.label}
            </span>
          ))}
        </div>
        <div className="flex min-w-max items-center gap-1">
          {STEPS.map((step, index) => {
            const phase = PHASE_BY_ID[step.phase];
            const state = stepState(index);
            const node = (
              <button
                key={step.name}
                type="button"
                title={step.name}
                aria-label={`Step ${index + 1}: ${step.name}`}
                aria-current={state === "active"}
                onClick={() => setActive(index)}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold tabular-nums transition-colors",
                  state === "future" && FUTURE_NODE,
                )}
                style={nodeStyle(state, phase.color)}
              >
                {index + 1}
              </button>
            );
            if (index === FORK_AFTER_INDEX) {
              return (
                <Fragment key="fork-boundary">
                  {node}
                  <span className="mx-1 flex shrink-0 flex-col items-center gap-0.5" aria-hidden>
                    <span className="text-2xs font-medium text-fd-muted-foreground">fork</span>
                    <span className="h-5 w-px bg-fd-border" />
                  </span>
                </Fragment>
              );
            }
            return node;
          })}
        </div>
      </div>

      {/* Stage — the active hop, large. */}
      <div className="flex items-start gap-4 px-5 py-4">
        <span
          className="text-4xl font-bold leading-none tabular-nums"
          style={{ color: activePhase.color }}
        >
          {String(active + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-fd-foreground">{activeStep.name}</span>
            <span className="rounded bg-fd-muted px-1.5 py-0.5 text-2xs font-medium text-fd-muted-foreground">
              {activeStep.layer}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-2xs font-semibold"
              style={{ backgroundColor: `${activePhase.color}1a`, color: activePhase.color }}
            >
              {activePhase.label}
            </span>
          </div>
          <code className="mt-1 block text-2xs text-fd-primary">{activeStep.file}</code>
          <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{activeStep.detail}</p>
        </div>
      </div>

      {/* Durable event log — the sidechat.v1 events, lighting up as the trace passes the step that emits each. */}
      <div className="border-t border-fd-border px-5 py-3">
        <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
          Durable event log
        </div>
        <div className="flex flex-col gap-1 font-mono text-2xs">
          {FRAMES.map((frame) => {
            const emitted = active + 1 >= frame.at;
            return (
              <div
                key={frame.seq}
                className={cn(
                  "flex items-baseline gap-2 transition-opacity",
                  emitted ? "opacity-100" : "opacity-30",
                )}
              >
                <span className="w-11 shrink-0 text-fd-muted-foreground">seq {frame.seq}</span>
                <code className="shrink-0 text-fd-primary">{frame.ev}</code>
                <span className="truncate text-fd-muted-foreground">{frame.tx}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 border-t border-fd-border bg-fd-muted/30 px-5 py-3">
        <button
          type="button"
          disabled={active === 0}
          onClick={() => setActive((prev) => Math.max(0, prev - 1))}
          className="inline-flex items-center gap-1 rounded-md border border-fd-border px-2 py-1 text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </button>
        <span className="font-mono text-xs tabular-nums text-fd-muted-foreground">
          Step {active + 1} / {STEPS.length}
        </span>
        <button
          type="button"
          disabled={active === STEPS.length - 1}
          onClick={() => setActive((prev) => Math.min(STEPS.length - 1, prev + 1))}
          className="inline-flex items-center gap-1 rounded-md border border-fd-border px-2 py-1 text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Next
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      <div className="border-t border-fd-border px-5 py-2.5">
        <p className="text-2xs leading-relaxed text-fd-muted-foreground">
          Before the <span className="font-medium text-fd-foreground">fork</span>, a failure rejects
          the request as JSON and no turn starts. After it the turn is server-owned: failures land as a
          terminal <code>sidechat.error</code> in the durable log, and any client can resubscribe with{" "}
          <code>?after=&lt;seq&gt;</code>.
        </p>
      </div>
    </div>
  );
}
