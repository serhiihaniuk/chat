import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { DesignControls } from "./design-controls";
import { Glossary } from "./glossary";
import { Preview } from "./preview";
import { Term } from "./term";
import { TokenTable } from "./token-table";
import { TurnExplorer } from "./turn-explorer";
import { TurnTrace } from "./turn-trace";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Glossary,
    Preview,
    Term,
    TokenTable,
    DesignControls,
    TurnTrace,
    TurnExplorer,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
