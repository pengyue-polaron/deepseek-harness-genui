# DeepSeek Harness GenUI v0.14.0

v0.14 makes generated task apps more dependable across creation, interaction, follow-up, and recovery. It remains a Web-profile release candidate for the upstream DeepSeek Harness developer-preview line; this release does not claim 1.0 stability.

## Highlights

- Saved UI state is serialized and coalesced, with bounded storage and predictable timeout/retry behavior. A later Agent turn can continue from explicitly saved selections without racing an in-flight write.
- Failed candidate builds still leave the last ready app in place. A sandbox startup failure now quarantines the failing current version and restores the newest ready version when available, including after refresh.
- Connected actions use canonical host declarations, task- and version-bound capabilities, and stricter same-origin management controls. Public HTTPS declarations now match origin, path segments, and declared queries precisely.
- Generated bundles now start behind a trusted, one-document broker. The real task capability stays in the Harness shell or standalone parent; the opaque child receives only a fixed, non-authorizing compatibility marker. Navigation closes the channel, host-control actions are rejected, and the parent binds allowed requests to the active version.
- Embedded cards can recover when nested tool results lose presentation metadata. The fallback receipt contains no preview URL or capability token and exchanges access only through a same-origin, task-bound route.
- Explicit Harness light/dark changes propagate into the shell and generated app. Loading, failure, retry, keyboard focus, narrow-screen, and settings states have all been expanded.
- The consumer install path uses native esbuild and does **not** install, download, launch, or depend on Chrome/Chromium. Playwright Chromium remains repository-only test tooling.

## Install or upgrade

Use Node.js `^22.19.0 || ^24.0.0` and the DeepSeek Harness Web profile.

```sh
dsh plugin --profile web add dsh-plugin-genui --allow-build=esbuild
dsh --profile web
```

To upgrade an existing profile after reviewing these notes:

```sh
dsh plugin --profile web add dsh-plugin-genui@0.14.0 --save-exact --allow-build=esbuild
```

The release gate performs a real upgrade from the published v0.13.2 package and checks that existing apps, nested semantic state, grants, version references, and old version assets remain readable. A real unchanged v0.13.2 bundle is also executed through the new broker to read, write, and restore state; its JavaScript and source-map bytes are compared before and after. This is a specific tested migration, not a promise for every historical or unreleased build.

## Compatibility

| Component | Validated versions |
| --- | --- |
| Node.js | 22.19.0 and 24.x |
| DeepSeek Harness | 0.1.0-rc.6, rc.7, rc.8; 0.1.1-rc.1, rc.2 |
| Supported host | Web profile: Inline, Canvas, fullscreen, and localhost links |

The upstream 0.1.2 alpha line is intentionally outside this compatibility promise.

## Validation

- 23 automated test files: 142 passing and one opt-in external-network scenario skipped in each offline compatibility run.
- The opt-in public Open-Meteo browser suite passes separately: 26 of 26 browser scenarios.
- Clean tarball installation activates in a fresh Web profile for every supported Harness fixture, passes peer checks, starts the real host, removes cleanly, and contains no browser runtime dependency. TUI/headless probes fail closed on the missing Web host service as documented.
- The compatibility matrix type-checks, builds, and verifies bundle budgets against every Harness version listed above.
- Total production entry bundle: approximately 256.4 KiB raw / 63.3 KiB gzip, within the unchanged 260 / 72 KiB aggregate release budget. The increase from v0.13.2 is recorded rather than hidden: the trusted preview/standalone broker raises the host entry to 147.2 KiB raw.

See the [v0.14 release test report](https://github.com/pengyue-polaron/deepseek-harness-genui/blob/v0.14.0/docs/release-test-report-v0.14.0.md) for the final environments, commands, and explicitly untested scope.

## Known limits

- v0.14 supports the Web profile only. TUI/headless activation is not supported because the plugin requires the Web host service.
- DeepSeek Harness is still marked developer preview upstream, so the supported prerelease range is intentionally exact.
- Recharts 2.x and a transitive `node-domexception` dependency emit deprecation warnings. Their major-version migrations are deferred to avoid mixing API changes into this compatibility release.
- Repository browser tests use Playwright's isolated Chromium; plugin users do not install it.
- The token and host-capability boundary does not make deliberately malicious generated code safe to trust with data it has already been authorized to read. Source checks and CSP are defense in depth; do not place secrets in generated-app state or grant access to data the app should not display.
- Formal Core Web Vitals measurements were not available in this release environment. Deterministic browser interaction tests and explicit raw/gzip bundle budgets are used instead.

For the full itemized change list, see the [changelog](https://github.com/pengyue-polaron/deepseek-harness-genui/blob/v0.14.0/CHANGELOG.md).
