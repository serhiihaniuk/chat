import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PROCESS_LIFECYCLE_SYMBOL = Symbol.for("@side-chat/side-chat-service/process-lifecycle");
const SHUTDOWN_MESSAGE = "sidechat.shutdown";
const SHUTDOWN_COMPLETE_MESSAGE = "sidechat.shutdown.complete";
const HARD_DEADLINE_SLACK_MS = 250;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

const serviceRoot = resolve(import.meta.dirname, "../apps/side-chat-service");
const outputEntry = resolve(serviceRoot, ".output/server/index.mjs");
let bootStage = "compiled module import";

try {
  const output = await import(pathToFileURL(outputEntry).href);
  bootStage = "listener contract validation";
  const lifecycle = readLifecycle();
  const middleware = output.middleware;
  if (typeof middleware !== "function" || lifecycle === undefined) {
    throw new Error("Compiled service did not publish its listener contract");
  }

  const server = createServer(middleware);
  bootStage = "listener attachment";
  lifecycle.attachServer({
    close: () => closeServer(server),
    forceClose: () => server.closeAllConnections(),
  });

  let shutdownPromise;
  const requestShutdown = () => {
    lifecycle.beginShutdown();
    shutdownPromise ??= finishShutdown(lifecycle, server);
    return shutdownPromise;
  };
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  process.on("message", (message) => {
    if (isShutdownMessage(message)) void requestShutdown();
  });

  bootStage = "listener open";
  await listen(server, readPort(), readHost());
  process.send?.({ type: "sidechat.listening", port: listeningPort(server) });
} catch {
  console.error(`Side Chat failed during ${bootStage}.`);
  process.exitCode = 1;
  process.disconnect?.();
}

function readLifecycle() {
  const lifecycle = Reflect.get(globalThis, PROCESS_LIFECYCLE_SYMBOL);
  if (typeof lifecycle !== "object" || lifecycle === null) return undefined;
  if (!("beginShutdown" in lifecycle) || typeof lifecycle.beginShutdown !== "function") {
    return undefined;
  }
  if (!("attachServer" in lifecycle) || typeof lifecycle.attachServer !== "function") {
    return undefined;
  }
  if (!("shutdown" in lifecycle) || typeof lifecycle.shutdown !== "function") return undefined;
  if (
    !("maxShutdownDurationMs" in lifecycle) ||
    typeof lifecycle.maxShutdownDurationMs !== "number"
  ) {
    return undefined;
  }
  return lifecycle;
}

async function finishShutdown(lifecycle, server) {
  const hardDeadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, lifecycle.maxShutdownDurationMs + HARD_DEADLINE_SLACK_MS);
  try {
    const observations = await lifecycle.shutdown();
    await sendShutdownComplete(observations);
  } finally {
    clearTimeout(hardDeadline);
  }
  process.exit(0);
}

function sendShutdownComplete(observations) {
  if (process.send === undefined) return Promise.resolve();
  return new Promise((resolveSend) => {
    process.send({ type: SHUTDOWN_COMPLETE_MESSAGE, observations }, () => resolveSend());
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) resolveClose();
      else rejectClose(error);
    });
    server.closeAllConnections();
  });
}

function listen(server, port, host) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function listeningPort(server) {
  const address = server.address();
  return typeof address === "object" && address !== null ? address.port : undefined;
}

function readPort() {
  const source = process.env.PORT ?? process.env.NITRO_PORT;
  if (source === undefined) return DEFAULT_PORT;
  const port = Number(source);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Invalid service port");
  }
  return port;
}

function readHost() {
  return process.env.HOST ?? process.env.NITRO_HOST ?? DEFAULT_HOST;
}

function isShutdownMessage(message) {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === SHUTDOWN_MESSAGE
  );
}
