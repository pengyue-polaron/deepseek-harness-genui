# Contributing

Use Node.js `^22.19.0 || ^24.0.0` and pnpm 11.

```sh
pnpm install
pnpm exec playwright install chromium
pnpm run typecheck
pnpm test
pnpm run build
```

The Playwright-managed Chromium above is only for repository browser tests. Plugin users do not install it.

Keep changes focused. A behavior change should include a test and, when it affects the Agent, a natural-language case in `examples/real-user-scenarios.md`.

Generated apps must remain task-scoped, permission-gated, keyboard accessible, responsive, and usable in light and dark mode. A compatibility layer needs a named supported migration and an executable, byte-preserving regression test; do not add speculative shims.

Open an issue before a large change so the product boundary is clear before implementation.
