import { readFileSync } from "node:fs";
import ts from "typescript";

const defaultFiles = [
  "packages/side-chat-widget/src/ui/side-chat-widget/SideChatWidget.tsx",
  "packages/side-chat-widget/src/adapters/react/use-side-chat.ts",
  "packages/side-chat-widget/src/domain/message/stream-event-state.ts",
  "packages/side-chat-widget/src/ui/panel-shell/use-panel-shell.ts",
  "apps/side-chat-api/src/application/stream-chat.ts",
  "apps/side-chat-api/src/application/prompt-context.ts",
  "apps/side-chat-api/src/adapters/workbench/workbench-tools-adapter.ts",
  "apps/side-chat-api/src/adapters/ai/openai-model.ts",
];

const files = process.argv.slice(2);
const targetFiles = files.length > 0 ? files : defaultFiles;

function createSourceFile(file, text) {
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
}

function getLine(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function getFunctionName(node) {
  return node.name?.text ?? "anonymous";
}

function countLocalSmells(body) {
  let ifs = 0;
  let ternaries = 0;

  function visit(node) {
    if (ts.isIfStatement(node)) ifs += 1;
    if (ts.isConditionalExpression(node)) ternaries += 1;
    ts.forEachChild(node, visit);
  }

  visit(body);
  return { ifs, ternaries };
}

function analyzeSourceFile(sourceFile, text) {
  const result = {
    file: sourceFile.fileName,
    loc: text.split("\n").length,
    ifs: 0,
    ternaries: 0,
    maxIfDepth: 0,
    maxBlockDepth: 0,
    longFunctions: [],
  };

  function visit(node, ifDepth = 0, blockDepth = 0) {
    if (ts.isIfStatement(node)) {
      result.ifs += 1;
      result.maxIfDepth = Math.max(result.maxIfDepth, ifDepth + 1);
      visit(node.thenStatement, ifDepth + 1, blockDepth);
      if (node.elseStatement) visit(node.elseStatement, ifDepth + 1, blockDepth);
      return;
    }

    if (ts.isConditionalExpression(node)) result.ternaries += 1;

    const nextBlockDepth = ts.isBlock(node) || ts.isSourceFile(node)
      ? blockDepth + 1
      : blockDepth;
    result.maxBlockDepth = Math.max(result.maxBlockDepth, nextBlockDepth);

    if (ts.isFunctionLike(node) && node.body) {
      const start = getLine(sourceFile, node.getStart(sourceFile));
      const end = getLine(sourceFile, node.end);
      const lines = end - start + 1;
      const smells = countLocalSmells(node.body);

      if (lines > 40 || smells.ifs > 4 || smells.ternaries > 2) {
        result.longFunctions.push({
          name: getFunctionName(node),
          line: start,
          lines,
          ifs: smells.ifs,
          ternaries: smells.ternaries,
        });
      }
    }

    ts.forEachChild(node, (child) => visit(child, ifDepth, nextBlockDepth));
  }

  visit(sourceFile);
  return result;
}

const inventory = targetFiles.map((file) => {
  const text = readFileSync(file, "utf8");
  return analyzeSourceFile(createSourceFile(file, text), text);
});

console.log(JSON.stringify(inventory, null, 2));
