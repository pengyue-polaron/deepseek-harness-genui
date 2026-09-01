# DeepSeek Harness GenUI

[English](README.md) | 简体中文

[![npm version](https://img.shields.io/npm/v/dsh-plugin-genui?logo=npm)](https://www.npmjs.com/package/dsh-plugin-genui)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%20%7C%2024-339933?logo=nodedotjs&logoColor=white)](package.json)
[![论文](https://img.shields.io/badge/%E8%AE%BA%E6%96%87-arXiv%3A2608.29387-B31B1B?logo=arxiv)](https://arxiv.org/abs/2608.29387)
[![dsh.so risk](https://www.dsh.so/badge/deepseek-harness-genui.svg)](https://www.dsh.so/zh/artifact/deepseek-harness-genui/)
[![License](https://img.shields.io/badge/license-MIT-202124)](LICENSE)

已收录：[dsh-market](https://dshmarket.com/p/pengyue-polaron/deepseek-harness-genui/) · [dsh.so](https://www.dsh.so/zh/artifact/deepseek-harness-genui/) · [awesome-dsh-plugin](https://awesome-dsh-plugin.com/p/pengyue-polaron/deepseek-harness-genui/) · [dsh.plus](https://www.dsh.plus/en/plugins/deepseek-harness-genui/)

<img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/assets/hero-zh-CN.png" width="1280" alt="DeepSeek Harness 同时展示保存过选择的路线 Inline 和银河尺度 Canvas">

有些任务用文字来回描述很别扭。DeepSeek Harness GenUI 让 Agent 可以为当前任务生成一个聚焦界面，用来讲清复杂关系，或收集难以用一段话表达的用户选择。

这个插件走 code-first 路线。Coding Agent 编写普通前端代码——React + TypeScript，而不是组件树 DSL 或 IR。界面可以保存用户的选择、输入和修改，供 Agent 在下一轮读取并继续处理任务。

> **相关研究：** [《EvoGenUI-Bench: Evaluating LLMs as Multi-Turn Generative UI Assistants》](https://arxiv.org/abs/2608.29387)系统评测了 LLM 在需求连续变化时，能否持续维护同一个可执行界面，覆盖信息呈现、有状态交互和工具驱动的外部状态。本插件把同一类生命周期落到 DeepSeek Harness 中：按任务生成界面、交接语义状态、限制工具权限，并对原位更新设置门禁。

## 什么时候值得生成界面

当用户需要看清一个复杂关系，或同时处理几项相互影响的选择时，界面比文字更合适。普通问答、文字改写、摘要和简单列表仍然只返回文字。

<table>
  <tr>
    <td><strong>选择日历时段</strong><br><br>把候选空闲时间变成一组可以直接操作的 90 分钟时段。<br><br>页面把选中的三个时段保存回任务；后续如需写入日历，仍要单独申请授权。</td>
    <td><img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/calendar-planner.jpg" width="280" alt="选择三个写作时段的中文界面"></td>
  </tr>
  <tr>
    <td><strong>探索光合作用</strong><br><br>改变光照、二氧化碳、温度和气孔开度，找到限制反应的环节。<br><br>图示会跟随控制项变化，用户可以直接观察各变量如何影响结果。</td>
    <td><img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/photosynthesis-explorer.jpg" width="280" alt="可以改变四个条件的光合作用瓶颈模型"></td>
  </tr>
  <tr>
    <td><strong>追踪代码路径</strong><br><br>从 CLI 要求 Agent 根据真实项目源码解释一条执行链路。<br><br>返回的本地页面列出文件、函数、分支，以及用户当前选中的路径。</td>
    <td><img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/code-path-explorer.jpg" width="280" alt="通过 CLI 请求生成的中文代码路径解释器"></td>
  </tr>
</table>

## Inline 与 Canvas

同一个页面既可以放在回答里，也可以在对话右侧打开。

| Inline | Canvas |
| --- | --- |
| <img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/photosynthesis-inline.jpg" width="620" alt="在 DeepSeek Harness 对话中内联显示的光合作用交互模型"> | <img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/photosynthesis-canvas-current.jpg" width="620" alt="DeepSeek Harness 会话侧边栏、对话区和右侧光合作用 Canvas 同时可见"> |
| 适合紧凑的控制项或聚焦选择。 | 提供更大空间，同时保留对话。 |

Inline、Canvas、全屏和 CLI/localhost 是同一份任务状态的不同入口。在任一入口保存的选择和输入，都可以在 Agent 后续轮次继续使用。

## CLI 示例

在 Web profile 中明确要求本地链接时，会返回 localhost 页面。下一轮可以直接引用用户刚才在页面里选择的路径。

```text
❯ 解释这个仓库里生成页面如何进入带权限控制的运行时。做一个交互式代码路径页面，
  然后返回 localhost 地址。

  我梳理了 src/tools.ts → src/artifacts/builder.ts → src/runtime/server.ts
  → src/artifacts/registry.ts。

  http://127.0.0.1:<port>/genui/app/<task-app>

❯ 我刚才选的路径停在哪里？

  它到达了 src/runtime/server.ts 的权限检查，然后停在真实工具调用之前，
  因为这项访问还没有获得允许。
```

## 工作方式

1. Agent 编写普通的 React + TypeScript，插件负责构建和检查。
2. 界面把选择、表单答案、草稿和进度等有意义的结果保存到当前任务。用户继续追问时，Agent 可以读取这些结果，不必让用户重新描述。
3. 页面只声明实际需要的 Harness/MCP/Skill 工具，或无需凭据的公开 HTTPS 接口。打开连接型应用前，Harness 会集中展示完整权限清单，由用户一次确认；能力发生变化时会重新询问，未声明的调用仍会被拒绝。
4. 后续修改更新同一个页面。未通过构建或源码契约门禁的候选不会覆盖当前可用版本；如果当前沙箱报告启动崩溃，插件会隔离这个版本，并在存在可用旧版本时自动恢复。

Web 端可以从页面卡片查看或撤回权限。MCP 凭据和任务 capability token 都不会进入生成代码。

## 为什么选择 Code-first

多数生成式 UI 方案要求开发者预先写好 widget，或维护一套受信任的组件目录。这个插件让 Coding Agent 直接为当前任务编写 React；生成代码仍在沙箱内运行，有意义的用户状态留在任务里，连接型操作继续受权限控制，失败更新也不会替换最后一个可用版本。

因此，它比固定组件目录更自由，但也有意比跨客户端 UI 协议更聚焦：它服务于 DeepSeek Harness 及其任务生命周期。

## 任务应用，还是组件树？

两种路线都成立，只是适合的任务不同：

| 更适合组件协议的情况 | 更适合这个插件的情况 |
| --- | --- |
| 用已知组件拼一张紧凑卡片、表格、图表或表单。 | 需要按当前任务编写一个事先无法确定结构和交互的 React 应用。 |
| 更在意模型输出短小、结构可预测，以及跨客户端渲染。 | 更在意自由模拟、空间工具、连接型工作流或多步骤状态。 |
| 一次操作可以表示成一个组件事件。 | 用户的选择和修改需要成为任务状态，供下一轮 Agent 继续读取。 |

这个项目不替代轻量的 `dsh-ui` 组件渲染器，它覆盖的是 code-first、按任务生成应用的 GenUI 场景。

相近项目选择了不同而且各自合理的取舍：

| 路线 | 更适合 | 这个插件的区别 |
| --- | --- | --- |
| [`dsh-genui`](https://github.com/omdsh-dev/dsh-genui) | 用受约束的组件目录稳定拼出卡片、表格、图表和表单。 | Agent 可以编写任意的任务型 React 应用；明确保存的语义状态能跨 Inline、Canvas、全屏和 localhost 进入下一轮 Agent。 |
| [`dsh-visualize`](https://github.com/Nagi-ovo/dsh-visualize) | 在 DeepSeek Harness Web 中快速生成轻量 HTML 可视化。 | 这里还提供任务应用生命周期、状态交接、连接能力，以及从受支持 Web profile 打开的 localhost 入口。 |
| [A2UI](https://a2ui.org/introduction/what-is-a2ui/) / [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) | 跨平台声明式 UI，或可由多个宿主复用的服务端应用资源。 | 本插件有意只服务 DeepSeek Harness，并为当前任务即时生成代码，而不是定义跨客户端协议。 |

小而可预测的结果通常更适合组件目录，需要可移植性时应优先考虑跨客户端协议。本插件最有优势的场景，是结构事先无法枚举，而且保存结果还要继续进入同一个 Harness 任务。

## DESIGN.md

打开 **设置 → 插件 → 插件配置**，可以为新应用设置默认设计：让插件自动选择、选用内置风格、导入自定义 `DESIGN.md`，或导出当前选中的设计作为起点。选定后，它会成为之后新建应用的默认设计，不必在每个提示词里重复描述风格。已经生成的应用会保留原来的设计。

`DESIGN.md` 控制的是设计语言，不是页面结构。React + TypeScript 仍然可以按任务需要实现模拟器、图形、地图、时间轴、代码图、动画和不规则布局。

| 设计风格 | 视觉语言 |
| --- | --- |
| `material-3` | Google Material 3：色调表面、鲜明主色、清晰层级与友好的触控组件 |
| `apple-human-interface` | Apple Human Interface：克制、精确、内容优先，使用熟悉的系统感控件 |
| `shadcn-ui` | shadcn/ui：语义色彩变量、利落边框、紧凑表单与完整交互状态 |

## 安装

使用 Node.js `^22.19.0 || ^24.0.0`。本版明确支持并测试 DeepSeek Harness `0.1.0-rc.6` 至 `0.1.0-rc.8`，以及 `0.1.1-rc.1` 至 `0.1.1-rc.2`。较新的 `0.1.2` alpha 线不在 v0.14 的兼容承诺中。

```sh
dsh plugin --profile web add dsh-plugin-genui --allow-build=esbuild
dsh --profile web
```

查看发布说明后，如需升级已有 Web profile，执行：

```sh
dsh plugin --profile web add dsh-plugin-genui@0.14.0 --save-exact --allow-build=esbuild
```

v0.14 兼容门禁会从真实安装的 v0.13.2 开始升级，并检查已有 app、语义化任务状态、授权和版本引用仍可读取；这不代表对所有未发布版本或更早历史版本作泛化承诺。

本版支持 Web profile，包括 Inline、Canvas、全屏和 localhost 链接。v0.14 不支持 TUI/headless profile，因为插件依赖 Web 宿主服务。MCP 仍按原有方式连接到同一个 Web profile。

`--allow-build=esbuild` 只批准 esbuild 在本机准备对应平台的原生编译器；它不会安装、下载、启动或依赖 Chrome/Chromium。每个候选版本都必须通过编译和源码契约检查，才能替换最后一个可用版本。仓库 CI 会另外用 Chromium 测试沙箱运行时；插件用户不需要安装它。

## 两分钟试一下

新建一个 Web 会话，复制下面任意一段：

```text
帮我规划一个周六行程，包含美术馆、滨江花园和晚餐。做成可以直接调整时间的界面，
并让我能把花园设为下雨时跳过。
```

```text
根据当前仓库源码，解释生成页面如何进入带权限控制的运行时。做一个可交互的代码
路径图，并标出文件、函数和权限检查。
```

```text
做一个可交互的双缝干涉实验，让我调整波长、缝间距和屏幕距离，并实时观察条纹变化。
```

在界面里修改并保存以后，再问一句：

```text
我刚才在界面里选了什么？请按保存结果继续。
```

真正要验证的不只是“页面出现了”，而是下一轮 Agent 能不能接着刚才的操作继续做。

## 安全

生成代码在 opaque-origin 沙箱中运行。可信父页面保管真实的任务 capability token，只代理状态、已声明工具和已声明的无凭据公开 HTTPS 接口；生成 iframe 不会拿到可用的 bearer token。临时链接和已授予权限会在 7 天后失效；任务状态在最后一次更新 7 天后过期。用户可以回到任务里的页面卡片查看或收回权限。

这条边界能保护宿主凭据与能力，但不能让已经获准读取某些数据的蓄意恶意代码变得可信。源码检查和 CSP 是纵深防御。不要把秘密写进生成页面状态，也不要授权页面读取不应展示的数据；精确威胁模型见 [Security](SECURITY.md)。

插件使用 DeepSeek Harness + Cordis、React 18 + TypeScript 和 esbuild。仓库测试使用 Playwright 与 Vitest。

## 开发

从源码构建需要 pnpm 11。类型检查和构建不需要另外安装浏览器：

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

只有维护者执行确定性的浏览器 E2E 套件时，才需要另外安装 Playwright 隔离的测试 Chromium。它只是 CI/测试工具，不在插件发布包或用户安装路径中：

```sh
pnpm exec playwright install chromium
pnpm test
pnpm run package:plugin
pnpm run verify:clean-install
pnpm run verify:upgrade
```

其中有一个真实 Open-Meteo 场景故意设为显式开启，避免普通 CI 依赖外部服务：`GENUI_LIVE_E2E=1 pnpm exec vitest run tests/browser-verifier.e2e.spec.ts`。

[验收场景](examples/real-user-scenarios.md) · [v0.14 社区发布手册](docs/community-launch-v0.14.md) · [参与贡献](CONTRIBUTING.md) · MIT
