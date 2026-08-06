# LaTale Damage Calculator

Personal LaTale damage calculator for comparing current stats, candidate stat changes, buffs, and equivalence values.

## Stack

- SvelteKit SPA with Vercel API routes
- shadcn-svelte initialized with Luma + Zinc
- Jazz Cloud v2 for accountless live-build sharing
- Device-local named drafts and portable snapshot links
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
npm run jazz:validate
npm run build
```

Formula maintenance notes live in [docs/BLUEPRINT.md](docs/BLUEPRINT.md). Deployment, security,
and retention details for live links are in [docs/live-sharing.md](docs/live-sharing.md).
