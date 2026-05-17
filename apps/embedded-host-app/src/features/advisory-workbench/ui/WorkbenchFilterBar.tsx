import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BriefcaseBusiness,
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
  priorityOptions,
  quickFilterOptions,
  riskCategoryOptions,
  sortOptions,
  type WorkbenchControlOption,
  type WorkbenchControlState,
  type WorkbenchDueStatus,
  type WorkbenchPriority,
  type WorkbenchQuickFilterId,
  type WorkbenchRiskCategory,
  type WorkbenchSortId,
  type WorkbenchViewQueue,
  viewQueueOptions,
} from "../model/workbench-controls.js";

type WorkbenchFilterBarProps = {
  controls: WorkbenchControlState;
  onChange: (next: WorkbenchControlState) => void;
  snapshot: AdvisoryDashboardSnapshot;
};

type ControlId =
  | "viewQueue"
  | "clientSegment"
  | "priority"
  | "riskCategory"
  | "dueStatus"
  | "rmAdvisor"
  | "sortBy";

type ToolbarControl<TValue extends string = string> = {
  id: ControlId;
  icon: typeof ListFilter;
  label: string;
  options: readonly WorkbenchControlOption<TValue>[];
  value: TValue;
};

export function WorkbenchFilterBar({
  controls,
  onChange,
  snapshot,
}: WorkbenchFilterBarProps) {
  const [openControl, setOpenControl] = useState<ControlId | null>(null);
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

  const selectControlValue = (id: ControlId, value: string) => {
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
              className={`quick-filter-pill${active ? " is-active" : ""}`}
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
  isOpen,
  onOpenChange,
  onSelect,
}: {
  control: ToolbarControl;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelect: (id: ControlId, value: string) => void;
}) => {
  const Icon = control.icon;
  const selectedLabel =
    control.options.find((option) => option.value === control.value)?.label ??
    control.value;

  return (
    <div className="toolbar-control-menu">
      <button
        aria-expanded={isOpen}
        className={`toolbar-control${isOpen ? " is-open" : ""}`}
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
  id: ControlId,
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
  if (id === "rmAdvisor") {
    return { ...current, rmAdvisor: value };
  }
  return { ...current, sortBy: value as WorkbenchSortId };
};
