# DeepSeek Harness GenUI v0.14 社区发布手册

> 维护者内部执行文档，不是可直接复制发布的宣传稿。
>
> 调研与链接核对日期：2026-08-29。社区规则和竞品能力会变化，正式发布当天应再打开原始链接确认。

## 目标与边界

v0.14 的发布目标不是制造一次短期曝光，而是让潜在用户在几分钟内验证这条完整链路：

1. Agent 为当前任务生成一个 React + TypeScript 界面。
2. 用户在界面里作出选择并明确保存。
3. 下一轮 Agent 能读取这些语义化状态并继续任务。
4. 涉及真实工具时，调用仍受能力声明和任务级授权约束。
5. 新候选版本构建失败时，当前可用版本不会被替换。

本手册只使用项目已经公开、或在 v0.14 发布前能由测试直接证明的能力。不要把路线图、内部实现意图、npm 下载量或一次演示成功包装成产品稳定性结论。

## 一句话定位

内部统一使用以下事实边界来组织介绍：

> DeepSeek Harness 原生的 code-first task apps：Agent 按当前任务编写普通 React + TypeScript，用户明确保存的选择可进入下一轮 Agent，真实工具动作仍受声明和任务级授权控制。

这句话不是平台帖子模板。发布者应根据各社区规则，用自己的经历和语言重新组织内容。

## 发布前门槛

以下各项未完成时，不开始大范围宣传：

- [ ] npm、`package.json`、Git tag 和 GitHub Release 均为同一个 `0.14.x` 版本。
- [ ] GitHub 的 `release` environment 已预先创建并至少配置一名 required reviewer；未完成该配置时，发布 workflow 必须 fail closed。
- [ ] Release 中有准确的兼容矩阵、升级说明、已知限制和可下载 tarball。
- [ ] 在计划支持的每个 DeepSeek Harness 版本上完成干净安装，而不只是在开发工作树中 link 安装。
- [ ] 验证从 `0.13.2` 升级到 `0.14.x` 后，旧任务状态、现有 app、权限查看/撤销和卸载流程符合承诺。
- [ ] Web 的 Inline、Canvas、fullscreen、localhost 路径均有端到端结果；TUI/headless 明确标为不支持并保留真实激活失败记录。
- [ ] 未声明调用被拒绝、授权变更重新提示、错误候选不替换当前版本都有自动化或可重复的验收记录。
- [ ] Node.js 支持范围与实际测试矩阵一致。
- [ ] 录制一段无剪切的主演示，并检查画面中没有个人日历、路径、令牌、邮箱或其他敏感信息。
- [ ] README、中文 README、Release、npm 页面和现有社区帖中的安装命令一致。
- [ ] 把测试报告中的“通过”与“未覆盖”分开；没有执行的浏览器、系统或宿主版本不得写成已支持。

上游 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)仍明确标注 developer preview，并提示会有 compatibility-breaking changes。发布时应写精确的已测版本，不宜只用“兼容最新版”“全面向后兼容”这类宽泛表达。

## 可执行发布顺序

### T-3 至 T-2 天：形成可复核证据

1. 冻结 release candidate，仅接受阻断发布的问题。
2. 跑完整测试矩阵，并保存命令、宿主版本、Node 版本和结果。
3. 用全新的 DSH profile 执行用户安装命令，确认没有开发机缓存或 link 依赖。
4. 录制主演示和两段短补充演示。
5. 准备以下静态素材：
   - 一张“生成界面 → 保存状态 → 下一轮继续”的流程图；
   - Inline、Canvas、CLI 各一张真实截图；
   - 一张权限清单或拒绝未声明调用的截图；
   - 一张兼容矩阵截图或可直接链接的 Markdown 表格。
