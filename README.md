# dsh-plugins

DeepSeek Harness (DSH) 本地插件集合。

## 插件列表

### dsh-plugin-notebook-grid

笔记本网格插件：以网格布局展示 DSH 笔记本内容，附 `preview.html` 可直接预览效果。

### dsh-llm-mmsp

LLM 多模态安全 / 多媒体处理插件，含多语言文案（`locale/`）与测试（`tests/`），安装步骤见 [dsh-llm-mmsp/INSTALL.md](./dsh-llm-mmsp/INSTALL.md)。

## 安装方式

各插件目录下均带 `cordis.patch.yml`，按 DSH 本地插件方式挂载即可（具体见各插件 README）。

## 目录结构

```
dsh-plugins/
├── dsh-plugin-notebook-grid/   # 笔记本网格插件
└── dsh-llm-mmsp/               # LLM 多模态处理插件
```
