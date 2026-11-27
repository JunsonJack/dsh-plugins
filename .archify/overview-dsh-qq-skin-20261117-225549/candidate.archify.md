# dsh-qq-skin 宿主适配三视图 {#overview}

三张图从流程、结构、数据三个角度覆盖 dsh-qq-skin 的宿主适配。
工作流看探针如何启动告警，架构看组件边界，数据流看时间标签如何生成。

- 工作流图追踪探针从注册到清理的完整生命周期。
- 架构图划出稳定契约层与宿主内部实现的边界。
- 数据流图还原时间文本从 DOM 节点到标签的提取过程。

@answer scope="dsh-qq-skin 客户端 · 基于 e05069f 源码 · 三张托管图"
@meta locale=zh-CN quality_profile=showcase

## 三张图对照 {#compare}

| 图 | 回答的问题 | 关键内容 | 文件 |
| --- | --- | --- | --- |
| 宿主探针工作流 | 探针何时介入、如何判定 | 三态锚点检测，必需锚点缺失才告警 | `workflow-host-probe.html` |
| 客户端架构 | 客户端由什么组成 | Token 契约层与宿主内部实现分离 | `architecture-client.html` |
| 时间分隔条数据流 | 时间标签从哪来 | 三级模式匹配，按回合分桶 | `time-divider-flow.html` |

## 验证状态 {#verify}

@callout level=note title="门禁结果"
三张图均通过自动门禁：validate、deliver、check、browser-check 全部通过，零诊断。
未做人工视觉审阅；个别图含连线绕行提示，属可选感知复核。
