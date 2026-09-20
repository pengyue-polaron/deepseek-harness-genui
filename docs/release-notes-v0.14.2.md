# DeepSeek Harness GenUI v0.14.2

This patch fixes plugin startup on Harness 0.1.5-rc.2 reporting that
`@deepseek-ai/dsh-llm` does not export `CallId`
([issue #13](https://github.com/pengyue-polaron/deepseek-harness-genui/issues/13)).

## Changes

- Remove the runtime dependency on `CallId`, which newer Harness versions renamed
  to `ToolCallId`. Derive the call ID type from the tool execution interface.
- Remove the runtime dependency on the deleted `settingsNamespace` helper,
  which would otherwise cause another startup error after fixing `CallId`.
- Derive tool JSON types from the execution interface to compile against both
  the original and modern Harness packages.
- Test the shipped entry against real 0.1.5-rc.2 runtime packages in CI, and
  import the shipped entry before rebuilding in the existing host matrix.

## Install or upgrade

In the Harness profile used by your desktop application, update
`dsh-plugin-genui` to **0.14.2**, then restart Harness. For the Web profile:

```sh
dsh plugin --profile web add dsh-plugin-genui@0.14.2 --save-exact
dsh --profile web
```

Replace `web` with your desktop application's active profile if it uses a
different profile. Updating the CLI's default profile will not update a
desktop application's separate `DSH_HOME`.

## Validation and scope

- The old entry reproduces the issue against 0.1.5-rc.2; the fixed entry loads.
- Original-host tests: 142 passed, one opt-in network test skipped. Targeted
  receipt, settings, and tool lifecycle tests passed again after type changes.
- Modern-host tests: 141 passed, one opt-in network test skipped. The separate
  published 0.13.2 migration fixture still requires an older host and is covered
  by the original-host suite.
- Real 0.1.5-rc.2 Web-profile installation, startup, GenUI endpoints, client
  settings rendering, design selection, and persistence after reload passed.
- Typechecks, build, and bundle budgets passed. The release workflow additionally
  checks the existing host matrix, production audit, live HTTPS scenario, clean
  installation, and upgrade regression before publishing.

The three issue-linked Electron/Tauri applications were inspected but their
native windows were not individually tested. This release addresses the shared
Harness startup error; it does not claim every desktop-specific integration or
future Harness version has been validated. TUI/headless profiles remain unsupported.

See the [issue #13 validation report](issue-13-validation.md) for details.
