# DeepSeek Harness GenUI

English | [简体中文](README.zh-CN.md)

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.19-339933?logo=nodedotjs&logoColor=white)](package.json)
[![License](https://img.shields.io/badge/license-MIT-202124)](LICENSE)

![A coding request becomes an inline interactive code-path explorer](assets/hero-en.png)

A DeepSeek Harness plugin that turns the interactive part of a task into a temporary React app. The answer stays in chat; the UI appears only when it is useful.

**Ask → read → interact → continue from the saved state**

## In Use

| Request | Agent response | Generated UI |
| --- | --- | --- |
| **Trace real code**<br><br>“Explain this project’s version and state flow. Generate a GenUI, map each step to real source, and return a localhost URL.” | Inspects the repository, explains the flow, and reads the selected path on the next turn. | <img src="screenshots/en/code-path-explorer.jpg" width="420" alt="Interactive code-path explorer served at a stable local URL"><br><br>A stable local app grounded in source files and functions. |

Other good fits: comparing real tool results, choosing calendar slots, exploring causal systems, and building spatial intuition. Plain questions and rewriting stay in prose.

## Features

- Inline, adaptive Canvas, full-screen, and stable localhost delivery.
- Code-first React + TypeScript; no component-tree IR.
- Task-scoped state that the Agent can read on the next turn.
- Harness and MCP tools behind first-use permission prompts.
- Approved public HTTPS requests without exposing credentials.
- Importable `DESIGN.md` profiles, dark mode, mobile layout, and accessibility checks.

## Install

Requires Node.js `^22.19.0 || >=24`, pnpm 11, DeepSeek Harness, and the GitHub CLI.

```sh
gh release download --repo pengyue-polaron/deepseek-harness-genui --pattern dsh-plugin-genui.tgz --output /tmp/dsh-plugin-genui.tgz --clobber
dsh plugin --profile web add /tmp/dsh-plugin-genui.tgz
dsh plugin --profile web exec playwright install chromium
dsh --profile web
```

Add MCP servers to the Harness profile as usual. Generated apps call their exact tool names; credentials stay in the Harness.

## Design

Open **Settings → Plugins → Plugin configuration** to choose automatic styling, use `notion-calm` or `material-expressive`, or import a `DESIGN.md`.

## Stack

| Host | App | Build | State | Verification |
| --- | --- | --- | --- | --- |
| DeepSeek Harness + Cordis | React 18 + TypeScript | esbuild | Task-scoped | Playwright + Vitest |

## Development

```sh
pnpm run typecheck
pnpm test
pnpm run package:plugin
```

[Acceptance prompts](examples/real-user-scenarios.md) · [Screenshot guide](docs/CAPTURE_GUIDE.zh-CN.md) · MIT
