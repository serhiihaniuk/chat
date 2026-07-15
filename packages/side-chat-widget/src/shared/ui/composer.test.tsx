import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  Composer,
  submitOnEnter,
  type ComposerEnterEvent,
  type ComposerProps,
} from "./composer.js";

// --- Enter policy (pure) ---------------------------------------------------
//
// React's delegated onKeyDown can't be driven from a synthetic dispatch under the
// node harness (the event bubbles past React's root listener), so the keyboard
// policy is unit-tested directly through the exported `submitOnEnter`.

const enterEvent = (
  overrides: Partial<ComposerEnterEvent> = {},
): [ComposerEnterEvent, () => boolean] => {
  let prevented = false;
  const event: ComposerEnterEvent = {
    key: "Enter",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    keyCode: 13,
    nativeEvent: { isComposing: false },
    preventDefault: () => {
      prevented = true;
    },
    ...overrides,
  };
  return [event, () => prevented];
};

describe("submitOnEnter policy", () => {
  it("does not send while an IME composition is active", () => {
    let sent = 0;
    const [composing] = enterEvent({ nativeEvent: { isComposing: true } });
    submitOnEnter({ event: composing, isBusy: false, sendOnEnter: true, send: () => (sent += 1) });
    const [legacy] = enterEvent({ keyCode: 229 });
    submitOnEnter({ event: legacy, isBusy: false, sendOnEnter: true, send: () => (sent += 1) });
    expect(sent).toBe(0);
  });

  it("sends on Enter and inserts a newline on Shift+Enter by default", () => {
    let sent = 0;
    const [shift, shiftPrevented] = enterEvent({ shiftKey: true });
    submitOnEnter({ event: shift, isBusy: false, sendOnEnter: true, send: () => (sent += 1) });
    expect(sent).toBe(0);
    expect(shiftPrevented()).toBe(false); // newline: default not prevented

    const [plain, plainPrevented] = enterEvent();
    submitOnEnter({ event: plain, isBusy: false, sendOnEnter: true, send: () => (sent += 1) });
    expect(sent).toBe(1);
    expect(plainPrevented()).toBe(true);
  });

  it("requires Ctrl/Cmd+Enter to send when sendOnEnter is off", () => {
    let sent = 0;
    const [bare] = enterEvent();
    submitOnEnter({ event: bare, isBusy: false, sendOnEnter: false, send: () => (sent += 1) });
    expect(sent).toBe(0);

    const [ctrl] = enterEvent({ ctrlKey: true });
    submitOnEnter({ event: ctrl, isBusy: false, sendOnEnter: false, send: () => (sent += 1) });
    const [meta] = enterEvent({ metaKey: true });
    submitOnEnter({ event: meta, isBusy: false, sendOnEnter: false, send: () => (sent += 1) });
    expect(sent).toBe(2);
  });

  it("neither sends nor stops on Enter while a turn streams", () => {
    let sent = 0;
    const [event, prevented] = enterEvent();
    submitOnEnter({ event, isBusy: true, sendOnEnter: true, send: () => (sent += 1) });
    expect(sent).toBe(0);
    expect(prevented()).toBe(false); // newline, not a stop
  });
});

// --- Field wiring (DOM) ----------------------------------------------------

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  assignGlobal("window", windowRef);
  assignGlobal("document", windowRef.document);
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  assignGlobal("Element", windowRef.Element);
  assignGlobal("HTMLElement", windowRef.HTMLElement);
  assignGlobal("Node", windowRef.Node);
  // Bind the happy-dom Event constructor to the global name so `new Event(...)`
  // dispatches an event happy-dom's dispatchEvent accepts, while TS keeps the
  // ambient lib.dom Event type.
  assignGlobal("Event", windowRef.Event);
  assignGlobal("getComputedStyle", windowRef.getComputedStyle.bind(windowRef));
  assignGlobal("requestAnimationFrame", windowRef.requestAnimationFrame.bind(windowRef));
  assignGlobal("cancelAnimationFrame", windowRef.cancelAnimationFrame.bind(windowRef));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  windowRef.close();
});

const assignGlobal = (name: string, value: unknown): void => {
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
};

// The composer renders its own ModelSelector + ToolsMenu by default; these tests only
// exercise the field + send, so pass null slots to keep the tree light.
const renderComposer = (props: Partial<ComposerProps>): void => {
  act(() =>
    root.render(createElement(Composer, { modelSelector: null, toolsMenu: null, ...props })),
  );
};

const findTextarea = (): HTMLTextAreaElement => {
  const node = container.querySelector("textarea");
  if (node === null) throw new Error("Expected a composer textarea.");
  return node;
};

const typeMessage = (value: string): void => {
  act(() => {
    const textarea = findTextarea();
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const clickSend = (): void => {
  const button = container.querySelector<HTMLElement>('[aria-label="Send message"]');
  if (button === null) throw new Error("Expected a send button.");
  act(() => button.click());
};

describe("Composer field wiring", () => {
  it("stays editable while a turn streams so the next message can be drafted", () => {
    renderComposer({ status: "streaming" });
    expect(findTextarea().disabled).toBe(false);
    expect(container.querySelector('[aria-label="Stop generating"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Send message"]')).toBeNull();
  });

  it("submits the trimmed message and returns focus to the field on a pointer send", () => {
    const submitted: string[] = [];
    renderComposer({
      onSubmit: (text) => {
        submitted.push(text);
      },
    });
    typeMessage("  hello  ");
    clickSend();
    expect(submitted).toEqual(["hello"]);
    expect(document.activeElement).toBe(findTextarea());
  });

  it("returns focus to the field when a turn finishes", () => {
    renderComposer({ status: "streaming" });
    expect(document.activeElement).not.toBe(findTextarea());

    renderComposer({ status: "idle" });
    expect(document.activeElement).toBe(findTextarea());
  });
});
