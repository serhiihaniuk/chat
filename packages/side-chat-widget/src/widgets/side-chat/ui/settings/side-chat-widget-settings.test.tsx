import { describe, expect, it } from "vitest";

import { SideChatWidget } from "../side-chat-widget.js";
import {
  clickButton,
  completed,
  delta,
  fakeClient,
  installWidgetTestDom,
  mountWidget,
  started,
} from "../widget-test-env.js";

installWidgetTestDom();

const THEME_STORAGE_KEY = "widget-theme-store";
const APPEARANCE_STORAGE_KEY = "side-chat-widget:appearance";

const renderThemeWidget = () =>
  mountWidget(
    <SideChatWidget
      client={fakeClient(async function* () {
        await Promise.resolve();
        yield started();
        yield delta("hi");
        yield completed();
      })}
      labels={{ placeholder: "Message", send: "Send", title: "Workspace Assistant" }}
      themeStorageKey={THEME_STORAGE_KEY}
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

  it("keeps graphite attribute-free so it tracks the host light/dark", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "ocean");
    renderThemeWidget();

    expect(widgetRoot()?.getAttribute("data-sidechat-theme")).toBe("ocean");

    await clickButton("Settings");
    await clickButton("Graphite");

    expect(widgetRoot()?.getAttribute("data-sidechat-theme")).toBeNull();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("graphite");
  });

  it("applies persisted appearance controls to the widget root tokens", async () => {
    renderThemeWidget();

    await clickButton("Settings");
    await clickButton("Blue");
    await clickButton("Roomy");
    await clickButton("Large");
    await clickButton("IBM Plex");
    await clickButton("Flat");

    const root = widgetRoot();
    if (!(root instanceof HTMLElement)) throw new Error("Expected widget root.");
    const rootStyle = root.style;
    expect(root.getAttribute("data-sidechat-accent")).toBe("blue");
    expect(rootStyle.getPropertyValue("--space-unit")).toBe("0.3125rem");
    expect(rootStyle.getPropertyValue("--text-md")).toBe("1rem");
    expect(rootStyle.getPropertyValue("--font-widget")).toContain("IBM Plex Sans");
    expect(rootStyle.getPropertyValue("--shadow-panel")).toBe("none");
    expect(JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}")).toMatchObject({
      accent: "blue",
      density: "roomy",
      elevation: "flat",
      textSize: "large",
      typeface: "ibm-plex",
    });
  });
});
