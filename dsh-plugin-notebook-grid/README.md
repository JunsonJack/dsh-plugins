# dsh-plugin-notebook-grid (DSH 笔记本纸张背景插件)

为 DeepSeek Harness（DSH Web / Desktop）提供沉浸式笔记纸张纹理背景，开关与样式选择集成在 **设置 → 通用设置** 的原生设置行中。

## 🌟 核心特性

- **4 种纸张纹理**（`body[data-nb-style]`）：
  - ⊞ **方格 (Grid)**：22×22px 浅蓝细线方格纸
  - 📐 **工程 (Engineering)**：方格 + 左侧红色装订边线
  - ⁝ **点阵 (Dots)**：22×22px 微光点阵（手帐点阵本）
  - ≡ **横线 (Lines)**：28px 横格信纸
- **原生设置入口**：
  - 注册进 DSH 设置弹窗「通用」分区（slot `settings.general.item`，id `notebook-grid`，order `20`）；
  - 使用官方 `@deepseek-ai/dsh-client-ui-primitives` 的 `SegmentedControl`（样式）与 `Switch`（开关）；
  - **无任何悬浮按钮 / 悬浮球**，启动时会清理历史版本遗留的 DOM 节点。
- **深浅主题自适应**：
  - `body:not([data-ds-dark-theme])` → 淡纸底 + 低饱和墨线；
  - `body[data-ds-dark-theme]` → `#0b0f17` 暗纸底 + 微光线条；
  - **不覆盖任何 DSH 主题 token**（尤其不碰 `--dsw-alias-bg-base`），不会引发白底白字等显示 bug。
- **9 档成对配色方案与自定义取色**（v3.1.0 → v3.2.0）：
  - 经典（Classic）、暖米（Warm，参考 9Router 配色）、纯白（Plain）、护眼（Mint）、石墨（Graphite）、
    深海蓝白（Ocean）、天空蓝白（Sky）、冰蓝（Ice）、海军蓝（Navy）；
  - 纸底色与网格线色成对联动；支持通过取色器或 Hex 码自由自定义，按亮/暗主题分别保存；
  - 设置页新增 order 21「纸张配色」原生行，采用两层卡片式流式布局；
  - **网格浓度滑块**（v3.2.0）：alpha 倍率 0.2–2.5，独立于颜色；
  - **网格尺寸滑块**（v3.2.0）：12–48px，按纹理分别调节；
  - **实时预览条 + 同步按钮 + 随机按钮**（v3.2.0）。
- **超轻量纯 CSS 渲染**：底层由 CSS 变量驱动，零 Canvas / WebGL 开销，`background-attachment: local` 让纹理随内容滚动。
- **持久化**：`localStorage`（`dsh-notebook-grid-style` / `dsh-notebook-grid-enabled`）+ 尽力同步至 Host 的 `~/.dsh/notebook-grid/config.json`。

## 🔧 安装要点

客户端 bundle 必须在 profile 的 `package.json` 中**同时**登记两处，缺一处都不会加载：

```jsonc
{
  "dependencies": { "dsh-plugin-notebook-grid": "file:../../plugins-src/dsh-plugin-notebook-grid" },
  "dsh": { "profile": { "bundles": ["dsh-plugin-notebook-grid"] } }
}
```

并在 `cordis.patch.yml` 注入：

```yaml
- insert:
    - id: notebook-grid
      name: dsh-plugin-notebook-grid
      config:
        enabled: true
        style: grid
        size: 24
        opacity: 0.08
```

## 🐞 调试 API

```js
window.__dshNotebookGrid.setStyle('dots');      // 切换样式并自动启用
window.__dshNotebookGrid.toggle(false);         // 关闭背景
window.__dshNotebookGrid.getStyle();            // 当前样式 id
window.__dshNotebookGrid.setPalette('warm');    // 切换配色（9 档预设 + custom）
window.__dshNotebookGrid.setAlphaScale(1.2);    // 网格浓度倍率（v3.2.0）
window.__dshNotebookGrid.setSize('grid', 32);   // 网格尺寸 px（v3.2.0）
window.__dshNotebookGrid.syncCustom();          // 同步到另一主题（v3.2.0）
window.__dshNotebookGrid.randomPalette();       // 随机配色（v3.2.0）
window.__dshNotebookGrid.setColor('bg', '#fff');// 自定义纸底色
window.__dshNotebookGrid.resetColors();         // 重置为经典配色
```
