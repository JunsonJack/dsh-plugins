/**
 * 渲染冒烟测试：真实执行 `lib/client.js` 的组件函数，确认不抛错。
 *
 * ## 为什么必须有这个测试
 *
 * 本插件的配置表单**两次**出现「界面上完全看不到」，根因都是**组件渲染时
 * 抛错**：槽位 occupant 变成 `active: false`，界面什么都不显示，而且**没有
 * 任何报错信息**。`node --check` 只查语法，查不出这类问题——上一次就是
 * `effective.apiKeyEnv` 被误删后仍被读 `.length`，抛 TypeError。
 *
 * 这个测试用最小的 React 替身把组件真跑一遍，把「渲染崩溃」变成一条可见的
 * 失败，而不是等用户报「又看不到了」。
 *
 * @module dsh-llm-mmsp/tests/render.test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const SOURCE = readFileSync(CLIENT_PATH, 'utf8');

// ── 网络闸门 ──────────────────────────────────────────────────────────────
//
// `KeyList` 有一个每 3 秒轮询用量的 effect：
//
// ```js
// const tick = async () => {
//   const value = await fetchUsage();        // ← 异步让出
//   if (live) timer = setTimeout(tick, 3_000);  // ← 让出**之后**才排下一次
// };
// tick();
// ```
//
// 关键在时序：`setTimeout` 是在 `await` **之后**才执行的，那时渲染早已结束。
// 所以「渲染期间把 setTimeout 闸死」拦不住它 —— 闸门一开，它照样排下一轮，
// 测试进程于是永远退不出（每次 tick 又续 3 秒）。
//
// 正确做法是让 `fetch` **永不落定**：`tick` 停在 `await` 上，永远不会走到
// 排定时器那一句；而挂起的 promise 不持有事件循环句柄，进程能正常退出。
// 渲染测试只关心「渲染出什么」，与这些请求的响应无关。
const realFetch = globalThis.fetch;
globalThis.fetch = () => new Promise(() => {});

/** 保留真实 fetch 的引用，供将来可能需要真正发请求的测试使用。 */
export const unfetch = realFetch;

/**
 * 加载 client.js 并返回它注册的插件对象。
 *
 * ## 这个替身为什么比看上去复杂
 *
 * 真实 React 的 hook 状态是**按组件实例隔离**的：`ConfigPanel` 的 `draftKeys`
 * 和 `KeyList` 的 `states` 各在各的槽位里。早先的替身只用一个共享数组 +
 * 一个游标，于是嵌套组件（`SettingsPage` → `ConfigPanel` → `KeyList`）会互相
 * 踩槽位：`ConfigPanel` 的 `useEffect` 把 `draftKeys` 写进了别的下标，
 * 第二轮渲染读不到，**密钥行一条都渲染不出来**，而按钮断言就永远是空的。
 *
 * 所以这里按「组件函数」分槽（`Map<Function, slot[]>`），每个组件有自己的
 * 游标，展开嵌套组件时切换上下文 —— 与 React 的隔离语义等价。
 *
 * @returns {object} 插件导出（含测试专用的 `__render`）。
 */
