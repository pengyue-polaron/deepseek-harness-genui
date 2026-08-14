# DeepSeek Harness GenUI

[![CI](https://github.com/pengyue-polaron/deepseek-harness-genui/actions/workflows/ci.yml/badge.svg)](https://github.com/pengyue-polaron/deepseek-harness-genui/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-339933?logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-202124)

Temporary interactive apps for DeepSeek Harness. The Agent writes ordinary React and TypeScript when interaction improves the task; the plugin builds, checks, and renders the result inside the conversation.

## What it does

- Keeps simple questions and rewriting in prose.
- Renders one focused app Inline, in an adaptive Canvas, or full screen.
- Persists user choices for the next turn in the same task.
- Reuses connected Harness tools after a clear, task-scoped permission request.
- Builds every candidate in a sandbox and keeps the last working version.
- Accepts reusable visual direction through `DESIGN.md`.

There is no component-tree IR and no provider adapter layer. Generated apps are normal multi-file React projects, while GitHub, Hugging Face, Google Maps, and internal services remain Harness-level tools.

## Install

Requirements: Node.js `^22.19.0 || >=24`, pnpm 11, DeepSeek Harness, and Playwright Chromium.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run package:plugin
```

From the DeepSeek Harness checkout:

```sh
DSH_HOME=/path/to/dsh-home pnpm dsh plugin --profile web add /absolute/path/to/dsh-plugin-genui-0.8.4.tgz
DSH_HOME=/path/to/dsh-home pnpm dsh --profile web
```

The bundled patch stores artifacts under `.dsh/genui` and serves them at `/genui`. Add MCP servers to the Harness profile; generated apps call their exact tool names without plugin-specific adapters.

## Scenarios

| Request | Expected behavior |
| --- | --- |
| Plan a constrained family outing | Compare the few real trade-offs and save the decision. |
| “Make an interactive weather card” | Ask for forecast access, then compare and refresh live data. |
| Shortlist GUI models and repositories | Search connected Hugging Face and GitHub tools with separate read permissions. |
| Explain a difficult scientific idea | Keep the explanation in chat and make only the causal relationship interactive. |
| Rewrite a meeting notice | Return prose; do not create an app. |

The full acceptance prompts are in [`examples/real-user-scenarios.md`](examples/real-user-scenarios.md).

## Runtime

Generated apps can use `useArtifactState`, `reportResult`, `callTool`, `watchTool`, and `requestExternal` from the virtual `@dsh-genui/sdk` module. Tool access is declared per app and approved on first use. Public HTTP access is limited to declared, credential-free HTTPS prefixes; credentials stay in Harness.

Task state and grants expire after 7 inactive days. Source versions are immutable, failed candidates never replace the current app, and browser checks cover desktop, mobile, light, dark, reduced motion, overflow, and basic accessible naming.

## Development

```sh
pnpm run typecheck
pnpm test
pnpm run package:plugin
```

## License

MIT
