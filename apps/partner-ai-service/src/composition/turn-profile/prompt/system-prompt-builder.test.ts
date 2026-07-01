import { describe, expect, it } from "vitest";
import {
  createDefaultSystemPromptBuilder,
  SystemPromptBuilderError,
} from "./system-prompt-builder.js";

describe("createDefaultSystemPromptBuilder", () => {
  const builder = createDefaultSystemPromptBuilder();

  it("preserves section order in content and section ids", () => {
    const built = builder({
      promptId: "prompt_1",
      sections: [
        { id: "role", content: "You are a helpful assistant." },
        { id: "formatting", content: "Answer in Markdown." },
      ],
    });

    expect(built.sectionIds).toEqual(["role", "formatting"]);
    expect(built.content).toBe("You are a helpful assistant.\n\nAnswer in Markdown.");
    expect(built.promptId).toBe("prompt_1");
  });

  it("rejects a required section that is missing or empty", () => {
    expect(() =>
      builder({
        promptId: "prompt_1",
        sections: [{ id: "role", content: "You are helpful." }],
        requiredSectionIds: ["formatting"],
      }),
    ).toThrow(SystemPromptBuilderError);

    expect(() =>
      builder({
        promptId: "prompt_1",
        sections: [{ id: "formatting", content: "   " }],
        requiredSectionIds: ["formatting"],
      }),
    ).toThrow("missing required section formatting");
  });

  it("produces a deterministic hash for the same definition", () => {
    const definition = {
      promptId: "prompt_1",
      sections: [{ id: "role", content: "You are helpful." }],
    };

    expect(builder(definition).hash).toBe(builder(definition).hash);
    expect(builder(definition).hash).not.toBe(
      builder({
        promptId: "prompt_1",
        sections: [{ id: "role", content: "You are very helpful." }],
      }).hash,
    );
  });
});
