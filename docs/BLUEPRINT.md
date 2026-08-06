# LaTale Damage Calculator Blueprint

This repo is a personal SvelteKit SPA for comparing LaTale stat changes, buffs, and equivalence values. UI, interaction design, layout, and persistence can evolve freely. The damage formula and its implementation are the protected contract.

## Current Architecture

- `src/lib/calculator/formula.js`: preserved legacy formula implementation. Treat this as the audit surface.
- `src/lib/calculator/model.ts`: typed adapter layer for UI input normalization, buff aggregation, target defenses, formatting, persistence, and reports.
- `src/lib/calculator/buffs.js`: buff catalog copied from the legacy app.
- `src/lib/calculator/defaults.js`: default stats, settings, and selected buffs copied from the legacy app.
- `src/lib/calculator/presets.js`: class factor presets copied from the legacy app.
- `src/lib/calculator/local-build-library.ts`: named device drafts, migration, and JSON backups.
- `src/lib/calculator/snapshot-codec.ts`: compressed, versioned, URL-fragment snapshots.
- `src/lib/calculator/formula.test.ts`: regression tests for legacy default damage and equivalence output.
- `src/lib/schema.ts` and `src/lib/permissions.ts`: Jazz live-build storage and access rules.
- `src/routes/api/live-builds`: accountless live-link HTTP API.
- `src/routes/+page.svelte`: shadcn-svelte calculator interface.
- `src/routes/+layout.ts`: SPA mode, prerendered with SSR disabled.
- `svelte.config.js`: Vercel adapter for the prerendered calculator and server API routes.

## Formula Contract

The formula module expects stats as:

```ts
Record<StatKey, [flatOrDisplayedValue: number, percentMultiplier: number]>
```

Important behavior to preserve:

- `applyChanges(stats, changes)` converts displayed values back to raw values, adds flat and percent deltas, then reapplies multipliers.
- `calculateDamage(stats, settings, defenses, enemyType)` calculates base damage, critical/minmax/amplification multipliers, final factor, and mitigation.
- `calculateEquivalenceIncrease(stats, settings, defenses, increasePercent)` works backward from a desired average damage increase and reports flat/percent stat equivalents.
- Normal and boss average increases are weighted from per-enemy increases, not from comparing averaged raw damage totals.

If formula behavior changes intentionally, update `formula.test.ts` in the same commit and document why.

## Data Flow

1. UI inputs are strings so blank fields remain visually blank.
2. `model.ts` converts blanks and invalid values to `0` before calling formula functions.
3. Selected buffs are normalized against the buff catalog so newly added buff groups appear as `None` by default.
4. Buffs are summed as stat deltas, then applied with `applyChanges`.
5. Defenses come from `TARGETS` in `model.ts`; target additions should include normal and boss profiles with `multiplier`, `flat`, `mitigation`, and `phasing`.
6. Reports are derived from current state and saved in the named-build library under
   `ltdc:library:v1`; existing `ltdc:state:v2` data migrates on first load.

## Updating Formulas Or Balance Data

1. Change data tables first when only buffs, presets, defaults, or defenses changed.
2. Change `formula.js` only when the game formula itself changed.
3. Add or update regression cases in `formula.test.ts`.
4. Run:

```sh
npm run check
npm test
npm run build
```

5. Browser-check the changed workflow, especially buffs, equivalence, import/export, and mobile layout.

## SPA And UI Notes

- The calculator remains a client-rendered, prerendered SvelteKit page; live-build APIs run as
  Vercel functions through `@sveltejs/adapter-vercel`.
- shadcn-svelte is initialized with the Luma style and Zinc base color.
- Keep the first viewport as the working calculator, not a landing page.
- Use compact controls and tables; this is an operational comparison tool.
- Prefer maintaining the domain model in `model.ts` over pushing calculation logic into Svelte components.