function loadPlugin() {
  /** 组件函数 → 它的 hook 槽位。 */
  const slotsByComponent = new Map();
  /** 当前正在渲染的组件函数。 */
  let currentComponent;
  /** 当前组件的 hook 游标。 */
  let currentCursor = 0;
  /** 本轮待执行的 effect（渲染结束后统一跑，与 React 的时序一致）。 */
  let pendingEffects = [];

  /**
   * 取（或建）某组件的槽位数组。
   *
   * @param {Function} component - 组件函数。
   * @returns {any[]} 槽位数组。
   */
  const slotsOf = (component) => {
    if (!slotsByComponent.has(component)) slotsByComponent.set(component, []);
    return slotsByComponent.get(component);
  };

  /**
   * 在某个组件的上下文里执行一次渲染函数。
   *
   * @param {Function} component - 组件函数。
   * @param {() => any} render - 真正的渲染体。
   * @returns {any} 渲染结果。
   */
  const withComponent = (component, render) => {
    const outerComponent = currentComponent;
    const outerCursor = currentCursor;
    currentComponent = component;
    currentCursor = 0;
    try {
      return render();
    } finally {
      currentComponent = outerComponent;
      currentCursor = outerCursor;
    }
  };

  /** 清空所有组件槽位（模拟全新挂载）。 */
  const resetHooks = () => {
    slotsByComponent.clear();
    currentCursor = 0;
    pendingEffects = [];
  };

  const ReactStub = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: 'Fragment',
    useState: (initial) => {
      const slots = slotsOf(currentComponent ?? ReactStub.useState);
      const index = currentCursor;
      currentCursor += 1;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next) => { slots[index] = next; }];
    },
    /**
     * 把 effect 排进本轮队列，渲染结束后统一执行。
     *
     * 立刻执行会让 `setState` 发生在渲染中途（React 里不会），而且嵌套组件的
     * effect 顺序会乱。排队后统一跑，写入的 state 留到**下一轮**渲染才可见，
     * 这正是「挂载 → effect → 重渲染」的真实时序。
     */
    useEffect: (fn) => {
      pendingEffects.push(fn);
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useRef: (initial) => ({ current: initial }),
  };
  const jsxStub = {
    jsx: ReactStub.createElement,
    jsxs: ReactStub.createElement,
    Fragment: 'Fragment',
  };

  let registered;
  const fakeWindow = {
    __ModuleLoader__: { load: (entry) => { registered = entry; } },
  };

  // eslint-disable-next-line no-new-func
  const run = new Function('window', 'console', SOURCE);
  run(fakeWindow, console);

  assert.ok(registered !== undefined, '没有捕获到 __ModuleLoader__.load');

  const requireStub = (id) => {
    if (id === 'react') return ReactStub;
    if (id === 'react/jsx-runtime') return jsxStub;
    throw new Error(`未知模块: ${id}`);
  };

  /**
   * 展开元素树：函数组件就地调用，产出的子树继续往下走。
   *
   * 展开时会切换到该组件的 hook 上下文（见 {@link withComponent}）。
   *
   * @param {any} node - 元素或子树。
   * @param {number} [depth] - 递归深度（防跑飞）。
   * @returns {any} 纯宿主元素树（`type` 全是字符串）。
   */
  const expand = (node, depth = 0) => {
    if (node === null || node === undefined || depth > 40) return node;
    if (Array.isArray(node)) return node.map((child) => expand(child, depth + 1));
    if (typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const rendered = withComponent(node.type, () => node.type(node.props));
      return expand(rendered, depth + 1);
    }
    return {
      ...node,
      children: (node.children ?? []).map((child) => expand(child, depth + 1)),
    };
  };

  /**
   * 渲染一次并把 effect 跑完（跑完后再渲染，直到没有新 effect）。
   *
   * ⚠️ 有次数上限：`KeyList` 的轮询 effect 会一直重排，真跑起来就停不下来。
   * 上限 5 轮足够让 `draftKeys` 这类初始化赋值落地。
   *
   * @param {object} element - 根元素。
   * @returns {any} 展开后的宿主元素树。
   */
  const render = (element) => {
    let tree = expand(element);
    for (let round = 0; round < 5 && pendingEffects.length > 0; round += 1) {
      const effects = pendingEffects;
      pendingEffects = [];
      for (const effect of effects) {
        try {
          effect();
        } catch {
          // effect 里抛错（例如相对 URL 的 fetch）不该让渲染测试失败。
        }
      }
      tree = expand(element);
    }
    pendingEffects = [];
    return tree;
  };

  const plugin = registered.factory(requireStub);
  plugin.__resetHooks = resetHooks;
  plugin.__render = render;
  return plugin;
}

/** 一个「已加载」的表单快照，含 keys / keyStrategy / apiKeyEnv。 */
const SNAPSHOT = {
  status: 'ready',
  writable: true,
  revision: 1,
  value: {
    provider: 'mmsp',
    baseURL: 'https://go.penguin.ooo',
    apiKeyEnv: 'MMSP_API_KEY',
    keys: [
      { ref: 'MMSP_API_KEY', enabled: true },
      { ref: 'MMSP_API_KEY_2', enabled: false },
    ],
    keyStrategy: 'round-robin',
  },
};

