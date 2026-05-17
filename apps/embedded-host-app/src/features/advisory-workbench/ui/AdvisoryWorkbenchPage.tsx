import { useEffect, useMemo, useRef, useState } from "react";
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
import { AdvisoryWorklistTable } from "./AdvisoryWorklistTable.js";
import { HeaderControls } from "./HeaderControls.js";
import { Sidebar } from "./Sidebar.js";
import {
  RiskIntelligenceOverview,
  RiskIntelligenceRail,
} from "./WorkbenchAnalytics.js";
import { WorkbenchFilterBar } from "./WorkbenchFilterBar.js";

const workspaceId = "demo-workspace";
const citationSelectedEventName = "sidechat:citation-selected";
const citationHighlightDurationMs = 15_000;

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
  const citationClearTimerRef = useRef<number | undefined>(undefined);
  const hostSurface = useMemo(
    () => createAdvisoryWorkbenchHostSurface(snapshot, controls),
    [controls, snapshot],
  );

  useHostSurfaceRegistration(hostSurface);

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
        setGridViews((current) => reduceGridViews(current, command));
        setControls((current) =>
          inferWorkbenchControlStateFromGridView(
            {
              filters: command.view.filters,
              sort: command.view.sort,
              highlightRowIds: command.view.highlightRowIds,
              sequence: Date.now(),
            },
            current,
          ),
        );
        scrollHostResourceIntoView(command.resourceId);
        return;
      }

      if (command.type === "grid.clearView") {
        setGridViews((current) => reduceGridViews(current, command));
        setControls(defaultWorkbenchControlState);
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
  }, []);

  const applyControls = (next: WorkbenchControlState) => {
    const view = createWorkbenchControlGridView(next);
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
            <p className="product-label">UBS Partner</p>
            <h1>Advisory Workbench</h1>
            <p className="header-subtitle">
              Real-time overview of relationship, portfolio performance,
              advisory coverage, and risk.
            </p>
          </div>
          <HeaderControls
            dateRangeLabel={snapshot?.dateRange.label ?? "Apr 1 - Jun 30, 2025"}
          />
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
              onChange={applyControls}
              snapshot={snapshot}
            />
            <div className="workbench-content">
              <div className="primary-workbench-column">
                <RiskIntelligenceOverview snapshot={snapshot} />
                <AdvisoryWorklistTable
                  activeSourceId={activeSourceId}
                  snapshot={snapshot}
                  view={gridViews.advisoryWorklist}
                />
              </div>
              <RiskIntelligenceRail snapshot={snapshot} />
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
