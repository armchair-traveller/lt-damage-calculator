# LaTale Damage Calculator

Personal LaTale damage calculator for comparing current stats, candidate stat changes, buffs, and equivalence values.

## Stack

- SvelteKit SPA
- shadcn-svelte initialized with Luma + Zinc
- Static adapter with `index.html` fallback
- Vitest regression tests for formula outputs

## Development

```sh
npm install
npm run dev
```

## Verification

```sh
npm run check
npm test
npm run build
```

Formula maintenance notes live in [docs/BLUEPRINT.md](docs/BLUEPRINT.md).
