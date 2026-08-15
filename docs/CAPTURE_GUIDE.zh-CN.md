# 宣传截图复现指南

仓库里的中英文截图分别来自真实任务，不合成翻译界面。拍摄时每个任务都新建会话，避免旧上下文影响结果。

## 开始前

在要作为工作区的项目目录启动 Harness：

```sh
cd /path/to/your/workspace
dsh --profile web
```

打开命令行输出的本地地址，然后：

1. 选择当前项目作为 Workspace。
2. 在 **Settings → General → Language** 切换语言。
3. 在 **Settings → Plugins → Plugin configuration** 选择本轮使用的设计。
4. 确认模型可用；需要真实数据的任务还要确认对应 MCP 已连接。

建议统一使用 `1440 × 900` 浏览器窗口。拍摄前折叠左侧栏，等待生成结束，直接在 Inline 页面里做一次选择，再问一轮“我刚才选了什么”。这张图最能体现状态可被下一轮读取；Canvas 只用于单独展示大画布。

不要拍到 API key、私人日程标题、真实账号名或无关工作区。

## 1. Coding Agent 与本地链接

这个场景使用本仓库作为 Workspace：

```sh
cd /Users/pengyue/Documents/Codex/2026-08-14/benchmark-deepseek-harness-genui-prompt-benchmarking/outputs/dsh-genui
dsh --profile web
```

语言设为 English，设计选 `notion-calm`，新建会话后发送：

> Explain how a stable local app URL resolves the current ready version in this project and how a user's selection becomes readable on the next Agent turn. Generate a GenUI for this CLI workflow, map every step to the real source file and function, and return a localhost browser URL. I will ask about the path I select afterward.

生成完成后：

1. 打开返回的 `127.0.0.1` 链接。
2. 在页面中选择 **Failed update**。
3. 回到同一会话发送：`Read my current selection first, then explain that path using the exact source files and functions.`
4. 确认回答读出了 **Failed update**，且引用了真实文件和函数。

建议拍两张：

- **Coding Agent 场景**：左边是 Harness 中的代码任务和读回回答，右边是真实浏览器打开的本地页面。用两个真实窗口并排，不要自行绘制对话框。
- **README 页面图**：只拍本地页面，保留浏览器地址栏里的 `127.0.0.1`，不要出现版本号。

拍摄期间不要关闭 `dsh` 进程。本地页面依赖这个长驻进程；不要用执行完就退出的 headless 模式拍这组图。

建议保存为：

```text
screenshots/en/coding-agent-local-link.jpg
screenshots/en/code-path-explorer.jpg
```

## 2. 本地视觉模型筛选

需要 Hugging Face 与 GitHub 连接。设计使用 `notion-calm`。

中文：

> 我想在一台 24 GB 统一内存的 Mac 上本地运行视觉语言模型，主要处理截图和简单文档。只使用我已经连接的 Hugging Face 和 GitHub 数据，说明内存、许可证和可运行实现上的限制，再帮我保留值得考虑的候选模型。我选完以后会继续问最终建议。

English:

> I want to run a vision-language model locally on a Mac with 24 GB of unified memory, mainly for screenshots and simple documents. Use only the Hugging Face and GitHub sources I already connected. Explain the practical limits around memory, licenses, and runnable implementations, then help me keep the candidates worth considering. I will ask for a final recommendation after I choose.

在界面里保留两个候选项，然后追问：

- 中文：`先读取我保留的候选项，不要重新搜索。根据我的选择给出最终建议。`
- English: `Read my saved candidates first and do not search again. Recommend one based on my choices.`

截图要同时看到候选清单、已选状态和 Agent 的读回回答。

## 3. 日历时段选择

需要 Calendar MCP 和真实可用时间。设计使用 `notion-calm`。

中文：

> 查看我下周的空闲时间，找出三个适合专注写作的 90 分钟时段。不要在回答中透露私人日程标题，也不要把每 15 分钟都做成一个按钮；每天只给两三个有用的选择。在我明确确认前不要创建日程。

English:

> Look at my availability next week and find three 90-minute windows for focused writing. Keep private event titles out of the answer. Show only two or three useful choices per day, and do not create anything until I confirm the exact times.

选中三个时段后追问：

- 中文：`我刚才选了哪三个时段？先读回选择，不要重新读取日历，也不要创建日程。`
- English: `Which three slots did I select? Read the saved choices first. Do not query the calendar again or create events.`

截图前确认界面没有显示私人事件标题。

## 4. 光合作用因果模型

不需要外部工具。设计使用 `material-expressive`。

中文：

> 我总觉得光合作用就是植物直接用阳光制造糖，但老师说光反应和卡尔文循环是两回事。帮我理解当光照、二氧化碳、温度或气孔开度变化时，哪一步会成为限制。我想自己改变条件，观察能量和物质怎样流动。

English:

> I keep thinking photosynthesis means a plant uses sunlight to make sugar directly, but the light reactions and Calvin cycle are different. Help me understand which step becomes limiting when light, carbon dioxide, temperature, or stomatal opening changes. I want to change the conditions myself and watch energy and matter move through the system.

把四个参数调到明显偏离默认值，再追问：

- 中文：`按我现在设置的四个条件，瓶颈在哪里？先读取界面状态再解释。`
- English: `Under my current four settings, where is the bottleneck? Read the UI state before explaining.`

截图要能看到参数、流动变化和针对当前条件的回答。

## 5. 银河系尺度探索

不需要外部工具。设计使用 `material-expressive`。

中文：

> 我知道太阳在银河系里面，但对尺度完全没有直觉。太阳在哪里，离银河系中心多远，附近恒星到整个银河系相差多少个数量级？带我从太阳系向外探索。我想改变尺度和视角、比较光行时间，并理解我们身处其中时如何推断银河系形状。不要只列事实。

English:

> I know the Sun is inside the Milky Way, but I have no intuition for the scale. Where is the Sun, how far away is the center, and how many orders of magnitude separate nearby stars from the whole galaxy? Take me from the Solar System outward. I want to change the scale and viewpoint, compare light-travel times, and understand how we infer the galaxy's shape from inside it. Do not just list facts.

切换到倾斜或侧视视角，改变尺度并选一个地标，再追问：

- 中文：`用自然语言说出我现在的尺度、视角和目标，并解释这个观察位置意味着什么。`
- English: `Describe my current scale, viewpoint, and target in plain language, then explain what this view means.`

截图要保留尺度控制、视角变化、地标和读回回答。

## 中英文各拍一套

中文 README 只使用中文 Harness、中文 Prompt 和中文生成页面；英文 README 同理。切换语言后必须新建会话重新生成，不能只改浏览器界面语言。

建议文件名：

```text
screenshots/zh-CN/local-model-shortlist.jpg
screenshots/zh-CN/calendar-planner.jpg
screenshots/zh-CN/photosynthesis-explorer.jpg
screenshots/zh-CN/milky-way-explorer.jpg

screenshots/en/local-model-shortlist.jpg
screenshots/en/calendar-planner.jpg
screenshots/en/photosynthesis-explorer.jpg
screenshots/en/milky-way-explorer.jpg
```

英文四张补齐后，把它们加入英文 README 的场景表；在此之前不要复用中文图。
