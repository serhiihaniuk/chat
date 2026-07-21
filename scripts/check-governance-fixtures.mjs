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

function writeQualitySkillFixture(
  root,
  { extraFrontmatter = "", unreachableReference = false, omitSecurityFailure = false } = {},
) {
  const skillDirectory = ".agents/skills/side-chat-code-quality-gate";
  const frontmatter = [
    "---",
    "name: side-chat-code-quality-gate",
    "description: Review production code quality with repository evidence.",
    extraFrontmatter,
    "---",
  ].filter(Boolean);
  writeFixtureFile(
    root,
    `${skillDirectory}/SKILL.md`,
    [...frontmatter, "", "# Quality gate", "", "- `references/eval-prompts.md`", ""].join("\n"),
  );

  const caseIds = [
    "boundary-leak",
    "native-stream",
    "over-refactor",
    "repository-audit",
    "security-review",
    "verification-reporting",
  ];
  const cases = caseIds.flatMap((identifier) => {
    const lines = [
      `## Case: ${identifier}`,
      "",
      "Prompt: Inspect the fixture.",
      "",
      "Expected evidence: Report current repository evidence.",
      "",
    ];
    if (!omitSecurityFailure || identifier !== "security-review") {
      lines.push("Fail if: The response is generic.", "");
    }
    return lines;
  });
  writeFixtureFile(
    root,
    `${skillDirectory}/references/eval-prompts.md`,
    ["# Evaluation cases", "", ...cases].join("\n"),
  );
  if (unreachableReference) {
    writeFixtureFile(root, `${skillDirectory}/references/orphan.md`, "# Orphan\n");
  }
}

expectFailure(
  "hard runtime pin fixture",
  "check-version-pins.mjs",
  (root) => {
    writeJson(join(root, "package.json"), {
      name: "fixture",
      private: true,
      type: "module",
      engines: { node: "24.16.0", npm: "11.15.0" },
      packageManager: "npm@11.15.0",
      devDependencies: {
        "@typescript/native": "npm:typescript@^7.0.2",
        typescript: "npm:@typescript/typescript6@6.0.2",
      },
    });
    writeFixtureFile(root, ".nvmrc", "24.16.0\n");
    writeJson(join(root, "package-lock.json"), {
      name: "fixture",
      lockfileVersion: 3,
      packages: {},
    });
  },
  "dependency @typescript/native must use an exact version",
);

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
    "packages/shared/src/bad.ts",
    "import React from 'react';\nexport const bad = React;\n",
  );
});

expectFailure("relative cross-package boundary fixture", "check-boundaries.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/side-chat-widget/src/bad.ts",
    "export { value } from '../../host-bridge/src/value.js';\n",
  );
  writeFixtureFile(root, "packages/host-bridge/src/value.ts", "export const value = 1;\n");
});

expectFailure("relative source-folder boundary fixture", "check-boundaries.mjs", (root) => {
  writeFixtureFile(
    root,
    "apps/side-chat-service/src/application/bad.ts",
    "import type { Turn } from '../domain/turn.js';\nexport type Bad = Turn;\n",
  );
  writeFixtureFile(
    root,
    "apps/side-chat-service/src/domain/turn.ts",
    "export type Turn = { id: string };\n",
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
  writeFixtureFile(root, "packages/shared/tests/bad.test.ts", "export {};\n");
});

expectFailure("code shape complexity fixture", "check-code-shape.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/shared/src/bad.ts",
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
    "packages/shared/src/fixtures.test-support.ts",
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

expectSuccess("quality skill structure fixture", "check-agent-skills.mjs", (root) => {
  writeQualitySkillFixture(root);
});

expectFailure(
  "quality skill frontmatter fixture",
  "check-agent-skills.mjs",
  (root) => {
    writeQualitySkillFixture(root, { extraFrontmatter: "compatibility: legacy" });
  },
  "unsupported frontmatter key compatibility",
);

expectFailure(
  "quality skill unreachable reference fixture",
  "check-agent-skills.mjs",
  (root) => {
    writeQualitySkillFixture(root, { unreachableReference: true });
  },
  "reference is unreachable",
);

expectFailure(
  "quality skill incomplete evaluation fixture",
  "check-agent-skills.mjs",
  (root) => {
    writeQualitySkillFixture(root, { omitSecurityFailure: true });
  },
  "case security-review is missing Fail if:",
);

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
      "apps/side-chat-service/src/application/dense.ts",
      [...helpers, ...Array.from({ length: 394 }, () => "// padding"), "export {};", ""].join("\n"),
    );
  },
  "needs a file-level mental-model comment",
);

expectFailure("flat source directory fixture", "check-code-shape.mjs", (root) => {
  for (let index = 1; index <= 13; index += 1) {
    writeFixtureFile(
      root,
      `packages/shared/src/flat/file-${index}.ts`,
      `export const value${index} = ${index};\n`,
    );
  }
});

expectFailure("build artifact fixture", "check-source-governance.mjs", (root) => {
  writeFixtureFile(root, "packages/shared/dist/index.js", "export {};\n");
});

