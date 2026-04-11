# Snapshot Baseline — Variant Merger Engine Phase 0

**Captured:** 2026-04-08
**Branch:** `feat/variant-merger-phase0`
**Status:** Pre-Phase-1 (contains known matching regressions)

## What this directory contains

Vitest snapshot files that freeze the current output of the variant matching pipeline across all 84 fixtures:

- `internalTreeSnapshot.test.ts.snap` — InternalTree (VariantMerger 직후, Phase 1 only)
- `uiTreeSnapshot.test.ts.snap` — UITree (후처리 포함, 전체 파이프라인)

## Why these contain "wrong" output

These snapshots were captured **before** the Match Decision Engine work (Phase 1~3) began. They therefore embed all currently-known matching regressions documented in `test/audits/audit-baseline.json` — 55 fixtures with 1991 disjoint variant sibling pairs.

This is intentional. The snapshots serve as a **regression detector**, not a correctness oracle:

- **Snapshot diff during Phase 1~3**: means "matching output changed somewhere" — could be an intended improvement OR an unintended side effect.
- **Reviewer's job**: cross-reference each diff against `test/audits/audit-baseline.json` to distinguish:
  - Intended fix → accept new snapshot via `vitest -u`
  - Unintended regression → revert or fix engine change

## Important: vitest strips custom comments from snap files

Vitest regenerates the `.snap` file on every `-u` update and only preserves the `// Vitest Snapshot v1` header line. **Do not add custom comments to the `.snap` files** — they will be silently stripped. This `BASELINE.md` is the persistent documentation instead.

## Re-generating snapshots (Phase 1+)

When a Phase 1~3 change intentionally improves matching:

1. Run `npx vitest run test/snapshots/ -u` to regenerate all affected snapshots
2. Run `npm run audit:write` to update `audit-baseline.json`
3. Review both diffs manually
4. Commit with a message describing which regression patterns were fixed
