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

expectFailure(
  "forbidden dependency fixture",
  "check-dependency-policy.mjs",
  (root) => {
    writeJson(join(root, "package.json"), { name: "fixture", private: true });
    writeJson(join(root, "packages/side-chat-widget/package.json"), {
      name: "@side-chat/side-chat-widget",
      version: "0.0.0",
      private: true,
      dependencies: { "lucide-react": "1.0.0" },
    });
  },
);

expectFailure("boundary fixture", "check-boundaries.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/chat-protocol/src/bad.ts",
    "import React from 'react';\nexport const bad = React;\n",
  );
});

expectFailure("test placement fixture", "check-test-placement.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/chat-protocol/tests/bad.test.ts",
    "export {};\n",
  );
});

expectFailure("build artifact fixture", "check-code-quality.mjs", (root) => {
  writeFixtureFile(
    root,
    "packages/chat-protocol/dist/index.js",
    "export {};\n",
  );
});

expectFailure(
  "typescript escape fixture",
  "check-typescript-rules.mjs",
  (root) => {
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
      },
    });
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/bad.ts",
      "const value: any = 1;\nexport { value };\n",
    );
  },
);

expectFailure(
  "generated artifact fixture",
  "check-generated-artifacts.mjs",
  (root) => {
    writeFixtureFile(
      root,
      "packages/chat-protocol/src/protocol.generated.ts",
      "export {};\n",
    );
  },
);

failIfErrors(errors);
