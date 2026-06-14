# shared

Read this when: editing cross-package utility code.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: product workflow or domain terms.

## Owns

- Small utilities that are truly reusable across packages.
- TypeScript-only helpers with no product ownership.

## Does Not Own

- Product policy.
- Protocol DTOs.
- Runtime/provider behavior.
- Widget rendering.
- Persistence adapters.

## Public Surface

Utility exports only.

## Boundary Rules

- Keep dependencies minimal.
- Do not turn this package into a dumping ground for domain concepts.
- Prefer package-owned helpers when a utility only makes sense in one package.

## Tests

Add package-local tests when a utility has behavior worth preserving.

## Canonical Docs

- `docs/architecture/system-map.md`
- `docs/architecture/package-boundaries.md`