/**
 * 表单句柄替身。
 *
 * @param {object} [snapshot] - 快照。
 * @returns {object} 表单句柄。
 */
function makeForm(snapshot = SNAPSHOT) {
  return {
    store: {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
    },
    set: async () => {},
  };
}

const t = (key) => key;

/**
 * 用假 ctx 执行 `apply`，收集它注册的槽位组件。
 *
 * @param {object | undefined} form - 表单句柄。
 * @returns {{options: object, component: Function}[]} 注册项（额外带 `render`）。
 */
function captureRegistrations(form) {
  const captured = [];
  const makeSlots = () => ({
    inject: (_name, callback) => {
      try { callback(); } catch { /* 槽位未声明时忽略 */ }
    },
    register: (options, component) => {
      captured.push({ options, component });
      return () => {};
    },
  });
  const locale = { register: () => () => {}, bind: () => t };
  const child = {
    configForms: { get: () => form, whileServed: (_ns, register) => register() },
    slots: makeSlots(),
    effect: (fn) => { try { fn(); } catch { /* 忽略 */ } },
    locale,
  };
  const ctx = {
    effect: (fn) => { try { fn(); } catch { /* 忽略 */ } },
    inject: (_deps, callback) => callback(child),
    get: () => undefined,
    locale,
    slots: makeSlots(),
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
  const plugin = loadPlugin();
  plugin.apply(ctx);
  // 把渲染器挂到结果上：它需要与**同一份** hook 槽位配合，所以只能从这里拿。
  captured.render = plugin.__render;
  return captured;
}

/**
 * 取出某个槽位的组件。
 *
 * @param {{options: object, component: Function}[]} captured - 注册项。
 * @param {string} name - 槽位名。
 * @returns {Function} 组件。
 */
function componentOf(captured, name) {
  const found = captured.find((entry) => entry.options.name === name);
  assert.ok(found !== undefined, `没有注册 ${name}`);
  return found.component;
}

/**
 * 把元素树展开成扁平列表。
 *
 * 每一项都带 `text`（该元素下所有字符串子节点的拼接），断言按钮文案时用它。
 *
 * ⚠️ 别去读 `node.props.children`：替身的 `createElement` 把子节点放在
 * **`node.children`**（与 React 的约定一致），`props` 里没有 children。
 *
 * 这一步**不再展开函数组件** —— `captured.render` 已经在渲染时展开了。
 *
 * @param {any} node - 元素或子树。
 * @param {any[]} out - 收集结果。
 * @param {number} [depth] - 递归深度（防跑飞）。
 * @returns {any[]} 扁平列表。
 */
function flatten(node, out = [], depth = 0) {
  if (node === null || node === undefined || depth > 40) return out;
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out, depth);
    return out;
  }
  if (typeof node !== 'object') {
    out.push({ kind: 'text', text: String(node) });
    return out;
  }
  const direct = (node.children ?? [])
    .flat(Infinity)
    .filter((child) => typeof child === 'string' || typeof child === 'number')
    .join('');
  out.push({ kind: node.type, props: node.props, text: direct });
  for (const child of node.children ?? []) flatten(child, out, depth + 1);
  return out;
}

/**
 * 渲染一个槽位组件并把 effect 跑完。
 *
 * @param {{render: Function}} captured - `captureRegistrations` 的返回值。
 * @param {Function} component - 槽位组件。
 * @param {object} props - 组件 props。
 * @returns {any[]} 扁平化的元素列表。
 */
function renderSettled(captured, component, props) {
  return flatten(captured.render(component(props)));
}

test('factory 导出 apply 与 inject', () => {
  const plugin = loadPlugin();
  assert.equal(typeof plugin.apply, 'function');
  assert.deepEqual(plugin.inject, ['slots', 'locale']);
});

