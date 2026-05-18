import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Flag,
  GitBranch,
  ListFilter,
  SlidersHorizontal,
  TrendingDown,
  UserRound,
} from "lucide-react";

import type { AdvisoryDashboardSnapshot } from "../model/advisory-dashboard.types.js";
import {
  createRmOptions,
  createSegmentOptions,
  dueStatusOptions,
  dueWindowOptions,
  priorityOptions,
  quickFilterOptions,
  riskCategoryOptions,
  sortOptions,
  type WorkbenchControlOption,
  type WorkbenchControlState,
  type WorkbenchDueStatus,
  type WorkbenchDueWindow,
  type WorkbenchPriority,
  type WorkbenchQuickFilterId,
  type WorkbenchRiskCategory,
  type WorkbenchSortId,
  type WorkbenchViewQueue,
  viewQueueOptions,
} from "../model/workbench-controls.js";

type WorkbenchFilterBarProps = {
  controls: WorkbenchControlState;
  highlightedControlIds?: readonly WorkbenchHighlightId[];
  onChange: (next: WorkbenchControlState) => void;
  snapshot: AdvisoryDashboardSnapshot;
};

export type WorkbenchControlId =
  | "viewQueue"
  | "clientSegment"
  | "priority"
  | "riskCategory"
  | "dueStatus"
  | "dueWindow"
  | "rmAdvisor"
  | "sortBy";

export type WorkbenchHighlightId = WorkbenchControlId | WorkbenchQuickFilterId;

type ToolbarControl<TValue extends string = string> = {
  id: WorkbenchControlId;
  icon: typeof ListFilter;
  label: string;
  options: readonly WorkbenchControlOption<TValue>[];
  value: TValue;
};

