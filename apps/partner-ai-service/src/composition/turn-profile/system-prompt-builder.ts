import { hashCanonicalJson } from "@side-chat/partner-ai-core";

/**
 * Deterministic system prompt assembly for service turn profile configuration.
 *
 * A `SystemPromptDefinition` lists ordered named sections; the builder turns it
 * into the final prompt content, the ordered section ids, and a stable hash. The
 * built result is what a turn profile carries as its system instructions, so
 * prompt text is explicit configuration instead of a hidden constant.
 */
export type SystemPromptSection = {
  readonly id: string;
  readonly content: string;
};

export type SystemPromptDefinition = {
  readonly promptId: string;
  readonly sections: readonly SystemPromptSection[];
  /** Section ids that must be present and non-empty for the prompt to build. */
  readonly requiredSectionIds?: readonly string[] | undefined;
};

export type BuiltSystemPrompt = {
  readonly promptId: string;
  readonly content: string;
  readonly sectionIds: readonly string[];
  readonly hash: string;
};

export type SystemPromptBuilder = (definition: SystemPromptDefinition) => BuiltSystemPrompt;

/** Composition-time failure raised when a prompt definition is invalid. */
export class SystemPromptBuilderError extends Error {
  readonly code = "service_system_prompt_invalid";

  constructor(message: string) {
    super(message);
    this.name = "SystemPromptBuilderError";
  }
}

const SECTION_SEPARATOR = "\n\n";

/**
 * Build prompts by joining sections in declared order.
 *
 * Section order is preserved in both the rendered content and the reported
 * section ids. The hash comes from the canonical definition, so the same
 * sections always produce the same hash regardless of build timing.
 */
export const createDefaultSystemPromptBuilder =
  (): SystemPromptBuilder => (definition: SystemPromptDefinition) => {
    assertPromptId(definition.promptId);
    assertSections(definition.sections);
    assertRequiredSections(definition);

    return {
      promptId: definition.promptId,
      content: definition.sections.map((section) => section.content).join(SECTION_SEPARATOR),
      sectionIds: definition.sections.map((section) => section.id),
      hash: hashCanonicalJson({ promptId: definition.promptId, sections: definition.sections }),
    };
  };

const assertPromptId = (promptId: string): void => {
  if (promptId.trim().length === 0) {
    throw new SystemPromptBuilderError("System prompt id must not be empty.");
  }
};

const assertSections = (sections: readonly SystemPromptSection[]): void => {
  if (sections.length === 0) {
    throw new SystemPromptBuilderError("System prompt requires at least one section.");
  }

  const seen = new Set<string>();
  for (const section of sections) {
    if (section.id.trim().length === 0) {
      throw new SystemPromptBuilderError("System prompt section id must not be empty.");
    }
    if (seen.has(section.id)) {
      throw new SystemPromptBuilderError(`Duplicate system prompt section id ${section.id}.`);
    }
    seen.add(section.id);
  }
};

const assertRequiredSections = (definition: SystemPromptDefinition): void => {
  for (const requiredId of definition.requiredSectionIds ?? []) {
    const section = definition.sections.find((candidate) => candidate.id === requiredId);
    if (!section || section.content.trim().length === 0) {
      throw new SystemPromptBuilderError(
        `System prompt ${definition.promptId} is missing required section ${requiredId}.`,
      );
    }
  }
};
