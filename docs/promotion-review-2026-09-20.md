# 产品宣传与公开动态复核（2026-09-20）

本次以 2026-09-07 的社区收录复核为比较基线。只做查询和本地文案整理，没有向外部维护者发送消息、提交 PR 或发布宣传帖。搜索引擎的抓取时间不等于内容发布时间；未找到不代表不存在。

## 建议统一的产品口径

面向用户的一句话：

> 让 Agent 为当前任务生成可操作的界面；你保存选择，下一轮 Agent 接着办。

面向开发者的一句话：

> DeepSeek Harness 的代码优先任务界面插件：Agent 编写 React + TypeScript，用户保存的选择可进入后续对话，工具操作受任务级授权控制。

可直接使用的短介绍草稿：

> 安排行程、比较方案、探索一个模型时，可以让 Agent 为当前任务生成一个可操作的小界面。你在里面调整选项并保存，再回到对话，Agent 就能读取这些选择并继续任务。DeepSeek Harness GenUI 使用普通 React + TypeScript，支持在对话和 Canvas 中使用同一份任务状态；连接工具时，需要声明能力并获得对应授权。现已发布 v0.14.2，修复 Harness 0.1.5-rc.2 的启动兼容问题。

技术介绍可加：

> 相关研究 EvoGenUI-Bench 已被 EMNLP 2026 接收，研究生成式界面在多轮需求变化中的行为与状态保持。

