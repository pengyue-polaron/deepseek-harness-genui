# DeepSeek Harness GenUI

English | [简体中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/dsh-plugin-genui?logo=npm)](https://www.npmjs.com/package/dsh-plugin-genui)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%20%7C%2024-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Paper](https://img.shields.io/badge/paper-arXiv%3A2608.29387-B31B1B?logo=arxiv)](https://arxiv.org/abs/2608.29387)
[![dsh.so risk](https://www.dsh.so/badge/deepseek-harness-genui.svg)](https://www.dsh.so/artifact/deepseek-harness-genui/)
[![License](https://img.shields.io/badge/license-MIT-202124)](LICENSE)

<img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/assets/hero-en.png" width="1280" alt="DeepSeek Harness with an interactive day plan inline and a scientific model open in Canvas">

DeepSeek Harness GenUI lets an Agent build a focused interface when a task is awkward in text. The Coding Agent writes ordinary React + TypeScript—not a component-tree DSL—and the interface can save user selections for the next Agent turn.

The result is a task-specific app that can explain a difficult relationship, collect connected choices, or continue a tool-backed workflow without asking the user to repeat their input.

Related research: [*EvoGenUI-Bench: Evaluating LLMs as Multi-Turn Generative UI Assistants*](https://arxiv.org/abs/2608.29387).

## Install

Requires Node.js `^22.19.0 || ^24.0.0` and a supported DeepSeek Harness Web profile.

```sh
dsh plugin --profile web add dsh-plugin-genui --allow-build=esbuild
dsh --profile web
```

v0.14 supports Inline, Canvas, fullscreen, and localhost on the tested Harness versions listed in the [release notes](docs/release-notes-v0.14.0.md). TUI/headless profiles are not supported. `--allow-build=esbuild` enables the local compiler; plugin users do not need Chrome or Chromium.

## Where It Helps

Use an interface when the user needs to see a complex relationship or make several connected choices. Plain questions, rewriting, summaries, and simple lists should stay in prose.

<table>
  <tr>
    <td><strong>Pick calendar slots</strong><br><br>Select useful writing blocks and save them to the task. A later calendar action remains separate and permission-gated.</td>
    <td><img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/en/calendar-planner.jpg" width="280" alt="English interface for choosing three writing slots"></td>
  </tr>
  <tr>
    <td><strong>Explore photosynthesis</strong><br><br>Move four causal controls and see the limiting step change immediately.</td>
    <td><img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/en/photosynthesis-explorer.jpg" width="280" alt="English interactive photosynthesis model with four causal controls"></td>
  </tr>
  <tr>
    <td><strong>Trace a code path</strong><br><br>Turn a source-grounded CLI explanation into a local explorer of files, functions, and branches.</td>
    <td><img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/en/code-path-explorer.jpg" width="280" alt="English source-grounded code path explorer returned from a CLI request"></td>
  </tr>
</table>

## The Core Loop

1. The Agent writes and builds a React + TypeScript app for the current task.
2. The user saves meaningful values such as selections, form answers, drafts, or progress.
3. A later Agent turn reads those values and continues the task.
4. Connected tools and public HTTPS routes must be declared. Harness asks for task-scoped access, and undeclared calls are blocked.

Later edits update the same app. A candidate that fails the build or source checks does not replace the last working version; a crashing version is quarantined and rolled back when possible.

## Inline & Canvas

| Inline | Canvas |
| --- | --- |
| <img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/en/code-path-inline.jpg" width="620" alt="An interactive code path shown inline in a DeepSeek Harness conversation"> | <img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/en/code-path-canvas.jpg" width="620" alt="The DeepSeek Harness sidebar, conversation, and code-path explorer visible together in the right-side Canvas"> |
| A compact control or focused choice. | More room without covering the conversation. |

Inline, Canvas, fullscreen, and localhost are different surfaces over the same task state.

## Try It

Start a new Web session and paste a prompt:

```text
Plan a Saturday route with a museum, a riverside garden, and dinner. Build an
interface where I can change the times and make the garden optional.
```

```text
Build an interactive double-slit experiment. Let me change wavelength, slit
spacing, and screen distance and see the interference pattern update.
```

After saving something in the interface, ask:

```text
What did I just choose in the interface? Continue from the saved result.
```

The useful proof is not only that an interface appears—it is that the next Agent turn can continue from the interaction.

## Why Code-First

Component-schema renderers are usually better for predictable cards, tables, charts, and forms. This plugin is for structures that cannot be known in advance: simulations, spatial tools, source explorers, and multi-step task apps whose saved result must continue the same Harness task.

The trade-off is deliberate: generated code is more expressive than a fixed component catalog, while this project remains DeepSeek Harness-specific rather than a cross-client UI protocol. See [`dsh-genui`](https://github.com/omdsh-dev/dsh-genui), [`dsh-visualize`](https://github.com/Nagi-ovo/dsh-visualize), [A2UI](https://a2ui.org/introduction/what-is-a2ui/), and [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) for related approaches.

## DESIGN.md

Open **Settings → Plugins → Plugin configuration** to choose automatic design selection, use `material-3`, `apple-human-interface`, or `shadcn-ui`, or import a custom `DESIGN.md`. The file controls visual language, not page structure; React remains free to implement the interaction the task needs.

## Safety

Generated code runs in an opaque-origin sandbox. A trusted parent keeps the real task capability token and brokers only saved state, declared tools, and declared credential-free public HTTPS routes. MCP credentials never enter generated code. Temporary links and grants expire after 7 days, as does task state 7 days after its last update.

This boundary protects host credentials and capabilities, but it cannot make malicious code safe to trust with data already authorized for it to read. Do not put secrets in generated-app state or grant access to data the app should not display. See [Security](SECURITY.md) for the threat model.

## Development

Building from source requires pnpm 11:

```sh
pnpm install
pnpm run typecheck
pnpm run build
pnpm test
pnpm run package:plugin
```

[Acceptance scenarios](examples/real-user-scenarios.md) · [Release notes](docs/release-notes-v0.14.0.md) · [Contributing](CONTRIBUTING.md) · MIT

Listed on [dsh-market](https://dshmarket.com/p/pengyue-polaron/deepseek-harness-genui/) · [dsh.so](https://www.dsh.so/artifact/deepseek-harness-genui/) · [awesome-dsh-plugin](https://awesome-dsh-plugin.com/p/pengyue-polaron/deepseek-harness-genui/) · [dsh.plus](https://www.dsh.plus/en/plugins/deepseek-harness-genui/)
