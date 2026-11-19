# DeepSeek Harness GenUI v0.15.4

This release gives the plugin a name and artwork of its own. Nothing about how
it generates, compiles, or stores pages changed.

## Changes

- Plugin Manager and Settings now show the display name **生成式页面**
  (*Generative UI* in English) with a short description of the capability,
  instead of the package name and its npm description.
- The bundle ships its own icon and exports `./locale/*.json` and `./icon`, so
  the row has recognizable artwork beside the other installed plugins.

The wording reads:

> 生成式页面 — 为当前任务生成一个可操作的页面，你在里面做出的选择会带进下一轮对话。
>
> Generative UI — Builds an interactive surface for the current task and carries
> your choices into the next turn.

## Install or upgrade

Update the profile used by your application, then restart Harness:

```sh
dsh plugin --profile web add dsh-plugin-genui@0.15.4 --save-exact
dsh --profile web
```

Use Node.js `^22.19.0 || ^24.0.0`. No compiler install-script approval, Chrome,
or Chromium is needed by plugin users. Current design preferences are under
**Settings → Built-in plugins → Generated app design**.

## Validation and scope

Local Node 24 validation runs the baseline suite on the oldest supported host
and the applicable suite on each of `0.2.2-rc.1`, `0.2.2-rc.3`, and
`0.2.2-rc.5`, plus typechecking, builds, bundle budgets, and the packed
tarball. The icon is self-contained SVG geometry that decodes and renders at
the panel's row size.

Release preflight additionally requires successful CI on the exact commit, the
live HTTPS scenario, clean installation/removal, and upgrades from `0.13.2`,
`0.14.1`, and `0.14.2`. The publish job verifies that npm serves the reviewed
tarball and attaches the same artifact and checksum to the GitHub release.

Supported Harness versions are unchanged from `0.15.3`: `0.1.0-rc.6`–`rc.8`,
`0.1.1-rc.1`–`rc.2`, `0.1.5-rc.2`–`rc.3`, `0.1.7-rc.1`, `0.2.1-rc.2`–`rc.3`, and
`0.2.2-rc.1`–`rc.5`. TUI/headless remain unsupported.

See the [compatibility review](compatibility-2026-11-19.md) for the host
support findings and the earlier display fix.