依据：[arXiv 页面](https://arxiv.org/abs/2608.29387)在 2026-09-07 的 v2 中标注接收信息；[论文代码仓库](https://github.com/MAPS-research/EvoGenUI-Bench)链接本插件作为 DeepSeek Harness 实现。论文接收不等于插件获得会议认证，评测结果也不等于插件可靠性保证。

首个演示建议使用“规划行程 → 调整时间并保存 → 下一轮 Agent 准确读回并继续”。演示保留明确的保存动作；若展示写日历等真实操作，单独展示授权。多轮继续、同一任务状态和可执行交互应成为主线，React 和 Canvas 作为实现说明。

品牌统一使用 **DeepSeek Harness GenUI**，安装处写 **dsh-plugin-genui**，配置排障处写 ID **genui**。搜索中的 `dsh-genui` 经常指向其他作者的项目，不能把同名报道、星数或桌面内置记录归到本项目。

## PR 和社区动态

| 对象 | 2026-09-20 核验结果 | 与此前记录的关系 |
| --- | --- | --- |
| [本仓库 #12](https://github.com/pengyue-polaron/deepseek-harness-genui/pull/12) | 9 月 16 日合并，添加 DSH Insights 徽章 | 新合并，但属于本仓库文档，不是新的外部收录 |
| [narrowin/awesome-generative-ui #13](https://github.com/narrowin/awesome-generative-ui/pull/13) | 仍 OPEN，未合并，无 review；最后更新 8 月 29 日 | 没有新进展 |
| [libukai/awesome-deepseek-harness #22](https://github.com/libukai/awesome-deepseek-harness/pull/22) | 仍 OPEN，未合并，无 review；最后更新 8 月 29 日 | 没有新进展 |
| [Sunrisepeak/dsh-index #34](https://github.com/Sunrisepeak/dsh-index/pull/34) | 仍 OPEN，批量名单含本项目，9 月 20 日更新 | 更新不等于合并 |
| [Sunrisepeak/dsh-index #43](https://github.com/Sunrisepeak/dsh-index/pull/43) | 发布同步 PR，仍 OPEN | 搜索相关结果，不当作已合并收录 |
| [awesome-dsh-plugin #942](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/942) | 实际合并时间是 8 月 16 日 | 不是新合并；不能把 8 月 26 日评论更新时间当合并时间 |
| [OpenDesign #6945](https://github.com/nexu-io/open-design/pull/6945) | 8 月 16 日合并；[产品页](https://open-design.ai/plugins/deepseek-harness-genui/)仍可访问 | 既有收录 |
| [DSH Directory 申请 #79](https://github.com/alexchenzl/dsh-plugin-directory/issues/79) | 9 月 7 日关闭，维护者确认上线 | 既有收录；本次页面仍显示 0.14.1，最后检查为 9 月 18 日 |

精确仓库名称与 `merged:>=2026-09-07` 的 GitHub PR 检索，仅返回本仓库 #12。宽泛 `GenUI` 搜索出现的其他项目 PR 已排除，不能作为本项目宣传成果。

## 报道、论文收录和目录曝光

本次未查到能够确认是 9 月 7 日以来新增、由第三方实际使用本产品后撰写的独立深度评测。已确认的公开内容有：

- [OpenDesign 产品介绍](https://open-design.ai/plugins/deepseek-harness-genui/)：产品专题收录，说明 React 界面和任务状态能力；属于既有收录。
- [Awesome Generative UI 的 EvoGenUI-Bench 条目](https://awesomegenerativeui.com/it/papers/evogenui-bench-multi-turn-interface-maintenance)：论文收录，标注 2026-08；不能据此认定 narrowin 仓库的插件 PR 已合并。
- [AIDB 论文页](https://ai-data-base.com/paper/2608-29387)：页面日期为 8 月 29 日，明确声明标题、要点和翻译为 AI 自动生成。
- [Paperlayer 论文页](https://paperlayer.ai/abs/2608.29387v1)：明确标注 AI 生成的论文摘要，不是产品实测或作者背书。
- [Sophon 论文页](https://sophon.at/papers/evogenui-bench-evaluating-llms-as-multi-turn-generative-ui-assistants)：可访问的论文索引，不能从抓取时间推断首次上线日期。

这些是本次新增发现或重新确认的传播触点，不统一称为“近期新增媒体报道”。

## 更值得处理的对外信息偏差

1. [deepseekserver.com 条目](https://www.deepseekserver.com/resources/deepseek-harness-genui/)仍把项目分类为 `skill`，安装命令带 `--allow-build=esbuild`。当前产品是插件，0.14.1 起使用 esbuild-wasm，无需该安装批准。
2. [dshplugin.me 条目](https://dshplugin.me/plugins/deepseek-harness-genui/)仍显示 0.12.2，并明确告诉用户可使用 `tui` profile。当前版本明确不支持 TUI/headless，应优先纠正。
3. [DSH Directory](https://dsh.directory/plugins/pengyue-polaron/deepseek-harness-genui)仍是 0.14.1 快照。今天刚发布 0.14.2，可先留意自动同步；无需立即重复申请收录。
4. [OpenTrain 的论文页](https://www.opentrain.ai/papers/evogenui-bench-evaluating-llms-as-multi-turn-generative-ui-assistants--arxiv-2608.29387/)仍标记没有确认实现仓库。官方研究仓库已经公开，可在获得对外联系授权后提供链接纠正。

[Anywhere Desktop #308](https://github.com/anywhere-labs/dsh-desktop/issues/308)仍开放，内容是旧的 settings key 故障；作者已在 8 月 26 日回复 0.13.2 修复。不要当作新故障，也不要重复催促。

## 建议下一步

1. 把上述一句话与约一分钟的真实闭环演示配对；演示必须包含保存和下一轮读回。
2. 下一次社区介绍以“多轮交互与研究背景”为主题，v0.14.2 作为兼容性更新说明。
3. 优先纠正第三方错误安装步骤和 TUI 支持范围，再考虑增加目录数量。
4. 两个长期未处理的 awesome PR 可以在准备好新演示后各做一次有实质内容的更新；本次未发送。

避免使用“官方插件”“唯一支持状态回传”“全面兼容所有 Desktop”“论文证明产品稳定”“获得多个媒体权威推荐”等没有对应证据的说法。当前 npm 下载量包含重复安装和自动化下载，也不能作为活跃用户数。

## 第三方目录纠错提交（2026-09-20）

- deepseekserver.com：已提交 [PR #86](https://github.com/fendouai/awesome-deepseek-harness/pull/86)。将现有条目从 skill/learning 移到 plugin/ui/generative-ui；修正 capability 和中文介绍；移除旧 esbuild 安装授权命令；补全 Web-only、Node 范围和无需浏览器安装的说明；更新发布链接。按上游要求生成中英文 README、分类页和详情页。严格数据校验 0 errors / 0 warnings，diff whitespace 检查通过。站方尚需合并部署。
- dshplugin.me：已提交 [纠错 issue #4](https://github.com/dshplugin-me/dsh-plugin-radar/issues/4)。该站公开的 Radar 仓库包含插件目录并链接本站，未发现公开网站源仓库。请求刷新 0.12.2 → 0.14.2，修正 TUI、Playwright/Chromium、Node 和旧设计预设，并同步中文页面与共享数据。待维护者处理。
- DSH Directory：在原收录 [issue #79 下追加刷新请求](https://github.com/alexchenzl/dsh-plugin-directory/issues/79#issuecomment-5750376132)，请求 0.14.1 → 0.14.2，明确替代旧评论中的 --allow-build=esbuild。未新建重复 issue，待站方刷新。
- OpenTrain 论文页：复查仍未识别官方代码仓库；公开联系入口为 https://www.opentrain.ai/contact/ 。本轮尚未提交该论文页面的纠错。

上述为已提交请求，不代表三个线上目录已经更新。
