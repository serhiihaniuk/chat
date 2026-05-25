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

function expectFailure(name, script, setup) {
  const fixtureRoot = makeFixtureRoot();
  try {
    setup(fixtureRoot);
    const result = runNodeScript(join(scriptDirectory, script), fixtureRoot);
    if (result.status === 0) {
      errors.push(`${name}: ${script} unexpectedly passed`);
    }
  } finally {
    removeFixtureRoot(fixtureRoot);
  }
}

expectFailure("version range fixture", "check-version-pins.mjs", (root) => {
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
    "packages/chat-client/src/bad.ts",
    "export { value } from '../../chat-protocol/src/value.js';\n",
  );
  writeFixtureFile(root, "packages/chat-protocol/src/value.ts", "export const value = 1;\n");
});

expectFailure("relative source-folder boundary fixture", "check-boundaries.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/partner-ai-core/src/application/bad.ts",
    "import type { AgentRuntimePort } from '../ports/index.js';\nexport type Bad = AgentRuntimePort;\n",
  );
  writeFixtureFile(
    root,
    "packages/partner-ai-core/src/ports/index.ts",
    "export type AgentRuntimePort = { stream: unknown };\n",
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

expectFailure("build artifact fixture", "check-source-governance.mjs", (root) => {
  writeFixtureFile(root, "packages/chat-protocol/dist/index.js", "export {};\n");
});

expectFailure("typescript escape fixture", "check-source-governance.mjs", (root) => {
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
  writeFixtureFile(
    root,
    "packages/chat-protocol/src/bad.ts",
    "const value = 1 as unknown as string;\nexport { value };\n",
  );
});

expectFailure("outbound fetch fixture", "check-outbound-rules.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/partner-ai-core/src/bad.ts",
    "export const bad = () => fetch('https://example.test');\n",
  );
});

expectFailure("generated artifact header fixture", "check-generated-artifacts.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/chat-protocol/src/generated/sidechat-v1.schema.generated.json",
    '{ "_generatedFrom": "Generated from: fixture" }\n',
  );
  writeFixtureFile(
    root,
    "docs/generated/partner-ai-service.openapi.generated.json",
    '{ "_generatedFrom": "Generated from: fixture" }\n',
  );
  writeFixtureFile(root, "packages/chat-protocol/src/protocol.generated.ts", "export {};\n");
});

expectFailure("generated artifact missing fixture", "check-generated-artifacts.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/chat-protocol/src/generated/sidechat-v1.schema.generated.json",
    '{ "_generatedFrom": "Generated from: fixture" }\n',
  );
});

failIfErrors(errors);
