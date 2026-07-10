/**
 * <TurnExplorer /> — the "architecture explorer": one assistant turn as a swimlane matrix. Lanes
 * (Browser · Service · Core · Runtime · DB) run down the side; the 16 hops run across the top, grouped
 * into phase bands; each hop's card sits in the lane that owns it, so the turn reads as a staircase
 * across the lanes. Click a hop (or a minimap cell), use Prev/Next, or arrow keys; the active hop's
 * detail shows below and the matrix scrolls it into view.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../lib/cn";

type LaneId = "browser" | "service" | "core" | "runtime" | "db";
type PhaseId = "pre-start" | "generation" | "stream" | "finalize";

interface Lane {
  readonly id: LaneId;
  readonly label: string;
  readonly color: string;
}

interface Phase {
  readonly id: PhaseId;
  readonly label: string;
  readonly color: string;
}

interface Hop {
  readonly name: string;
  readonly lane: LaneId;
  readonly phase: PhaseId;
  readonly pkg: string;
  readonly fn: string;
  readonly file: string;
  readonly detail: string;
}

const LANES: readonly Lane[] = [
  { id: "browser", label: "Browser", color: "#3b82f6" },
  { id: "service", label: "Service", color: "#d97706" },
  { id: "core", label: "Core", color: "#0d9488" },
  { id: "runtime", label: "Runtime", color: "#8b5cf6" },
  { id: "db", label: "DB", color: "#16a34a" },
];

const PHASES: readonly Phase[] = [
  { id: "pre-start", label: "Pre-start", color: "#3b82f6" },
  { id: "generation", label: "Generation", color: "#8b5cf6" },
  { id: "stream", label: "Stream", color: "#0d9488" },
  { id: "finalize", label: "Finalize", color: "#d97706" },
];

const HOPS: readonly Hop[] = [
  {
    name: "Parse & brand the request",
    lane: "service",
    phase: "pre-start",
    pkg: "partner-ai-service",
    fn: "POST /chat/runs",
    file: "inbound/http/routes/chat/runs/chat-runs.ts",
    detail:
      "Validate the ChatStreamRequest JSON and brand its ids. Malformed input is rejected here as a JSON error, before any work begins.",
  },
  {
    name: "Authorize the subject",
    lane: "core",
    phase: "pre-start",
    pkg: "partner-ai-core",
    fn: "assertWorkspaceAuthority()",
    file: "application/stream-chat",
    detail: "Confirm the caller may act in this workspace and conversation before anything else runs.",
  },
  {
    name: "Record request received",
    lane: "core",
    phase: "pre-start",
    pkg: "partner-ai-core",
    fn: "recordStreamObservation()",
    file: "stream-chat/observability",
    detail:
      "Record correlation and observation before any runtime or persistence work begins.",
  },
  {
    name: "Resolve the turn plan",
    lane: "core",
    phase: "pre-start",
    pkg: "partner-ai-core",
    fn: "resolveAllowedTurnPlan()",
    file: "stream-chat/turn/turn-policy-plan.ts",
    detail:
      "Pick the assistant profile, model policy, tool allowlist, executor, and instructions for this turn.",
  },
  {
    name: "Run turn guards",
    lane: "core",
    phase: "pre-start",
    pkg: "partner-ai-core",
    fn: "runSelectedTurnGuards()",
    file: "stream-chat/run-turn-guards.ts",
    detail: "Run selected guards before private context, persistence, tools, or provider work.",
  },
  {
    name: "Ensure the conversation",
    lane: "db",
    phase: "pre-start",
    pkg: "db",
    fn: "ensureConversation()",
    file: "db · records/conversations.ts",
    detail: "Load or create only a conversation this subject may access.",
  },
  {
    name: "Reject a concurrent turn",
    lane: "core",
    phase: "pre-start",
    pkg: "partner-ai-core",
    fn: "guardConcurrentConversationTurn()",
    file: "stream-chat/turn/prepare-stream-chat-turn.ts",
    detail:
      "Return `conversation_busy` when this conversation already has a running assistant turn.",
  },
  {
    name: "Append the user message",
    lane: "db",
    phase: "pre-start",
    pkg: "db",
    fn: "appendMessage()",
    file: "db · records/messages.ts",
    detail: "Persist Maya's visible message with the server-assigned `user` role.",
  },
  {
    name: "Start the assistant turn",
    lane: "db",
    phase: "pre-start",
    pkg: "db",
    fn: "startAssistantTurn()",
    file: "db · records/turns.ts",
    detail:
      "Insert the assistant_turns row as `running`, idempotent on requestId.",
  },
  {
    name: "Prepare and record context",
    lane: "core",
    phase: "pre-start",
    pkg: "partner-ai-core",
    fn: "prepareTurnContext()",
    file: "stream-chat · context preparation",
    detail: "Assemble history, host context, tool context, and the manifest snapshot.",
  },
  {
    name: "Fork generation and register the live turn",
    lane: "service",
    phase: "pre-start",
    pkg: "partner-ai-service",
    fn: "FiberMap.run() + registerTurn()",
    file: "inbound/turn-runner/turn-runner.ts",
    detail:
      "Fork generation onto a fiber keyed by assistantTurnId, then register the fresh turn before the POST response subscribes.",
  },
  {
    name: "Acquire the owner lease and emit started",
    lane: "core",
    phase: "generation",
    pkg: "partner-ai-core",
    fn: "drainUnderOwnerLease()",
    file: "stream-chat/protocol/lease/turn-lease-heartbeat.ts",
    detail:
      "Fence this instance as owner, then append sidechat.started at sequence 0 to the local registry.",
  },
  {
    name: "Run the tool loop",
    lane: "runtime",
    phase: "generation",
    pkg: "agent-runtime",
    fn: "ToolLoopAgent",
    file: "agent-runtime · runtime/ai-sdk",
    detail:
      "Stream RuntimeEvents from the provider — deltas, reasoning, and tool calls (search Jira) — feeding each tool result back to the model.",
  },
  {
    name: "Map runtime events → protocol events",
    lane: "core",
    phase: "generation",
    pkg: "partner-ai-core",
    fn: "mapRuntimeEvent()",
    file: "stream-chat/protocol/runtime-event-mapper.ts",
    detail:
      "Convert each RuntimeEvent into a sidechat.v1 event with a sequence number; the state machine rejects illegal transitions.",
  },
  {
    name: "Append each event to the live registry",
    lane: "service",
    phase: "generation",
    pkg: "partner-ai-service",
    fn: "append()",
    file: "adapters/persistence/turn-events/in-memory-turn-event-log.ts",
    detail:
      "Buffer each mapped sidechat.v1 event in order and wake subscribers on this instance.",
  },
  {
    name: "Stream the POST response; resume with GET",
    lane: "service",
    phase: "stream",
    pkg: "partner-ai-service",
    fn: "openTurnEventStream()",
    file: "inbound/turn-stream/turn-subscription-stream.ts",
    detail:
      "The POST response replays from sequence -1 and tails as SSE. GET …/stream?after=<seq> resumes only on the owner instance.",
  },
  {
    name: "Finalize & persist the terminal",
    lane: "core",
    phase: "finalize",
    pkg: "partner-ai-core",
    fn: "onExit → finalize",
    file: "stream-chat/protocol/finalization/finalize-turn-generation.ts",
    detail:
      "Effect.onExit persists the final status and message; when needed, the registry terminal guard accepts one synthetic terminal. The reaper covers a dead instance.",
  },
];

const laneById = (id: LaneId): Lane => {
  const lane = LANES.find((candidate) => candidate.id === id);
  if (!lane) throw new Error(`Unknown turn-explorer lane: ${id}`);
  return lane;
};

const phaseById = (id: PhaseId): Phase => {
  const phase = PHASES.find((candidate) => candidate.id === id);
  if (!phase) throw new Error(`Unknown turn-explorer phase: ${id}`);
  return phase;
};

const laneRow = (id: LaneId): number => LANES.findIndex((lane) => lane.id === id);
const hopNumber = (index: number): string => String(index + 1).padStart(2, "0");

/** Consecutive runs of the same phase, for the spanning header bands. */
interface Band {
  readonly phase: Phase;
  readonly start: number;
  readonly count: number;
}
const PHASE_BANDS: readonly Band[] = HOPS.reduce<Band[]>((bands, hop, index) => {
  const last = bands[bands.length - 1];
  if (last && last.phase.id === hop.phase) {
    bands[bands.length - 1] = { ...last, count: last.count + 1 };
  } else {
    bands.push({ phase: phaseById(hop.phase), start: index, count: 1 });
  }
  return bands;
}, []);

