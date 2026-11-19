# DeepSeek Harness GenUI v0.15.3

This release supports Harness `0.2.2-rc.1` (npm `latest` checked on 2026-11-19),
`0.2.2-rc.3` (the Desktop runtime), and `0.2.2-rc.5` (`next`), while retaining
the previously supported hosts.

## Changes

- Pass the current hosts' plugin compatibility gate without version exemptions.
  The plugin previously stopped at `0.2.1-rc.3`, so every 0.2.2 host rejected
  installation.
- Run connected actions through the batch tool API that arrived in 0.2.2.
  `execute({ calls, signal, agent })` settles `{ results }`; the previous
  `{ callId, name, arguments }` shape is rejected by the types and the runtime,
  which would have broken every action a generated app proxies through its
  declared tools. A single runtime marker selects the shape, so one bundle still
  serves `0.1.x`, `0.2.1`, and `0.2.2` hosts.
- Mount the native tool executor in tool fixtures on 0.2.2 hosts, which delegate
  `tools.execute` to a separately loaded executor.
- Prefer `webServer.getOrigin()` when the host exposes it, so `app_url` reports
  the real protocol and bind host instead of a port that 0.2.2 now types as
  optional.
- Declare the Canvas overlay's visible viewport as a macOS window-drag
  exclusion, which 0.2.2-rc.1 requires of custom client overlays covering the
  draggable header.
- Keep a completed Turn's generated app visible. Chat folds the process rows of
  a finished Turn and does not render folded rows, so an app that only lived in
  its tool row disappeared until that row was expanded. The Turn's last
  successful receipt is now republished on the Turn and rendered below the
  answer through `conversation.chat.turnTail`.


## Install or upgrade

Update the profile used by your application, then restart Harness:

```sh
dsh plugin --profile web add dsh-plugin-genui@0.15.3 --save-exact
dsh --profile web
```

Use Node.js `^22.19.0 || ^24.0.0`. No compiler install-script approval, Chrome,
or Chromium is needed by plugin users. Current design preferences are under
**Settings → Built-in plugins → Generated app design**.

## Validation and scope

Local Node 24 validation passed 146 baseline tests on the oldest supported host
and 144 applicable tests on each of `0.2.2-rc.1`, `0.2.2-rc.3`, and
`0.2.2-rc.5`, plus typechecking, builds, bundle budgets, and the packed
tarball. The plugin installed into a running Desktop `0.2.2-rc.3` profile
through the host compatibility gate without a version exemption.

The turn-tail surface raises the raw bundle ceiling from 260 KiB to 272 KiB;
the gzip ceiling stays at 72 KiB, so the transfer size is unchanged.

Release preflight additionally requires successful CI on the exact commit,
the live HTTPS scenario, clean installation/removal, and upgrades from
`0.13.2`, `0.14.1`, and `0.14.2` preserving compiled apps, state, grants, and
version history. The publish job verifies that npm serves the reviewed tarball
and attaches the same artifact and checksum to the GitHub release.

Supported Harness versions are `0.1.0-rc.6`–`rc.8`, `0.1.1-rc.1`–`rc.2`,
`0.1.5-rc.2`–`rc.3`, `0.1.7-rc.1`, `0.2.1-rc.2`–`rc.3`, and
`0.2.2-rc.1`–`rc.5`. Untested intermediate releases, alpha releases, and
future prereleases are excluded. TUI/headless remain unsupported. Native
desktop windows and paid model inference are not covered by these checks. The
macOS window-drag behaviour needs a manual check in Desktop, and the legacy
bridge fixture is tested only on hosts that still expose its imports.

See the [compatibility review](compatibility-2026-11-19.md) for the findings,
test scope, and remaining verification gaps.
