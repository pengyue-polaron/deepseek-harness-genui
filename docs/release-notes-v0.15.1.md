# DeepSeek Harness GenUI v0.15.1

This release fixes [issue #14](https://github.com/pengyue-polaron/deepseek-harness-genui/issues/14): installation was rejected on Harness 0.1.7-rc.1. It also adapts the plugin to that host's settings and tool-view APIs.

## Changes

- Admit the tested 0.1.7-rc.1 host in Harness peer ranges. Remove the obsolete `dsh-client-runtime` peer: it is used only for legacy development types, but the new host checks even absent optional peers against its own version.
- Show design preferences under **Settings → Built-in plugins → Generated app design** on 0.1.7-rc.1. Keep the existing card on older hosts and avoid calling the removed settings namespace API.
- Handle the new tool preparation phase before arguments are available and keep configuration schema declarations portable across host dependency versions.
- Add 0.1.7-rc.1 to the CI host matrix. Exercise the host's own compatibility gate without exemptions, install the packaged plugin, start Web, save a design choice, reload, and check the management endpoints.

## Install or upgrade

Update the profile actually used by your application, then restart Harness. For Web:

```sh
dsh plugin --profile web add dsh-plugin-genui@0.15.1 --save-exact
dsh --profile web
```

No version exemption or compiler install-script approval is needed. Desktop applications may use a separate `DSH_HOME` or profile; update that installation's profile.

## Validation and scope

The supported versions are 0.1.0-rc.6 through rc.8, 0.1.1-rc.1 through rc.2, 0.1.5-rc.2 through rc.3, and exactly 0.1.7-rc.1. This patch does not claim compatibility with untested intermediate or future releases.

CI checks Node 22.19 and 24, the existing host matrix plus 0.1.7-rc.1, type declarations, shipped runtime bundles, tool/state behavior, and browser rendering. The published 0.13.2 bridge fixture runs only on legacy hosts; the old settings-provider test runs only on hosts with that API, while the actual modern Web test covers the new settings surface.

Release preflight also runs the live HTTPS browser scenario, production dependency audit, clean installation, and upgrades preserving compiled apps, state, permissions, and version history. Publication verifies that npm serves the exact reviewed tarball.

TUI/headless profiles remain unsupported. Native Electron/Tauri windows are not individually tested. Host compatibility checks do not require model credentials or paid inference.