const FIRST_GRID_ROW = 3; // row 1 = phase bands, row 2 = hop numbers, rows 3+ = lanes

export function TurnExplorer(): ReactElement | null {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeCardRef = useRef<HTMLButtonElement>(null);
  const activeHop = HOPS[active] ?? HOPS[0];
  if (!activeHop) return null;
  const activeLane = laneById(activeHop.lane);
  const activePhase = phaseById(activeHop.phase);

  useEffect(() => {
    const container = scrollRef.current;
    const card = activeCardRef.current;
    if (!container || !card) return;
    const target = card.offsetLeft - container.clientWidth / 2 + card.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [active]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setActive((prev) => Math.min(HOPS.length - 1, prev + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((prev) => Math.max(0, prev - 1));
    }
  }, []);

  const gridColumns = `7rem repeat(${HOPS.length}, 10rem)`;
  const lastLaneRow = FIRST_GRID_ROW + LANES.length;

  return (
    <div
      role="group"
      aria-label="Life of a turn — architecture explorer"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="not-prose my-6 overflow-hidden rounded-xl border border-fd-border bg-fd-card outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
    >
      <div className="border-b border-fd-border bg-fd-muted/30 px-4 py-2.5">
        <span className="text-2xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
          Life of a turn · architecture explorer
        </span>
      </div>

      {/* Swimlane matrix — lanes × hops. Horizontal scroll; lane labels stick to the left. */}
      <div ref={scrollRef} className="overflow-x-auto">
        <div
          className="relative grid items-start gap-1.5 p-3"
          style={{ gridTemplateColumns: gridColumns, gridAutoRows: "minmax(0, auto)" }}
        >
          {/* active-hop column highlight, behind the cards */}
          <div
            aria-hidden
            className="pointer-events-none self-stretch rounded-lg bg-fd-accent/50"
            style={{ gridColumn: active + 2, gridRow: `2 / ${lastLaneRow}` }}
          />

          {/* corner */}
          <div className="sticky left-0 z-20 bg-fd-card" style={{ gridColumn: 1, gridRow: "1 / 3" }} />

          {/* phase bands (row 1) */}
          {PHASE_BANDS.map((band) => (
            <div
              key={band.phase.id}
              className="flex items-center gap-2 self-stretch rounded-md px-2 py-1 text-2xs font-semibold uppercase tracking-wide"
              style={{
                gridColumn: `${band.start + 2} / span ${band.count}`,
                gridRow: 1,
                color: band.phase.color,
                backgroundColor: `${band.phase.color}14`,
              }}
            >
              {band.phase.label}
              <span className="font-mono font-normal opacity-70">
                {hopNumber(band.start)}–{hopNumber(band.start + band.count - 1)}
              </span>
            </div>
          ))}

          {/* hop numbers (row 2) */}
          {HOPS.map((hop, index) => (
            <button
              key={`n-${hop.name}`}
              type="button"
              aria-label={`Hop ${index + 1}: ${hop.name}`}
              onClick={() => setActive(index)}
              className="z-10 flex items-center justify-center rounded-md py-1 font-mono text-2xs font-semibold tabular-nums transition-colors hover:bg-fd-accent"
              style={{
                gridColumn: index + 2,
                gridRow: 2,
                color:
                  index === active
                    ? phaseById(hop.phase).color
                    : "var(--color-fd-muted-foreground)",
              }}
            >
              {hopNumber(index)}
            </button>
          ))}

          {/* lane labels (column 1, sticky) */}
          {LANES.map((lane, row) => (
            <div
              key={lane.id}
              className="sticky left-0 z-20 flex items-center gap-1.5 self-stretch bg-fd-card pr-2 text-xs font-medium text-fd-foreground"
              style={{ gridColumn: 1, gridRow: FIRST_GRID_ROW + row }}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: lane.color }} aria-hidden />
              {lane.label}
            </div>
          ))}

          {/* hop cards, each in its lane row + hop column */}
          {HOPS.map((hop, index) => {
            const lane = laneById(hop.lane);
            const selected = index === active;
            const cardStyle: CSSProperties = {
              gridColumn: index + 2,
              gridRow: FIRST_GRID_ROW + laneRow(hop.lane),
              borderColor: selected ? lane.color : undefined,
              boxShadow: selected ? `0 0 0 1px ${lane.color}` : undefined,
            };
            return (
              <button
                key={`c-${hop.name}`}
                ref={selected ? activeCardRef : undefined}
                type="button"
                aria-label={`Hop ${index + 1}: ${hop.name}`}
                aria-current={selected}
                onClick={() => setActive(index)}
                style={cardStyle}
                className={cn(
                  "z-10 flex flex-col gap-1 self-start rounded-lg border bg-fd-card p-2 text-left transition-colors",
                  selected ? "border-transparent" : "border-fd-border hover:border-fd-muted-foreground/40",
                )}
              >
                <span
                  className="text-2xs font-semibold uppercase tracking-wide break-words"
                  style={{ color: lane.color }}
                >
                  {hop.pkg}
                </span>
                <span className="font-mono text-2xs leading-snug break-words text-fd-foreground">
                  {hop.fn}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* active hop detail */}
      <div className="flex items-start gap-3 border-t border-fd-border px-4 py-3">
        <span
          className="font-mono text-2xl font-bold leading-none tabular-nums"
          style={{ color: activeLane.color }}
        >
          {hopNumber(active)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-fd-foreground">{activeHop.name}</span>
            <span
              className="rounded px-1.5 py-0.5 text-2xs font-semibold"
              style={{ backgroundColor: `${activeLane.color}1a`, color: activeLane.color }}
            >
              {activeLane.label}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-2xs font-medium"
              style={{ backgroundColor: `${activePhase.color}1a`, color: activePhase.color }}
            >
              {activePhase.label}
            </span>
          </div>
          <code className="mt-1 block text-2xs text-fd-primary">{activeHop.file}</code>
          <p className="mt-1.5 text-sm leading-relaxed text-fd-muted-foreground">{activeHop.detail}</p>
        </div>
      </div>

      {/* minimap + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-fd-border bg-fd-muted/30 px-4 py-2.5">
        <div className="flex gap-0.5">
          {HOPS.map((hop, index) => {
            const phase = phaseById(hop.phase);
            const selected = index === active;
            return (
              <button
                key={`m-${hop.name}`}
                type="button"
                aria-label={`Hop ${index + 1}: ${hop.name}`}
                onClick={() => setActive(index)}
                title={`${hopNumber(index)} · ${hop.name}`}
                className={cn(
                  "flex h-7 w-3 flex-col justify-center gap-px rounded-sm p-px transition",
                  selected && "ring-1 ring-fd-foreground",
                )}
              >
                {LANES.map((lane) => (
                  <span
                    key={lane.id}
                    className="h-1 w-full rounded-[1px]"
                    style={{
                      background: lane.id === hop.lane ? phase.color : "var(--color-fd-border)",
                    }}
                  />
                ))}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Previous hop"
            disabled={active === 0}
            onClick={() => setActive((prev) => Math.max(0, prev - 1))}
            className="rounded-md border border-fd-border p-1 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-mono text-xs tabular-nums text-fd-muted-foreground">
            {hopNumber(active)} / {hopNumber(HOPS.length - 1)}
          </span>
          <button
            type="button"
            aria-label="Next hop"
            disabled={active === HOPS.length - 1}
            onClick={() => setActive((prev) => Math.min(HOPS.length - 1, prev + 1))}
            className="rounded-md border border-fd-border p-1 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
