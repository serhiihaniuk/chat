import type { JsonObject } from "@side-chat/chat-protocol";

export type RuntimeObserver = {
  record(event: RuntimeObserverEvent): void;
};

export type RuntimeObserverEvent = {
  readonly name: string;
  readonly attributes?: JsonObject;
};

export const noopRuntimeObserver: RuntimeObserver = {
  record: () => undefined,
};

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
