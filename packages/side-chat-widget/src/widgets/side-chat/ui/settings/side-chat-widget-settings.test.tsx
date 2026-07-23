import { describe, expect, it } from "vitest";

import { SideChatWidget } from "../side-chat-widget.js";
import {
  clickButton,
  fakeWorkflowChat,
  installWidgetTestDom,
  mountWidget,
} from "../widget-test-env.js";

installWidgetTestDom();

const THEME_STORAGE_KEY = "widget-theme-store";
const APPEARANCE_STORAGE_KEY = "side-chat-widget:appearance";

const renderThemeWidget = () =>
  mountWidget(
    <SideChatWidget
      labels={{ placeholder: "Message", send: "Send", title: "Workspace Assistant" }}
      themeStorageKey={THEME_STORAGE_KEY}
      workflowChat={fakeWorkflowChat()}
    />,
  );

const widgetRoot = (): Element | null => document.querySelector(".side-chat-widget-root");

describe("SideChatWidget settings", () => {
  it("opens settings from the header and applies a theme to the widget root", async () => {
    renderThemeWidget();

    expect(widgetRoot()?.getAttribute("data-sidechat-theme")).toBeNull();

    await clickButton("Settings");
    expect(document.body.textContent).toContain("Sage");

    await clickButton("Sage");

    expect(widgetRoot()?.getAttribute("data-sidechat-theme")).toBe("sage");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("sage");
  });

  it("returns from settings to the active chat panel", async () => {
    renderThemeWidget();

    await clickButton("Settings");
    expect(document.body.textContent).toContain("Appearance controls");

    await clickButton("Back to chat");
    expect(document.body.textContent).toContain("Workspace Assistant");
    expect(document.querySelector('textarea[aria-label="Message"]')).not.toBeNull();
  });

  it("keeps General focused on behavior settings", async () => {
    renderThemeWidget();

    await clickButton("Settings");

    expect(document.querySelector('button[aria-label="Theme"]')?.textContent).toContain(
      "Appearance controls",
    );

    await clickButton("General");

    expect(document.querySelector('button[aria-label="General"]')?.textContent).toContain(
      "Behavior preferences",
    );
    expect(document.body.textContent).toContain("Send with Ctrl+Enter");
    expect(document.body.textContent).toContain("Tool call details");
    expect(document.body.textContent).not.toContain("Custom instructions");
    expect(document.body.textContent).not.toContain("Default model");
  });

  it("persists the tool-detail level from the General group", async () => {
    renderThemeWidget();

    await clickButton("Settings");
    await clickButton("General");
    await clickButton("Name only");

    expect(window.localStorage.getItem("side-chat-widget:tool-detail")).toBe("name");
  });

  it("offers only the locally served widget typefaces", async () => {
    renderThemeWidget();

    await clickButton("Settings");

    expect(document.body.textContent).toContain("Plus Jakarta Sans");
    expect(document.body.textContent).toContain("DM Sans");
    expect(document.body.textContent).toContain("Instrument Sans");
    expect(document.body.textContent).not.toContain("IBM Plex");
  });

  it("keeps graphite attribute-free so it inherits the base palette", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "ocean");
    renderThemeWidget();

    expect(widgetRoot()?.getAttribute("data-sidechat-theme")).toBe("ocean");

    await clickButton("Settings");
    await clickButton("Graphite");

    expect(widgetRoot()?.getAttribute("data-sidechat-theme")).toBeNull();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("graphite");
  });

  it("exposes persisted appearance ids for the stylesheet to apply", async () => {
    renderThemeWidget();

    await clickButton("Settings");
    await clickButton("Blue");
    await clickButton("Roomy");
    await clickButton("Large");
    await clickButton("Instrument Sans");
    await clickButton("Flat");

    const root = widgetRoot();
    if (!(root instanceof HTMLElement)) throw new Error("Expected widget root.");
    expect(root.getAttribute("data-sidechat-accent")).toBe("blue");
    expect(root.getAttribute("data-sidechat-density")).toBe("roomy");
    expect(root.getAttribute("data-sidechat-elevation")).toBe("flat");
    expect(root.getAttribute("data-sidechat-text-size")).toBe("large");
    expect(root.getAttribute("data-sidechat-typeface")).toBe("instrument-sans");
    expect(root.getAttribute("style")).not.toContain("--space-unit");
    expect(JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}")).toMatchObject({
      accent: "blue",
      density: "roomy",
      elevation: "flat",
      textSize: "large",
      typeface: "instrument-sans",
    });
  });
});
