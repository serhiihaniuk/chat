import { buildTaskContext, type TaskContextDetails, type TaskContextParams } from "./context.ts";
import type { RegisteredTool, SidechatPiAPI } from "./types.ts";
import {
  runVerification,
  type VerificationDetails,
  type VerificationParams,
} from "./verification.ts";

function createTaskContextTool(
  pi: SidechatPiAPI,
): RegisteredTool<TaskContextParams, TaskContextDetails> {
  return {
    name: "sidechat_task_context",
    label: "Side Chat task context",
    description:
      "Build a compact, deterministic Side Chat repository packet before semantic reconnaissance or delegation.",
    promptSnippet:
      "Inspect Side Chat ownership, dirty paths, canonical docs, and active plan state without spending an agent turn.",
    promptGuidelines: [
      "Call this before context-builder when the relevant ownership boundary or plan state is not already known.",
      "Treat dirty files as user-owned until the parent assigns an explicit write scope.",
    ],
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["objective"],
      properties: {
        objective: { type: "string", minLength: 1, description: "Concrete task outcome." },
        mode: {
          type: "string",
          enum: ["locate", "trace", "impact", "plan-state"],
          description: "Kind of reconnaissance packet to prepare.",
        },
        hints: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 1 },
          description: "Known repository paths or domain terms.",
        },
      },
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return buildTaskContext(pi, ctx.cwd, params, signal);
    },
  };
}

function createVerificationTool(
  pi: SidechatPiAPI,
): RegisteredTool<VerificationParams, VerificationDetails> {
  return {
    name: "sidechat_verify",
    label: "Side Chat deterministic verification",
    description:
      "Run the narrowest deterministic Side Chat checks for an explicit implementation scope and save full output outside Git.",
    promptSnippet: "Verify assigned paths without spending a subagent turn on passing commands.",
    promptGuidelines: [
      "Pass only the approved write scope; never infer scope from every dirty file in the checkout.",
      "Use focused first, standard for integration confidence, and full only when repository-wide verification is justified.",
      "If a check fails, pass the returned log path to failure-analyst instead of pasting the full log into context.",
    ],
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["paths"],
      properties: {
        paths: {
          type: "array",
          minItems: 1,
          maxItems: 30,
          items: { type: "string", minLength: 1 },
          description:
            "Repository-relative files or directories in the approved implementation scope.",
        },
        tier: { type: "string", enum: ["focused", "standard", "full"], default: "focused" },
        claim: {
          type: "string",
          description: "Behavioral claim the checks are intended to support.",
        },
        tests: {
          type: "array",
          maxItems: 30,
          items: { type: "string", minLength: 1 },
          description: "Additional repository-relative test files to run.",
        },
      },
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return runVerification(pi, ctx.cwd, params, signal);
    },
  };
}

export default function registerSidechatOrchestrator(pi: SidechatPiAPI): void {
  pi.registerTool(createTaskContextTool(pi));
  pi.registerTool(createVerificationTool(pi));
}
