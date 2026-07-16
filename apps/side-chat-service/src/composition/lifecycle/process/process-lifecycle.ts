import type { ShutdownCoordinator } from "./shutdown-coordinator.js";

const PROCESS_LIFECYCLE_SYMBOL = Symbol.for("@side-chat/side-chat-service/process-lifecycle");

/** Publish lifecycle ownership for the repository-owned compiled Node listener. */
export function publishProcessLifecycle(lifecycle: ShutdownCoordinator): void {
  Reflect.set(globalThis, PROCESS_LIFECYCLE_SYMBOL, lifecycle);
}
