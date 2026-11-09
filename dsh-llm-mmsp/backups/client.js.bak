/**
 * MMSP 插件的浏览器半边。
 *
 * ## 提供两个入口（互相独立）
 *
 * 1. **设置页**（`settings.section`，id `mmsp`）——**主入口**。这是宿主
 *    「设置」里独立的一页，不依赖任何其它页面是否 dispatch 我，只要插件启用
 *    就能进。照本机已验证可用的 `dsh-pocket` 同一写法。
 * 2. **插件页配置区**（`plugins.bundle.config`）——副入口，key 是包名
 *    `dsh-llm-mmsp`。
 *
 * ## 页面内容为什么「先静态、后增强」
 *
 * 页面**无条件**渲染三样东西：当前配置值、保存按钮（表单可用时）、以及密钥
 * 该写到哪里。表单拿不到时页面照样有内容可看，不会白屏——这是刻意设计：
 * 一个「什么都看不见」的页面无法判断是没注册、没 dispatch，还是组件崩了。
 *
 * ## 配置读写
 *
 * 走 `configForms.get(entryNs)`：`.store` 是快照（`getSnapshot`/`subscribe`），
 * `.set(field, value)` 写单个字段（内部走 `settings.mutate`，自带版本冲突
 * 恢复）。字段落进 `cordis.patch.yml` 的对应条目，**热生效**。
 *
 * ## 三个踩过的硬坑
 *
 * 1. **`inject` 只能列真实存在的 cordis 服务**：`slots` / `locale`。写
 *    `remote`、`remote.credentials` 会让 `apply` 永不执行且无任何报错。
 * 2. **`t` 必须显式注入**。槽位选项 `locale: NS` 只对编译期登记在
 *    `LocaleNamespaceMap` 的命名空间生效；运行时命名空间拿到的 `t` 是
 *    undefined，组件第一句 `t(...)` 就抛 TypeError，槽位 occupant 变
 *    `active: false`，界面上什么都不显示。
 * 3. **导出形态是 `return { apply, inject }`**：factory 只拿到 `require`。
 *
 * @module dsh-llm-mmsp/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-llm-mmsp',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useSyncExternalStore } = React;

    /** 文案命名空间（只用于字典）。 */
    const NS = 'plugin.mmsp';

    /** 本 bundle 的包名——`plugins.bundle.config` 的 key。 */
    const PKG = 'dsh-llm-mmsp';

    /** Host 条目 id / 配置命名空间。 */
    const ENTRY_NS = 'mmsp';

    /** Host 侧密钥写入路由（与 `lib/index.js` 的 `KEY_ROUTE_PATH` 一致）。 */
    const KEY_ROUTE_PATH = '/api/dsh-llm-mmsp/key';

    const zh = {
      sectionLabel: 'MMSP',
      title: 'MMSP 协议适配',
      intro: '让 DSH 直接用 MMSP 协议调用上游。下面三项写入插件配置，改完热生效；密钥值单独存在凭据库里。',
      provider: '路由名',
      providerHint: '注册到模型选择器的路由名，默认 mmsp。',
      baseURL: '上游地址',
      baseURLHint: '模型列表从 {url}/api/v1/models 实时拉取。',
      save: '保存',
      saving: '保存中…',
      saved: '已保存，下一次请求即生效。',
      revert: '还原',
      failed: '保存失败：{message}',
      loading: '读取配置中…',
      formUnavailable: '配置表单暂不可用，下面仍显示密钥的写入位置。',
      readonly: '当前配置只读。',
      keyHeading: '密钥',
      keyOrderHint: '拖拽排序 —— 越靠上优先级越高',
      keyStrategy: '轮询策略',
      strategyRoundRobin: '轮询（轮流用）',
      strategyPriority: '优先级（只用最靠前的）',
      strategyRoundRobinHint: '每次请求换下一个可用密钥，把负载摊到多个账号上。',
      strategyPriorityHint: '始终用最靠前的可用密钥；它失败（401/429）才降到下一个。',
      keyEmpty: '还没有密钥。在下面输入引用名添加一条。',
      keyListScrollHint: '列表可滚动 —— 一次显示 {shown} 条，共 {total} 条',
      keyAdd: '添加密钥',
      keyAdding: '添加中…',      keyAddPlaceholder: '粘贴密钥',
      keyAddHint: '直接粘贴密钥即可 —— 会自动分配一个内部引用名，不用你起名字。',
      keyAdded: '密钥已添加（内部名 {ref}），下一次请求即生效。',
      keyDragHint: '拖拽调整优先级',
      keyDisabledTag: '已停用',
      keyEnable: '启用',
      keyDisable: '停用',
      keyRemove: '删除这一条（连密钥值一起清掉）',
      keySavingShort: '…',
      keySaved: '密钥 {ref} 已保存，下一次请求即生效。',
      keyCleared: '密钥 {ref} 已清除。',
      keyOrderSaved: '密钥顺序已保存，下一次请求即生效。',
      keyOrderDirty: '顺序/策略有改动，点左边保存',
      saveKeyOrder: '保存顺序',
      keySomeMissing: '有密钥行还没有填值 —— 这些行会被跳过。',
      usageLoading: '读取使用状态中…（本插件启动后还没有请求时会显示 0 次）',
      usageTotal: '累计成功 {n} 次',
      usageLast: '上次用 {ref}',
      usageNext: '下次用 {ref}',
      usageRefresh: '刷新',
      usageCount: '用 {n} 次',
      usageCooling: '冷却 {s}s',
      usageActive: '刚用过',
      usageNextTag: '下一个',
      keyConfigured: '已配置',
      keyMissing: '未配置',
      keyUnknown: '状态未知',
      keyPlaceholderSaved: '已保存（输入新值可更换）',
      keyPlaceholderEmpty: '粘贴密钥',
      keyReplace: '更换',
      keyReveal: '显示',
      keyHide: '隐藏',
      keyFailed: '操作失败：{message}',
      keyRouteUnavailable: '写入通道不可用（插件未挂载 webServer）。请按下面的方式改凭据文件：',
      keyFile: '文件位置',
      current: '当前生效值',
      thinkingSummary: '思考摘要',
      thinkingSummaryOn: '显示思考过程（推荐）',
      thinkingSummaryOff: '不显示思考过程',
      thinkingSummaryHint: '开启后向 MMSP 请求思考摘要。Gemini 系不开就只计费、看不到思考；开启不会增加 token。',
    };

    const en = {
      sectionLabel: 'MMSP',
      title: 'MMSP protocol adapter',
      intro: 'Let DSH call the upstream over MMSP directly. The three fields below are plugin config and apply live; the key value lives in the credential store.',
      provider: 'Route name',
      providerHint: 'The route registered in the model picker; defaults to mmsp.',
      baseURL: 'Upstream URL',
      baseURLHint: 'The model list is read live from {url}/api/v1/models.',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved; applies to the next request.',
      revert: 'Revert',
      failed: 'Save failed: {message}',
      loading: 'Loading configuration…',
      formUnavailable: 'The configuration form is unavailable; the key location is still shown below.',
      readonly: 'This configuration is read-only.',
      keyHeading: 'API keys',
      keyOrderHint: 'Drag to reorder — the top key has the highest priority',
      keyStrategy: 'Strategy',
      strategyRoundRobin: 'Round-robin (rotate)',
      strategyPriority: 'Priority (top key only)',
      strategyRoundRobinHint: 'Each request moves to the next usable key, spreading load across accounts.',
      strategyPriorityHint: 'Always use the top usable key; fall back only when it fails (401/429).',
      keyEmpty: 'No keys yet. Add one by entering a reference name below.',
      keyListScrollHint: 'Scrollable list — {shown} visible, {total} total',
      keyAdd: 'Add key',
      keyAdding: 'Adding…',
      keyAddPlaceholder: 'Paste a key',
      keyAddHint: 'Just paste the key — an internal reference name is assigned for you.',
      keyAdded: 'Key added (internal name {ref}); applies to the next request.',
      keyDragHint: 'Drag to reorder',
      keyDisabledTag: 'disabled',
      keyEnable: 'Enable',
      keyDisable: 'Disable',
      keyRemove: 'Remove this entry (also clears its key)',
      keySavingShort: '…',
      keySaved: 'Key {ref} saved; applies to the next request.',
      keyCleared: 'Key {ref} cleared.',
      keyOrderSaved: 'Key order saved; applies to the next request.',
      keyOrderDirty: 'Order/strategy changed — save it',
      saveKeyOrder: 'Save order',
      keySomeMissing: 'Some key entries have no value yet — they are skipped.',
      usageLoading: 'Reading usage… (0 until this plugin serves a request since startup)',
      usageTotal: '{n} successful requests',
      usageLast: 'last {ref}',
      usageNext: 'next {ref}',
      usageRefresh: 'Refresh',
      usageCount: '{n}×',
      usageCooling: 'cooling {s}s',
      usageActive: 'just used',
      usageNextTag: 'next',
      keyConfigured: 'Configured',
      keyMissing: 'Not configured',
      keyUnknown: 'Unknown',
      keyPlaceholderSaved: 'Saved — type a new value to replace it',
      keyPlaceholderEmpty: 'Paste the key',
      keyReplace: 'Replace',
      keyReveal: 'Show',
      keyHide: 'Hide',
      keyFailed: 'Operation failed: {message}',
      keyRouteUnavailable: 'The write channel is unavailable (the plugin did not mount webServer). Edit the credential file instead:',
      keyFile: 'File',
      current: 'Effective values',
      thinkingSummary: 'Thinking summary',
      thinkingSummaryOn: 'Show the reasoning (recommended)',
      thinkingSummaryOff: 'Hide the reasoning',
      thinkingSummaryHint: 'Requests a thinking summary from MMSP. Without it the Gemini family bills thoughts but returns none; enabling it adds no tokens.',
    };

    /**
     * 密钥列表**可见行数**。超出的部分滚动查看。
     *
     * 4 条：能一眼看清主用 + 备用几条，又不至于把「添加密钥」按钮挤出视野。
     * 想要更紧凑就调小（3），想一次看更多就调大（5）。
     *
     * @type {number}
     */
    const KEY_LIST_VISIBLE_ROWS = 4;

    /**
     * 单条密钥行的估算高度（px）。
     *
     * 构成：上下内边距 `10 + 10`、状态行 `20`、它和输入框之间的间隙 `6`、
     * 输入框 `32`、上下边框 `0.5 + 0.5`。
     *
     * ⚠️ 这是**估算**，不是实测：行内若加了新元素（比如多一行说明文字），
     * 这里要跟着调。偏小会让最后一条显示不全，偏大只是多留一点空白。
     *
     * @type {number}
     */
    const KEY_ROW_HEIGHT = 79;

    /**
     * 行与行之间的间隙（px），必须与 `S.keyList` 的 `gap` 保持一致。
     *
     * @type {number}
     */
    const KEY_ROW_GAP = 8;

    /**
     * 密钥列表的最大高度（px）。
     *
     * ## 为什么不是 `行数 × 行高`
     *
     * 列表是 `flex-direction: column` + `gap`，N 行之间有 `N-1` 个间隙。
     * 只算 `4 × 79 = 316` 会让第 4 条**底部被切掉 24px**（少算了 3 个间隙），
     * 看起来像是行没渲染完。必须把间隙算进去：`4×79 + 3×8 = 340`。
     *
     * 多留这几像素不影响「显示 4 条」的意图——第 5 条仍然露不出来。
     *
     * @type {number}
     */
    const KEY_LIST_MAX_HEIGHT = KEY_LIST_VISIBLE_ROWS * KEY_ROW_HEIGHT
      + (KEY_LIST_VISIBLE_ROWS - 1) * KEY_ROW_GAP;

    const S = {
      wrap: { display: 'flex', flexDirection: 'column', gap: '14px', color: 'var(--dsw-alias-label-primary)' },
      title: { fontSize: '16px', fontWeight: 500, lineHeight: '24px', margin: 0 },
      intro: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '14px', lineHeight: '22px', margin: 0 },
      card: {
        display: 'flex', flexDirection: 'column', gap: '12px',
        border: '0.5px solid var(--dsw-alias-settings-card-stroke)',
        background: 'var(--dsw-alias-settings-card-fill)',
        borderRadius: 'var(--dsw-radius-xl)', padding: '14px 16px',
      },
      field: { display: 'flex', flexDirection: 'column', gap: '4px' },
      label: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '18px' },
      input: {
        boxSizing: 'border-box', width: '100%', height: '32px', padding: '0 10px',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-settings-card-fill)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit', fontSize: '13px',
      },
      row: { display: 'flex', alignItems: 'center', gap: '8px' },
      primary: {
        boxSizing: 'border-box', height: '32px', padding: '0 14px', border: 'none',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-label-primary)',
        color: 'var(--dsw-alias-settings-card-fill)',
        font: 'inherit', fontSize: '13px', cursor: 'pointer',
        // 按钮在 flex 行里**不许被压缩、不许换行**：同一行里有 `flex: 1` 的
        // 输入框，缺了这两条按钮会被挤成两行（「添加密/钥」）。
        flex: 'none',
        whiteSpace: 'nowrap',
      },
      secondary: {
        boxSizing: 'border-box', height: '32px', padding: '0 12px',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
        font: 'inherit', fontSize: '13px', cursor: 'pointer',
        flex: 'none',
        whiteSpace: 'nowrap',
      },
      iconBtn: {
        boxSizing: 'border-box', flex: 'none', width: '28px', height: '28px', padding: 0,
        border: '0.5px solid var(--dsw-alias-border-l3)',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
        font: 'inherit', fontSize: '12px', cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      hint: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px', margin: 0 },
      ok: { color: 'var(--dsw-alias-state-success-primary)', fontSize: '12px', lineHeight: '18px', margin: 0 },
      warn: { color: 'var(--dsw-alias-state-warn-label)', fontSize: '12px', lineHeight: '18px', margin: 0 },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px', lineHeight: '18px', margin: 0 },
      pre: {
        margin: 0, padding: '8px 10px', borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px', lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      },

      // ── 密钥列表 ──────────────────────────────────────────────────────
      //
      // 列表**定高滚动**：密钥多起来（常见 8～10 条）时不应该把设置页拉成
      // 一条长龙，把下面的「添加密钥」「保存顺序」挤出视野。
      //
      // 高度由 {@link KEY_LIST_MAX_HEIGHT} 算出（含行间隙，见那里的说明），
      // 不写死像素：改可见条数只改 `KEY_LIST_VISIBLE_ROWS` 一个数字。
      //
      // ⚠️ `overflowY: 'auto'` 必须配 `overscrollBehavior: 'contain'`：
      // 否则滚到底部后滚轮会「穿透」到外层的设置页，用户以为列表卡住了。
      // ⚠️ 横向也要 `hidden` —— 行内有 `min-width: 0` 的弹性子项，理论上不会
      // 溢出，但拖拽中的 `box-shadow` 描边会让横向出现 1px 滚动条。
      keyList: {
        display: 'flex', flexDirection: 'column', gap: `${KEY_ROW_GAP}px`,
        maxHeight: `${KEY_LIST_MAX_HEIGHT}px`,
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        // 给滚动条留出位置，免得它压住行右侧的按钮。
        paddingRight: '4px',
      },
      /** 包住可滚动列表：让「还有 N 条」的提示紧贴在列表下方。 */
      keyListWrap: { display: 'flex', flexDirection: 'column', gap: '4px' },
      keyRow: {
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        // 不许被压缩：flex 容器里默认 `flex-shrink: 1`，行一多就会被压扁。
        flex: 'none',
        padding: '10px 10px 10px 6px',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-layer-2)',
        cursor: 'grab',
        transition: 'border-color 120ms ease, opacity 120ms ease',
      },
      keyRowOver: {
        borderColor: 'var(--dsw-alias-brand-primary)',
        boxShadow: 'inset 0 0 0 1px var(--dsw-alias-brand-primary)',
      },
      keyRowDragging: { opacity: 0.4, cursor: 'grabbing' },
      grip: {
        flex: 'none', width: '14px', paddingTop: '4px',
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: '14px', lineHeight: '20px', textAlign: 'center',
        cursor: 'grab', userSelect: 'none',
      },
      order: {
        flex: 'none', minWidth: '16px', paddingTop: '3px',
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: '11px', lineHeight: '20px', textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
      },
      keyMain: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 },
      keyActions: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 'none' },
      /** 用量汇总条：一行灰字 + 刷新。 */
      usageBar: {
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        padding: '6px 10px',
        border: '0.5px dashed var(--dsw-alias-border-l3)',
        borderRadius: 'var(--dsw-radius-md)',
      },
      refText: {
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px', lineHeight: '20px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
      /** 引用名：辅助信息，不抢视线。 */
      refTextTiny: {
        color: 'var(--dsw-alias-label-tertiary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '11px', lineHeight: '18px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
      badge: {
        flex: 'none', padding: '0 5px',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        borderRadius: 'var(--dsw-radius-xs)',
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: '10px', lineHeight: '15px',
      },
    };

    /** 凭据库路径（展示用，说明密钥写在哪）。 */
    const CREDENTIALS_PATH = '\\.dsh\\.credentials.yaml';

    /**
     * 从表单快照里读字符串字段。
     *
     * @param {object | undefined} snapshot - `{ status, value, writable, ... }`。
     * @param {string} key - 字段名。
     * @returns {string} 值，未设置时为空串。
     */
    function fieldOf(snapshot, key) {
      const value = snapshot?.value;
      if (value === null || typeof value !== 'object') return '';
      const raw = Reflect.get(value, key);
      return typeof raw === 'string' ? raw : '';
    }

    /**
     * 从表单快照读出密钥表（保序 —— 顺序就是优先级）。
     *
     * @param {object | undefined} snapshot - 表单快照。
     * @returns {{ref: string, enabled: boolean}[]} 密钥列表。
     */
    function keysOf(snapshot) {
      const raw = snapshot?.value?.keys;
      if (!Array.isArray(raw)) return [];
      const out = [];
      const seen = new Set();
      for (const entry of raw) {
        if (entry === null || typeof entry !== 'object') continue;
        const ref = Reflect.get(entry, 'ref');
        if (typeof ref !== 'string') continue;
        const trimmed = ref.trim();
        if (trimmed.length === 0 || seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push({ ref: trimmed, enabled: Reflect.get(entry, 'enabled') !== false });
      }
      return out;
    }

    /**
     * 读轮询策略。
     *
     * @param {object | undefined} snapshot - 表单快照。
     * @returns {'round-robin' | 'priority'} 策略。
     */
    function strategyOf(snapshot) {
      return snapshot?.value?.keyStrategy === 'priority' ? 'priority' : 'round-robin';
    }

    /**
     * 读思考摘要开关。
     *
     * 缺字段时按 `true` —— 与 `Config` schema 的默认值一致，也避免老配置
     * 升级后行为忽然变化。
     *
     * @param {object | undefined} snapshot - 表单快照。
     * @returns {boolean} 是否请求思考摘要。
     */
    function thinkingSummaryOf(snapshot) {
      return snapshot?.value?.thinkingSummary !== false;
    }

    /**
     * 调 Host 的密钥路由。
     *
     * @param {string} action - `status` / `set` / `unset`。
     * @param {object} [payload] - POST 载荷；省略则发 GET。
     * @returns {Promise<any>} `value` 字段。
     */
    async function callKeyApi(action, payload) {
      const response = await fetch(`${KEY_ROUTE_PATH}/${action}`, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: payload === undefined ? undefined : { 'content-type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => undefined);
      if (!response.ok || data?.ok !== true) {
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }
      return data.value;
    }

    /**
     * 批量问「配没配」。一次请求问完所有行，避免 N 个密钥发 N 次请求。
     *
     * @param {string[]} refs - 引用名。
     * @returns {Promise<Record<string, boolean>>} ref → 是否已配置。
     */
    async function fetchKeyStates(refs) {
      if (refs.length === 0) return {};
      const query = refs.map((ref) => `ref=${encodeURIComponent(ref)}`).join('&');
      const value = await callKeyApi(`status?${query}`);
      const out = {};
      for (const entry of value?.entries ?? []) {
        if (typeof entry?.ref === 'string') out[entry.ref] = entry.configured === true;
      }
      return out;
    }

    /**
     * 读密钥池的使用状态。
     *
     * 轮询发生在后台，界面不给读数的话「怎么验证真的在切」只能靠翻日志。
     *
     * @returns {Promise<object | undefined>} `{ entries, next, lastUsed, lastUsedAt, total, strategy }`。
     */
    async function fetchUsage() {
      try {
        return await callKeyApi('usage');
      } catch {
        return undefined;
      }
    }

    /**
     * 配置卡片主体。
     *
     * 设计要点：**表单不可用时仍然渲染密钥说明**，页面永远有内容。
     *
     * @param {object} props - `{ t, form, view }`。
     * @returns {object} 元素。
     */
    function ConfigPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const form = props.form;

      const snapshot = useSyncExternalStore(
        useCallback((notify) => {
          if (form?.store === undefined || typeof form.store.subscribe !== 'function') return () => {};
          return form.store.subscribe(notify);
        }, [form]),
        useCallback(() => (typeof form?.store?.getSnapshot === 'function' ? form.store.getSnapshot() : undefined), [form]),
      );

      const [draft, setDraft] = useState({ provider: '', baseURL: '', apiKeyEnv: '' });
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState(undefined);
      const [touched, setTouched] = useState(false);

      // 思考摘要开关。与 `draft` 分开：它是布尔，控件类型也不同。
      const [draftSummary, setDraftSummary] = useState(true);

      // 密钥**表**（顺序 / 启停 / 策略）是配置的一部分，与凭据值分开。
      const [draftKeys, setDraftKeys] = useState([]);
      const [draftStrategy, setDraftStrategy] = useState('round-robin');
      const [keyTouched, setKeyTouched] = useState(false);
      const [keyBusy, setKeyBusy] = useState(false);
      const [keyNotice, setKeyNotice] = useState(undefined);

      const effective = {
        provider: fieldOf(snapshot, 'provider'),
        baseURL: fieldOf(snapshot, 'baseURL'),
        // ⚠️ 这个字段**不在界面上显示**，但内部要用：它是第一条密钥的引用名，
        //    「粘贴即添加」靠它决定新密钥叫什么（见 `nextRefFor`）。
        //    删掉这里会让第 546 行的 `.length` 抛 TypeError → 整个组件崩 →
        //    表单空白（`active: false`）。这是踩过的坑。
        apiKeyEnv: fieldOf(snapshot, 'apiKeyEnv'),
      };
      const effectiveKeys = keysOf(snapshot);
      const effectiveStrategy = strategyOf(snapshot);
      // 缺字段时按默认 `true` 处理（与 Config schema 的默认一致）。
      const effectiveSummary = thinkingSummaryOf(snapshot);

      useEffect(() => {
        if (touched || snapshot === undefined) return;
        setDraft({ provider: effective.provider, baseURL: effective.baseURL, apiKeyEnv: effective.apiKeyEnv });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [touched, snapshot, effective.provider, effective.baseURL, effective.apiKeyEnv]);

      useEffect(() => {
        if (touched || snapshot === undefined) return;
        setDraftSummary(effectiveSummary);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [touched, snapshot, effectiveSummary]);

      useEffect(() => {
        if (keyTouched || snapshot === undefined) return;
        setDraftKeys(effectiveKeys);
        setDraftStrategy(effectiveStrategy);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [keyTouched, snapshot, JSON.stringify(effectiveKeys), effectiveStrategy]);

      const writable = snapshot?.writable !== false;
      const dirty = draft.provider !== effective.provider
        || draft.baseURL !== effective.baseURL
        || draft.apiKeyEnv !== effective.apiKeyEnv
        || draftSummary !== effectiveSummary;
      const keysDirty = JSON.stringify(draftKeys) !== JSON.stringify(effectiveKeys)
        || draftStrategy !== effectiveStrategy;

      const edit = (key, value) => {
        setTouched(true);
        setNotice(undefined);
        setDraft((current) => ({ ...current, [key]: value }));
      };

      /**
       * 保存密钥表（顺序 / 启停 / 策略）。
       *
       * @param {object[]} [override] - 要保存的列表；省略则用 `draftKeys`。
       *   「粘贴即添加」会在写入凭据后立刻调它，把新行一起存掉。
       */
      const saveKeys = useCallback(async (override) => {
        const target = Array.isArray(override) ? override : draftKeys;
        if (form === undefined || typeof form.set !== 'function') return;
        if (!Array.isArray(override) && !keysDirty) return;
        setKeyBusy(true);
        setKeyNotice(undefined);
        try {
          await form.set('keys', target);
          if (draftStrategy !== effectiveStrategy) await form.set('keyStrategy', draftStrategy);
          setKeyTouched(false);
          setKeyNotice({ tone: 'ok', text: t('keyOrderSaved') });
        } catch (error) {
          setKeyNotice({
            tone: 'error',
            text: t('failed').replace('{message}', () => (error instanceof Error ? error.message : String(error))),
          });
          throw error;
        } finally {
          setKeyBusy(false);
        }
      }, [form, draftKeys, keysDirty, draftStrategy, effectiveStrategy, t]);

      const revertKeys = () => {
        setKeyTouched(false);
        setDraftKeys(effectiveKeys);
        setDraftStrategy(effectiveStrategy);
        setKeyNotice(undefined);
      };

      const save = useCallback(async () => {
        if (form === undefined || typeof form.set !== 'function' || !dirty) return;
        setBusy(true);
        setNotice(undefined);
        try {
          if (draft.provider !== effective.provider) await form.set('provider', draft.provider);
          if (draft.baseURL !== effective.baseURL) await form.set('baseURL', draft.baseURL);
          if (draft.apiKeyEnv !== effective.apiKeyEnv) {
            await form.set('apiKeyEnv', draft.apiKeyEnv.length > 0 ? draft.apiKeyEnv : undefined);
          }
          if (draftSummary !== effectiveSummary) await form.set('thinkingSummary', draftSummary);
          setTouched(false);
          setNotice({ tone: 'ok', text: t('saved') });
        } catch (error) {
          setNotice({ tone: 'error', text: t('failed').replace('{message}', () => String(error)) });
        } finally {
          setBusy(false);
        }
      }, [form, dirty, draft, effective, draftSummary, effectiveSummary, t]);

      const revert = () => {
        setTouched(false);
        setDraft(effective);
        setDraftSummary(effectiveSummary);
        setNotice(undefined);
      };

      const hasForm = form !== undefined && typeof form.set === 'function';
      const canSave = hasForm && dirty && writable && !busy;

      // 只暴露用户真正需要的两个字段。
      //
      // `apiKeyEnv` **不再**作为表单项出现：它现在只是「第一条密钥的内部引用名」，
      // 由系统在粘贴密钥时自动沿用/分配。把它摆在界面上只会让人以为需要自己起名字
      // ——那正是这次要消掉的负担。它仍然存在于配置里，供单密钥旧配置兼容。
      const fields = [
        { key: 'provider', label: t('provider'), hint: t('providerHint'), placeholder: 'mmsp' },
        {
          key: 'baseURL',
          label: t('baseURL'),
          hint: t('baseURLHint').replace('{url}', () => draft.baseURL || 'https://go.penguin.ooo'),
          placeholder: 'https://go.penguin.ooo',
        },
      ];

      return h('div', { style: S.wrap },
        h('h2', { style: S.title }, t('title')),
        h('p', { style: S.intro }, t('intro')),

        h('div', { style: S.card },
          hasForm ? null : h('p', { style: S.hint }, t('formUnavailable')),

          ...fields.map((field) => h('div', { style: S.field, key: field.key },
            h('label', { style: S.label }, field.label),
            h('input', {
              style: S.input,
              type: 'text',
              value: draft[field.key],
              spellCheck: false,
              autoComplete: 'off',
              disabled: !hasForm || !writable || busy,
              placeholder: field.placeholder,
              onChange: (event) => edit(field.key, event.target.value),
            }),
            h('p', { style: S.hint }, field.hint),
          )),

          // 思考摘要开关。用 `<select>` 而不是 checkbox：与下面的「轮询策略」
          // 同一套控件，两个选项的文字也比「勾选/不勾选」更说得清后果。
          h('div', { style: S.field },
            h('label', { style: S.label }, t('thinkingSummary')),
            h('select', {
              style: { ...S.input, cursor: 'pointer' },
              value: draftSummary ? 'on' : 'off',
              disabled: !hasForm || !writable || busy,
              onChange: (event) => {
                setTouched(true);
                setNotice(undefined);
                setDraftSummary(event.target.value === 'on');
              },
            },
              h('option', { value: 'on' }, t('thinkingSummaryOn')),
              h('option', { value: 'off' }, t('thinkingSummaryOff')),
            ),
            h('p', { style: S.hint }, t('thinkingSummaryHint')),
          ),

          h('div', { style: S.row },
            h('button', {
              type: 'button',
              style: { ...S.primary, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'default' },
              disabled: !canSave,
              onClick: save,
            }, busy ? t('saving') : t('save')),
            dirty && hasForm
              ? h('button', { type: 'button', style: S.secondary, disabled: busy, onClick: revert }, t('revert'))
              : null,
            hasForm && !writable ? h('span', { style: S.hint }, t('readonly')) : null,
          ),

          notice === undefined ? null : h('p', { style: notice.tone === 'error' ? S.error : S.ok }, notice.text),
        ),

        h(KeyList, {
          t,
          form,
          writable,
          keys: draftKeys,
          strategy: draftStrategy,
          // 取可选值，不要直接读 `.length`：字段缺失时会抛 TypeError 把组件打死。
          preferredRef: effective.apiKeyEnv.length > 0 ? effective.apiKeyEnv : 'MMSP_API_KEY',
          onKeysChange: (next) => {
            setKeyTouched(true);
            setDraftKeys(next);
          },
          onStrategyChange: (next) => {
            setKeyTouched(true);
            setDraftStrategy(next);
          },
          onSave: saveKeys,
          onSaveKeys: saveKeys,
          onRevert: revertKeys,
          dirty: keysDirty,
          busy: keyBusy,
          notice: keyNotice,
          onNotice: setKeyNotice,
          savedKeys: effectiveKeys,
        }),
      );
    }

    /**
     * 给新密钥分配一个引用名。
     *
     * 用户不需要关心这个名字——它只是凭据库里的键。优先用配置里已有的
     * `apiKeyEnv`（兼容老配置），其次 `MMSP_API_KEY`，再次 `_2`、`_3`…
     *
     * @param {{ref: string}[]} keys - 现有密钥列表。
     * @param {string} [preferred] - 首选名字（配置里的 apiKeyEnv）。
     * @returns {string} 未占用的引用名。
     */
    function nextRefFor(keys, preferred) {
      const taken = new Set(keys.map((entry) => entry.ref));
      const first = typeof preferred === 'string' && preferred.trim().length > 0
        ? preferred.trim()
        : 'MMSP_API_KEY';
      if (!taken.has(first)) return first;
      // 已经是 MMSP_API_KEY_N 形式时接着往上加，避免 _2 之后又冒出 _1。
      const base = first.replace(/_\d+$/, '');
      for (let index = 2; index < 1000; index += 1) {
        const candidate = `${base}_${index}`;
        if (!taken.has(candidate)) return candidate;
      }
      return `${base}_${Date.now()}`;
    }

    /**
     * 密钥列表：拖拽排序 + 单条启停 + **直接粘贴密钥**。
     *
     * ## 用户不需要知道「引用名」
     *
     * 粘贴密钥 → 自动分配引用名（`MMSP_API_KEY`、`_2`、`_3`…）→ 写进凭据库 →
     * 追加到列表并保存配置。一次点击完成，用户只面对「密钥」这一个概念。
     *
     * 引用名仍然存在（凭据库必须有键），但只在每行底部以灰字显示，不要求输入。
     *
     * @param {object} props - 见 `ConfigPanel` 的调用处。
     * @returns {object} 元素。
     */
    function KeyList(props) {
      const {
        t, form, writable, keys, strategy, onKeysChange, onStrategyChange,
        onSave, onSaveKeys, onRevert, dirty, busy, notice, onNotice, savedKeys, preferredRef,
      } = props;

      // 每条密钥的「配没配」状态 + 正在编辑的值。
      const [states, setStates] = useState({});
      const [values, setValues] = useState({});
      const [revealed, setRevealed] = useState({});
      const [rowBusy, setRowBusy] = useState({});
      const [routeOk, setRouteOk] = useState(true);
      const [dragFrom, setDragFrom] = useState(undefined);
      const [dragOver, setDragOver] = useState(undefined);
      const [adding, setAdding] = useState('');
      const [addBusy, setAddBusy] = useState(false);

      // 密钥池的实时用量（轮询在后台发生，这里是唯一能看见它的地方）。
      const [usage, setUsage] = useState(undefined);

      const refs = keys.map((entry) => entry.ref);

      // 每 3 秒问一次用量：够看出轮询在切，又不至于把页面拖慢。
      // 页面不可见时停掉，避免后台空转。
      useEffect(() => {
        let live = true;
        let timer;
        const tick = async () => {
          if (!live) return;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            timer = setTimeout(tick, 3_000);
            return;
          }
          const value = await fetchUsage();
          if (live && value !== undefined) setUsage(value);
          if (live) timer = setTimeout(tick, 3_000);
        };
        tick();
        return () => {
          live = false;
          if (timer !== undefined) clearTimeout(timer);
        };
      }, []);

      // 批量问一次所有 key 的状态（引用名集合变了才重问）。
      const refsKey = refs.join('\u0000');
      useEffect(() => {
        let live = true;
        (async () => {
          if (refs.length === 0) {
            if (live) setStates({});
            return;
          }
          try {
            const value = await fetchKeyStates(refs);
            if (live) {
              setStates(value);
              setRouteOk(true);
            }
          } catch {
            if (live) setRouteOk(false);
          }
        })();
        return () => { live = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [refsKey]);

      const hasForm = form !== undefined && typeof form.set === 'function';

      // ── 拖拽 ──────────────────────────────────────────────────────────
      const onDragStart = (index) => (event) => {
        setDragFrom(index);
        // Firefox 要求设置 dataTransfer 才会真开始拖。
        event.dataTransfer?.setData('text/plain', String(index));
        if (event.dataTransfer !== undefined) event.dataTransfer.effectAllowed = 'move';
      };

      const onDragOver = (index) => (event) => {
        event.preventDefault();
        if (event.dataTransfer !== undefined) event.dataTransfer.dropEffect = 'move';
        if (dragOver !== index) setDragOver(index);
      };

      const onDrop = (index) => (event) => {
        event.preventDefault();
        if (dragFrom !== undefined && dragFrom !== index) {
          const next = [...keys];
          const [moved] = next.splice(dragFrom, 1);
          next.splice(index, 0, moved);
          onKeysChange(next);
        }
        setDragFrom(undefined);
        setDragOver(undefined);
      };

      const onDragEnd = () => {
        setDragFrom(undefined);
        setDragOver(undefined);
      };

      // ── 单条操作 ──────────────────────────────────────────────────────
      //
      // ⚠️ 这些操作**立即写配置**，不再走「草稿 + 再点保存」那一套。
      //
      // 原先启停 / 删除 / 拖拽只改草稿，必须滚到底部再点「保存顺序」才生效；
      // 用户点了图标却什么都没发生，看起来就是"按钮坏了"。一条密钥的启停或
      // 删除本来就是一个完整意图，不该再要一次确认。
      //
      // 拖拽**仍然**留在草稿里（见 {@link KeyList} 的 `keysDirty` 提示）：
      // 一次拖动会连发多个 drop，逐次写配置既吵又慢。顺序用底部的
      // 「保存顺序」统一提交——那是唯一需要"批量"语义的操作。

      /** 直接写整张密钥表（用于启停 / 删除这类一步到位的操作）。 */
      const commitKeys = useCallback(async (next) => {
        onKeysChange(next);
        if (!hasForm || !writable) return;
        if (typeof onSaveKeys === 'function') await onSaveKeys(next);
      }, [onKeysChange, onSaveKeys, hasForm, writable]);

      const toggleEnabled = (index) => {
        const next = keys.map((entry, at) => (at === index ? { ...entry, enabled: !entry.enabled } : entry));
        commitKeys(next).catch(() => { /* 错误已由 saveKeys 报出 */ });
      };

      /**
       * 粘贴密钥 → 自动分配引用名 → 写入凭据库 → 追加到列表 → 保存配置。
       *
       * **一次点击完成全部四步**：用户只面对「密钥」，引用名是内部实现细节。
       *
       * 顺序刻意如此：先写值再改配置。反过来的话，配置里会短暂出现一条
       * 「有引用名但没值」的行，中途失败就留下悬空行。
       */
      const addRow = async () => {
        const value = adding.trim();
        if (value.length === 0 || addBusy) return;
        if (!hasForm || !writable) return;

        const ref = nextRefFor(keys, preferredRef);
        setAddBusy(true);
        onNotice(undefined);
        try {
          // ① 先写凭据值。
          await callKeyApi('set', { ref, value });
          // ② 再追加配置并立刻保存（不等用户再点一次「保存顺序」）。
          const next = [...keys, { ref, enabled: true }];
          onKeysChange(next);
          if (typeof onSaveKeys === 'function') await onSaveKeys(next);
          setStates((current) => ({ ...current, [ref]: true }));
          setAdding('');
          onNotice({ tone: 'ok', text: t('keyAdded').replace('{ref}', () => ref) });
        } catch (error) {
          onNotice({
            tone: 'error',
            text: t('keyFailed').replace('{message}', () => (error instanceof Error ? error.message : String(error))),
          });
        } finally {
          setAddBusy(false);
        }
      };

      const writeValue = useCallback(async (ref) => {
        const value = (values[ref] ?? '').trim();
        if (value.length === 0) return;
        setRowBusy((current) => ({ ...current, [ref]: true }));
        onNotice(undefined);
        try {
          await callKeyApi('set', { ref, value });
          setValues((current) => ({ ...current, [ref]: '' }));
          setRevealed((current) => ({ ...current, [ref]: false }));
          setStates((current) => ({ ...current, [ref]: true }));
          onNotice({ tone: 'ok', text: t('keySaved').replace('{ref}', () => ref) });
        } catch (error) {
          onNotice({
            tone: 'error',
            text: t('keyFailed').replace('{message}', () => (error instanceof Error ? error.message : String(error))),
          });
        } finally {
          setRowBusy((current) => ({ ...current, [ref]: false }));
        }
      }, [values, t, onNotice]);

      /**
       * 删除一整行：**先清凭据值，再删配置里的行**。
       *
       * ## 为什么合成一步
       *
       * 原来「清除密钥值」和「删除这一行」是两个按钮，但它们的结果只差一个
       * 空壳行——而空壳行正是最没用的状态（状态点变红、界面提示"未配置"）。
       * 用户的真实意图只有两种：**这一条我不要了**，或者**我要换一个值**。
       * 前者就是这里：一次点击把凭据和行都清掉。
       *
       * 顺序：先 unset 凭据再改配置。反过来的话，配置写入成功而 unset 失败时，
       * 会留下一条配置里查不到、凭据里还在的孤儿密钥（占着库又看不见）。
       *
       * `unset` 失败**不阻断**删行：行已经点了删除，用户要的是界面干净；
       * 残留的凭据值无害（没有配置引用它就不会被用到），报个 warn 即可。
       *
       * @param {{ref: string, enabled: boolean}} entry - 要删除的密钥行。
       */
      const removeRow = useCallback(async (entry) => {
        const ref = entry.ref;
        setRowBusy((current) => ({ ...current, [ref]: true }));
        onNotice(undefined);
        try {
          if (states[ref] === true && routeOk) {
            try {
              await callKeyApi('unset', { ref });
            } catch (error) {
              // 凭据没清掉不影响删行，但要让人知道。
              onNotice({
                tone: 'error',
                text: t('keyFailed').replace(
                  '{message}',
                  () => `凭据 ${ref} 清除失败（配置行仍会删除）：`
                    + (error instanceof Error ? error.message : String(error)),
                ),
              });
            }
          }
          const next = keys.filter((row) => row.ref !== ref);
          onKeysChange(next);
          if (typeof onSaveKeys === 'function') await onSaveKeys(next);
          onNotice({ tone: 'ok', text: t('keyCleared').replace('{ref}', () => ref) });
        } catch (error) {
          onNotice({
            tone: 'error',
            text: t('keyFailed').replace('{message}', () => (error instanceof Error ? error.message : String(error))),
          });
        } finally {
          setRowBusy((current) => ({ ...current, [ref]: false }));
        }
      }, [states, routeOk, keys, onKeysChange, onSaveKeys, t, onNotice]);

      const anyRouteIssue = !routeOk;

      return h('div', { style: S.card },
        h('div', { style: S.row },
          h('p', { style: S.label }, t('keyHeading')),
          h('span', { style: S.hint }, t('keyOrderHint')),
        ),

        // 策略切换：轮询 / 优先级。
        h('div', { style: S.field },
          h('label', { style: S.label }, t('keyStrategy')),
          h('select', {
            style: { ...S.input, cursor: 'pointer' },
            value: strategy,
            disabled: !hasForm || !writable || busy,
            onChange: (event) => onStrategyChange(event.target.value),
          },
            h('option', { value: 'round-robin' }, t('strategyRoundRobin')),
            h('option', { value: 'priority' }, t('strategyPriority')),
          ),
          h('p', { style: S.hint }, strategy === 'priority' ? t('strategyPriorityHint') : t('strategyRoundRobinHint')),
        ),

        // 用量汇总：一眼确认轮询是不是真的在切。
        usage === undefined
          ? h('p', { style: S.hint }, t('usageLoading'))
          : h('div', { style: S.usageBar },
            h('span', { style: S.hint }, t('usageTotal').replace('{n}', () => String(usage.total ?? 0))),
            usage.lastUsed === undefined
              ? null
              : h('span', { style: S.hint }, t('usageLast').replace('{ref}', () => usage.lastUsed)),
            usage.next === undefined
              ? null
              : h('span', { style: S.hint }, t('usageNext').replace('{ref}', () => usage.next)),
            h('button', {
              type: 'button',
              style: { ...S.secondary, height: '24px', fontSize: '12px' },
              onClick: async () => {
                const value = await fetchUsage();
                if (value !== undefined) setUsage(value);
              },
            }, t('usageRefresh')),
          ),

        keys.length === 0
          ? h('p', { style: S.hint }, t('keyEmpty'))
          : h('div', { style: S.keyListWrap },
            h('div', { style: S.keyList },
              ...keys.map((entry, index) => {
              const configured = states[entry.ref];
              const isBusy = rowBusy[entry.ref] === true;
              const isOver = dragOver === index && dragFrom !== index;
              // 这条密钥的实时用量。
              const stat = usage?.entries?.find((row) => row.ref === entry.ref);
              const isLastUsed = usage?.lastUsed === entry.ref;
              const isNext = usage?.next === entry.ref;
              const coolingSec = stat === undefined ? 0 : Math.ceil(stat.coolingMs / 1000);
              return h('div', {
                key: entry.ref,
                style: {
                  ...S.keyRow,
                  ...(isOver ? S.keyRowOver : {}),
                  ...(dragFrom === index ? S.keyRowDragging : {}),
                  opacity: entry.enabled ? 1 : 0.55,
                },
                draggable: hasForm && writable && !busy,
                onDragStart: onDragStart(index),
                onDragOver: onDragOver(index),
                onDrop: onDrop(index),
                onDragEnd,
              },
                // 拖拽把手（整行可拖，把手只是视觉提示）。
                h('span', { style: S.grip, title: t('keyDragHint'), 'aria-hidden': 'true' }, '⠿'),

                // 序号 = 优先级。
                h('span', { style: S.order }, String(index + 1)),

                h('div', { style: S.keyMain },
                  h('div', { style: S.row },
                    // 状态点。
                    h('span', {
                      style: {
                        ...S.dot,
                        background: configured === true
                          ? 'var(--dsw-alias-state-success-primary)'
                          : configured === false
                            ? 'var(--dsw-alias-state-error-primary)'
                            : 'var(--dsw-alias-label-tertiary)',
                      },
                      'aria-hidden': 'true',
                    }),
                    // 用户面对的只有一个概念：密钥。引用名退成灰字辅助信息。
                    h('span', { style: S.hint }, configured === true
                      ? t('keyConfigured')
                      : configured === false ? t('keyMissing') : t('keyUnknown')),
                    h('code', { style: S.refTextTiny, title: entry.ref }, entry.ref),
                    !entry.enabled ? h('span', { style: S.badge }, t('keyDisabledTag')) : null,

                    // 实时用量：用了几次 / 冷却剩余 / 是否当前在用。
                    stat === undefined || stat.successes === 0
                      ? null
                      : h('span', { style: S.badge }, t('usageCount').replace('{n}', () => String(stat.successes))),
                    coolingSec > 0
                      ? h('span', { style: { ...S.badge, color: 'var(--dsw-alias-state-warn-label)' } }, t('usageCooling').replace('{s}', () => String(coolingSec)))
                      : null,
                    isLastUsed
                      ? h('span', { style: { ...S.badge, color: 'var(--dsw-alias-state-success-primary)' } }, t('usageActive'))
                      : isNext
                        ? h('span', { style: { ...S.badge, color: 'var(--dsw-alias-brand-primary)' } }, t('usageNextTag'))
                        : null,
                  ),

                  // 该条的密钥值输入。
                  //
                  // 按钮只保留**有意义的**那几个：
                  // - 眼睛：只有输入框里**有未保存内容**时才出现。原先它对已保存
                  //   的行永远是禁用的（框里是空的，没东西可揭示），看起来像坏了。
                  // - 写入：框里非空才可点（有内容 = 要更换）。
                  // - 清除：仅在已配置时出现，且**并入**删除语义里——
                  //   见下方 `keyActions` 的说明。
                  h('div', { style: S.row },
                    h('input', {
                      style: S.input,
                      type: revealed[entry.ref] === true ? 'text' : 'password',
                      value: values[entry.ref] ?? '',
                      spellCheck: false,
                      autoComplete: 'new-password',
                      disabled: isBusy || !routeOk,
                      placeholder: configured === true ? t('keyPlaceholderSaved') : t('keyPlaceholderEmpty'),
                      onChange: (event) => {
                        const next = event.target.value;
                        setValues((current) => ({ ...current, [entry.ref]: next }));
                      },
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') writeValue(entry.ref);
                      },
                    }),
                    // 有内容可看时才给眼睛——否则是个永远点不动的死按钮。
                    (values[entry.ref] ?? '').length === 0
                      ? null
                      : h('button', {
                        type: 'button',
                        style: S.iconBtn,
                        title: revealed[entry.ref] === true ? t('keyHide') : t('keyReveal'),
                        disabled: isBusy,
                        onClick: () => setRevealed((current) => ({ ...current, [entry.ref]: current[entry.ref] !== true })),
                      }, revealed[entry.ref] === true ? '●' : '○'),
                    // 有输入才给写入按钮（已保存的行不写就是"保持不变"，不需要按钮）。
                    (values[entry.ref] ?? '').trim().length === 0
                      ? null
                      : h('button', {
                        type: 'button',
                        style: S.secondary,
                        disabled: isBusy || !routeOk,
                        onClick: () => writeValue(entry.ref),
                      }, isBusy ? t('keySavingShort') : t('keyReplace')),
                  ),
                ),

                // 单条控制：启停 + 删除。
                //
                // 只留两个按钮。原来还有一个「清除密钥值」（🗑）与「删除这一条」
                // （✕）并排，语义重叠：用户分不清"清掉值"和"删掉行"的差别，而
                // 前者之后留下的正是后者要删的空壳行。合并成：
                //   ⏸/▶ 启停（立即生效）
                //   ✕    删除这一行（**连凭据值一起清**，一次做完）
                h('div', { style: S.keyActions },
                  h('button', {
                    type: 'button',
                    style: S.iconBtn,
                    title: entry.enabled ? t('keyDisable') : t('keyEnable'),
                    disabled: !hasForm || !writable || busy,
                    onClick: () => toggleEnabled(index),
                  }, entry.enabled ? '⏸' : '▶'),
                  h('button', {
                    type: 'button',
                    style: { ...S.iconBtn, color: 'var(--dsw-alias-state-error-primary)' },
                    title: t('keyRemove'),
                    disabled: !hasForm || !writable || busy || isBusy,
                    onClick: () => removeRow(entry),
                  }, '✕'),
                ),
              );
            }),
            ),
            // 列表能滚动时给一句提示 —— 否则用户只看到 4 条，以为其余的丢了。
            // 只在**确实溢出**时才显示，短列表不该多这句废话。
            keys.length > KEY_LIST_VISIBLE_ROWS
              ? h('p', { style: S.hint }, t('keyListScrollHint')
                .replace('{shown}', () => String(KEY_LIST_VISIBLE_ROWS))
                .replace('{total}', () => String(keys.length)))
              : null,
          ),

        // 新增：粘贴密钥即可，引用名自动分配。
        h('div', { style: S.row },
          h('input', {
            style: S.input,
            type: 'password',
            value: adding,
            spellCheck: false,
            autoComplete: 'new-password',
            disabled: !hasForm || !writable || busy || addBusy,
            placeholder: t('keyAddPlaceholder'),
            onChange: (event) => setAdding(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') addRow();
            },
          }),
          h('button', {
            type: 'button',
            style: { ...S.primary, opacity: adding.trim().length > 0 && !addBusy ? 1 : 0.45 },
            disabled: !hasForm || !writable || busy || addBusy || adding.trim().length === 0,
            onClick: addRow,
          }, addBusy ? t('keyAdding') : t('keyAdd')),
        ),
        h('p', { style: S.hint }, t('keyAddHint')),

        // 保存顺序 / 策略。
        //
        // ⚠️ 这里**只管顺序和策略**：启停、删除、新增密钥值都是点完即生效
        // （见 toggleEnabled / removeRow / writeValue / addRow）。所以这个按钮
        // 只在你拖过行或改过策略后才会亮 —— 它亮着就一定有东西没保存。
        h('div', { style: S.row },
          h('button', {
            type: 'button',
            style: { ...S.primary, opacity: dirty && writable && !busy ? 1 : 0.45, cursor: dirty && writable && !busy ? 'pointer' : 'default' },
            disabled: !dirty || !writable || busy || !hasForm,
            // 显式套一层：直接把 onSave 交给 onClick 会把 PointerEvent 当参数传进去。
            onClick: () => onSave(),
          }, busy ? t('saving') : t('saveKeyOrder')),
          dirty && hasForm
            ? h('button', { type: 'button', style: S.secondary, disabled: busy, onClick: onRevert }, t('revert'))
            : null,
          // 未保存时明确说是哪一类改动 —— 否则用户不知道它在等什么。
          dirty && hasForm ? h('span', { style: S.warn }, t('keyOrderDirty')) : null,
          !writable ? h('span', { style: S.hint }, t('readonly')) : null,
        ),

        notice === undefined ? null : h('p', { style: notice.tone === 'error' ? S.error : S.ok }, notice.text),

        // 路由不可用 → 退回改文件的说明。
        anyRouteIssue
          ? h('div', { style: S.field },
            h('p', { style: S.warn }, t('keyRouteUnavailable')),
            h('p', { style: S.hint }, `${t('keyFile')}: %USERPROFILE%${CREDENTIALS_PATH}`),
            h('pre', { style: S.pre }, `refs:\n${refs.map((ref) => `  ${ref}: <你的密钥>`).join('\n') || '  MMSP_API_KEY: <你的密钥>'}`),
          )
          : null,

        // 有已保存的行没配值 → 明确点出来。
        savedKeys.some((entry) => states[entry.ref] === false)
          ? h('p', { style: S.warn }, t('keySomeMissing'))
          : null,
      );
    }

    /**
     * 插件页配置区：`view === 'summary'` 只给一行，`page` 给完整面板。
     *
     * @param {object} props - `{ view, t, form }`。
     * @returns {object} 元素。
     */
    function BundleConfigCard(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      if (props.view === 'summary') {
        return h('span', null, t('title'));
      }
      return h(ConfigPanel, props);
    }

    /**
     * 设置页（主入口）。
     *
     * @param {object} props - `{ t, form }`。
     * @returns {object} 元素。
     */
    function SettingsPage(props) {
      return h(ConfigPanel, props);
    }

    /** 需要的客户端 cordis 服务——只列真实存在的。 */
    const inject = ['slots', 'locale'];

    /**
     * 注册两个入口。
     *
     * @param {object} ctx - 客户端根上下文。
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-llm-mmsp: dictionaries');
      const t = ctx.locale.bind(NS);

      // ① 独立设置页：不依赖任何页面的 dispatch，插件启用即可进。
      //    `configForms` 是可选依赖——缺失时页面仍显示密钥写入位置。
      ctx.inject(['configForms'], (child) => {
        const forms = child.configForms;
        const form = forms !== undefined && typeof forms.get === 'function'
          ? forms.get(ENTRY_NS)
          : undefined;

        const injected = () => ({ t, form });

        child.slots.inject('settings.section', () => child.slots.register({
          name: 'settings.section',
          id: 'mmsp',
          order: 60,
          label: () => t('sectionLabel'),
          inject: injected,
        }, SettingsPage));

        // ② 插件页配置区：只在 Host 真的提供该命名空间时注册。
        if (forms !== undefined && typeof forms.whileServed === 'function') {
          child.effect(() => forms.whileServed([ENTRY_NS], () =>
            child.slots.inject('plugins.bundle.config', () => child.slots.register({
              name: 'plugins.bundle.config',
              key: PKG,
              inject: injected,
            }, BundleConfigCard)),
          ), 'dsh-llm-mmsp: plugin page card');
        }
      });
    }

    return { apply, inject };
  },
});
