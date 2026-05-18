import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HostCommand } from "@side-chat/shared-protocol";

import { useHostSurfaceRegistration } from "../../../shared/host-surface/HostSurfaceProvider.js";
import { getAdvisoryDashboardSnapshot } from "../api/advisory-dashboard-client.js";
import type { AdvisoryDashboardSnapshot } from "../model/advisory-dashboard.types.js";
import {
  reduceGridViews,
  type AdvisoryGridViews,
} from "../model/grid-view-state.js";
import { createAdvisoryWorkbenchHostSurface } from "../model/side-chat-host.js";
import {
  createWorkbenchControlGridView,
  defaultWorkbenchControlState,
  inferWorkbenchControlStateFromGridView,
  type WorkbenchControlState,
} from "../model/workbench-controls.js";
import { createWorkbenchPageSnapshot } from "../model/workbench-page-snapshot.js";
import { AdvisoryWorklistTable } from "./AdvisoryWorklistTable.js";
import { Sidebar } from "./Sidebar.js";
import {
  RiskIntelligenceOverview,
  RiskIntelligenceRail,
} from "./WorkbenchAnalytics.js";
import {
  WorkbenchFilterBar,
  type WorkbenchHighlightId,
} from "./WorkbenchFilterBar.js";

const workspaceId = "demo-workspace";
const citationSelectedEventName = "sidechat:citation-selected";
const citationHighlightDurationMs = 15_000;
const aiControlHighlightDurationMs = 5_000;

type CitationSelectedEvent = CustomEvent<{ sourceId?: unknown }>;
type HostCommandEvent = CustomEvent<HostCommand>;

/**
 * Main Workbench screen. It owns dashboard data loading, host command events,
 * citation highlighting, and composition of the visible advisory surface.
 */