test('apply 注册了设置页与插件页两个槽位', () => {
  const captured = captureRegistrations(makeForm());
  const names = captured.map((entry) => entry.options.name).sort();
  assert.deepEqual(names, ['plugins.bundle.config', 'settings.section']);

  const section = captured.find((entry) => entry.options.name === 'settings.section');
  assert.equal(section.options.id, 'mmsp', '设置页 id 必须是 mmsp');

  const pluginCard = captured.find((entry) => entry.options.name === 'plugins.bundle.config');
  assert.equal(pluginCard.options.key, 'dsh-llm-mmsp', '插件页 key 必须是包名');
});

test('设置页能渲染（page 视图）—— 这是「表单消失」的防线', () => {
  const captured = captureRegistrations(makeForm());
  const component = componentOf(captured, 'settings.section');
  const element = component({
    t,
    form: makeForm(),
    view: 'page',
    provider: { provider: 'mmsp', displayName: 'MMSP', settingsNs: 'mmsp' },
    configured: true,
    keyConfigured: true,
  });
  assert.ok(element !== undefined && element !== null, '组件返回了空 —— 界面上会什么都不显示');
});

test('两个入口的 summary 视图都能渲染', () => {
  const captured = captureRegistrations(makeForm());
  for (const { options, component } of captured) {
    const element = component({ t, form: makeForm(), view: 'summary' });
    assert.ok(element !== undefined, `${options.name} summary 渲染返回空`);
  }
});

test('表单缺失时仍能渲染（降级路径）', () => {
  const captured = captureRegistrations(undefined);
  const component = componentOf(captured, 'settings.section');
  const element = component({ t, form: undefined, view: 'page' });
  assert.ok(element !== undefined && element !== null, '拿不到 form 时返回了空');
});

test('配置为只读时仍能渲染', () => {
  const readOnly = { ...SNAPSHOT, writable: false };
  const captured = captureRegistrations(makeForm(readOnly));
  const component = componentOf(captured, 'settings.section');
  const element = component({ t, form: makeForm(readOnly), view: 'page' });
  assert.ok(element !== undefined && element !== null);
});

test('keys 为空时仍能渲染（单密钥旧配置）', () => {
  const empty = {
    ...SNAPSHOT,
    value: { provider: 'mmsp', baseURL: 'https://x', apiKeyEnv: 'MMSP_API_KEY', keys: [], keyStrategy: 'round-robin' },
  };
  const captured = captureRegistrations(makeForm(empty));
  const component = componentOf(captured, 'settings.section');
  const element = component({ t, form: makeForm(empty), view: 'page' });
  assert.ok(element !== undefined && element !== null);
});

test('快照里缺 apiKeyEnv 也不许崩（这类字段缺失曾导致表单消失）', () => {
  const missing = {
    ...SNAPSHOT,
    value: { provider: 'mmsp', baseURL: 'https://x', keys: [], keyStrategy: 'round-robin' },
  };
  const captured = captureRegistrations(makeForm(missing));
  const component = componentOf(captured, 'settings.section');
  const element = component({ t, form: makeForm(missing), view: 'page' });
  assert.ok(element !== undefined && element !== null, '缺 apiKeyEnv 时崩了 —— 直接读 .length 的典型后果');
});

test('keys 含脏数据时不崩', () => {
  const dirty = {
    ...SNAPSHOT,
    value: {
      provider: 'mmsp',
      baseURL: 'https://x',
      apiKeyEnv: 'MMSP_API_KEY',
      keys: [null, 'string', 42, { ref: '' }, { ref: 'OK' }],
      keyStrategy: 'nonsense',
    },
  };
  const captured = captureRegistrations(makeForm(dirty));
  const component = componentOf(captured, 'settings.section');
  const element = component({ t, form: makeForm(dirty), view: 'page' });
  assert.ok(element !== undefined && element !== null);
});

test('快照里缺 thinkingSummary 时按默认 true 渲染（老配置升级不炸）', () => {
  const legacy = {
    ...SNAPSHOT,
    value: { provider: 'mmsp', baseURL: 'https://x', apiKeyEnv: 'MMSP_API_KEY', keys: [], keyStrategy: 'round-robin' },
  };
  const captured = captureRegistrations(makeForm(legacy));
  const component = componentOf(captured, 'settings.section');
  const element = component({ t, form: makeForm(legacy), view: 'page' });
  assert.ok(element !== undefined && element !== null);
});

