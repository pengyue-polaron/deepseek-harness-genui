# DeepSeek Harness GenUI v0.14.0 Release Test Report

- Test date: 2026-08-29
- Candidate: `dsh-plugin-genui@0.14.0`
- Local platform: macOS 26.6, arm64
- Package manager: pnpm 11.17.0

This report separates locally completed evidence from checks that must still run on the exact reviewed commit. No npm publication, Git tag, GitHub Release, commit, or push was performed while producing it.

## Completed source matrix

| Node.js | Top-level DeepSeek Harness fixture | Typecheck | Offline Vitest | Live browser verifier | Build and bundle |
| --- | --- | --- | --- | --- | --- |
| 22.19.0 | 0.1.0-rc.6 | Pass | 23 files; 142 pass; 1 expected network skip | 26/26 pass | Pass |
| 24.20.0 | 0.1.0-rc.6 | Pass | 23 files; 142 pass; 1 expected network skip | 26/26 pass | Pass |

The opt-in test makes a real public request to Open-Meteo after task-scoped approval. It passed in both Node runs. Offline runs skip that single scenario deliberately so ordinary CI is not coupled to an external service.

## Completed host compatibility matrix

Each row was installed and exercised in a fresh temporary project under Node 24.20.0. The listed `@deepseek-ai/dsh*` development packages were resolved to the exact target release candidate before typecheck, all tests, build, bundle verification, tarball creation, clean Web-profile installation, host startup, and removal.

| DeepSeek Harness | Typecheck | Offline Vitest | Build | Bundle budget | Pack/install/remove |
| --- | --- | --- | --- | --- | --- |
| 0.1.0-rc.7 | Pass | 142 pass; 1 expected network skip | Pass | Pass | Pass |
| 0.1.0-rc.8 | Pass | 142 pass; 1 expected network skip | Pass | Pass | Pass |
| 0.1.1-rc.1 | Pass | 142 pass; 1 expected network skip | Pass | Pass | Pass |
| 0.1.1-rc.2 | Pass | 142 pass; 1 expected network skip | Pass | Pass | Pass |

Concurrent browser-heavy files exposed a test-harness problem: recovery scenarios that passed immediately in isolation could spend their entire Playwright/Vitest limit waiting for an oversubscribed Chromium process. Vitest now runs test files serially, and the standalone suite has a 45-second test-only ceiling; Playwright assertions still fail earlier on their own bounds, while the product's eight-second behavior and recovery logic are unchanged. The transient timed-out attempts are not counted as passes; every matrix row above has a subsequent complete run on the final test configuration.

## Bundle budget

| Entry | Raw | Gzip | Budget raw / gzip |
| --- | ---: | ---: | ---: |
| `lib/index.js` | 147.2 KiB | 39.8 KiB | 152 / 42 KiB |
| `lib/client.js` | 108.8 KiB | 23.2 KiB | 128 / 30 KiB |
| `lib/invariant.js` | 0.4 KiB | 0.3 KiB | 4 / 2 KiB |
| Total | 256.4 KiB | 63.3 KiB | 260 / 72 KiB |

The host-entry raw ceiling moved from 144 to 152 KiB for the trusted preview/standalone broker. The tighter aggregate raw and gzip ceilings remain 260 and 72 KiB, so the release still fails if that security cost causes the overall package to exceed its existing budget.

## Completed package and upgrade gates

- The final npm tarball installs through the real pinned DSH CLI into a fresh `web` profile using `--allow-build=esbuild`.
- Every supported Harness fixture packs the candidate, passes `pnpm peers check`, activates it in a clean Web profile, starts the real host, and serves discovery and design-management endpoints.
- Removing the package from that profile removes both the installed package and active config entry. Separate TUI and headless activation probes fail closed because the required `webServer` service is absent.
- The installed production dependency tree is inspected recursively and contains no Playwright, Puppeteer, Chromium, ChromeDriver, or Selenium runtime.
- The package contains the release documentation, declaration maps, and the TypeScript source paths referenced by those maps.
- A real profile first installs the published `dsh-plugin-genui@0.13.2`, creates and builds two app versions, nested semantic state, and a grant, then upgrades with the documented v0.14 command.
- After upgrade, the old current app, preview, compiled assets, version history, nested state, and grant remain readable without rewriting old records. The first new write persists schema version 1 without changing old version or compiled asset bytes.
- A separate real-browser gate executes an unchanged v0.13.2 bundle through the v0.14 runtime, restores old nested state, writes a new value, reloads it, confirms every state request originates in the trusted parent, and verifies the child URL contains only the non-authorizing bridge marker.
- `pnpm audit --prod` reports no known vulnerabilities.

