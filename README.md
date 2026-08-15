# DeepSeek Harness GenUI

[![Version](https://img.shields.io/badge/version-0.9.2-ea8f5a)](package.json)
[![CI](https://github.com/pengyue-polaron/deepseek-harness-genui/actions/workflows/ci.yml/badge.svg)](https://github.com/pengyue-polaron/deepseek-harness-genui/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.19-339933?logo=nodedotjs&logoColor=white)](package.json)
[![License](https://img.shields.io/badge/license-MIT-202124)](LICENSE)

![DeepSeek Harness GenUI](assets/hero.png)

Disposable, tool-aware React apps inside a DeepSeek Harness conversation. The Agent keeps the answer in chat and makes only the part that benefits from interaction into an app.

## What it adds

- Inline, adaptive Canvas, and full-screen surfaces.
- Normal multi-file React + TypeScript; no component-tree IR.
- Task-scoped state that the Agent can read on the next turn.
- MCP and public HTTPS access behind clear, first-use permission prompts.
- Sandboxed builds with desktop, mobile, dark-mode, overflow, motion, and accessibility checks.
- Reusable visual direction through `DESIGN.md`.

## Install

Requires Node.js `^22.19.0 || >=24`, pnpm 11, DeepSeek Harness, and Playwright Chromium.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run package:plugin
```

```sh
DSH_HOME=/path/to/dsh-home pnpm dsh plugin --profile web add /absolute/path/to/dsh-plugin-genui-0.9.2.tgz
DSH_HOME=/path/to/dsh-home pnpm dsh --profile web
```

Add MCP servers to the Harness profile. Generated apps call their exact tool names; credentials never enter generated source or app state.

## Stack

| Layer | Choice |
| --- | --- |
| Host | DeepSeek Harness + Cordis |
| App code | React 18 + TypeScript |
| Build | esbuild |
| Isolation | sandboxed iframe + capability tokens |
| Verification | Playwright + Vitest |
| Tools | Harness/MCP calls + approved public HTTPS |
| State | task-scoped artifact state, 7-day inactivity expiry |

## Good fits

- Compare a small set of plans, products, models, or time slots.
- Explore a difficult scientific relationship with one manipulable model.
- Collect missing inputs during a longer Agent task and resume later.
- Search, filter, and shortlist live data from connected tools.
- Monitor a live operation, then ask separately before any write action.

Plain questions, rewriting, and straightforward explanations stay in prose. See [`examples/real-user-scenarios.md`](examples/real-user-scenarios.md) for acceptance prompts.

## Development

```sh
pnpm run typecheck
pnpm test
pnpm run package:plugin
```

MIT
