import {
  CalendarDays,
  Download,
  ListFilter,
  MoreHorizontal,
} from "lucide-react";

type HeaderControlsProps = {
  dateRangeLabel: string;
};

export function HeaderControls({ dateRangeLabel }: HeaderControlsProps) {
  return (
    <div className="header-controls" aria-label="Dashboard controls">
      <button
        type="button"
        className="control-button control-button-wide"
        aria-disabled="true"
        onClick={(event) => event.preventDefault()}
      >
        <CalendarDays size={18} />
        <span>{dateRangeLabel}</span>
      </button>
      <button
        type="button"
        className="control-button"
        aria-disabled="true"
        onClick={(event) => event.preventDefault()}
      >
        <ListFilter size={18} />
        <span>Filters</span>
      </button>
      <button
        type="button"
        className="control-button"
        aria-disabled="true"
        onClick={(event) => event.preventDefault()}
      >
        <Download size={18} />
        <span>Export</span>
      </button>
      <button
        type="button"
        className="control-icon-button"
        aria-label="More options"
        aria-disabled="true"
        onClick={(event) => event.preventDefault()}
      >
        <MoreHorizontal size={20} />
      </button>
    </div>
  );
}
