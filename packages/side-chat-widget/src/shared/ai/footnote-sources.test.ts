import { createElement } from "react";
import { describe, expect, it } from "vitest";

import {
  footnoteSourceForMarker,
  parseFootnoteSources,
  reactNodeText,
} from "./footnote-sources.js";

describe("parseFootnoteSources", () => {
  it("numbers definitions by document order", () => {
    const sources = parseFootnoteSources(
      "a [^1] b [^2].\n\n[^1]: First. https://a.test\n[^2]: Second. https://b.test",
    );
    expect(sources.map((source) => source.number)).toEqual([1, 2]);
  });

  it("splits a trailing bare URL into label + url", () => {
    const [source] = parseFootnoteSources(
      "x [^1].\n\n[^1]: Smith, J. (2022). Introduction to Testing. https://example.com/smith",
    );
    expect(source).toEqual({
      number: 1,
      label: "Smith, J. (2022). Introduction to Testing",
      url: "https://example.com/smith",
    });
  });

  it("reads a Markdown link's text as the label and its target as the url", () => {
    const [source] = parseFootnoteSources(
      "x [^1].\n\n[^1]: [Boredom & Creativity](https://j.test/b)",
    );
    expect(source).toEqual({
      number: 1,
      label: "Boredom & Creativity",
      url: "https://j.test/b",
    });
  });

  it("keeps a URL-less definition as a terminal source", () => {
    const [source] = parseFootnoteSources('x [^1].\n\n[^1]: "…quoted excerpt from a pasted note."');
    expect(source?.url).toBeUndefined();
    expect(source?.label).toContain("quoted excerpt");
  });

  it("lifts the model's trailing quote into an excerpt beside the label + url", () => {
    const [source] = parseFootnoteSources(
      'x [^1].\n\n[^1]: Regulatory framework on AI — https://ai.test — "The AI Act entered into force on 1 August 2024."',
    );
    expect(source).toEqual({
      number: 1,
      label: "Regulatory framework on AI",
      url: "https://ai.test",
      excerpt: "The AI Act entered into force on 1 August 2024.",
    });
  });

  it("ignores footnote references with no definition", () => {
    expect(parseFootnoteSources("A claim [^9] with no matching definition.")).toEqual([]);
  });
});

describe("footnoteSourceForMarker", () => {
  const sources = parseFootnoteSources(
    "a [^1] b [^2].\n\n[^1]: Britannica. https://britannica.test\n[^2]: OpenStax. https://openstax.test",
  );

  it("binds marker 2 to the second source (not the first)", () => {
    expect(footnoteSourceForMarker(sources, "2")?.label).toBe("OpenStax");
    expect(footnoteSourceForMarker(sources, "1")?.label).toBe("Britannica");
  });

  it("returns undefined for a number past the defined sources", () => {
    expect(footnoteSourceForMarker(sources, "9")).toBeUndefined();
  });
});

describe("reactNodeText", () => {
  it("flattens nested elements to their text", () => {
    const node = createElement("sup", null, createElement("button", null, "12"));
    expect(reactNodeText(node)).toBe("12");
  });
});
