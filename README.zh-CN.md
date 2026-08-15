# DeepSeek Harness GenUI

[English](README.md) | 简体中文

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.19-339933?logo=nodedotjs&logoColor=white)](package.json)
[![License](https://img.shields.io/badge/license-MIT-202124)](LICENSE)

<img src="assets/hero-zh-CN.png" width="1280" alt="用户提出代码问题，DeepSeek Harness 返回文字解释和交互式代码路径界面">

一个为 DeepSeek Harness 提供临时任务页面的插件。Agent 用文字回答问题，只在用户确实需要探索、比较、配置或执行操作时加入交互界面。

## 真实场景

<table>
  <tr>
    <td><strong>选择本地模型</strong><br><br>哪些视觉模型能在 24 GB Mac 上实际运行？<br><br>插件把 Hugging Face 和 GitHub 的真实结果整理成可筛选的候选清单，列出内存、许可证、来源，并保存用户的选择。</td>
    <td><img src="screenshots/zh-CN/local-model-shortlist.jpg" width="280" alt="结合 Hugging Face 和 GitHub 结果生成的本地视觉模型筛选界面"></td>
  </tr>
  <tr>
    <td><strong>选择日历时段</strong><br><br>找出合适的 90 分钟写作时间，只创建最终确认的日程。<br><br>页面并列显示真实空闲时间、保留选择，并在写入日历前明确申请授权。</td>
    <td><img src="screenshots/zh-CN/calendar-planner.jpg" width="280" alt="读取真实空闲时间后生成的日历时段选择界面"></td>
  </tr>
  <tr>
    <td><strong>探索光合作用</strong><br><br>改变光照、二氧化碳、温度和气孔开度，找到限制反应的环节。<br><br>图示会跟随控制项变化，因果关系可以直接操作和验证。</td>
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

Inline、Canvas、全屏、本地页面和 Agent 后续轮次共享同一份任务状态。

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
2. 它编写 React + TypeScript，声明需要的准确工具或公开 HTTPS 范围；插件负责构建和检查页面。
3. 用户输入保存到当前任务。后续轮次直接读取这些状态，后续修改更新同一个页面，失败的修改不会替换正常版本。

连接工具和 API 首次使用前会申请授权。页面卡片会显示当前访问权限，用户可以随时收回。凭据始终留在 Harness 中。

## Design MD

视觉方向写在 `DESIGN.md` 中。插件内置 4 套风格：

| 风格 | 适用场景 |
| --- | --- |
| `editorial-workbench` | 阅读、规划、表单和内容密集型任务 |
| `ledger-grid` | 对比、排程、证据和候选清单 |
| `field-atlas` | 科学、因果和空间概念解释 |
| `kinetic-signal` | 实时数据、连接工具和用户触发操作 |

打开 **设置 → 插件 → 插件配置**，可以自动选择、指定内置风格、导入 `DESIGN.md`，或导出一份作为起点。这个选择只影响之后新建的页面，不会在页面中增加设计设置。

## 安装

使用 Node.js `^22.19.0 || >=24`。当前版本在 DeepSeek Harness `0.1.0-rc.6` 和 Cordis `4.0.0-rc.7` 上通过测试。

```sh
curl -fL https://github.com/pengyue-polaron/deepseek-harness-genui/releases/latest/download/dsh-plugin-genui.tgz -o /tmp/dsh-plugin-genui.tgz
dsh plugin --profile web add /tmp/dsh-plugin-genui.tgz
dsh plugin --profile web exec playwright install chromium
dsh --profile web
```

Web profile 支持 Inline、Canvas、全屏和 localhost 链接。终端 profile 把命令里的 `web` 换成 `tui`；TUI 返回本地链接，不嵌入 Canvas。MCP 仍按原有方式连接到同一个 profile。

## 安全

生成代码在沙箱中运行。工具调用和公开 HTTPS 范围必须提前声明、限定范围并由用户授权。临时链接 7 天后失效；任务状态和访问权限在 7 天无活动后清理。用户可以回到任务里的页面卡片查看或收回权限。

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
