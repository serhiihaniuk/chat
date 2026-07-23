# Adoption Release

Read this when: preparing an alpha tag or deciding whether the starter is ready for an adopter handoff.
Source of truth for: the alpha release stop condition and deferred release evidence.
Not source of truth for: command semantics ([verification.md](verification.md)), deployment sizing ([capacity-and-deployment.md](capacity-and-deployment.md)), or database procedures ([database.md](database.md)).

The alpha release decision is an evidence checklist, not one command. The release owner records the commands, environment, provider authorization, known deferrals, and license status before tagging or handing the starter to another organization.

## Stop condition

Do not tag or publish an alpha until every required item below has a named owner and a recorded result.

| Item                     | Required evidence                                                                                                                    | Stop rule                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Local deterministic gate | `npm run verify` passes on the supported Node/npm range.                                                                             | Blocks alpha.                                                                  |
| Registry audit           | `npm run audit` reports no high-or-above advisory.                                                                                   | Blocks alpha.                                                                  |
| Browser contract         | `npm run test:e2e` passes against the widget harness.                                                                                | Blocks alpha.                                                                  |
| Production identity      | The app-local `RequestAuthorizer` returns tenant-qualified workspace and subject identity, with focused ownership tests.             | Blocks adopter deployment; the bundled placeholder intentionally fails closed. |
| Database and lifecycle   | `npm run test:db:container` and `npm run test:service:lifecycle` pass when Docker/Testcontainers are available.                      | Blocks alpha only for releases that claim disposable-Postgres evidence.        |
| Provider smoke           | A release owner explicitly authorizes any real OpenAI or Azure smoke, then records the config name, provider, and non-secret result. | Blocks any release that claims real-provider readiness.                        |
| License                  | The intended license is committed before publication outside the owning organization.                                                | Blocks public or external publication.                                         |
| Release ownership        | One maintainer owns the tag, evidence log, and go/no-go decision.                                                                    | Blocks alpha.                                                                  |

`npm run verify:alpha` runs the local deterministic gate, registry audit, disposable database lane, compiled lifecycle lane, and browser lane. It is the preferred alpha command when Docker/Testcontainers are available. Ordinary `npm run verify` deliberately excludes `npm audit` because registry availability is not deterministic.

## Deferred production-container validation

Production-service container validation is deferred. The existing `npm run verify:container` command builds the pinned development/test image and runs the alpha checks inside it; it does not build or smoke-test `infra/docker/side-chat-service.Dockerfile`.

When Docker/infra work is reopened, add and record an explicit production-image build and service smoke. Until then, an alpha may proceed only when its release notes state that production-container readiness is not claimed.

## Provider smoke authorization

Real-provider smoke tests are never implicit. Before running one, the release owner must authorize:

- the provider and config variant;
- the workspace or tenant used for the smoke;
- the budget and data-safety boundary;
- whether the result can be included in release notes.

Record only non-secret evidence: command name, provider family, config variant, outcome, and sanitized error code if it fails.
