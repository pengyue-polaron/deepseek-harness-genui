# DeepSeek Harness GenUI v0.15.0

This release adds full Harness 0.1.5-rc.3 Web compatibility checks and updates
generated-app charts to Recharts 3. Existing compiled apps and saved task state
are preserved across the upgrade.

## Changes

- Extend the supported modern Harness peer range to 0.1.5-rc.2 and rc.3.
  Test rc.3 installation, shipped bundles, tool and browser behavior, the actual
  Web settings card, and design selection after reload. Retain the original
  0.1.0-rc.6 through rc.8 and 0.1.1-rc.1 through rc.2 host coverage.
- Pin transitive Harness dependencies in modern compatibility fixtures so
  upstream prerelease resolution cannot silently mix different host versions.
- Upgrade Recharts to 3.10.1, supply its required `react-is` peer, and update
  the Agent's chart API guidance. Add responsive bar, line, and pie chart
  browser tests with saved input and reload coverage.
- Check upgrades from 0.13.2, 0.14.1, and 0.14.2 for unchanged compiled app/map
  bytes, state, grants, and version history.
- Require license and release documentation before packaging and select Node
  24 for local development through `.nvmrc`.

## Chart source compatibility

Existing compiled apps keep their embedded chart library; upgrading the plugin
does not rewrite them. New builds use Recharts 3. Rebuilding or editing older
chart source may require migrating removed `activeIndex` props and `Customized`
chart-state props. See the [Recharts 3 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide).
This source compatibility change is why the release uses a new minor version.

## Install or upgrade

Update the plugin in the Harness profile actually used by your application,
then restart Harness. For the Web profile:

```sh
dsh plugin --profile web add dsh-plugin-genui@0.15.0 --save-exact
dsh --profile web
```

Desktop applications may use a separate `DSH_HOME` or profile. Updating the
system CLI's default profile does not update those installations.

## Validation and scope

- Local baseline suite: 143 passed; modern-host suite: 142 passed. Each skips
  one opt-in live-network test. The historical 0.13.2 bridge fixture runs only
  against the original host because that published plugin imports old exports.
- Typechecks, builds, bundle budgets, clean installation/removal, and upgrade
  checks passed locally. The production dependency audit reported no known
  vulnerabilities. See the [local validation report](maintenance-validation-2026-09-24.md).
- Publication is gated on Linux CI with Node 22.19 and 24, the host matrix,
  the live HTTPS scenario, production audit, installation and upgrade checks,
  and byte-for-byte verification of the published npm tarball.
- Harness 0.1.7-rc.1 passed an exploratory server-entry import check only;
  it is not included in the full compatibility promise.

TUI/headless profiles remain unsupported. Native Electron/Tauri windows were
not individually tested. No model API credentials or paid inference are used
by these compatibility checks.