export function WorkbenchFilterBar({
  controls,
  highlightedControlIds = [],
  onChange,
  snapshot,
}: WorkbenchFilterBarProps) {
  const [openControl, setOpenControl] = useState<WorkbenchControlId | null>(
    null,
  );
  const highlightedControls = useMemo(
    () => new Set<WorkbenchHighlightId>(highlightedControlIds),
    [highlightedControlIds],
  );
  const segmentOptions = useMemo(() => createSegmentOptions(snapshot), [snapshot]);
  const rmOptions = useMemo(() => createRmOptions(snapshot), [snapshot]);
  const toolbarControls = useMemo(
    () =>
      [
        {
          id: "viewQueue",
          icon: ListFilter,
          label: "View / Queue",
          options: viewQueueOptions,
          value: controls.viewQueue,
        },
        {
          id: "clientSegment",
          icon: BriefcaseBusiness,
          label: "Client Segment",
          options: segmentOptions,
          value: controls.clientSegment,
        },
        {
          id: "priority",
          icon: GitBranch,
          label: "Priority",
          options: priorityOptions,
          value: controls.priority,
        },
        {
          id: "riskCategory",
          icon: Flag,
          label: "Risk Category",
          options: riskCategoryOptions,
          value: controls.riskCategory,
        },
        {
          id: "dueStatus",
          icon: Clock3,
          label: "Due Status",
          options: dueStatusOptions,
          value: controls.dueStatus,
        },
        {
          id: "dueWindow",
          icon: CalendarDays,
          label: "Due Window",
          options: dueWindowOptions,
          value: controls.dueWindow,
        },
        {
          id: "rmAdvisor",
          icon: UserRound,
          label: "RM / Advisor",
          options: rmOptions,
          value: controls.rmAdvisor,
        },
        {
          id: "sortBy",
          icon: SlidersHorizontal,
          label: "Sort by",
          options: sortOptions,
          value: controls.sortBy,
        },
      ] satisfies readonly ToolbarControl[],
    [controls, rmOptions, segmentOptions],
  );

  const selectControlValue = (id: WorkbenchControlId, value: string) => {
    onChange(updateControlValue(controls, id, value));
    setOpenControl(null);
  };

  const toggleQuickFilter = (value: WorkbenchQuickFilterId) => {
    const active = controls.quickFilters.includes(value);
    onChange({
      ...controls,
      quickFilters: active
        ? controls.quickFilters.filter((filter) => filter !== value)
        : [...controls.quickFilters, value],
      sortBy: value === "largestOutflow" && !active ? "outflowAsc" : controls.sortBy,
    });
  };

  return (
    <section
      className="workbench-filter-bar"
      aria-label="Workbench page controls"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpenControl(null);
      }}
    >
      <div className="toolbar-control-group" role="group">
        {toolbarControls.map((control) => (
          <ToolbarControlMenu
            control={control}
            isAiHighlighted={highlightedControls.has(control.id)}
            isOpen={openControl === control.id}
            key={control.id}
            onOpenChange={(isOpen) =>
              setOpenControl(isOpen ? control.id : null)
            }
            onSelect={selectControlValue}
          />
        ))}
      </div>
      <div className="quick-filter-pills" aria-label="Quick active filters">
        {quickFilterOptions.map((filter) => {
          const Icon =
            filter.value === "largestOutflow" ? TrendingDown : AlertCircle;
          const active = controls.quickFilters.includes(filter.value);
          return (
            <button
              aria-pressed={active}
              className={`quick-filter-pill${active ? " is-active" : ""}${
                highlightedControls.has(filter.value) ? " is-ai-highlighted" : ""
              }`}
              key={filter.value}
              onClick={() => toggleQuickFilter(filter.value)}
              type="button"
            >
              {filter.value === "highPriority" ? (
                <AlertTriangle aria-hidden="true" size={15} />
              ) : (
                <Icon aria-hidden="true" size={15} />
              )}
              {filter.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const ToolbarControlMenu = ({
  control,
  isAiHighlighted,
  isOpen,
  onOpenChange,
  onSelect,
}: {
  control: ToolbarControl;
  isAiHighlighted: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelect: (id: WorkbenchControlId, value: string) => void;
}) => {
  const Icon = control.icon;
  const selectedLabel =
    control.options.find((option) => option.value === control.value)?.label ??
    control.value;

  return (
    <div className="toolbar-control-menu">
      <button
        aria-expanded={isOpen}
        className={`toolbar-control${isOpen ? " is-open" : ""}${
          isAiHighlighted ? " is-ai-highlighted" : ""
        }`}
        onClick={() => onOpenChange(!isOpen)}
        type="button"
      >
        <Icon aria-hidden="true" size={16} />
        <span>
          <small>{control.label}</small>
          <strong>{selectedLabel}</strong>
        </span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {isOpen ? (
        <div className="toolbar-menu-popover" role="menu">
          {control.options.map((option) => {
            const selected = option.value === control.value;
            return (
              <button
                className={selected ? "is-selected" : ""}
                key={option.value}
                onClick={() => onSelect(control.id, option.value)}
                role="menuitemradio"
                aria-checked={selected}
                type="button"
              >
                <span>{option.label}</span>
                {selected ? <Check aria-hidden="true" size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const updateControlValue = (
  current: WorkbenchControlState,
  id: WorkbenchControlId,
  value: string,
): WorkbenchControlState => {
  if (id === "viewQueue") {
    return { ...current, viewQueue: value as WorkbenchViewQueue };
  }
  if (id === "clientSegment") {
    return { ...current, clientSegment: value };
  }
  if (id === "priority") {
    return { ...current, priority: value as WorkbenchPriority };
  }
  if (id === "riskCategory") {
    return { ...current, riskCategory: value as WorkbenchRiskCategory };
  }
  if (id === "dueStatus") {
    return { ...current, dueStatus: value as WorkbenchDueStatus };
  }
  if (id === "dueWindow") {
    return { ...current, dueWindow: value as WorkbenchDueWindow };
  }
  if (id === "rmAdvisor") {
    return { ...current, rmAdvisor: value };
  }
  return { ...current, sortBy: value as WorkbenchSortId };
};