Repository browser tests use Playwright's isolated test Chromium. This is maintainer-only test tooling. The consumer clean-install and upgrade paths do not install, download, launch, or depend on Chrome/Chromium.

## User journeys exercised

The automated browser and integration suites cover:

- embedded, Canvas/fullscreen shell, and stable localhost delivery;
- explicit save followed by reload and later task-state reads;
- rapid repeated writes, dynamic keys, stalled writes, and slower connected actions;
- task-scoped permission approval, revoke, undeclared-tool rejection, old-version replay rejection, and public HTTPS path/query matching;
- nested PTC create/update receipts with secret-free recovery, transient retry, wrong-session rejection, and opaque/cross-site rejection;
- real-token exclusion from generated frames, fixed-marker replay rejection, computed form submission blocking, committed self-navigation, stale-document raw-message spoofing, second-channel rejection, host-control action rejection, and parent-enforced active version IDs;
- failed candidate rollback, runtime startup quarantine, refresh recovery, and interactive-session errors that must not globally quarantine an app;
- 260-pixel conversation width, keyboard reachability, visible focus, accessible names/alt text, modal inertness, and explicit light/dark host themes.

## Release controls verified locally

- Release is manual-dispatch only and requires the exact package version plus the literal confirmation `PUBLISH`.
- The exact commit must already have a successful complete CI workflow.
- The preflight job has read-only permissions and builds one immutable tarball plus checksum and reviewed release notes.
- The publish job receives that same artifact, verifies the checksum, publishes npm first, waits with bounded retries for registry propagation, compares npm's served tarball byte-for-byte, and only then creates the GitHub Release from the same assets and notes.
- The workflow fails closed unless a pre-existing GitHub `release` environment has at least one required reviewer. That environment is intentionally not created by this candidate; the maintainer must configure and inspect it before release.
- The preflight performs `pnpm audit --prod` and refuses publication when the production dependency audit fails.

## Explicitly outside the completed scope

- The exact uncommitted candidate has not yet run on GitHub-hosted Ubuntu. The release workflow refuses to publish until the exact reviewed commit has a successful CI result there.
- Windows, Safari, Firefox, and DeepSeek Harness Desktop were not exercised and are not claimed by this report.
- TUI/headless profiles are unsupported in v0.14 because activation requires the Web host service.
- DeepSeek Harness 0.1.2 alpha and later untested prereleases are outside the compatibility range. The `0.1.2-alpha.1` GitHub pre-release was inspected, but as of the test date the matching `@deepseek-ai/dsh` npm package family was not published under that version, so the fresh-install matrix could not reproduce it honestly.
- Formal Core Web Vitals/CDP measurements were unavailable in the local tool environment. Deterministic browser interaction tests and raw/gzip bundle budgets were used instead.
- The broker prevents generated or navigated documents from acquiring the bearer or undeclared host capabilities. It cannot prevent deliberately malicious code from disclosing data it was legitimately authorized to read, for example by encoding that data into a later self-navigation URL. CSP and source-contract checks are defense in depth, not a proof for arbitrary obfuscated JavaScript.
- Recharts 3, React 19, Framer Motion 13, lucide-react 1, esbuild 0.28, Vitest 4, tsdown 0.22, and TypeScript 7 are deferred major migrations rather than being mixed into this compatibility release.

The expected deprecation notices from Recharts 2.x and the transitive `node-domexception` package appeared only in some fresh host-matrix installs; they did not produce test or build failures.
