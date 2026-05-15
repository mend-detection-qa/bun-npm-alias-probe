# bun-npm-alias-probe

A minimal Bun probe project for Mend SCA detection testing.
Exercises the `npm:` alias protocol (S1 feature, Tier 4 docs-gap).

## Pattern

**S1 — `npm:` aliases** (`"foo": "npm:bar@1.0"`).

The `npm:` protocol lets consumers install a package under a different
name than what is published on the npm registry. It is a first-class Bun
(and npm 6.9+) feature. The format in `package.json` is:

```json
"<alias-name>": "npm:<upstream-package>@<version-range>"
```

Bun encodes this in `bun.lock` with:
- **Key**: the alias name (the install-time identity; what lives in `node_modules/`)
- **Tuple[0]**: `"<upstream-name>@<resolved-version>"` (the actual npm package and pinned version)

## Why standalone

Alias resolution is a distinct manifest-parsing path from plain registry
deps. The failures it triggers — alias name loss, entry merging, wrong
version extraction — are silent: the tree is returned successfully but
with incorrect node identities.

Bundling this with `basic-registry` would obscure whether a failure was
caused by aliasing or by a more basic parsing issue. A standalone probe
lets the comparator assert specifically on alias identity preservation.

## Mend config

No `.whitesource` emitted.

`js-bun` is NOT in Mend's `install-tool` list. Manual toolchain pinning
via `scanSettings.versioning` is impossible for this ecosystem. The probe
ships no `.whitesource` file.

Implication: Mend falls back to its npm-resolver logic. The npm resolver
was designed to parse `package-lock.json`, whose `packages` section uses
one JSON object per package. Bun's `bun.lock` uses a tuple format
`["realname@version", {metadata}, "hash"]` — structurally different. How
well Mend's JSONC stripper and package-section walker handle Bun's tuple
format is the core exploratory question for this probe.

## Alias-target table

| Install name (alias) | Upstream package | Version specifier | Resolved version |
|---|---|---|---|
| `my-lodash` | `lodash` | `npm:lodash@^4.17.0` | `4.17.21` |
| `old-lodash` | `lodash` | `npm:lodash@3.10.1` | `3.10.1` |
| `hono` | `hono` (no alias) | `^4.12.0` | `4.7.11` |

Note: `my-lodash` and `old-lodash` both resolve to the upstream `lodash`
package but at different versions. They are two distinct entries in the
dependency tree and must never be merged into a single node.

## Dependency graph

```
bun-npm-alias-probe (root)
├── my-lodash@4.17.21    [direct, alias → lodash@4.17.21, leaf]
├── old-lodash@3.10.1    [direct, alias → lodash@3.10.1,  leaf]
└── hono@4.7.11          [direct, plain registry dep,      leaf]
```

## Failure modes

### Failure A — alias name collapsed to upstream name

The parser reads the tuple element `"lodash@4.17.21"` and uses `lodash`
as the node identity, ignoring the lockfile key `my-lodash`. Consequence:
the dep tree shows `lodash` (twice, or once if also merged), not
`my-lodash` or `old-lodash`. The alias identity is entirely lost.

Detection signal: any dep named `lodash` in the output tree is wrong.
The names `lodash` must not appear — only `my-lodash`, `old-lodash`.

### Failure B — two aliases merged into one entry

Both `my-lodash` and `old-lodash` resolve to the upstream package
`lodash`. A parser that de-duplicates by upstream name merges them into
one node. Consequence: only 2 direct deps are reported (or 1 `lodash`
entry), instead of the correct 3 direct deps. The probe's
`expected_direct_dependencies_number = 3` assertion catches this.

### Failure C — alias name reported but resolved version lost

The parser preserves the alias key (`my-lodash`) but extracts the version
from the `package.json` specifier (`npm:lodash@^4.17.0`) rather than
from the tuple's resolved entry (`lodash@4.17.21`). Consequence:
version reported is `^4.17.0` (a range, not a pinned version) or missing.

### Failure D — zero detection (JSONC parse failure)

Mend's npm-resolver fallback cannot parse Bun's JSONC lockfile (tuple
format, trailing commas, JSONC comments). All packages are dropped.
Consequence: empty dep tree. The `expected_total_dependencies_number >= 1`
assertion catches this.

## Resolver notes

The UA `javascript.md` resolver documents npm, Yarn, and pnpm detection.
Bun is NOT a named UA resolver. When Mend encounters a directory with
`bun.lock` but no `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`,
the resolver selection table has no explicit match. Expected behavior is
npm-resolver fallback, which attempts to parse `bun.lock` as
JSONC/JSON and walk a packages section.

Bun's `packages` section uses a tuple `["name@version", {meta}, "hash"]`
rather than npm's `"name": { "version": "...", "resolved": "...", ... }`.
This structural mismatch is the primary source of Mend detection failures
for Bun projects. The alias probe adds a second layer: even if the tuple
format is parsed correctly, the parser must use the tuple **key** (alias
name) as the node identity, not the tuple **element[0]** (upstream name).

The UA resolver file does not mention Bun or the `npm:` alias protocol.
This probe is therefore exploratory rather than regression-bound.

---

Tracked in: docs/BUN_COVERAGE_PLAN.md §11.4 entry #17