test('thinkingSummary 为 false 时也能渲染（开关的关闭态）', () => {
  const off = {
    ...SNAPSHOT,
    value: { ...SNAPSHOT.value, thinkingSummary: false },
  };
  const captured = captureRegistrations(makeForm(off));
  const component = componentOf(captured, 'settings.section');
  const element = component({ t, form: makeForm(off), view: 'page' });
  assert.ok(element !== undefined && element !== null);
});

test('设置页里能找到思考摘要的下拉框', () => {
  const captured = captureRegistrations(makeForm());
  const component = componentOf(captured, 'settings.section');
  const nodes = renderSettled(captured, component, { t, form: makeForm(), view: 'page' });

  const selectValues = nodes
    .filter((node) => node.kind === 'select')
    .map((node) => String(node.props?.value));
  assert.ok(selectValues.length >= 1, '没有找到任何 select —— 思考摘要下拉框不见了');
  // 思考摘要控件是 `<select value="on"|"off">`；轮询策略那个是
  // `round-robin`/`priority`。只认前者，避免被另一个 select 蒙混过去。
  assert.ok(
    selectValues.includes('on') || selectValues.includes('off'),
    `思考摘要下拉框不在（实际取值：${selectValues.join(', ')}）`,
  );
});

test('密钥行的按钮已精简：每行只有启停 + 删除两个图标按钮', () => {
  const captured = captureRegistrations(makeForm());
  const component = componentOf(captured, 'settings.section');
  const nodes = renderSettled(captured, component, { t, form: makeForm(), view: 'page' });

  const buttons = nodes.filter((node) => node.kind === 'button');
  const removeButtons = buttons.filter((node) => node.text === '✕');
  assert.equal(removeButtons.length, 2, `两个密钥行应各有 1 个删除按钮，实际 ${removeButtons.length} 个`);

  // 不应再出现 🗑（清除密钥值）这种与删除重叠的按钮。
  const trashButtons = buttons.filter((node) => node.text === '🗑');
  assert.equal(trashButtons.length, 0, '不该再有「清除密钥值」按钮（已并入删除）');
});

test('已保存的密钥行不再显示永远点不动的眼睛按钮', () => {
  const captured = captureRegistrations(makeForm());
  const component = componentOf(captured, 'settings.section');
  const nodes = renderSettled(captured, component, { t, form: makeForm(), view: 'page' });

  const buttons = nodes.filter((node) => node.kind === 'button');
  // 输入框都是空的（已保存的行显示占位符），所以「显示/隐藏」按钮一个都不该出现。
  const eyeButtons = buttons.filter(
    (node) => node.props?.title === 'keyReveal' || node.props?.title === 'keyHide',
  );
  assert.equal(eyeButtons.length, 0, `空输入框旁不该有眼睛按钮（找到 ${eyeButtons.length} 个）`);

  // 同理，「更换」按钮也不该出现 —— 没有输入就没有可写的内容。
  const replaceButtons = buttons.filter((node) => node.text === 'keyReplace');
  assert.equal(replaceButtons.length, 0, '空输入框旁不该有更换按钮');
});

test('删除按钮的提示明说会连密钥值一起清掉', () => {
  const captured = captureRegistrations(makeForm());
  const component = componentOf(captured, 'settings.section');
  const nodes = renderSettled(captured, component, { t, form: makeForm(), view: 'page' });

  const removeButtons = nodes.filter(
    (node) => node.kind === 'button' && node.text === '✕',
  );
  assert.ok(removeButtons.length > 0, '没有删除按钮');
  for (const button of removeButtons) {
    // t() 是恒等函数，所以 title 就是文案键；具体文案见 zh 字典。
    assert.equal(button.props.title, 'keyRemove');
  }
});

/**
 * 造一个有 N 条密钥的快照。
 *
 * @param {number} count - 条数。
 * @returns {object} 表单快照。
 */
function snapshotWithKeys(count) {
  const keys = Array.from({ length: count }, (_value, index) => ({
    ref: index === 0 ? 'MMSP_API_KEY' : `MMSP_API_KEY_${index + 1}`,
    enabled: true,
  }));
  return { ...SNAPSHOT, value: { ...SNAPSHOT.value, keys } };
}

