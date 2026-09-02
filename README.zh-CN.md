# DeepSeek Harness GenUI

[English](README.md) | 简体中文

[![npm version](https://img.shields.io/npm/v/dsh-plugin-genui?logo=npm)](https://www.npmjs.com/package/dsh-plugin-genui)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%20%7C%2024-339933?logo=nodedotjs&logoColor=white)](package.json)
[![论文](https://img.shields.io/badge/%E8%AE%BA%E6%96%87-arXiv%3A2608.29387-B31B1B?logo=arxiv)](https://arxiv.org/abs/2608.29387)
[![dsh.so risk](https://www.dsh.so/badge/deepseek-harness-genui.svg)](https://www.dsh.so/zh/artifact/deepseek-harness-genui/)
[![License](https://img.shields.io/badge/license-MIT-202124)](LICENSE)

<img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/assets/hero-zh-CN.png" width="1280" alt="DeepSeek Harness 同时展示保存过选择的路线 Inline 和银河尺度 Canvas">

DeepSeek Harness GenUI 让 Agent 在文字不够好用时，为当前任务生成一个聚焦界面。Coding Agent 编写普通的 React + TypeScript，而不是组件树 DSL；界面可以把用户选择保存给下一轮 Agent。

它适合讲清复杂关系、收集相互关联的选择，或在工具工作流中继续处理，而不必让用户重复输入。

相关研究：[《EvoGenUI-Bench: Evaluating LLMs as Multi-Turn Generative UI Assistants》](https://arxiv.org/abs/2608.29387)。

## 安装

需要 Node.js `^22.19.0 || ^24.0.0` 和受支持的 DeepSeek Harness Web profile。

```sh
dsh plugin --profile web add dsh-plugin-genui --allow-build=esbuild
dsh --profile web
```

v0.14 在[发布说明](docs/release-notes-v0.14.0.md)所列 Harness 版本中支持 Inline、Canvas、全屏和 localhost；不支持 TUI/headless。`--allow-build=esbuild` 用于启用本地编译器，插件用户不需要安装 Chrome 或 Chromium。

## 适用场景

当用户需要看清复杂关系，或同时处理几项相互影响的选择时，界面比文字更合适。普通问答、改写、摘要和简单列表仍应只返回文字。

<table>
  <tr>
    <td><strong>选择日历时段</strong><br><br>选择写作时段并保存回任务。后续写入日历仍是独立且需要授权的操作。</td>
    <td><img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/calendar-planner.jpg" width="280" alt="选择三个写作时段的中文界面"></td>
  </tr>
  <tr>
    <td><strong>探索光合作用</strong><br><br>调整四个因果变量，直接观察限制环节如何变化。</td>
    <td><img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/photosynthesis-explorer.jpg" width="280" alt="可以改变四个条件的光合作用瓶颈模型"></td>
  </tr>
  <tr>
    <td><strong>追踪代码路径</strong><br><br>把基于真实源码的 CLI 解释变成文件、函数和分支都可探索的本地页面。</td>
    <td><img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/code-path-explorer.jpg" width="280" alt="通过 CLI 请求生成的中文代码路径解释器"></td>
  </tr>
</table>

## 核心闭环

1. Agent 为当前任务编写并构建 React + TypeScript 页面。
2. 用户保存选择、表单答案、草稿或进度等有意义的结果。
3. 下一轮 Agent 读取这些值并继续任务。
4. 页面必须声明要使用的工具和公开 HTTPS 接口。Harness 负责按任务授权，未声明调用会被拒绝。

后续修改会更新同一个页面。构建或源码检查失败的候选不会替换最后一个可用版本；启动崩溃的版本会被隔离，并在可能时回滚。

## Inline 与 Canvas

| Inline | Canvas |
| --- | --- |
| <img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/photosynthesis-inline.jpg" width="620" alt="在 DeepSeek Harness 对话中内联显示的光合作用交互模型"> | <img src="https://raw.githubusercontent.com/pengyue-polaron/deepseek-harness-genui/main/screenshots/zh-CN/photosynthesis-canvas-current.jpg" width="620" alt="DeepSeek Harness 会话侧边栏、对话区和右侧光合作用 Canvas 同时可见"> |
| 适合紧凑的控制项或聚焦选择。 | 提供更大空间，同时保留对话。 |

Inline、Canvas、全屏和 localhost 是同一份任务状态的不同入口。

## 试一下

新建一个 Web 会话，复制一段提示词：

```text
帮我规划一个周六行程，包含美术馆、滨江花园和晚餐。做成可以直接调整时间的界面，
并让我能把花园设为下雨时跳过。
```

```text
做一个可交互的双缝干涉实验，让我调整波长、缝间距和屏幕距离，并实时观察条纹变化。
```

在界面中保存以后，再问：

```text
我刚才在界面里选了什么？请按保存结果继续。
```

真正要验证的不只是“页面出现了”，而是下一轮 Agent 能不能接着刚才的操作继续做。

## 为什么选择 Code-first

组件协议通常更适合可预测的卡片、表格、图表和表单。这个插件面向结构事先无法确定的场景，例如模拟器、空间工具、源码浏览器，以及保存结果需要继续进入同一个 Harness 任务的多步骤应用。

它的取舍很明确：生成代码比固定组件目录更自由，但项目也有意只服务 DeepSeek Harness，而不是跨客户端 UI 协议。相关路线可参考 [`dsh-genui`](https://github.com/omdsh-dev/dsh-genui)、[`dsh-visualize`](https://github.com/Nagi-ovo/dsh-visualize)、[A2UI](https://a2ui.org/introduction/what-is-a2ui/) 和 [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)。

## DESIGN.md

打开 **设置 → 插件 → 插件配置**，可以自动选择设计，使用 `material-3`、`apple-human-interface` 或 `shadcn-ui`，也可以导入自定义 `DESIGN.md`。它只控制视觉语言，不限制 React 为任务实现所需的页面结构和交互。

## 安全

生成代码在 opaque-origin 沙箱中运行。可信父页面保管真实的任务 capability token，只代理已保存状态、已声明工具和已声明的无凭据公开 HTTPS 接口。MCP 凭据不会进入生成代码。临时链接和授权 7 天后过期；任务状态也会在最后一次更新 7 天后过期。

这条边界能保护宿主凭据与能力，但不能让恶意代码安全地读取已经授权给它的数据。不要把秘密写进生成页面状态，也不要授权页面读取不应展示的数据。精确威胁模型见 [Security](SECURITY.md)。

## 开发

从源码构建需要 pnpm 11：

```sh
pnpm install
pnpm run typecheck
pnpm run build
pnpm test
pnpm run package:plugin
```

[验收场景](examples/real-user-scenarios.md) · [发布说明](docs/release-notes-v0.14.0.md) · [参与贡献](CONTRIBUTING.md) · MIT

已收录：[dsh-market](https://dshmarket.com/p/pengyue-polaron/deepseek-harness-genui/) · [dsh.so](https://www.dsh.so/zh/artifact/deepseek-harness-genui/) · [awesome-dsh-plugin](https://awesome-dsh-plugin.com/p/pengyue-polaron/deepseek-harness-genui/) · [dsh.plus](https://www.dsh.plus/en/plugins/deepseek-harness-genui/)
