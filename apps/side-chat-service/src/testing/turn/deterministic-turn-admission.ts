import type { TurnAdmission, TurnAdmissionLease } from "#application/ports/turn/turn-admission";

export class DeterministicTurnAdmission implements TurnAdmission {
  admitted = 0;
  released = 0;

  admitTurn(): Promise<TurnAdmissionLease> {
    this.admitted += 1;
    let released = false;
    return Promise.resolve({
      release: () => {
        if (released) {
          return Promise.reject(new Error("Turn admission lease was released more than once"));
        }
        released = true;
        this.released += 1;
        return Promise.resolve();
      },
    });
  }
}