/**
 * 从元素树里找出密钥列表容器与所有密钥行。
 *
 * @param {any[]} nodes - 扁平化元素列表。
 * @returns {{list: object | undefined, rows: object[]}} 结果。
 */
function findKeyList(nodes) {
  const list = nodes.find((node) => node.kind === 'div' && node.props?.style?.maxHeight !== undefined);
  const rows = nodes.filter((node) => node.kind === 'div' && node.props?.style?.cursor === 'grab');
  return { list, rows };
}

test('密钥列表定高滚动：超出部分滚动而不是把页面拉长', () => {
  const form = makeForm(snapshotWithKeys(10));
  const captured = captureRegistrations(form);
  const component = componentOf(captured, 'settings.section');
  const nodes = renderSettled(captured, component, { t, form, view: 'page' });

  const { list, rows } = findKeyList(nodes);
  assert.ok(list !== undefined, '没有找到密钥列表容器（缺 maxHeight）');

  const style = list.props.style;
  assert.match(String(style.maxHeight), /^\d+px$/, 'maxHeight 必须是像素值');
  assert.equal(style.overflowY, 'auto', 'overflowY 必须是 auto，才能滚动');
  // 滚到底后滚轮不该穿透到外层设置页。
  assert.equal(style.overscrollBehavior, 'contain');

  // 10 条密钥**全部**渲染（靠滚动看到，而不是被裁掉最后几条）。
  assert.equal(rows.length, 10, `应渲染全部 10 行，实际 ${rows.length} 行`);
  // 每行不许被 flex 压扁。
  for (const row of rows) {
    assert.equal(row.props.style.flex, 'none', '密钥行必须 flex:none，否则行一多就被压扁');
  }
});

test('密钥列表高度容得下 4 条（含行间隙），不会切掉第 4 条底部', () => {
  const form = makeForm(snapshotWithKeys(10));
  const captured = captureRegistrations(form);
  const component = componentOf(captured, 'settings.section');
  const nodes = renderSettled(captured, component, { t, form, view: 'page' });

  const { list } = findKeyList(nodes);
  const maxHeight = Number(String(list.props.style.maxHeight).replace('px', ''));
  const gap = Number(String(list.props.style.gap).replace('px', ''));

  // 行高是按布局估算的（内边距 20 + 状态行 20 + 间隙 6 + 输入框 32 + 边框 1）。
  const estimatedRowHeight = 79;
  const fourRows = 4 * estimatedRowHeight + 3 * gap;

  assert.ok(
    maxHeight >= fourRows,
    `maxHeight=${maxHeight} 装不下 4 行（${fourRows}）—— 第 4 条底部会被切掉`,
  );
  // 但也不该大到露出第 5 条（留着「定高」的意义）。
  const fiveRows = 5 * estimatedRowHeight + 4 * gap;
  assert.ok(
    maxHeight < fiveRows,
    `maxHeight=${maxHeight} 已经能看到第 5 行（${fiveRows}）—— 失去了定高截断的效果`,
  );
});

test('密钥超过可见条数时给滚动提示，未超出时不给', () => {
  const manyForm = makeForm(snapshotWithKeys(10));
  const manyCaptured = captureRegistrations(manyForm);
  const manyNodes = renderSettled(
    manyCaptured,
    componentOf(manyCaptured, 'settings.section'),
    { t, form: manyForm, view: 'page' },
  );
  assert.ok(
    manyNodes.some((node) => node.kind === 'text' && node.text === 'keyListScrollHint'),
    '10 条密钥时应提示列表可滚动',
  );

  const fewForm = makeForm(snapshotWithKeys(3));
  const fewCaptured = captureRegistrations(fewForm);
  const fewNodes = renderSettled(
    fewCaptured,
    componentOf(fewCaptured, 'settings.section'),
    { t, form: fewForm, view: 'page' },
  );
  assert.equal(
    fewNodes.some((node) => node.kind === 'text' && node.text === 'keyListScrollHint'),
    false,
    '3 条密钥没超出可见范围，不该有多余的滚动提示',
  );
});
