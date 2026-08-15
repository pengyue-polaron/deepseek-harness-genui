# Contributing

Use Node.js 24 and pnpm 11.

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

Keep changes focused. A behavior change should include a test and, when it affects the Agent, a natural-language case in `examples/real-user-scenarios.md`.

Generated apps must remain task-scoped, permission-gated, keyboard accessible, responsive, and usable in light and dark mode. Do not add compatibility layers for removed behavior.

Open an issue before a large change so the product boundary is clear before implementation.
