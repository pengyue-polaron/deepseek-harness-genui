# Issue #13 compatibility validation

Validated on 2026-09-20 with Node 24.21.0 and Harness 0.1.5-rc.2. The plugin is
the fix candidate built from the 0.14.1 checkout for release 0.14.2, not the
published 0.14.1 package.

## Results

| Check | Result |
| --- | --- |
| Pre-fix shipped entry with 0.1.5-rc.2 dependencies | Reproduces the missing `CallId` export error |
| Fixed shipped entry with 0.1.5-rc.2 dependencies | Pass |
| Typecheck against the checkout's original dependencies | Pass |
| Typecheck against 0.1.5-rc.2 dependencies | Pass after the additional type compatibility changes below |
| Build and bundle budgets | Pass |
| Original-host full suite, initial fix | 23 files passed; 142 tests passed, 1 skipped |
| Original-host targeted rerun after type changes | 10 tests passed: receipts, settings namespace, and tool lifecycle |
| Modern-host suite excluding the historical plugin fixture | 22 files passed; 141 tests passed, 1 skipped |
| Install the packed fix with `dsh plugin --profile web add` | Pass |
| Boot the real modern Web profile with the installed plugin | Pass |
| GenUI discovery and design-management endpoints | HTTP 200, expected response bodies |
| Real Web frontend: Settings → Plugins → Generated app design | Card renders; no page, console, or failed-response errors |
| Select Material 3, reload, verify saved selection, reset to Automatic | Pass |
| Repeat Web startup and browser checks without the old client-runtime package exposed at the test project root | Pass |

The skipped test uses a live public weather service and is gated by
`GENUI_LIVE_E2E`. No model API key or paid inference was used.

## Additional findings

- `settingsNamespace` is also absent from the modern settings package. Removing
  only the `CallId` import is insufficient; both runtime imports were removed.
- `JsonValue` is no longer re-exported by `dsh-tools`. The plugin now derives
  that type from `ToolExecutionSuccess['value']`, which exists on both versions.
- The modern client block type no longer declares the legacy `callView` and
  `resultView` fields. The receipt fixture now returns a structurally checked
  object compatible with both versions.
- `tests/legacy-bridge.e2e.spec.ts` imports the published **0.13.2** plugin to
  generate historical artifacts. That unmodified package itself imports
  `CallId`, so it cannot load against modern LLM dependencies. It remains tested
  in the original-host suite; it is explicitly excluded from the modern run,
  rather than counted as a passing modern compatibility check.
- A direct request to the old `/plugins/dsh-plugin-genui/client.js` URL returns
  404 on the modern host. This is not a frontend loading failure: the real
  client loads through the modern `/plugins/` composition endpoint and the
  GenUI settings card works. Browser checks use the actual frontend.

## Reproduction

For the checkout's original dependency set:

```sh
pnpm run typecheck
pnpm test
pnpm run build
pnpm run verify:bundle
pnpm run verify:host-import
pnpm run prepare:bundle
```

For the modern run, use an isolated copy of the project. Pin the `dsh` CLI and
its direct `dsh-*` development dependencies to `0.1.5-rc.2`, retaining
`dsh-client-runtime@0.1.1-rc.2` for the legacy client type imports only. Some
upstream peer ranges require stable `>=0.1.5` even though only prereleases are
published; explicitly override those DSH peers to `0.1.5-rc.2` in the isolated
test workspace. Do not alter the project's baseline lockfile.

```sh
pnpm run typecheck
pnpm exec vitest run --exclude tests/legacy-bridge.e2e.spec.ts
```

Use a fresh `DSH_HOME` for the real host. Install the packed local fix with
the modern CLI, then launch `dsh web --no-open --host 127.0.0.1 --port 0`.
Open the emitted authenticated URL in Chromium, dismiss the first-run notice
and choose Configure later for API credentials. Open Settings → Plugins,
change the generated-app design, reload, check persistence, and reset it.
The final run used an isolated workspace and hid the legacy client-runtime
root link before restarting the server.

## Desktop scope and remaining limits

The three issue-linked repositories were inspected at these revisions:

- anywhere-labs/dsh-desktop: `d95802b8206dae246fcaec177545a4f591190b54`
- dataelement/dsh-desktop: `959b26fb5c2d19fd09ea674417843526ef2cef04`
- hairyf/deepseek-harness-desktop: `d6468b5cf154a39953f72d44dac96366585d040a`

They compose or launch Harness profiles. The tests above exercise the actual
0.1.5-rc.2 host, installed package, Web client, and tool/MCP paths. They do **not**
constitute native-window tests of each Electron/Tauri application or validation
of every desktop-specific patch. No release, commit, or push had been performed at the time of these tests.
