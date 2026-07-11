import type { TurnAdmission } from "#application/ports/turn/turn-admission";

/** Named Step 17 seam; capacity is intentionally unbounded until that story. */
export const PASS_THROUGH_TURN_ADMISSION: TurnAdmission = {
  admitTurn: () => Promise.resolve({ release: () => Promise.resolve() }),
};