export function AdvisoryWorkbenchPage() {
  const [snapshot, setSnapshot] = useState<AdvisoryDashboardSnapshot | null>(
    null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [gridViews, setGridViews] = useState<AdvisoryGridViews>({});
  const [controls, setControls] = useState<WorkbenchControlState>(
    defaultWorkbenchControlState,
  );
  const [aiHighlightedControlIds, setAiHighlightedControlIds] = useState<
    WorkbenchHighlightId[]
  >([]);
  const citationClearTimerRef = useRef<number | undefined>(undefined);
  const aiControlHighlightTimerRef = useRef<number | undefined>(undefined);
  const controlsRef = useRef<WorkbenchControlState>(
    defaultWorkbenchControlState,
  );
  const pageSnapshot = useMemo(
    () =>
      snapshot
        ? createWorkbenchPageSnapshot(snapshot, controls)
        : null,
    [controls, snapshot],
  );
  const hostSurface = useMemo(
    () =>
      createAdvisoryWorkbenchHostSurface(
        pageSnapshot,
        controls,
        gridViews.advisoryWorklist,
      ),
    [controls, gridViews.advisoryWorklist, pageSnapshot],
  );

  useHostSurfaceRegistration(hostSurface);

  const clearAiControlHighlights = useCallback(() => {
    window.clearTimeout(aiControlHighlightTimerRef.current);
    setAiHighlightedControlIds([]);
  }, []);

  const flashAiControlHighlights = useCallback(
    (controlIds: readonly WorkbenchHighlightId[]) => {
      const uniqueControlIds = [...new Set(controlIds)];
      if (uniqueControlIds.length === 0) return;

      window.clearTimeout(aiControlHighlightTimerRef.current);
      setAiHighlightedControlIds(uniqueControlIds);
      aiControlHighlightTimerRef.current = window.setTimeout(() => {
        setAiHighlightedControlIds([]);
      }, aiControlHighlightDurationMs);
    },
    [],
  );

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(
    () => () => window.clearTimeout(aiControlHighlightTimerRef.current),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    getAdvisoryDashboardSnapshot(workspaceId, controller.signal)
      .then((data) => {
        setSnapshot(data);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setStatus("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onCitationSelected = (event: Event) => {
      const { sourceId } = (event as CitationSelectedEvent).detail ?? {};
      if (typeof sourceId !== "string") return;

      window.clearTimeout(citationClearTimerRef.current);
      setActiveSourceId(null);
      window.setTimeout(() => {
        setActiveSourceId(sourceId);
        document
          .querySelector(`[data-sidechat-source-id="${CSS.escape(sourceId)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      citationClearTimerRef.current = window.setTimeout(() => {
        setActiveSourceId(null);
      }, citationHighlightDurationMs);
    };

    window.addEventListener(citationSelectedEventName, onCitationSelected);
    return () => {
      window.clearTimeout(citationClearTimerRef.current);
      window.removeEventListener(citationSelectedEventName, onCitationSelected);
    };
  }, []);

  useEffect(() => {
    const onHostCommand = (event: Event) => {
      const command = (event as HostCommandEvent).detail;
      if (!command || typeof command.type !== "string") return;

      if (command.type === "grid.applyView") {
        const currentControls = controlsRef.current;
        const nextControls = inferWorkbenchControlStateFromGridView(
          {
            filters: command.view.filters,
            sort: command.view.sort,
            highlightRowIds: command.view.highlightRowIds,
            sequence: Date.now(),
          },
          currentControls,
          snapshot?.asOfDate,
        );

        setGridViews((current) => reduceGridViews(current, command));
        controlsRef.current = nextControls;
        setControls(nextControls);
        flashAiControlHighlights(
          createChangedControlHighlights(currentControls, nextControls),
        );
        scrollHostResourceIntoView(command.resourceId);
        return;
      }

      if (command.type === "grid.clearView") {
        const currentControls = controlsRef.current;
        setGridViews((current) => reduceGridViews(current, command));
        controlsRef.current = defaultWorkbenchControlState;
        setControls(defaultWorkbenchControlState);
        flashAiControlHighlights(
          createChangedControlHighlights(
            currentControls,
            defaultWorkbenchControlState,
          ),
        );
        if (typeof command.resourceId === "string") {
          scrollHostResourceIntoView(command.resourceId);
        }
        return;
      }

      if (
        command.type === "ui.focusResource" &&
        typeof command.resourceId === "string"
      ) {
        scrollHostResourceIntoView(command.resourceId);
      }
    };

    window.addEventListener("sidechat:host-command", onHostCommand);
    return () =>
      window.removeEventListener("sidechat:host-command", onHostCommand);
  }, [flashAiControlHighlights, snapshot?.asOfDate]);

  const applyControls = (next: WorkbenchControlState) => {
    const view = createWorkbenchControlGridView(next, snapshot?.asOfDate);
    clearAiControlHighlights();
    controlsRef.current = next;
    setControls(next);
    setGridViews((current) => ({
      ...current,
      advisoryWorklist: view,
    }));
  };

  return (
    <div className="workbench-shell">
      <Sidebar />
      <div className="workbench-main">
        <header className="workbench-header">
          <div>
            <p className="product-label">Advisory Dashboard</p>
            <h1>Advisory Dashboard</h1>
            <p className="header-subtitle">
              Real-time overview of relationship, portfolio performance,
              advisory coverage, and risk.
            </p>
          </div>
        </header>

        {status === "loading" ? (
          <div className="dashboard-state" role="status">
            Loading advisory dashboard...
          </div>
        ) : null}

        {status === "error" ? (
          <div className="dashboard-state error" role="alert">
            Advisory dashboard data is unavailable.
          </div>
        ) : null}

        {snapshot ? (
          <>
            <WorkbenchFilterBar
              controls={controls}
              highlightedControlIds={aiHighlightedControlIds}
              onChange={applyControls}
              snapshot={snapshot}
            />
            <div className="workbench-content">
              <div className="primary-workbench-column">
                <RiskIntelligenceOverview snapshot={pageSnapshot ?? snapshot} />
                <AdvisoryWorklistTable
                  activeSourceId={activeSourceId}
                  snapshot={pageSnapshot ?? snapshot}
                  view={gridViews.advisoryWorklist}
                />
              </div>
              <RiskIntelligenceRail snapshot={pageSnapshot ?? snapshot} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

const scrollHostResourceIntoView = (resourceId: string) => {
  document
    .querySelector(`[data-host-resource-id="${CSS.escape(resourceId)}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
};

const createChangedControlHighlights = (
  previous: WorkbenchControlState,
  next: WorkbenchControlState,
): WorkbenchHighlightId[] => {
  const controlIds: WorkbenchHighlightId[] = [];

  pushIfChanged(controlIds, "viewQueue", previous.viewQueue, next.viewQueue);
  pushIfChanged(
    controlIds,
    "clientSegment",
    previous.clientSegment,
    next.clientSegment,
  );
  pushIfChanged(controlIds, "priority", previous.priority, next.priority);
  pushIfChanged(
    controlIds,
    "riskCategory",
    previous.riskCategory,
    next.riskCategory,
  );
  pushIfChanged(
    controlIds,
    "dueStatus",
    previous.dueStatus,
    next.dueStatus,
  );
  pushIfChanged(
    controlIds,
    "dueWindow",
    previous.dueWindow,
    next.dueWindow,
  );
  pushIfChanged(controlIds, "rmAdvisor", previous.rmAdvisor, next.rmAdvisor);
  pushIfChanged(controlIds, "sortBy", previous.sortBy, next.sortBy);

  const changedQuickFilters = new Set([
    ...previous.quickFilters,
    ...next.quickFilters,
  ]);
  for (const quickFilter of changedQuickFilters) {
    if (
      previous.quickFilters.includes(quickFilter) !==
      next.quickFilters.includes(quickFilter)
    ) {
      controlIds.push(quickFilter);
    }
  }

  return controlIds;
};

const pushIfChanged = (
  controlIds: WorkbenchHighlightId[],
  controlId: WorkbenchHighlightId,
  previous: string,
  next: string,
) => {
  if (previous !== next) controlIds.push(controlId);
};
