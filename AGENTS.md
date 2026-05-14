# Repository Guidelines

## Project Structure & Module Organization
This checkout is currently a minimal `chat-app` scaffold with only local OMX metadata under `.omx/`. As application code is added, keep the layout predictable:

- `src/` for app source code, grouped by feature (for example, `src/features/chat/`, `src/components/`, `src/lib/`).
- `tests/` or colocated `*.test.*` files for automated tests.
- `public/` for served static assets and `assets/` for source images, icons, or design files.
- `.omx/` is agent/runtime state; do not treat it as product source.

Update this guide when new top-level directories or tooling are introduced.

## Build, Test, and Development Commands
No package manifest or build scripts exist yet in this checkout. Once a Node/TypeScript app is initialized, prefer standard script names in `package.json`:

- `npm install` — install project dependencies.
- `npm run dev` — start the local development server.
- `npm test` — run the automated test suite.
- `npm run build` — produce a production build.
- `npm run lint` and `npm run typecheck` — validate style and types before merging.

Keep commands documented here in sync with `package.json`.

## Coding Style & Naming Conventions
Use TypeScript for application code unless the project explicitly chooses otherwise. Prefer 2-space indentation, single-responsibility modules, and clear feature-oriented names. Use `PascalCase` for UI components, `camelCase` for functions and variables, and `kebab-case` for route or asset filenames. Avoid adding dependencies until an existing utility or platform API has been considered.

## Testing Guidelines
Add tests with every behavior change. Name tests after the unit or feature under test, such as `chat-message.test.ts` or `MessageList.test.tsx`. Cover core chat flows, error states, and any serialization or API boundary logic. Run the narrowest relevant test first, then the full suite before opening a pull request.

## Commit & Pull Request Guidelines
This checkout has no Git history to infer conventions from. Use concise, imperative commit messages, preferably Conventional Commits such as `feat: add chat input` or `fix: handle empty messages`. Pull requests should include a short summary, testing evidence, linked issues when applicable, and screenshots or recordings for UI changes.

## Security & Configuration Tips
Do not commit secrets, local tokens, or `.env` files. Provide safe examples in `.env.example`, document required variables, and validate configuration at startup where possible.
