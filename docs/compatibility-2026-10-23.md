# DSH compatibility review — 2026-10-23

## Target and installation

The official [DSH npm package](https://www.npmjs.com/package/@deepseek-ai/dsh)
reported `latest = 0.2.1-rc.2`, `next = 0.2.1-rc.3`, and
`alpha = 0.2.1-alpha.5` when checked on 2026-10-23. This change supports the
first two releases, not the alpha channel or arbitrary future prereleases.

This compatibility update ships in `0.15.2`; the `0.15.1` tarball has the
previous peer ranges. Install or upgrade the Web profile with:

```sh
dsh plugin --profile web add dsh-plugin-genui@0.15.2 --save-exact
dsh --profile web
```

To build this checkout instead, use Node 24 and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm run package:plugin
dsh plugin --profile web add ./dist/dsh-plugin-genui-0.15.2.tgz --save-exact
dsh --profile web
```

Run those commands in this repository, using the DSH installation and profile
you actually launch.

## Findings and changes

| Finding | Resolution |
| --- | --- |
| The plugin's DSH peers stop at `0.1.7-rc.1`, so newer hosts reject installation. | Add the tested `0.2.1-rc.2`–`rc.3` interval to all DSH peers and to the CI host matrix. Exercise the real host gate without exemptions. |
| DSH 0.2.1 tool records add `name` and lazy `args`; full host record types made receipt parser fixtures depend on unrelated host fields. | Parse the receipt boundary as unknown input, preserving the existing secret-free envelope and malformed/duplicate-marker rejection tests. |
| Preparing tool calls can expose a title before the complete source payload arrives. | Use `args.textPrefix('title', 256)` on the new host, with a complete-JSON fallback on older hosts. A regression test ensures the lazy path never reads the full argument payload. |
| DSH 0.2 uses an account menu and dismissible sign-in dialog instead of the old “Configure later” flow. | Update the installed Web smoke test, retaining the old-host path. No account or model credentials are needed. |
| The settings persistence check read the select value while its asynchronous reload was still in progress. | Wait for the select to be enabled and contain the saved value before asserting. |

Current design settings are under **Settings → Built-in plugins → Generated
app design**. The old settings namespace and list/keyed slot adapters remain
for previously supported hosts.

The development baseline deliberately remains `0.1.0-rc.6`: it produces one
bundle for the supported host generations. Isolated compatibility fixtures
pin each target host and its transitive DSH packages, load the shipped bundle
before rebuilding, and exercise the installed frontend. The retired
`dsh-client-runtime` package is used only for legacy development types and is
hidden during modern Web startup; it is not a published peer dependency.

## Verification

Local verification used Node 24.22.1 and pnpm 11.17.0:

- Baseline suite, TypeScript checks, build, and bundle size checks.
- Both current host releases: typecheck, applicable unit/browser/integration
  tests, shipped server entry import, packed installation, host compatibility
  gate, peer checks, actual Web startup, settings persistence after reload,
  discovery and management endpoints, and rebuild.
- Clean installation/removal and byte-preserving upgrades from plugin
  `0.13.2`, `0.14.1`, and `0.14.2` on the legacy host fixture. Compiled apps,
  saved state, grants, and version history remain intact.
- `pnpm audit --prod`: no known vulnerabilities reported.
- Runtime bundles total approximately **257.3 KiB raw / 63.6 KiB gzip**, within
  the **260 KiB / 72 KiB** budgets.

The modern suite excludes the published `0.13.2` bridge fixture, whose host
imports were removed upstream; that migration remains tested on the legacy
host. The retired settings-provider API test is skipped on modern hosts,
where the actual installed settings UI is tested instead. The initial compatibility review did not enable the optional live HTTPS
scenario; release preflight runs that scenario separately. No paid model inference or
native desktop window testing is included.

The existing Node 22.19/24 and legacy host CI matrix remains in place; this
local review does not claim a fresh run of every historical host or Node 22.
TUI/headless remain unsupported, and Node 26 is outside the declared engine
range. Rebuilding old generated chart source still requires Recharts 3 APIs;
previously compiled apps retain their original bundled library.

## Further optimization opportunities

- The bounded lazy title read is implemented now and avoids parsing large
  generated-source arguments on each progress render.
- The raw bundle is close to its ceiling. Before adding substantial UI or
  broker features, measure where bytes are added and consider minifying the
  shipped bundles or separating optional code; keep the existing budget check.
- Once support for the 0.1 host generations is intentionally retired, move the
  development baseline to current DSH and remove the legacy client-runtime
  type dependency and old settings adapters together. Doing this now would
  remove compatibility that this update explicitly preserves.
