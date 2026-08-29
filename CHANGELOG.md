# Changelog

## 0.14.0 - 2026-08-29

### Added

- Quarantine a current version that reports a sandbox startup failure and restore the latest ready version when one exists, including after the task page is refreshed.
- Start generated bundles behind a trusted, one-document bridge that keeps the real task capability token in the Harness shell or standalone parent while preserving v0.13.2 state and action calls through a non-authorizing compatibility marker.
- Persist a schema version with artifact records while continuing to load records created by earlier releases.
- Enforce raw and gzip bundle-size budgets during CI and plugin packaging.
- Exercise Node.js 22.19 and 24, plus DeepSeek Harness 0.1.0-rc.6 through rc.8 and 0.1.1-rc.1 through rc.2, in the release matrix.

### Fixed

- Serialize and coalesce artifact-state writes, time out stalled state requests without shortening the host's connected-action timeouts, and wait for pending writes before dynamic-key reads.
- Bound per-task state by key count and encoded size while allowing legacy over-limit state to stay the same size or shrink.
- Keep grant, revoke, and runtime-quarantine controls host-only; bind connected actions to the current app version so old grants cannot be replayed; and render permission prompts from canonical server declarations rather than iframe-supplied descriptions.
- Close the generated app's API channel on navigation, reject child-selected endpoints and host-control actions, and block preview networking, nested frames, and form submission through a preview-specific Content Security Policy.
- Separate startup crashes from interactive-session errors so a transient user-session problem does not globally quarantine a version.
- Follow explicit Harness light/dark theme changes inside the shell and newly built artifact frames, including a light Harness theme on a dark operating system.
- Add timeout, retry, and explicit loading feedback to design settings.
- Expand browser verification to cover compact mobile viewports, keyboard reachability, and visible focus states.
- Run browser-heavy test files serially so independent Chromium lifecycles cannot create resource-contention false failures.
- Recover embedded cards when nested PTC/run_code results omit presentation metadata, using a versioned secret-free receipt and a same-origin, task-bound access exchange with an explicit retry state.
- Match public HTTPS capabilities on origin plus exact/slash-delimited descendant paths, and require an exact query when one is declared.
- Declare the MCP client used by integration tests as a development dependency instead of requiring it from plugin consumers.
- Restore native esbuild for faster artifact compilation; installation explicitly approves only its local compiler setup and does not depend on Chrome.
- Include the TypeScript sources referenced by declaration maps in the package.
- Make production dependency auditing, clean tarball installation, removal, and unsupported-profile activation checks part of the release gates.

### Compatibility

- Support the Web profile on DeepSeek Harness 0.1.0-rc.6 through rc.8 and 0.1.1-rc.1 through rc.2; TUI/headless profiles are not supported because the plugin requires the Web host service. The upstream 0.1.2 alpha line is not included in this compatibility promise.
- Verify Node.js 22.19 and 24 in the release matrix.
