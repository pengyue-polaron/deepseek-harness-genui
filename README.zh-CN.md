# DeepSeek Harness GenUI

[English](README.md) | 简体中文

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.19-339933?logo=nodedotjs&logoColor=white)](package.json)
[![License](https://img.shields.io/badge/license-MIT-202124)](LICENSE)

<img src="assets/hero-zh-CN.png" width="1280" alt="当前任务生成界面，保存的选择回到任务，后续行动仍需授权">

DeepSeek Harness GenUI 是 Agent 任务里的动态界面层。文字不好用时，Agent 可以让当前任务临时长出一个聚焦界面：解释难讲清的关系、收集复杂选择，或操作已经连接的工具。

<table>
  <tr>
    <td width="33%"><strong>为当前任务而生</strong><br><br>根据当前上下文生成，可放在 Inline、Canvas 或 localhost 里。不用另做、另部署一个 App。</td>
    <td width="33%"><strong>操作结果会回来</strong><br><br>页面保存的选择、输入、草稿和进度会回到任务状态，供 Agent 后续轮次读取。</td>
    <td width="33%"><strong>能连接真实工具</strong><br><br>已声明的 Harness/MCP 工具和无需凭据的公开 HTTPS，仅在当前任务授权后调用。</td>
  </tr>
</table>

> **界面不是对话结束后的产物，它就是对话的一部分。**

在这段对话里，界面既可以是 Agent 的表达，也可以是用户的结构化回应；获得授权后，它还可以成为真实工具的入口。

## 区别在哪里

| | 生成什么 | 接下来怎样 |
| --- | --- | --- |
| App Builder | 一个可保存、可分享的独立应用 | 应用本身成为交付物 |
| MCP Apps | 工具作者预先准备的界面 | 界面始终跟着对应工具 |
| DeepSeek Harness GenUI | 当前任务临时缺少的界面 | 保存的状态回到 Agent，已授权的工具可以继续办事 |

## 什么时候值得生成界面

它主要解决两类问题：把难讲清的关系画出来，把难描述的选择变成可以直接操作的界面。

<table>
  <tr>
    <td><strong>选择日历时段</strong><br><br>把候选空闲时间变成一组可以直接操作的 90 分钟时段。<br><br>页面把选中的三个时段保存回任务；后续如需写入日历，仍要单独申请授权。</td>
    <td><img src="screenshots/zh-CN/calendar-planner.jpg" width="280" alt="选择三个写作时段的中文界面"></td>
  </tr>
  <tr>
    <td><strong>探索光合作用</strong><br><br>改变光照、二氧化碳、温度和气孔开度，找到限制反应的环节。<br><br>图示会跟随控制项变化，用户可以直接观察各变量如何影响结果。</td>
    <td><img src="screenshots/zh-CN/photosynthesis-explorer.jpg" width="280" alt="可以改变四个条件的光合作用瓶颈模型"></td>
  </tr>
  <tr>
    <td><strong>追踪代码路径</strong><br><br>从 CLI 要求 Agent 根据真实项目源码解释一条执行链路。<br><br>返回的本地页面列出文件、函数、分支，以及用户当前选中的路径。</td>
    <td><img src="screenshots/zh-CN/code-path-explorer.png" width="280" alt="通过 CLI 请求生成的中文代码路径解释器"></td>
  </tr>
</table>

普通问答、文字改写、摘要和简单列表只返回文字。

## Inline 与 Canvas

同一个页面既可以放在回答里，也可以在对话右侧打开。

| Inline | Canvas |
| --- | --- |
| <img src="screenshots/zh-CN/photosynthesis-inline.png" width="620" alt="在 DeepSeek Harness 对话中内联显示的光合作用交互模型"> | <img src="screenshots/zh-CN/photosynthesis-canvas-current.png" width="620" alt="DeepSeek Harness 会话侧边栏、对话区和右侧光合作用 Canvas 同时可见"> |
| 适合紧凑的控制项或聚焦选择。 | 提供更大空间，同时保留对话。 |

Inline、Canvas、全屏和本地页面读写同一份任务状态。界面保存的选择和输入，可以在 Agent 后续轮次继续使用。

## CLI 示例

终端 profile 会返回 localhost 页面。下一轮可以直接引用用户刚才在页面里选择的路径。

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

1. Agent 把解释留在对话里，只在交互有实际价值时创建一个聚焦页面。
2. Agent 编写 React + TypeScript，并且只声明需要的准确 Harness/MCP/Skill 工具，或无需凭据的公开 HTTPS 范围；插件负责构建和检查界面。
3. 界面把选择、表单答案、草稿和进度等有意义的结果保存到当前任务。用户下一轮继续时，Agent 可以先读取这些结果，不必让用户重新描述一遍。
4. 后续修改更新同一个页面，失败的修改不会替换正常版本。

每项声明过的能力在第一次使用前，都会申请当前任务内的授权；未声明的调用直接拒绝。Web 端可以从页面卡片查看或撤回权限。MCP 凭据不会进入生成代码，页面直连 API 仅支持无需凭据的公开 HTTPS。

## Design MD

视觉方向写在 `DESIGN.md` 中。插件内置 4 套风格：

| 风格 | 适用场景 |
| --- | --- |
| `editorial-workbench` | 阅读、规划、表单和内容密集型任务 |
| `ledger-grid` | 对比、排程、证据和候选清单 |
| `field-atlas` | 科学、因果和空间概念解释 |
| `kinetic-signal` | 变化中的数据、连接工具和用户触发操作 |

打开 **设置 → 插件 → 插件配置**，可以自动选择、指定内置风格、导入 `DESIGN.md`，或导出一份作为起点。这个选择只影响之后新建的页面，不会在页面中增加设计设置。

## 安装

使用 Node.js `^22.19.0 || >=24`。当前版本在 DeepSeek Harness `0.1.0-rc.6` 上通过测试。

```sh
dsh plugin --profile web add dsh-plugin-genui
dsh plugin --profile web exec playwright install chromium
dsh --profile web
```

Web profile 支持 Inline、Canvas、全屏和 localhost 链接。终端 profile 把命令里的 `web` 换成 `tui`；TUI 返回本地链接，不嵌入 Canvas。MCP 仍按原有方式连接到同一个 profile。

## 安全

生成代码在沙箱中运行。工具调用和公开 HTTPS 范围必须提前声明、限定范围并由用户授权。临时链接和已授予权限会在 7 天后失效；任务状态在最后一次更新 7 天后过期。用户可以回到任务里的页面卡片查看或收回权限。

插件使用 DeepSeek Harness + Cordis、React 18 + TypeScript、esbuild、Playwright 和 Vitest。

## 开发

从源码构建需要 pnpm 11。

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run package:plugin
```

[验收场景](examples/real-user-scenarios.md) · [截图指南](docs/CAPTURE_GUIDE.zh-CN.md) · [参与贡献](CONTRIBUTING.md) · MIT
