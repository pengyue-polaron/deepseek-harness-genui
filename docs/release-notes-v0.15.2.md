# DeepSeek Harness GenUI v0.15.2

This release supports Harness `0.2.1-rc.2` (npm `latest` checked on 2026-10-23)
and `0.2.1-rc.3` (`next`), while retaining the previously supported hosts.

## Changes

- Pass the current hosts' plugin compatibility gate without version exemptions.
- Display app titles while tool arguments are still streaming. Use the host's
  bounded lazy argument reader instead of repeatedly parsing the full generated
  source payload, with a fallback for older hosts.
- Keep receipt parsing independent of unrelated host tool-record fields and
  preserve malformed/duplicate-envelope rejection.
- Add both current hosts to CI. Update installed Web tests for the new sign-in
  dialog and account menu, and wait for settings to load before checking saved
  values after a reload.
- Extend npm propagation retries before the release workflow's byte-for-byte
  tarball check, addressing the previous release's verification timeout.

## Install or upgrade

Update the profile used by your application, then restart Harness:

```sh
dsh plugin --profile web add dsh-plugin-genui@0.15.2 --save-exact
dsh --profile web
```

Use Node.js `^22.19.0 || ^24.0.0`. No compiler install-script approval, Chrome,
or Chromium is needed by plugin users. Current design preferences are under
**Settings → Built-in plugins → Generated app design**.

## Validation and scope

Local Node 24 validation passed 146 baseline tests and 144 applicable tests
on each current host, plus typechecking, builds, bundle budgets, packed Web
installation, the real host compatibility gate, settings persistence, and
management endpoints. Clean installation/removal and upgrades from `0.13.2`,
`0.14.1`, and `0.14.2` preserve compiled apps, state, grants, and version history.
The production dependency audit reported no known vulnerabilities.

Release preflight additionally requires successful CI on the exact commit,
the live HTTPS scenario, and a fresh build/install/upgrade check. The publish
job verifies that npm serves the reviewed tarball and attaches the same
artifact and checksum to the GitHub release.

Supported Harness versions are `0.1.0-rc.6`–`rc.8`, `0.1.1-rc.1`–`rc.2`,
`0.1.5-rc.2`–`rc.3`, `0.1.7-rc.1`, and `0.2.1-rc.2`–`rc.3`. Untested
intermediate releases, alpha releases, and future prereleases are excluded.
TUI/headless remain unsupported. Native desktop windows and paid model
inference are not covered by these checks. The legacy bridge fixture and
retired settings-provider API are tested only on hosts that still expose them.

See the [compatibility review](compatibility-2026-10-23.md) for the findings,
test scope, and remaining optimization opportunities.