expectFailure("typescript escape fixture", "check-source-governance.mjs", (root) => {
  writeStrictTsconfig(root);
  writeFixtureFile(
    root,
    "packages/shared/src/bad.ts",
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
      "packages/shared/src/bad.ts",
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
      "packages/shared/src/bad.ts",
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
      "packages/shared/src/bad.ts",
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
      "packages/shared/src/bad.ts",
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
      "packages/shared/src/bad.ts",
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
      "packages/shared/src/bad.test.ts",
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
      "packages/shared/src/assertion.test.ts",
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
      "packages/shared/src/assertion.test-support.ts",
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
      "packages/shared/src/explicit-any.ts",
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
      "packages/shared/src/good.ts",
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
    "packages/shared/src/bad.ts",
    "export const bad = () => fetch('https://example.test');\n",
  );
});

expectFailure(
  "undefined optional contract fixture",
  "check-undefined-optional-contracts.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "packages/shared/src/bad.ts",
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
    writeFixtureFile(root, "packages/shared/src/contract.generated.ts", "export {};\n");
  },
);

expectFailure("runtime boundary process.env fixture", "check-runtime-boundaries.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/shared/src/bad.ts",
    "export const token = process.env.SECRET_TOKEN;\n",
  );
});

expectFailure(
  "service application framework boundary fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/application/bad.ts",
      "import { Hono } from 'hono';\nexport const bad = new Hono();\n",
    );
  },
  "application imports outward dependency hono",
);

expectFailure(
  "service application dependency allowlist fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/application/bad.ts",
      "import { openai } from '@ai-sdk/openai';\nexport const bad = openai;\n",
    );
  },
  "application imports outward dependency @ai-sdk/openai",
);

expectFailure(
  "service Effect boundary fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/application/bad.ts",
      "import { Effect } from 'effect';\nexport const bad = Effect.succeed(1);\n",
    );
  },
  "v7 service must not import Effect dependency effect",
);

expectFailure(
  "service workflow directive placement fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/adapters/http/bad.ts",
      "export async function bad() {\n  'use workflow';\n}\n",
    );
  },
  "Workflow directive must live under",
);

expectFailure(
  "service adapter coupling fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/adapters/http/bad.ts",
      "import { adapter } from '#adapters/providers/azure';\nexport const bad = adapter;\n",
    );
  },
  "adapter imports another outer implementation",
);

expectFailure(
  "service adapter workflow coupling fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/adapters/http/bad.ts",
      "import { run } from '#workflows/production/chat-turn';\nexport const bad = run;\n",
    );
  },
  "adapter imports another outer implementation #workflows/production/chat-turn",
);

expectFailure(
  "service relative adapter coupling fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/adapters/http/bad.ts",
      "import { model } from '../providers/model.js';\nexport const bad = model;\n",
    );
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/adapters/providers/model.ts",
      "export const model = {};\n",
    );
  },
  "adapter imports another outer implementation ../providers/model.js",
);

expectFailure(
  "service workflow engine placement fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/adapters/http/bad.ts",
      "import { start } from 'workflow/api';\nexport const bad = start;\n",
    );
  },
  "Workflow engine import workflow/api is legal only",
);

expectFailure(
  "service production testing isolation fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/index.ts",
      "export { app } from '#composition/route/production';\n",
    );
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/composition/route/production.ts",
      "export { model } from '#testing/scripted-model';\n",
    );
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/testing/scripted-model.ts",
      "export const model = {};\n",
    );
  },
  "production import graph reaches testing dependency",
);

expectFailure(
  "service production testing folder isolation fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/index.ts",
      "export { app } from '#composition/route/production';\n",
    );
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/composition/route/production.ts",
      "export { fake } from './testing-harness/fake.js';\n",
    );
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/composition/route/testing-harness/fake.ts",
      "export const fake = {};\n",
    );
  },
  "production import graph reaches testing dependency",
);

expectFailure(
  "service workflow self-assembly fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/workflows/bad.ts",
      "import { model } from '#testing/scripted-model';\nexport const bad = model;\n",
    );
  },
  "workflow imports forbidden outer dependency #testing/scripted-model",
);

expectFailure(
  "service config escape fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/config/bad.ts",
      "export { value } from '../testing/secret.js';\n",
    );
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/testing/secret.ts",
      "export const value = 1;\n",
    );
  },
  "config subsystem imports outward dependency",
);

expectFailure(
  "service environment magic string fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/src/config/environment/bad.ts",
      "export const value = process.env['WORKFLOW_POSTGRES_URL'];\n",
    );
  },
  "environment key WORKFLOW_POSTGRES_URL must use SERVICE_ENV_KEYS",
);

expectFailure(
  "service root config environment magic string fixture",
  "check-side-chat-service-architecture.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "apps/side-chat-service/sidechat.config.ts",
      "export const postgresUrl = readEnv.secret('WORKFLOW_POSTGRES_URL');\n",
    );
  },
  "environment key WORKFLOW_POSTGRES_URL must use SERVICE_ENV_KEYS",
);

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
