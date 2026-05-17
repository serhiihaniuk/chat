# Widget Demo Learning Guide

Status: local learning path

Read this when you want to inspect the reusable widget outside the Workbench host app. This app is intentionally small: it proves package consumption and callback behavior without the full dashboard.

## Purpose

`apps/widget-demo` imports `SideChatWidget` through the public package API and mounts it on a simple page. It is the fastest place to test widget packaging, styles, callback props, deterministic stream behavior, and error/retry states.

## Owns / Does Not Own

| Owns | Does not own |
| --- | --- |
| Minimal widget consumer page. | Workbench dashboard UI. |
| Package-consumption smoke path. | Chat backend implementation. |
| Demo callback event display. | Host surface commands or table state. |

## Read Order

1. [`src/App.tsx`](src/App.tsx)  
   See the public widget import and props.

2. [`src/main.tsx`](src/main.tsx)  
   See the React mount.

3. [`src/styles.css`](src/styles.css)  
   See only demo-page styling. Widget styling comes from the widget package.

## Key Files

| File | Why it exists |
| --- | --- |
| `src/App.tsx` | Consumer example for `SideChatWidget`, `availableModels`, callbacks, and initial conversation id. |
| `src/main.tsx` | Vite/React entry point. |
| `src/styles.css` | Demo shell styling, not reusable widget styling. |

## Technology Purpose In Context

### React

React is only the consumer app framework here. It demonstrates that the widget does not require Next.js or a specific host application.

### Widget Package

The demo imports `@side-chat/side-chat-widget`, not source internals. That keeps package boundaries honest.

## Boundary Warnings

- Do not add Workbench-specific code here.
- Do not use this app as the source of truth for host commands.
- Do not bypass the widget public API.

## Verification

Run from the repository root:

```sh
npm run typecheck
npm run verify
```

## Read Next

- [Side-Chat Widget](../../packages/side-chat-widget/LEARNING.md) for package internals.
- [Embedded Host App](../embedded-host-app/LEARNING.md) for the realistic host integration.