6. 检查现有第三方目录是否仍展示旧版本或旧安装步骤：
   - [dsh.plus](https://www.dsh.plus/en/plugins/deepseek-harness-genui/)
   - [dshplugins.cc](https://dshplugins.cc/en/plugins/pengyue-polaron-deepseek-harness-genui)
   - [DSHarness Directory](https://dsharness.io/en/plugins?category=ui)
   - [DSHarness 中文条目](https://dsharness.org/zh/plugin/pengyue-polaron/deepseek-harness-genui)

其中有的页面仍显示 v0.13.1 或已经不适用的安装方式。v0.14 真正发布并完成干净安装后，再请求各站重抓；发布前不要让第三方页面先出现一个实际上无法安装的版本。

第三方目录的“verified”或“install-tested”只表示其声明范围内的安装检查，不是安全审计。项目也不应把目录收录数量当作用户规模。

### T-1 天：完成发布包

1. 创建 GitHub Release 草稿，内容顺序为：用户可见变化、安装/升级、兼容矩阵、测试证据、已知限制、完整 changelog。
2. 确认 Release 资产能在一个没有仓库权限的环境中下载和安装。
3. 上传主演示到一个能直接播放和长期访问的位置；GitHub README/Release 中保留原始 MP4 或稳定链接。
4. 为不同渠道准备“事实卡片”，而不是一套复制到所有平台的统一文案：
   - 解决的问题；
   - 一条可运行安装命令；
   - 一个真实任务；
   - 三项已测差异；
   - 两项已知限制；
   - GitHub、npm、Release 和测试证据链接。
5. 记录发布前基线：GitHub stars/forks、npm 最近七天下载、Release asset 下载、Discussion reaction、外部 issue/PR 数。npm 下载是原始请求数，不是独立用户数。

### T0：先发布事实来源，再触达核心社区

按以下顺序执行：

1. 发布 npm 包和 GitHub Release，安装验证通过后再开始社区发布。
2. 在已有的 [DeepSeek Harness Discussion #2114](https://github.com/deepseek-ai/deepseek-harness/discussions/2114)追加 v0.14 更新、演示和兼容矩阵链接。不要新建重复 discussion；[官方规则](https://github.com/deepseek-ai/deepseek-harness/discussions/2004)要求一个项目一个 discussion，并要求明确标注非官方。
3. 加入 [DeepSeek Harness 官方 Discord](https://discord.gg/Ycq5dCaS4)，在当时实际存在且合适的 plugin/showcase 频道分享一个场景并提出一个具体反馈问题。不要假定频道名称，也不要同时刷多个频道。
4. 在 [r/DeepSeekHarness](https://www.reddit.com/r/DeepSeekHarness/)发布一次项目更新，重点展示完整用户闭环，不逐条罗列内部架构。
5. 观察安装问题至少数小时；若出现阻断问题，先修复、说明受影响版本，再继续扩散。

### T+1 至 T+2 天：进入更广的 DeepSeek 与开发者社区

1. 在 [r/DeepSeek](https://www.reddit.com/r/DeepSeek/)以真实任务和使用结果为中心分享。该社区要求自荐遵循 1/10 原则、提供项目价值与用例、使用直接源码链接、避免宣传式标题并选择正确 flair。
2. 只在已有的 [narrowin/awesome-generative-ui #13](https://github.com/narrowin/awesome-generative-ui/pull/13) 和 [libukai/awesome-deepseek-harness #22](https://github.com/libukai/awesome-deepseek-harness/pull/22)各追加一次最终 Release 与测试报告链接；两者当前都是开放 PR，不新建重复 PR，也不在发布前再次催促。
3. 在已有的 [dsh-plugin-directory #79](https://github.com/alexchenzl/dsh-plugin-directory/issues/79)补一次已发布版本信息，并按各目录维护方式请求刷新。优先修正旧版本、错误安装方式和旧 Chromium/Playwright 步骤，而不是继续追求更多自动收录站。
4. 在 [V2EX 分享创造](https://www.v2ex.com/go/create)分享开发过程和技术取舍。根据 [V2EX 节点规则](https://www.v2ex.com/help/node)，独立开发者新作适合“分享创造”；公司式营销应进入“推广”节点。

已经合并的收录不要重复提交：[awesome-dsh-plugin #736](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/736)已经合并，配套截图也已有单独记录。此类列表在发布后只需要等待或请求其数据源刷新。

### T+3 至 T+7 天：有条件地扩大曝光

- **Hacker News**：仅在项目已达到可直接试用、无需注册、确属重大升级时考虑 [Show HN](https://news.ycombinator.com/showhn.html)。小版本号本身不足以成为 Show HN。作者需要亲自在线回答技术问题，不能拉票。
- **Product Hunt**：只有在已有独立演示页、至少两张 gallery 图和可直接观看的视频后再考虑。DeepSeek Harness 本体已经有 [Product Hunt 产品页](https://www.producthunt.com/products/deepseek)，本项目必须明确是独立维护的非官方插件。遵循 [Product Hunt 发布要求](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)，可以请求访问和评论，不能直接请求 upvote。
- **r/LocalLLaMA**：仅在 v0.14 有与本地模型直接相关的实测材料时发布，例如不同本地模型生成 UI 的成功率、首次可交互时间、失败类型和复现配置。泛化的 DSH 插件发布与该社区主题不够匹配。
- **LINUX DO**：项目类型匹配，但平台明确限制 AI 生成或润色内容，见下文“必须人工亲写的平台”。
- **DEV Community**：更适合发布沙箱、能力声明或回滚设计的深度技术文章，不适合把同一篇版本宣传稿换皮发布。[DEV 的 AI 辅助规则](https://dev.to/guidelines-for-ai-assisted-articles-on-dev/)要求披露、事实核查，并禁止以推广项目或构建 backlink 为主要目的的 AI 辅助文章。

## 主演示脚本：日历选择到授权执行

建议时长 60–75 秒，全程连续录制。使用专门的测试日历和测试账号，绝不展示真实个人日程。

### 录制前准备

- 使用全新 DSH profile，固定并显示 DSH、插件和 Node 版本。
- 测试日历中预先创建几段无敏感信息的占用时间。
- 浏览器缩放为 100%，关闭通知、密码管理器气泡和无关标签页。
- 准备一个确定可复现的提示，不在录制过程中临时修改系统提示或数据库。
- 若模型输出耗时较长，视频可以在开头说明真实等待时间；不要通过剪切伪装生成速度。

### 分镜

| 时间 | 屏幕动作 | 要证明的事情 |
|---|---|---|
| 0–5 秒 | 显示干净任务、DSH/插件版本和安装完成状态 | 不是概念 mockup，也不是开发工作树特例 |
| 5–15 秒 | 请求 Agent 基于测试日历给出三个 90 分钟候选，并生成可调整、可保存的界面 | 真实任务，而非装饰性 dashboard |
| 15–35 秒 | 界面出现后调整时间、取消一个候选、选择三个时段并点击明确的保存动作 | React task app 的交互自由度和语义化保存 |
| 35–45 秒 | 回到对话，询问“我刚才保存了哪些选择？继续处理它们” | 下一轮 Agent 能读回界面状态 |
| 45–60 秒 | Agent 复述选择；请求把已选时段写入测试日历 | 状态不是只能留在前端 |
| 60–75 秒 | 展示独立的工具授权界面，确认后显示测试日历结果 | 保存选择不等于自动执行；真实动作仍有授权边界 |

录制时应保留模型回答错误、权限拒绝或超时的真实表现。如果为了主视频长度重录，应保留原始完整录屏，并在公开视频说明是否加速了等待段。

### 两段补充证据

1. **跨 surface 状态**：在 Inline 保存一个值，打开 Canvas 或 fullscreen 查看同一 task app，再从 CLI/localhost 继续引用该状态。
2. **失败更新回滚**：从一个可用 app 开始，提交一个确定无法通过构建或源契约检查的候选，展示错误报告和原版本仍可使用。不要人为剪掉失败提示。

## 公平竞品对比

以下比较基于各项目截至 2026-08-29 的公开文档，只比较已记录的产品路线，不代表性能、安全等级或维护质量排名。

| 方案 | 公开实现路线 | 适合它的任务 | 本项目可区分之处 | 不应歪曲的事实 |
|---|---|---|---|---|
| [dsh-genui](https://github.com/omdsh-dev/dsh-genui) | 模型输出白名单约束的 `dsh-ui` JSON；支持 30+ 组件、流式渲染、panel、local state 和 action event loop | 表格、卡片、图表、表单等可由已知组件快速组合的答案型 UI | 普通 React + TypeScript；适合结构无法预先枚举的模拟器、空间工具和多步骤 task app；同一任务状态覆盖 Inline、Canvas、fullscreen、CLI | 对方并非“没有状态”或“不能回传模型”；其公开文档已有表单字段、action 和会话内持久化。本项目应比较 task-scoped semantic handoff 和 surface 范围，而不是声称独占交互回传 |
| [dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) | 模型生成 HTML fragment，放入 opaque-origin sandboxed iframe；CSP 默认阻止网络、嵌套页面和表单提交 | 在 DSH Web 中快速生成交互可视化、图表、比较面板和 UI mockup | task app 状态可进入后续 Agent 轮次；支持更多 surface；声明能力后可连接工具；候选更新有回滚语义 | 对方的安全范围更窄也更简单。可准确引用其当前限制：仅 Web 渲染卡片，TUI/headless 显示普通工具结果，卡片按钮暂不能向主对话发送 follow-up；不要据此推断其整体质量更低 |
| [A2UI](https://a2ui.org/introduction/what-is-a2ui/) | 跨 Web、mobile、desktop 的声明式 JSON 协议；客户端使用可信 catalog 和原生组件渲染，不执行任意代码 | 需要跨平台可移植、原生风格、受控组件和可预测输出的 agent UI | 代码优先提供更开放的结构和交互表达，适合不能预先定义组件树的任务 | A2UI 是协议，不是 DSH 插件；其声明式安全、原生渲染和可移植性是明确优势。本项目不能声称替代或全面优于 A2UI |
| [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) | MCP server 通过 tool metadata 暴露预构建 HTML UI resource；host 在 sandboxed iframe 中渲染，并通过 JSON-RPC 双向通信 | 同一个 MCP server app 需要在多个兼容 host 中复用，或工具拥有稳定的专用 UI | DSH 内按当前任务即时生成界面，并直接使用 DSH task lifecycle、状态和授权体验 | MCP Apps 也支持调用工具、发消息和更新模型上下文；不能把“双向通信”或“工具连接”说成本项目独有。本项目当前更窄、更依赖 DSH |

### 推荐的比较框架

对外比较时使用“什么时候选择谁”，而不是“谁赢了”：

- 简单、可预测、组件已知的卡片/表格：优先考虑 `dsh-genui` 一类组件 schema renderer。
- DSH Web 内的一次性图表或可视化卡片：`dsh-visualize` 路径更轻。
- 需要跨 host、跨平台协议：优先评估 MCP Apps 或 A2UI。
- 需要结构未知的 React task app、跨 DSH surface 的同一任务状态，以及后续 Agent 继续处理：这是本项目应重点证明的范围。

## 可证实、条件性和禁止使用的措辞

### 可以直接使用，但仍应链接证据

- “Agent 编写普通 React + TypeScript，而不是组件树 DSL 或 IR。”
- “同一 task app 可以出现在 Inline、Canvas、fullscreen 和 CLI/localhost；明确保存的选择和输入可供后续 Agent 轮次读取。”
- “生成代码在 sandbox 中运行。”
- “app 需要声明其使用的 Harness、MCP、Skill 工具和无凭据的公开 HTTPS 范围；未声明调用会被阻止。”
- “MCP 凭据不会进入生成代码。”
- “候选 app 在替换当前版本前会经过构建和检查；失败候选不会替换当前工作版本。”
- “MIT License，非官方、由社区独立维护的 DeepSeek Harness 插件。”

上述能力的公开基线见[项目 README](https://github.com/pengyue-polaron/deepseek-harness-genui)。发布 v0.14 时还应链接本次 Release 和测试矩阵。

### 只有完成相应验证后才能使用

- “支持当前最新版 DeepSeek Harness”：必须写出测试时的精确版本，并确认 peer dependency 范围能够安装。
- “向后兼容”：必须列出从哪些历史版本升级、哪些状态和配置被保留；不能只凭单元测试或 TypeScript 编译通过。
- “无需额外安装 Chromium/Playwright”：必须用发布 tarball 在干净 profile 中验证用户路径；仓库 E2E 仍可依赖 Chromium。
- “修复了某类启动/状态/权限问题”：必须有可复现旧行为、修复测试和 Release 变更项。
- “更快”“更省 token”“成功率更高”：必须有公开测试任务、模型、温度、重复次数、计时边界、失败定义和原始结果。
- “用户喜欢”“采用增长”：必须有明确调查或可解释指标；stars、registry downloads 和目录收录不能单独证明。

### 不应宣称

- “第一个”“唯一”“最好”“最先进的 GenUI”。
- “比 dsh-genui / dsh-visualize / A2UI / MCP Apps 更安全”。这些方案的信任边界不同，没有统一审计或同一威胁模型。
- “任意代码零风险”“完全隔离”“绝不会泄露”。只能描述已实现并验证的 sandbox、CSP、能力声明和凭据边界。
- “整个插件都运行在沙箱里”。公开承诺是**生成代码**运行在 sandbox；DSH 插件本身仍应按宿主插件权限审查。
- “组件树方案没有状态、不能交互、不能连接模型”。`dsh-genui` 和 A2UI 都有公开的状态/action 机制。
- “MCP Apps 只是静态 iframe”。其规范明确包含双向 host 通信、工具调用和模型上下文更新。
- “跨客户端标准”或“在任意 agent harness 中可用”。本项目目前明确是 DeepSeek Harness 专用。
- “生产级稳定”“长期 API 稳定”或以 v0.14 暗示 1.0 稳定承诺。上游仍是 developer preview。
- “已有 2,593 名用户”之类把 npm 下载请求当独立用户的说法。

## 必须人工亲写的平台

### Hacker News

[HN Guidelines](https://news.ycombinator.com/newsguidelines.html)明确要求不要发布生成文本或 AI 编辑文本；[Show HN Guidelines](https://news.ycombinator.com/showhn.html)还要求作品可实际试用、尽量无注册障碍、发布者亲自参与讨论，并禁止拉票。

执行限制：

- 本文、AI 生成摘要或由 AI 润色的标题、正文、首评和回复都不得复制到 HN。
- 作者应从空白页面，用自己的语言和真实开发经历完成标题、正文和所有评论。
- 本文只能作为核对事实、链接和演示证据的内部清单。
- 不要求朋友、群成员或其他社区去 upvote/comment。

### LINUX DO

[LINUX DO Guidelines](https://linux.do/guidelines)对开源推广要求完整开源、使用“开源推广”标签、原则上每周不超过一帖、不能简单复制 README，并明确禁止 AI 生成或润色推广文字，也禁止把用户引流到另一个社群。

执行限制：

- 维护者必须亲自从空白开始写帖子；不得把本文改写、翻译或截图伪装成自己的发布正文。
- 不得让我或其他模型起草标题、正文、回复、私信或对现有草稿进行润色。
- 发布前由维护者本人重新阅读当日规则和开源推广格式。
- 帖子应围绕真实开发经历、测试结果和限制，不复制 README，也不引导加入 Discord、微信群或其他社区。

### r/LocalLLaMA

[r/LocalLLaMA 规则](https://www.reddit.com/r/LocalLLaMA/)禁止完全或主要由 LLM 生成的文案和代码；非英语母语者可使用翻译/语言修正，但需明确披露。自荐建议不超过内容的 10%，并必须披露项目关系。

执行限制：

- 只有发布者确实完成了本地模型测试时才发。
- 主要分析、结果解释和回复由发布者本人完成。
- 若使用模型做英文翻译或语法修正，在帖子中透明披露。

### 允许 AI 辅助但有披露要求的平台

- [DEV Community](https://dev.to/guidelines-for-ai-assisted-articles-on-dev/)允许 AI 辅助文章，但必须披露、由作者核查事实，而且 AI 辅助内容不得以宣传业务/项目、个人品牌或 backlink 为主要目的。
- Reddit 的具体限制以各 subreddit 当前规则为准；即使未禁止 AI，也不应批量复制同一宣传文案。

## 社区回复与反馈处理

发布者应在发布后的第一周优先响应以下信息：

1. 干净安装失败和宿主版本不兼容。
2. 状态保存后无法被下一轮读取。
3. 授权清单与真实能力不一致、撤销无效或未声明调用未被阻止。
4. 失败候选覆盖工作版本。
5. 辅助技术、键盘操作、窄屏和不同浏览器的问题。

回复原则：

- 先给复现条件、受影响版本和临时规避方式，再谈设计理念。
- 对竞品问题承认其适合的场景，并链接原始文档；不根据 stars、单次失败或匿名评论评价质量。
- 对安全问题只描述已验证边界，不用“理论上没问题”替代证据。
- 对暂未支持的功能直接写“当前未支持”或“尚未验证”，不要写成“即将到来”。
- 把高质量场景反馈转成 issue 或验收用例，但未经原作者同意不要公开其私有数据或聊天截图。

## 发布后一周复盘

在 T+7 记录：

- 干净安装成功/失败的宿主和系统分布；
- 新 issue 中真实缺陷、文档问题和功能请求的比例；
- 主演示完成观看、Release asset 下载和 npm 下载的变化，但不据此推算独立用户；
- 是否出现外部 PR、可复现案例或新的实际任务场景；
- 哪个渠道带来了可执行反馈，而不只看 upvote 或 stars；
- 哪些对外措辞被误解，下个版本应如何缩小或澄清承诺。

一次成功发布的标准不是“所有渠道都发过”，而是新用户可以复现核心闭环、失败能被定位、比较措辞经得起竞品维护者核对，并且发布后形成了至少一批可转化为测试的真实场景。
