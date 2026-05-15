import type { ModelPort } from "../../ports/index.js";

export type FakeModelAdapterOptions = {
  chunkDelayMs?: number;
};

const defaultChunkDelayMs = 90;

const wordCount = (content: string) =>
  content.trim().split(/\s+/).filter(Boolean).length;

const parseChunkDelayMs = () => {
  const value = Number(process.env.SIDE_CHAT_FAKE_CHUNK_DELAY_MS);
  return Number.isFinite(value) && value >= 0 ? value : defaultChunkDelayMs;
};

const wait = (delayMs: number, signal?: AbortSignal) => {
  if (delayMs <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error("fake stream aborted"));

  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = globalThis.setTimeout(finish, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timeout);
      reject(new Error("fake stream aborted"));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
};

const createResponseChunks = (modelId: string, prompt: string) => [
  "# Assistant answer\n",
  `Model **${modelId}** received: ${prompt}\n\n`,
  "## Mocked streaming process\n",
  "- deterministic mocked streaming\n- markdown-ready output\n- visible chunk-by-chunk delivery for local UX testing\n\n",
  "> Mock insight: this response is intentionally richer than a plain echo so the widget can exercise markdown, spacing, and scroll behavior.\n\n",
  "| Feature | Demo value |\n| --- | --- |\n| Tables | Supported |\n| Lists | Ordered and unordered |\n| Code | Inline and fenced blocks |\n\n",
  "1. Parse the workspace context.\n2. Summarize the user's request.\n3. Suggest a concrete next action.\n\n",
  "Here is `inline code` and a TypeScript block:\n",
  "```ts\nconst x = 1;\nconst featureFlags = ['streaming', 'markdown', 'tables'];\n```\n",
  "### Suggested next actions\n- [ ] Review the highlighted metrics\n- [ ] Ask a follow-up question\n- [ ] Compare the response between available models\n",
];

export const createFakeModelAdapter = (
  options: FakeModelAdapterOptions = {},
): ModelPort => ({
  async *stream(request, signal) {
    if (request.message.content.toLowerCase().includes("fail")) {
      throw new Error("fake model failure");
    }

    const chunks = createResponseChunks(
      request.model.id,
      request.message.content,
    );
    const chunkDelayMs = options.chunkDelayMs ?? parseChunkDelayMs();

    for (const text of chunks) {
      await wait(chunkDelayMs, signal);
      yield { kind: "delta", text };
    }

    const inputTokens = wordCount(request.message.content);
    const outputTokens = wordCount(chunks.join(" "));
    yield {
      kind: "done",
      finishReason: "stop",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  },
});

export const fakeModelAdapter: ModelPort = createFakeModelAdapter();
