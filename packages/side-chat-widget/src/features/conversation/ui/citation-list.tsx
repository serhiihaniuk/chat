import type { ReactElement } from "react";

import type { CitationSource } from "../model/message-view.js";
import { Source, SourceLabel, Sources } from "#shared/ai/source";

export type CitationListProps = {
  readonly sources: readonly CitationSource[];
};

export const CitationList = ({
  sources,
}: CitationListProps): ReactElement | null => {
  if (sources.length === 0) return null;

  return (
    <Sources>
      <SourceLabel>Sources</SourceLabel>
      <div className="min-w-0">
        {sources.map((source) => (
          <Source key={source.sourceId} title={source.dataset}>
            {source.label}
          </Source>
        ))}
      </div>
    </Sources>
  );
};
