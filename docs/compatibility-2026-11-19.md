# DSH compatibility review — 2026-11-19

## Target and installation

The official [DSH npm package](https://www.npmjs.com/package/@deepseek-ai/dsh)
reported `latest = 0.2.2-rc.1`, `next = 0.2.2-rc.5`, and
`alpha = 0.2.2-alpha.3` when checked on 2026-11-19. The DeepSeek Harness
Desktop app used for this review runs `0.2.2-rc.3`. This change supports the
first, the third, and the fifth release — the interval
`>=0.2.2-rc.1 <=0.2.2-rc.5` — and not the alpha channel.

This compatibility update ships in `0.15.3`; the `0.15.2` tarball has the
previous peer ranges. Install or upgrade the Web profile with:

```sh
dsh plugin --profile web add dsh-plugin-genui@0.15.3 --save-exact
dsh --profile web
```

To build this checkout instead, use Node 24 and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm run package:plugin
dsh plugin --profile web add ./dist/dsh-plugin-genui-0.15.3.tgz --save-exact
dsh --profile web
```

Run those commands in this repository, using the DSH installation and profile
you actually launch.

## Findings and changes

| Finding | Resolution |
| --- | --- |
| The plugin's DSH peers stop at `0.2.1-rc.3`, so newer hosts reject installation. | Add the tested `0.2.2-rc.1`–`rc.5` interval to all DSH peers and to the CI host matrix. Exercise the real host gate without exemptions. |
| DSH 0.2.2 replaced single-call tool execution with `execute({ calls, signal, agent })`, which settles `{ results }`. The old `{ callId, name, arguments }` shape is rejected by both the types and the runtime, so every action a generated app proxies through its declared tools would fail. | Run proxied calls through a small adapter that takes either shape. A single runtime marker — the `setExecutor` member that arrived with the batch API — selects it, so one bundle still serves `0.1.x`, `0.2.1`, and `0.2.2` hosts. |
| DSH 0.2.2 delegates `tools.execute` to a separately mounted executor and settles `ToolExecutorUnavailableError` when a composition has none. The tool fixtures mount only the registry, so their calls began failing before reaching plugin code. | Mount the native executor in the fixtures on 0.2.2 hosts only. The executor is imported by name at runtime because the package does not exist on earlier hosts, where it must stay out of the install graph. |
| `WebServer.port` is now typed `number \| undefined`; a port read before `listen` binds produces `http://127.0.0.1:undefined` in an `app_url`. `getOrigin()` reports the real protocol and bind host instead. | Prefer `getOrigin()` when the host exposes it, with the previous loopback form as the fallback for hosts that only publish a port. |
| Chat folds the process rows of a completed Turn, and folded rows are not rendered, so a card that only lives in `tool.call.toolview` disappears once the Turn settles. | Publish each Turn's last successful receipt through a Conversation Definition and render it in `conversation.chat.turnTail`, below the answer. The slot is a list entry from 0.1.7 on; the 0.1.0 generation declares it as a chain entry and also lacks the Definition registry, so registration there is skipped and the tool-row card remains. |
| From 0.2.2-rc.1, macOS Desktop only excludes declared window regions instead of every matching control, so a custom overlay covering the draggable header can turn its own buttons into drag handles. | The Canvas overlay declares its visible viewport with `data-window-drag-exclude` while it is open; inline cards live in the conversation flow and need nothing. |
| The MCP client `Config` gained required `closeTimeoutMs` and `expandTemplates`, while earlier hosts reject both keys on their own type. | The bridge fixture passes the documented defaults through the plugin parameter type, so one fixture compiles against either generation. |

Everything else in the `0.2.1-rc.3` → `0.2.2-rc.3` upgrade guides was checked
against the plugin's import surface and did not apply: the plugin never uses
attachments, CUA, Forge, worktrees, terminals, schedules, projections, the
context menu, `ProcessActivity`, `BundleInfo`, `Session.append`, or the
auxiliary LLM request API.

The raw bundle ceiling moved from 260 KiB to 272 KiB for the turn-tail surface;
gzip stays at 72 KiB (66.5 KiB used), so transfer size is unchanged.

Current design settings are under **Settings → Built-in plugins → Generated
app design**. The old settings namespace and list/keyed slot adapters remain
for previously supported hosts.

The development baseline deliberately remains `0.1.0-rc.6`: it produces one
bundle for the supported host generations. Isolated compatibility fixtures pin
each target host and its transitive DSH packages, load the shipped bundle
before rebuilding, and exercise the installed frontend.

## Verification

Local verification used Node 24.21.0 and pnpm 11.17.0. The DSH-bundled Node 24
is hardened against unsigned native addons, so a standalone Node 24 build ran
the suites; the repository's own CI runs Node 22.19 and 24.

- Development baseline (`0.1.0-rc.6` peers): typecheck and the full suite —
  23 files, 146 passed, 1 skipped — so the single-call execution path still
  works on the oldest supported host.
- Each of `0.2.2-rc.1`, `0.2.2-rc.3`, and `0.2.2-rc.5`: typecheck against that
  host's packages and the full unit, integration, and browser suite — 21 files
  passed, 1 skipped, 144 tests passed, 2 skipped on every release, including
  the real MCP server bridge and the generated-app runtime.
- Build and packaging gate: typecheck, tests, build, bundle size budget, and
  the packed tarball.
- Installed into the running Desktop profile (`0.2.2-rc.3`) through the plugin
  manager: the compatibility gate accepted the plugin without a version
  exemption, `application: applied`, and the Host service answered a live
  design listing after the reload.

The published `0.13.2` bridge fixture remains excluded from modern hosts, whose
host imports were removed upstream; that migration stays tested on the legacy
host, which is why one file is skipped there.

Not verified in this local review:

- The repository's full `verify:host-compat` run — it installs the `@deepseek-ai/dsh`
  CLI meta-package, whose LibreOffice runtime binaries could not be downloaded
  on this network. CI runs that entry point, including the installed-Web
  settings persistence check, on every supported host.
- The macOS window-drag behaviour itself needs a manual check in Desktop with a
  Canvas overlay open over the header.
- The release preflight's optional live HTTPS scenario was not run. No paid
  model inference or native desktop window testing is included.
