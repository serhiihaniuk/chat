import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

const DOM_WAIT_TIMEOUT_MS = 2_000;
const WINDOW_GLOBALS = [
  "CSS",
  "CustomEvent",
  "Document",
  "DOMParser",
  "DOMRect",
  "DOMRectReadOnly",
  "Element",
  "Event",
  "FocusEvent",
  "FormData",
  "HTMLButtonElement",
  "HTMLFormElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLTextAreaElement",
  "HTMLElement",
  "IntersectionObserver",
  "KeyboardEvent",
  "MouseEvent",
  "MutationObserver",
  "Node",
  "PointerEvent",
  "SVGElement",
] as const;

type PropertySnapshot = Readonly<{
  descriptor: PropertyDescriptor | undefined;
  name: PropertyKey;
  target: object;
}>;

export type DomTestEnvironment = Readonly<{
  restore: () => void;
  window: Window;
}>;

export type ReactDomTestHarness = Readonly<{
  cleanup: () => void;
  container: HTMLElement;
  render: (element: ReactNode) => void;
  waitFor: (predicate: () => boolean, failureMessage?: string) => Promise<void>;
  window: Window;
}>;

/** Install one isolated browser realm and restore every replaced process global. */
export function createDomTestEnvironment({
  failOnConsoleError = true,
}: {
  readonly failOnConsoleError?: boolean | undefined;
} = {}): DomTestEnvironment {
  const windowRef = new Window();
  const snapshots: PropertySnapshot[] = [];
  const consoleErrors: unknown[][] = [];

  installProperty(globalThis, "window", windowRef, snapshots);
  installProperty(globalThis, "document", windowRef.document, snapshots);
  installProperty(globalThis, "localStorage", windowRef.localStorage, snapshots);
  installProperty(globalThis, "sessionStorage", windowRef.sessionStorage, snapshots);
  installProperty(globalThis, "navigator", windowRef.navigator, snapshots);
  installProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", true, snapshots);
  for (const name of WINDOW_GLOBALS) {
    const value = Reflect.get(windowRef, name);
    if (value !== undefined) installProperty(globalThis, name, value, snapshots);
  }
  installProperty(
    globalThis,
    "getComputedStyle",
    windowRef.getComputedStyle.bind(windowRef),
    snapshots,
  );
  installProperty(
    globalThis,
    "requestAnimationFrame",
    windowRef.requestAnimationFrame.bind(windowRef),
    snapshots,
  );
  installProperty(
    globalThis,
    "cancelAnimationFrame",
    windowRef.cancelAnimationFrame.bind(windowRef),
    snapshots,
  );
  installProperty(globalThis, "ResizeObserver", TestResizeObserver, snapshots);

  if (typeof Reflect.get(windowRef.Element.prototype, "getAnimations") !== "function") {
    Reflect.set(windowRef.Element.prototype, "getAnimations", () => []);
  }
  if (failOnConsoleError) {
    installProperty(
      console,
      "error",
      (...values: unknown[]) => consoleErrors.push(values),
      snapshots,
    );
  }

  return {
    window: windowRef,
    restore: () => {
      windowRef.close();
      restoreProperties(snapshots);
      if (consoleErrors.length > 0) throw unexpectedConsoleError(consoleErrors);
    },
  };
}

/** Mount React inside the isolated realm and keep all updates inside `act`. */
export function createReactDomTestHarness(options?: {
  readonly failOnConsoleError?: boolean | undefined;
}): ReactDomTestHarness {
  const environment = createDomTestEnvironment(options);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  return {
    container,
    window: environment.window,
    render: (element) => act(() => root.render(element)),
    waitFor: (predicate, failureMessage) =>
      waitForMutation(container, predicate, failureMessage ?? "Expected DOM state did not appear."),
    cleanup: () => {
      try {
        act(() => root.unmount());
      } finally {
        environment.restore();
      }
    },
  };
}

async function waitForMutation(
  target: Node,
  predicate: () => boolean,
  failureMessage: string,
): Promise<void> {
  if (predicate()) return;
  await act(
    () =>
      new Promise<void>((resolveWait, rejectWait) => {
        const observer = new MutationObserver(() => {
          if (!predicate()) return;
          clearTimeout(timeout);
          observer.disconnect();
          resolveWait();
        });
        const timeout = setTimeout(() => {
          observer.disconnect();
          rejectWait(new Error(failureMessage));
        }, DOM_WAIT_TIMEOUT_MS);
        observer.observe(target, { attributes: true, childList: true, subtree: true });
      }),
  );
}

function installProperty(
  target: object,
  name: PropertyKey,
  value: unknown,
  snapshots: PropertySnapshot[],
): void {
  snapshots.push({ descriptor: Reflect.getOwnPropertyDescriptor(target, name), name, target });
  Object.defineProperty(target, name, { configurable: true, value, writable: true });
}

function restoreProperties(snapshots: readonly PropertySnapshot[]): void {
  for (const snapshot of snapshots.slice().reverse()) {
    if (snapshot.descriptor) {
      Object.defineProperty(snapshot.target, snapshot.name, snapshot.descriptor);
    } else {
      Reflect.deleteProperty(snapshot.target, snapshot.name);
    }
  }
}

function unexpectedConsoleError(calls: readonly unknown[][]): Error {
  const details = calls
    .map((values) => values.map(formatConsoleValue).join(" "))
    .map((message) => `- ${message}`)
    .join("\n");
  return new Error(`Unexpected console.error during React DOM test:\n${details}`);
}

function formatConsoleValue(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  const serialized = JSON.stringify(value);
  return serialized ?? String(value);
}

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
