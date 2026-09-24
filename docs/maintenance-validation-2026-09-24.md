# Maintenance validation — 2026-09-24

Validated locally on macOS arm64 with Node 24.21.0 and pnpm 11.17.0.
The initial local validation below preceded release preparation and used
package version 0.14.2. See the [v0.15.0 release notes](release-notes-v0.15.0.md)
for the release scope and additional upgrade gate from 0.14.2.

## Changes

- Restored the missing lockfile, Cordis patch, license, changelog, screenshot
  manifest, and screenshots from the current commit. Preserved existing README
  and community documentation edits.
- Added `.nvmrc` for Node 24 and required license/release documentation at pack time.
- Added Harness 0.1.5-rc.3 to the full compatibility matrix and retained the
  0.1.5-rc.2 startup regression. Test fixtures now pin transitive DSH packages
  to avoid mixing incompatible prereleases during fresh installs.
- Extended the declared modern peer range to the tested 0.1.5-rc.2/rc.3 hosts.
  The removed client-runtime package retains its original optional range.
- Added 0.14.1 to upgrade verification alongside the 0.13.2 migration fixture.
- Updated Recharts to 3.10.1 and explicitly supplied its `react-is@18.3.1` peer.
  Updated the generation prompt and added a browser regression for bar, line,
  and pie charts, saved chart input, reload, and a narrow viewport.

## Results

| Check | Result |
| --- | --- |
| Frozen dependency installation | Passed |
| Baseline typecheck and full suite | 23 files, 143 passed, 1 opt-in live-network test skipped |
| Harness 0.1.5-rc.3 typecheck and suite | 22 files, 142 passed, 1 opt-in live-network test skipped |
| Shipped entry with 0.1.5-rc.2 and rc.3 runtime dependencies | Passed |
| 0.1.5-rc.3 packed installation and actual Web frontend | Passed; no missing peers, browser errors, or dependency on the legacy client-runtime root link |
| 0.1.5-rc.3 settings and endpoints | Design card rendered; Material 3 survived reload; discovery/design endpoints passed |
| Baseline and modern builds and bundle budgets | Passed; baseline total 256.4 KiB raw / 63.4 KiB gzip |
| Clean package install, compiler, Web endpoints, removal | Passed; no native compiler approval or browser production dependency |
| Unsupported TUI/headless activation | Failed closed as expected |
| Upgrades from 0.13.2 and 0.14.1 | Compiled app/map bytes, saved state, grants, and version history preserved |
| Production dependency audit | 0 known vulnerabilities reported |
| Experimental 0.1.7-rc.1 server entry import | Passed; not a full compatibility claim |

The modern suite excludes the historical 0.13.2 bridge fixture because that
published package imports host exports removed upstream. That fixture remains
covered in the baseline suite. Tool lifecycle and generated-app state tests use
local test agents; no model API credentials or paid inference were used.

At the time of this local validation, the new CI matrix had not yet run remotely. This local pass
does not replace the existing Linux/Node 22 CI checks or test native Desktop
windows. The optional live weather-service scenario was not run.

## Chart migration

Existing compiled apps keep their embedded chart library and are not rewritten.
Rebuilding older chart source may need Recharts 3 API changes, particularly
removed `activeIndex` props and `Customized` chart-state props. See the
[upstream migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide).

## Reproduction

```sh
nvm use
pnpm install --frozen-lockfile
pnpm run package:plugin
pnpm run verify:host-import
node scripts/verify-host-import.mjs 0.1.5-rc.2
pnpm run verify:host-compat 0.1.5-rc.3
pnpm run verify:clean-install
pnpm run verify:upgrade
pnpm audit --prod
```
