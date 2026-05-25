import type { RuntimeObserver } from "./runtime-observer.js";

export type StepObserverInput = {
  readonly observer: RuntimeObserver;
  readonly stepName: string;
};

export const createStepObserver = ({ observer, stepName }: StepObserverInput): RuntimeObserver => ({
  record: (event) =>
    observer.record({
      ...event,
      name: `${stepName}.${event.name}`,
    }),
});
