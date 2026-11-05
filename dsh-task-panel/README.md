# dsh-task-panel

DeepSeek Harness (DSH) 右上角任务面板插件。

为 DeepSeek Harness 提供会话进度、输出交付物、工具调用统计与 Git 源码管理联动的右上角专属任务面板。

---

## 核心特性

- **任务进度与步骤时间线**
  - 实时跟随会话任务与步骤计划（`todo/write`），支持正在进行中的步骤呼吸动效；
  - 支持折叠与展开先前/后续步骤，可滚轮滚动浏览步骤历史；
  - 支持「当前轮次」与「全部轮次」切换。

- **交付物与成果文件管理**
  - 汇总会话中生成和输出的文件（`deliverables/presented`）；
  - 支持文件缩略图、富文本预览及直接打开与右键操作。

- **工具与技能记录**
  - 聚合会话中调用的工具（Tools）与技能（Skills）；
  - 统计执行次数、调用中状态与失败情况，支持展开明细。

- **Git 状态与分支切换（新功能）**
  - **常驻入口徽标**：顶栏入口按钮显示当前未提交的变更计数（如 `±3`）；
  - **Diff 统计展示**：展开卡片内清晰呈现当前 Git 分支、更改文件数与 `+新增 / -删除` 行数；
  - **分支切换器**：点击分支按钮即可展开本地分支菜单，支持关键字搜索与一键切换分支（自动 checkout）；
  - **侧边栏联动**：点击「查看 Diff ›」或「打开 ›」一键唤起侧边栏 Git 源码管理视图。

- **高度可定制**
  - 专属设置项（设置 → 任务面板）：可单独开启/关闭进度、输出、工具等子模块；
  - 支持多种卡片材质与外观风格，支持自定义面板宽度与步骤数；
  - 保留消息气泡与对话卡片自定义设置。

---

## 目录结构

```
dsh-task-panel/
├── client.js           # 客户端入口：插槽注册、状态与 UI 渲染
├── index.js            # 服务端入口：插件初始化与依赖注入
├── cordis.patch.yml    # Cordis 容器装载补丁
├── package.json        # 插件元数据与依赖清单
├── server/
│   ├── git-status.js       # Git 状态、分支列表与分支切换接口
│   ├── file-clipboard.js   # 本地剪贴板操作
│   └── file-operations.js  # 文件管理辅助
├── vendor/             # 静态图标与矢量资源
├── LICENSE             # MIT 开源许可证
└── README.md
```

---

## 安装方式

1. 将 `dsh-task-panel` 复制或克隆到本地目录。
2. 在 DSH 当前 profile（如 `~/.dsh/profiles/desktop/package.json`）中添加依赖与 bundle：
   ```json
   {
     "dependencies": {
       "dsh-task-panel": "file:/path/to/dsh-task-panel"
     },
     "dsh": {
       "profile": {
         "bundles": [
           "dsh-task-panel"
         ]
       }
     }
   }
   ```
3. 执行 `pnpm install` 安装依赖。
4. 完全重启 DeepSeek Harness（托盘彻底退出后重新打开）即可生效。
