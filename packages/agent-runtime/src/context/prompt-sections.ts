import type { RuntimeContextBoard, RuntimeContextSection } from "./context-board.js";

export const renderContextBoardSections = (board: RuntimeContextBoard): string =>
  board.sections
    .toSorted(compareSections)
    .map((section) => `### ${section.title}\n${section.content.trim()}`)
    .join("\n\n");

const compareSections = (left: RuntimeContextSection, right: RuntimeContextSection): number =>
  (right.priority ?? 0) - (left.priority ?? 0);
