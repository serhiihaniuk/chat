import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  failIfErrors,
  makeFixtureRoot,
  removeFixtureRoot,
  runNodeScript,
  writeFixtureFile,
  writeJson,
} from "./lib/governance.mjs";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const errors = [];

function expectFailure(name, script, setup, expectedText) {
  const fixtureRoot = makeFixtureRoot();
  try {
    setup(fixtureRoot);
    const result = runNodeScript(join(scriptDirectory, script), fixtureRoot);
    if (result.status === 0) {
      errors.push(`${name}: ${script} unexpectedly passed`);
    } else if (
      expectedText !== undefined &&
      !`${result.stdout ?? ""}\n${result.stderr ?? ""}`.includes(expectedText)
    ) {
      errors.push(`${name}: ${script} failed without the expected message "${expectedText}"`);
    }
  } finally {
    removeFixtureRoot(fixtureRoot);
  }
}

function expectSuccess(name, script, setup) {
  const fixtureRoot = makeFixtureRoot();
  try {
    setup(fixtureRoot);
    const result = runNodeScript(join(scriptDirectory, script), fixtureRoot);
    if (result.status !== 0) {
      errors.push(
        `${name}: ${script} unexpectedly failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      );
    }
  } finally {
    removeFixtureRoot(fixtureRoot);
  }
}

function writeStrictTsconfig(root) {
  writeJson(join(root, "tsconfig.base.json"), {
    compilerOptions: {
      strict: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noPropertyAccessFromIndexSignature: true,
      useUnknownInCatchVariables: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      skipLibCheck: true,
    },
  });
}

expectFailure("hard runtime pin fixture", "check-version-pins.mjs", (root) => {
  writeJson(join(root, "package.json"), {
    name: "fixture",
    private: true,
    type: "module",
    engines: { node: "24.16.0", npm: "11.15.0" },
    packageManager: "npm@11.15.0",
    devDependencies: { typescript: "^6.0.3" },
  });
  writeFixtureFile(root, ".nvmrc", "24.16.0\n");
  writeJson(join(root, "package-lock.json"), {
    name: "fixture",
    lockfileVersion: 3,
    packages: {},
  });
});

expectFailure("forbidden dependency fixture", "check-dependency-policy.mjs", (root) => {
  writeJson(join(root, "package.json"), { name: "fixture", private: true });
  writeJson(join(root, "packages/side-chat-widget/package.json"), {
    name: "@side-chat/side-chat-widget",
    version: "0.0.0",
    private: true,
    dependencies: { shadcn: "1.0.0" },
  });
});

expectFailure("boundary fixture", "check-boundaries.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/chat-protocol/src/bad.ts",
    "import React from 'react';\nexport const bad = React;\n",
  );
});

expectFailure("relative cross-package boundary fixture", "check-boundaries.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/side-chat-widget/src/bad.ts",
    "export { value } from '../../chat-protocol/src/value.js';\n",
  );
  writeFixtureFile(root, "packages/chat-protocol/src/value.ts", "export const value = 1;\n");
});

expectFailure("relative source-folder boundary fixture", "check-boundaries.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/partner-ai-core/src/application/bad.ts",
    "import type { AiRuntimePort } from '../ports/index.js';\nexport type Bad = AiRuntimePort;\n",
  );
  writeFixtureFile(
    root,
    "packages/partner-ai-core/src/ports/index.ts",
    "export type AiRuntimePort = { stream: unknown };\n",
  );
});

expectFailure("widget layer fixture", "check-widget-layers.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/side-chat-widget/src/shared/ai/bad.tsx",
    "import { ChatComposer } from '#features/composer/ui/chat-composer';\nexport const bad = ChatComposer;\n",
  );
  writeFixtureFile(
    root,
    "packages/side-chat-widget/src/features/composer/ui/chat-composer.tsx",
    "export const ChatComposer = () => null;\n",
  );
});

expectFailure("test placement fixture", "check-source-governance.mjs", (root) => {
  writeFixtureFile(root, "packages/chat-protocol/tests/bad.test.ts", "export {};\n");
});

expectFailure("code shape complexity fixture", "check-code-shape.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/chat-protocol/src/bad.ts",
    [
      "export const bad = (value) => {",
      "  if (value.a) {",
      "    if (value.b) {",
      "      if (value.c) {",
      "        if (value.d) {",
      "          if (value.e) {",
      "            if (value.f) return true;",
      "          }",
      "        }",
      "      }",
      "    }",
      "  }",
      "  return false;",
      "};",
      "",
    ].join("\n"),
  );
});

expectFailure("test support placement fixture", "check-code-shape.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/chat-protocol/src/sidechat-v1/fixtures.test-support.ts",
    "export const fixture = {};\n",
  );
});

expectFailure("human readability dense doc fixture", "check-human-readability.mjs", (root) => {
  writeFixtureFile(
    root,
    "README.md",
    [
      "# Fixture",
      "",
      "Read this when: checking a fixture.",
      "Source of truth for: fixture behavior.",
      "Not source of truth for: real docs.",
      "",
      "This paragraph intentionally keeps adding more and more text without giving the reader a table, list, short flow, or concrete contract, because the readability gate needs to catch documentation that looks plausible but forces a maintainer to parse a wall of prose before they can tell what matters, what owns the term, what boundary is crossed, which invariant must be preserved, and which part of the system should be edited next when the behavior changes.",
      "",
    ].join("\n"),
  );
});

expectFailure(
  "high-load source orientation fixture",
  "check-human-readability.mjs",
  (root) => {
    const helpers = Array.from(
      { length: 12 },
      (_, index) => `const helper${index} = () => ${index};`,
    );
    writeFixtureFile(
      root,
      "apps/docs/app/dense.ts",
      [...helpers, ...Array.from({ length: 394 }, () => "// padding"), "export {};", ""].join("\n"),
    );
  },
  "needs a file-level mental-model comment",
);

expectFailure("flat source directory fixture", "check-code-shape.mjs", (root) => {
  for (let index = 1; index <= 13; index += 1) {
    writeFixtureFile(
      root,
      `packages/chat-protocol/src/flat/file-${index}.ts`,
      `export const value${index} = ${index};\n`,
    );
  }
});

expectFailure("build artifact fixture", "check-source-governance.mjs", (root) => {
  writeFixtureFile(root, "packages/chat-protocol/dist/index.js", "export {};\n");
});

expectFailure("typescript escape fixture", "check-source-governance.mjs", (root) => {
  writeStrictTsconfig(root);
  writeFixtureFile(
    root,
    "packages/chat-protocol/src/bad.ts",
    "const value = 1 as unknown as string;\nexport { value };\n",
  );
});

expectFailure(
  "type assertion fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/bad.ts",
      [
        "const input: unknown = 'value';",
        "export const asserted = input as string;",
        "export const nonNull = [input][0]!;",
        "",
      ].join("\n"),
    );
  },
  'TypeScript escape hatch is forbidden: type assertion "as string"',
);

expectFailure(
  "angle-bracket assertion fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/bad.ts",
      "const input: unknown = 'value';\nexport const asserted = <string>input;\n",
    );
  },
  'TypeScript escape hatch is forbidden: angle-bracket type assertion "<string>"',
);

expectFailure(
  "non-null assertion fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/bad.ts",
      "const input: unknown[] = [];\nexport const asserted = input[0]!;\n",
    );
  },
  'TypeScript escape hatch is forbidden: non-null assertion "!"',
);

expectFailure(
  "definite-assignment assertion fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/bad.ts",
      "let resolve!: () => void;\nexport { resolve };\n",
    );
  },
  'TypeScript escape hatch is forbidden: definite-assignment assertion "!"',
);

expectFailure(
  "TypeScript ignore directive fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/bad.ts",
      "// @ts-ignore\nexport const value: string = 1;\n",
    );
  },
  'TypeScript suppression "@ts-ignore" is forbidden',
);

expectFailure(
  "unexplained expect-error fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/bad.test.ts",
      "// @ts-expect-error\nexport const value: string = 1;\n",
    );
  },
  '"@ts-expect-error" requires a reason',
);

expectFailure(
  "test assertion fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/assertion.test.ts",
      "const input: unknown = 'value';\nexport const asserted = input as string;\n",
    );
  },
  'TypeScript escape hatch is forbidden: type assertion "as string"',
);

expectFailure(
  "test-support assertion fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/assertion.test-support.ts",
      "const input: unknown = 'value';\nexport const asserted = input as string;\n",
    );
  },
  'TypeScript escape hatch is forbidden: type assertion "as string"',
);

expectFailure(
  "copied UI assertion fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/side-chat-widget/src/shared/ai/assertion.tsx",
      "const input: unknown = 'value';\nexport const asserted = input as string;\n",
    );
  },
  'TypeScript escape hatch is forbidden: type assertion "as string"',
);

expectFailure(
  "explicit any fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/explicit-any.ts",
      "export const readValue = (value: any): any => value;\n",
    );
  },
  'TypeScript escape hatch is forbidden: explicit "any" type',
);

expectSuccess(
  "inference-preserving TypeScript operators fixture",
  "check-source-governance.mjs",
  (root) => {
    writeStrictTsconfig(root);
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/good.ts",
      [
        "const VALUES = { READY: 'ready' } as const;",
        "export const config = { value: VALUES.READY } satisfies { readonly value: string };",
        "",
      ].join("\n"),
    );
  },
);

expectFailure("outbound fetch fixture", "check-outbound-rules.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/partner-ai-core/src/bad.ts",
    "export const bad = () => fetch('https://example.test');\n",
  );
});

expectFailure(
  "undefined optional contract fixture",
  "check-undefined-optional-contracts.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "packages/partner-ai-core/src/bad.ts",
      [
        "const maybeTraceId = '';",
        "export const bad = { traceId: maybeTraceId || undefined };",
        "",
      ].join("\n"),
    );
  },
);

expectFailure(
  "unregistered generated artifact fixture",
  "check-generated-artifacts.mjs",
  (root) => {
    writeFixtureFile(root, "packages/chat-protocol/src/protocol.generated.ts", "export {};\n");
  },
);

expectFailure("runtime boundary process.env fixture", "check-runtime-boundaries.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/partner-ai-core/src/bad.ts",
    "export const token = process.env.SECRET_TOKEN;\n",
  );
});

expectFailure("package exports fixture", "check-package-exports.mjs", (root) => {
  writeJson(join(root, "tsconfig.json"), { references: [] });
  writeJson(join(root, "packages/orphan/package.json"), {
    name: "@side-chat/orphan",
    version: "0.0.0",
    private: true,
    type: "module",
    types: "./src/index.ts",
    scripts: { typecheck: "tsc" },
  });
});

expectFailure("unused dependency fixture", "check-unused-dependencies.mjs", (root) => {
  writeJson(join(root, "packages/orphan/package.json"), {
    name: "@side-chat/orphan",
    dependencies: { "left-pad": "1.0.0" },
  });
  writeFixtureFile(root, "packages/orphan/src/index.ts", "export const value = 1;\n");
});

// Meta-coverage: every governance check must be wired into the orchestrator, or it
// silently never runs. This catches a new check-*.mjs that someone forgot to add.
validateOrchestratorCoverage();

failIfErrors(errors);

function validateOrchestratorCoverage() {
  const orchestrator = readFileSync(join(scriptDirectory, "run-custom-lints.mjs"), "utf8");
  const wired = new Set(
    [...orchestrator.matchAll(/"(check-[a-z-]+\.mjs)"/gu)].map((match) => match[1]),
  );

  for (const entry of readdirSync(scriptDirectory)) {
    if (!/^check-[a-z-]+\.mjs$/u.test(entry)) continue;
    if (wired.has(entry)) continue;

    errors.push(
      `${entry}: governance check is not wired into run-custom-lints.mjs, so it never runs.\n` +
        "  Fix: add it to the checks list in scripts/run-custom-lints.mjs.",
    );
  }
}
