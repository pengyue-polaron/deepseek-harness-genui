# Contributing

Use Node.js `^22.19.0 || ^24.0.0` and pnpm 11.
The repository's `.nvmrc` selects Node 24 for local development.

```sh
nvm use
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run typecheck
pnpm test
pnpm run build
```

The Playwright-managed Chromium above is only for repository browser tests. Plugin users do not install it.

Run `pnpm run verify:host-compat 0.1.5-rc.3` to check the current Harness Web
host in an isolated project. This runs the shipped entry, typecheck, tests,
installed Web frontend, settings persistence, and a rebuild. The published
0.13.2 fixture imports removed host exports, so its legacy bridge test runs
only in the original-host suite. The old client-runtime package is retained
for types in the modern fixture and hidden during the real Web smoke test.

After `pnpm run package:plugin`, run `pnpm run verify:upgrade` to check
0.13.2, 0.14.1, and 0.14.2. A specific source version can be passed for local diagnosis.
The checked-in lockfile and generated `lib` files must accompany dependency
or source changes.

Generated apps use Recharts 3. Existing compiled apps remain unchanged across
upgrades, but rebuilding older chart source may require the
[Recharts 3 migration](https://github.com/recharts/recharts/wiki/3.0-migration-guide).

Keep changes focused. A behavior change should include a test and, when it affects the Agent, a natural-language case in `examples/real-user-scenarios.md`.

Generated apps must remain task-scoped, permission-gated, keyboard accessible, responsive, and usable in light and dark mode. A compatibility layer needs a named supported migration and an executable, byte-preserving regression test; do not add speculative shims.

Open an issue before a large change so the product boundary is clear before implementation.
