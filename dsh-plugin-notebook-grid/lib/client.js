/**
 * dsh-plugin-notebook-grid - Client Bundle
 * DeepSeek Harness 笔记本网格 / 点阵 / 横线背景插件
 *
 * v3.2.0 变更：
 *  - 9 档成对预设（经典/暖米/纯白/护眼/石墨/深海蓝白/天空蓝白/冰蓝/海军蓝）
 *  - 新增「网格浓度」滑块（alpha 倍率，0.2–2.5），独立于颜色
 *  - 新增「网格尺寸」滑块（12–48px），按纹理分别调节
 *  - 设置行嵌入实时预览条；新增「同步到另一主题」「随机」按钮
 *  - 网格尺寸改为 CSS 变量驱动，运行时可无损调节
 *
 * v3.1.0 变更：
 *  - 新增「纸张配色」设置行（settings.general.item，id=notebook-grid-colors，order=21）
 *  - 5 档成对预设（纸底色 + 网格线色）：经典 / 暖米 / 纯白 / 护眼 / 石墨
 *  - 自定义取色：纸底色与线色各带取色器 + hex 输入框，按明暗主题分别保存
 *  - 颜色改由 CSS 变量驱动（--nb-bg-* / --nb-ink-<style>-*），默认值写在样式表里，
 *    JS 只覆盖变量，因此不会出现首屏无变量的空档
 *
 * v3 变更：
 *  - 彻底移除右下角悬浮按钮 / 悬浮菜单（含历史遗留节点清理）
 *  - 开关与样式选择改为注册进「设置 → 通用设置」的原生行（settings.general.item）
 */

function factory(require) {
  'use strict';
  const module = { exports: {} };
  const exports = module.exports;

  const React = require('react');
  const primitives = (function () {
    try {
      return require('@deepseek-ai/dsh-client-ui-primitives') || {};
    } catch {
      return {};
    }
  })();

  const h = React.createElement;
  const Switch = primitives.Switch;
  const SegmentedControl = primitives.SegmentedControl;

  // ---------------------------------------------------------------- 纸张纹理
  // inkScale：同一条线色在不同纹理里的浓度倍数
  //  （圆点是实心、横线是整行，视觉都比 1px 细线重，故分别放大）
  const STYLES = [
    { id: 'grid', label: '方格', en: 'Grid', icon: '⊞', inkScale: 1 },
    { id: 'engineering', label: '工程', en: 'Engineering', icon: '📐', inkScale: 1 },
    { id: 'dots', label: '点阵', en: 'Dots', icon: '⁝', inkScale: 1.6 },
    { id: 'lines', label: '横线', en: 'Lines', icon: '≡', inkScale: 1.15 }
  ];
  const STYLE_IDS = STYLES.map(s => s.id);

  // 每种纹理的默认网格尺寸（px）。用户可滑块覆盖，改的是 state.sizeOverride
  const DEFAULT_SIZE = { grid: 22, engineering: 22, dots: 22, lines: 28 };
  const SIZE_MIN = 12;
  const SIZE_MAX = 48;

  // 网格浓度（alpha 倍率）：1.0 = 用预设原本的设计值
  const ALPHA_MIN = 0.2;
  const ALPHA_MAX = 2.5;
  const ALPHA_DEFAULT = 1.0;

  // ---------------------------------------------------------------- 配色预设
  // 每档 = 亮/暗主题各一套「纸底色 + 网格线色」，成对出现保证协调
  //  inkFor  ：个别纹理需要单独线色时的覆盖（点阵沿用墨色而非品牌蓝）
  //  alphaFor：个别纹理直接指定绝对 alpha，绕过 inkScale 换算
  //            （v3.0.0 的点阵/横线 alpha 是手工调过的，用它保证「经典」档逐值一致）
  const PALETTES = [
    {
      id: 'classic',
      label: '经典',
      en: 'Classic',
      light: {
        bg: '#f8fafc',
        ink: '#2563eb',
        alpha: 0.08,
        inkFor: { dots: '#0f172a' },
        alphaFor: { dots: 0.13, lines: 0.09 }
      },
      dark: {
        bg: '#0b0f17',
        ink: '#ffffff',
        alpha: 0.055,
        alphaFor: { dots: 0.09, lines: 0.065 }
      }
    },
    {
      id: 'warm',
      label: '暖米',
      en: 'Warm',
      light: { bg: '#fdfaf6', ink: '#e56a4a', alpha: 0.08 },
      dark: { bg: '#1a1a1a', ink: '#e56a4a', alpha: 0.06 }
    },
    {
      id: 'pure',
      label: '纯白',
      en: 'Plain',
      light: { bg: '#ffffff', ink: '#0f172a', alpha: 0.07 },
      dark: { bg: '#000000', ink: '#ffffff', alpha: 0.07 }
    },
    {
      id: 'mint',
      label: '护眼',
      en: 'Mint',
      light: { bg: '#f2f8f4', ink: '#10b981', alpha: 0.1 },
      dark: { bg: '#0c1512', ink: '#34d399', alpha: 0.09 }
    },
    {
      id: 'graphite',
      label: '石墨',
      en: 'Graphite',
      light: { bg: '#f4f5f7', ink: '#64748b', alpha: 0.1 },
      dark: { bg: '#121316', ink: '#94a3b8', alpha: 0.09 }
    },
    {
      id: 'ocean',
      label: '深海蓝白',
      en: 'Ocean',
      light: { bg: '#eef4ff', ink: '#1e40af', alpha: 0.085 },
      dark: { bg: '#0b1f3a', ink: '#93c5fd', alpha: 0.07 }
    },
    {
      id: 'sky',
      label: '天空蓝白',
      en: 'Sky',
      light: { bg: '#f0f6ff', ink: '#3b82f6', alpha: 0.085 },
      dark: { bg: '#0c1a2e', ink: '#60a5fa', alpha: 0.07 }
    },
    {
      id: 'ice',
      label: '冰蓝',
      en: 'Ice',
      light: { bg: '#f0fbff', ink: '#0284c7', alpha: 0.09 },
      dark: { bg: '#082f49', ink: '#7dd3fc', alpha: 0.075 }
    },
    {
      id: 'navy',
      label: '海军蓝',
      en: 'Navy',
      light: { bg: '#fafbff', ink: '#1e3a8a', alpha: 0.085 },
      dark: { bg: '#0f172a', ink: '#c7d2fe', alpha: 0.07 }
    }
  ];
  const PALETTE_IDS = PALETTES.map(p => p.id).concat(['custom']);

  const DEFAULT_CUSTOM = {
    light: {
      bg: '#f8fafc',
      ink: '#2563eb',
      alpha: 0.08,
      inkFor: { dots: '#0f172a' },
      alphaFor: { dots: 0.13, lines: 0.09 }
    },
    dark: { bg: '#0b0f17', ink: '#ffffff', alpha: 0.055, alphaFor: { dots: 0.09, lines: 0.065 } }
  };

  const STORAGE_KEY = 'dsh-notebook-grid-style';
  const STORAGE_ENABLED = 'dsh-notebook-grid-enabled';
  const STORAGE_PALETTE = 'dsh-notebook-grid-palette';
  const STORAGE_CUSTOM = 'dsh-notebook-grid-custom';
  const STORAGE_ALPHA = 'dsh-notebook-grid-alpha';
  const STORAGE_SIZE = 'dsh-notebook-grid-size';

  // 悬浮按钮已下线，这些 id 是历史版本留下的节点，启动时统一清除
  const LEGACY_IDS = [
    'dsh-notebook-grid-fab',
    'dsh-notebook-grid-panel',
    'dsh-notebook-grid-style',
    'dsh-nb-switcher-root',
    'dsh-notebook-grid-stylesheet-v1'
  ];

  // ---------------------------------------------------------------- 小工具
  function isZh() {
    try {
      return String(navigator.language || navigator.userLanguage || '').toLowerCase().indexOf('zh') === 0;
    } catch {
      return true;
    }
  }

  function T(zh, en) {
    return isZh() ? zh : en;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function normalizeHex(input) {
    if (typeof input !== 'string') return null;
    let v = input.trim().toLowerCase();
    if (!v) return null;
    if (v.charAt(0) !== '#') v = '#' + v;
    if (/^#[0-9a-f]{3}$/.test(v)) {
      v = '#' + v.charAt(1) + v.charAt(1) + v.charAt(2) + v.charAt(2) + v.charAt(3) + v.charAt(3);
    }
    return /^#[0-9a-f]{6}$/.test(v) ? v : null;
  }

  function hexToRgba(hex, alpha) {
    const v = normalizeHex(hex) || '#000000';
    const r = parseInt(v.substr(1, 2), 16);
    const g = parseInt(v.substr(3, 2), 16);
    const b = parseInt(v.substr(5, 2), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + parseFloat(clamp(alpha, 0.01, 0.6).toFixed(4)) + ')';
  }

  function relLum(hex) {
    const v = normalizeHex(hex) || '#ffffff';
    const ch = [1, 3, 5].map(function (i) {
      const s = parseInt(v.substr(i, 2), 16) / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  function isDark() {
    try {
      return !!(document && document.body && document.body.hasAttribute('data-ds-dark-theme'));
    } catch {
      return false;
    }
  }

  function activeTheme() {
    return isDark() ? 'dark' : 'light';
  }

  function paletteById(id) {
    for (let i = 0; i < PALETTES.length; i++) {
      if (PALETTES[i].id === id) return PALETTES[i];
    }
    return null;
  }

  function clonePair(pair) {
    const out = { bg: pair.bg, ink: pair.ink, alpha: pair.alpha };
    if (pair.inkFor) out.inkFor = Object.assign({}, pair.inkFor);
    if (pair.alphaFor) out.alphaFor = Object.assign({}, pair.alphaFor);
    return out;
  }

  function cloneCustom(src) {
    return { light: clonePair(src.light), dark: clonePair(src.dark) };
  }

  function sanitizePair(raw, fallback) {
    if (!raw || typeof raw !== 'object') return clonePair(fallback);
    const bg = normalizeHex(raw.bg) || fallback.bg;
    const ink = normalizeHex(raw.ink) || fallback.ink;
    const alpha = typeof raw.alpha === 'number' && raw.alpha > 0 && raw.alpha <= 0.6 ? raw.alpha : fallback.alpha;
    const out = { bg: bg, ink: ink, alpha: alpha };
    if (raw.inkFor && typeof raw.inkFor === 'object') {
      const inkFor = {};
      Object.keys(raw.inkFor).forEach(function (k) {
        const v = normalizeHex(raw.inkFor[k]);
        if (v) inkFor[k] = v;
      });
      if (Object.keys(inkFor).length) out.inkFor = inkFor;
    }
    if (raw.alphaFor && typeof raw.alphaFor === 'object') {
      const alphaFor = {};
      Object.keys(raw.alphaFor).forEach(function (k) {
        const v = raw.alphaFor[k];
        if (typeof v === 'number' && v > 0 && v <= 0.6) alphaFor[k] = v;
      });
      if (Object.keys(alphaFor).length) out.alphaFor = alphaFor;
    }
    return out;
  }

  // ---------------------------------------------------------------- 读写存储
  function readStyle() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return STYLE_IDS.indexOf(v) >= 0 ? v : 'grid';
    } catch {
      return 'grid';
    }
  }

  function readEnabled() {
    try {
      const v = localStorage.getItem(STORAGE_ENABLED);
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  }

  function readPalette() {
    try {
      const v = localStorage.getItem(STORAGE_PALETTE);
      return PALETTE_IDS.indexOf(v) >= 0 ? v : 'classic';
    } catch {
      return 'classic';
    }
  }

  function readCustom() {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM);
      if (!raw) return cloneCustom(DEFAULT_CUSTOM);
      const parsed = JSON.parse(raw);
      return {
        light: sanitizePair(parsed && parsed.light, DEFAULT_CUSTOM.light),
        dark: sanitizePair(parsed && parsed.dark, DEFAULT_CUSTOM.dark)
      };
    } catch {
      return cloneCustom(DEFAULT_CUSTOM);
    }
  }

  function readAlphaScale() {
    try {
      const v = parseFloat(localStorage.getItem(STORAGE_ALPHA));
      if (isNaN(v)) return ALPHA_DEFAULT;
      return clamp(v, ALPHA_MIN, ALPHA_MAX);
    } catch {
      return ALPHA_DEFAULT;
    }
  }

  function readSizeOverride() {
    try {
      const raw = localStorage.getItem(STORAGE_SIZE);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const out = {};
      Object.keys(parsed).forEach(function (k) {
        const v = parseInt(parsed[k], 10);
        if (STYLE_IDS.indexOf(k) >= 0 && v >= SIZE_MIN && v <= SIZE_MAX) out[k] = v;
      });
      return out;
    } catch {
      return {};
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, state.style);
      localStorage.setItem(STORAGE_ENABLED, String(state.enabled));
      localStorage.setItem(STORAGE_PALETTE, state.palette);
      localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(state.custom));
      localStorage.setItem(STORAGE_ALPHA, String(state.alphaScale));
      localStorage.setItem(STORAGE_SIZE, JSON.stringify(state.sizeOverride));
    } catch {}

    // 尽力同步一份到宿主端 config.json（失败不影响使用）
    try {
      fetch('/_plugins/notebook-grid/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: state.enabled,
          style: state.style,
          palette: state.palette,
          custom: state.custom,
          alphaScale: state.alphaScale,
          sizeOverride: state.sizeOverride,
          size: 24,
          opacity: 0.08
        })
      }).catch(function () {});
    } catch {}
  }

  // ---------------------------------------------------------------- 状态仓库
  const state = {
    style: 'grid',
    enabled: true,
    palette: 'classic',
    custom: cloneCustom(DEFAULT_CUSTOM),
    alphaScale: ALPHA_DEFAULT,
    sizeOverride: {}
  };
  const listeners = new Set();

  function snapshot() {
    return {
      style: state.style,
      enabled: state.enabled,
      palette: state.palette,
      custom: state.custom,
      alphaScale: state.alphaScale,
      sizeOverride: state.sizeOverride
    };
  }

  function notify() {
    listeners.forEach(function (fn) {
      try {
        fn();
      } catch {}
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return function () {
      listeners.delete(fn);
    };
  }

  // 当前生效的一组颜色（默认读「当前主题」那一套）
  function currentPair(theme) {
    const t = theme || activeTheme();
    if (state.palette === 'custom') {
      return clonePair(state.custom[t] || DEFAULT_CUSTOM[t]);
    }
    const p = paletteById(state.palette) || paletteById('classic');
    return clonePair(p[t]);
  }

  function inkForStyle(pair, styleId) {
    if (pair.inkFor && pair.inkFor[styleId]) return pair.inkFor[styleId];
    return pair.ink;
  }

  // 该纹理该用的 alpha：预设可直接钉死绝对值，否则按 inkScale 换算，最后乘浓度倍率
  function alphaForStyle(pair, style) {
    let a;
    if (pair.alphaFor && typeof pair.alphaFor[style.id] === 'number') {
      a = pair.alphaFor[style.id];
    } else {
      a = pair.alpha * style.inkScale;
    }
    return a * state.alphaScale;
  }

  // 生成 CSS 变量表：每种纹理 × 明暗主题各一条线色 + 每主题一条纸底色 + 每纹理一个尺寸
  function buildVars() {
    const vars = {};
    ['light', 'dark'].forEach(function (theme) {
      const pair = currentPair(theme);
      vars['--nb-bg-' + theme] = pair.bg;
      STYLES.forEach(function (s) {
        vars['--nb-ink-' + s.id + '-' + theme] = hexToRgba(inkForStyle(pair, s.id), alphaForStyle(pair, s));
        vars['--nb-size-' + s.id] = (state.sizeOverride[s.id] || DEFAULT_SIZE[s.id]) + 'px';
      });
    });
    return vars;
  }

  function applyState() {
    if (typeof document === 'undefined' || !document.body) return;
    const body = document.body;
    body.setAttribute('data-nb-style', state.style);
    body.setAttribute('data-nb-enabled', String(state.enabled));
    body.setAttribute('data-nb-palette', state.palette);
    const vars = buildVars();
    Object.keys(vars).forEach(function (key) {
      body.style.setProperty(key, vars[key]);
    });
  }

  function setStyle(next) {
    if (STYLE_IDS.indexOf(next) < 0) return;
    state.style = next;
    state.enabled = true;
    persist();
    applyState();
    notify();
  }

  function setEnabled(next) {
    // Switch 一般回传布尔值，兼容回传事件对象的情况
    let value = next;
    if (value && typeof value === 'object' && value.target) value = value.target.checked;
    state.enabled = !!value;
    persist();
    applyState();
    notify();
  }

  function setPalette(next) {
    if (PALETTE_IDS.indexOf(next) < 0) return;
    state.palette = next;
    state.enabled = true;
    persist();
    applyState();
    notify();
  }

  // 从当前配色（预设或已有自定义）拷一份作为自定义的起点
  function seedCustomFromCurrent() {
    const seed = {};
    ['light', 'dark'].forEach(function (theme) {
      seed[theme] = currentPair(theme);
    });
    state.custom = seed;
    return seed;
  }

  // 用户首次碰取色器/hex 输入时：把当前配色复制成自定义，再在此基础上改
  function beginCustomEdit() {
    if (state.palette === 'custom') return;
    seedCustomFromCurrent();
    state.palette = 'custom';
    persist();
    applyState();
    notify();
  }

  // part: 'bg' | 'ink'，改的是「当前主题」的那一套
  function setCustomColor(part, value) {
    if (part !== 'bg' && part !== 'ink') return;
    const hex = normalizeHex(value);
    if (!hex) return;
    if (state.palette !== 'custom') seedCustomFromCurrent();
    const theme = activeTheme();
    const next = cloneCustom(state.custom);
    next[theme][part] = hex;
    // 自定义时不再保留个别纹理的线色覆盖，保持所见即所得
    delete next[theme].inkFor;
    state.custom = next;
    state.palette = 'custom';
    persist();
    applyState();
    notify();
  }

  function resetColors() {
    state.custom = cloneCustom(DEFAULT_CUSTOM);
    state.palette = 'classic';
    persist();
    applyState();
    notify();
  }

  function setAlphaScale(v) {
    const next = clamp(parseFloat(v) || ALPHA_DEFAULT, ALPHA_MIN, ALPHA_MAX);
    state.alphaScale = next;
    persist();
    applyState();
    notify();
  }

  function setSizeOverride(styleId, px) {
    if (STYLE_IDS.indexOf(styleId) < 0) return;
    const next = clamp(parseInt(px, 10) || DEFAULT_SIZE[styleId], SIZE_MIN, SIZE_MAX);
    const ov = Object.assign({}, state.sizeOverride);
    if (next === DEFAULT_SIZE[styleId]) {
      delete ov[styleId];
    } else {
      ov[styleId] = next;
    }
    state.sizeOverride = ov;
    persist();
    applyState();
    notify();
  }

  function resetSize() {
    state.sizeOverride = {};
    persist();
    applyState();
    notify();
  }

  // 把当前主题的自定义配色同步到另一主题，自动按明暗方向调整纸底亮度
  function syncCustomAcrossThemes() {
    if (state.palette !== 'custom') {
      // 先把当前配色拷成自定义，再同步
      seedCustomFromCurrent();
    }
    const from = activeTheme();
    const to = from === 'light' ? 'dark' : 'light';
    const src = state.custom[from];
    if (!src) return;
    const next = cloneCustom(state.custom);
    next[to].bg = shiftLuminance(src.bg, from === 'light' ? 0.30 : 2.6);
    next[to].ink = shiftLuminance(src.ink, from === 'light' ? 1.8 : 0.55);
    next[to].alpha = src.alpha;
    state.custom = next;
    persist();
    applyState();
    notify();
  }

  // 按相对亮度方向缩放一个 hex 的亮度：factor>1 变亮，<1 变暗
  function shiftLuminance(hex, factor) {
    const v = normalizeHex(hex);
    if (!v) return hex;
    const r = parseInt(v.substr(1, 2), 16);
    const g = parseInt(v.substr(3, 2), 16);
    const b = parseInt(v.substr(5, 2), 16);
    const nr = clamp(Math.round(r * factor), 0, 255);
    const ng = clamp(Math.round(g * factor), 0, 255);
    const nb = clamp(Math.round(b * factor), 0, 255);
    function pad(n) {
      const s = n.toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + pad(nr) + pad(ng) + pad(nb);
  }

  function randomPalette() {
    const ids = PALETTES.map(function (p) { return p.id; });
    const next = ids[Math.floor(Math.random() * ids.length)];
    setPalette(next);
  }

  function paletteName(id) {
    const p = paletteById(id);
    if (!p) return T('自定义', 'Custom');
    return isZh() ? p.label : p.en;
  }

  function contrastWarn(pair, theme) {
    const lum = relLum(pair.bg);
    if (theme === 'light' && lum < 0.42) {
      return T('底色偏深，亮色主题下文字可能不易读', 'Paper is quite dark; text may be hard to read in light theme');
    }
    if (theme === 'dark' && lum > 0.5) {
      return T('底色偏亮，暗色主题下文字可能不易读', 'Paper is quite light; text may be hard to read in dark theme');
    }
    return null;
  }

  window.__dshNotebookGrid = {
    setStyle: setStyle,
    toggle: function (force) {
      setEnabled(typeof force === 'boolean' ? force : !state.enabled);
    },
    getStyle: function () {
      return state.style;
    },
    isEnabled: function () {
      return state.enabled;
    },
    // v3.1.0 新增
    setPalette: setPalette,
    getPalette: function () {
      return state.palette;
    },
    setColor: setCustomColor,
    getColors: function (theme) {
      return currentPair(theme);
    },
    getCustom: function () {
      return cloneCustom(state.custom);
    },
    resetColors: resetColors,
    // v3.2.0 新增
    setAlphaScale: setAlphaScale,
    getAlphaScale: function () {
      return state.alphaScale;
    },
    setSize: setSizeOverride,
    getSize: function (styleId) {
      return state.sizeOverride[styleId] || DEFAULT_SIZE[styleId];
    },
    resetSize: resetSize,
    syncCustom: syncCustomAcrossThemes,
    randomPalette: randomPalette,
    openSettings: function () {
      try {
        window.dispatchEvent(new CustomEvent('dsh-open-settings', { detail: { section: 'general' } }));
      } catch {}
    },
    STYLES: STYLES,
    PALETTES: PALETTES,
    ALPHA_MIN: ALPHA_MIN,
    ALPHA_MAX: ALPHA_MAX,
    SIZE_MIN: SIZE_MIN,
    SIZE_MAX: SIZE_MAX
  };

  // ---------------------------------------------------------------- 清理遗留
  function cleanupLegacyElements() {
    if (typeof document === 'undefined') return;
    LEGACY_IDS.forEach(function (id) {
      const els = document.querySelectorAll('#' + id);
      els.forEach(function (el) {
        el.remove();
      });
    });
  }

  // ---------------------------------------------------------------- 样式表
  function injectStylesheet() {
    const STYLE_ID = 'dsh-notebook-grid-stylesheet';
    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      /* =========================================================
         dsh-plugin-notebook-grid
         跟随 body[data-ds-dark-theme] 明暗主题，零污染 DSH 原生主题变量
         颜色全部走 --nb-* 变量；变量默认值即「经典」配色，JS 只做覆盖
         ========================================================= */

      body {
        --nb-bg-light: #f8fafc;
        --nb-bg-dark: #0b0f17;
        --nb-ink-grid-light: rgba(37, 99, 235, 0.08);
        --nb-ink-grid-dark: rgba(255, 255, 255, 0.055);
        --nb-ink-engineering-light: rgba(37, 99, 235, 0.08);
        --nb-ink-engineering-dark: rgba(255, 255, 255, 0.055);
        --nb-ink-dots-light: rgba(15, 23, 42, 0.13);
        --nb-ink-dots-dark: rgba(255, 255, 255, 0.09);
        --nb-ink-lines-light: rgba(37, 99, 235, 0.09);
        --nb-ink-lines-dark: rgba(255, 255, 255, 0.065);
        --nb-size-grid: 22px;
        --nb-size-engineering: 22px;
        --nb-size-dots: 22px;
        --nb-size-lines: 28px;
      }

      :is([data-slot="main.conversation"],
          [data-slot="conversation"],
          [data-conversation-scroll],
          [data-slot="conversation.view"],
          div[data-slot="conversation"] > [data-phase],
          main[role="main"],
          #root > div > main) {
        transition: background-color 0.2s ease;
      }

      /* ---------------- 1. 经典方格 (grid) ---------------- */
      body[data-nb-enabled="true"][data-nb-style="grid"]:not([data-ds-dark-theme]) :is([data-conversation-scroll], [data-slot="main.conversation"], [data-slot="conversation"], [data-slot="conversation.view"], div[data-slot="conversation"] > [data-phase], main[role="main"], #root > div > main) {
        background-color: var(--nb-bg-light) !important;
        background-image:
          linear-gradient(to right, var(--nb-ink-grid-light) 1px, transparent 1px),
          linear-gradient(to bottom, var(--nb-ink-grid-light) 1px, transparent 1px) !important;
        background-size: var(--nb-size-grid) var(--nb-size-grid) !important;
        background-attachment: local !important;
      }

      body[data-nb-enabled="true"][data-nb-style="grid"][data-ds-dark-theme] :is([data-conversation-scroll], [data-slot="main.conversation"], [data-slot="conversation"], [data-slot="conversation.view"], div[data-slot="conversation"] > [data-phase], main[role="main"], #root > div > main) {
        background-color: var(--nb-bg-dark) !important;
        background-image:
          linear-gradient(to right, var(--nb-ink-grid-dark) 1px, transparent 1px),
          linear-gradient(to bottom, var(--nb-ink-grid-dark) 1px, transparent 1px) !important;
        background-size: var(--nb-size-grid) var(--nb-size-grid) !important;
        background-attachment: local !important;
      }

      /* ---------------- 2. 工程活页 (engineering) ---------------- */
      /* 左侧红色装订线是工程纸的签名，不随配色变动 */
      body[data-nb-enabled="true"][data-nb-style="engineering"]:not([data-ds-dark-theme]) :is([data-conversation-scroll], [data-slot="main.conversation"], [data-slot="conversation"], [data-slot="conversation.view"], div[data-slot="conversation"] > [data-phase], main[role="main"], #root > div > main) {
        background-color: var(--nb-bg-light) !important;
        background-image:
          linear-gradient(to right, transparent 56px, rgba(239, 68, 68, 0.25) 56px, rgba(239, 68, 68, 0.25) 58px, transparent 58px),
          linear-gradient(to right, var(--nb-ink-engineering-light) 1px, transparent 1px),
          linear-gradient(to bottom, var(--nb-ink-engineering-light) 1px, transparent 1px) !important;
        background-size: 100% 100%, var(--nb-size-engineering) var(--nb-size-engineering), var(--nb-size-engineering) var(--nb-size-engineering) !important;
        background-repeat: no-repeat, repeat, repeat !important;
        background-attachment: local !important;
      }

      body[data-nb-enabled="true"][data-nb-style="engineering"][data-ds-dark-theme] :is([data-conversation-scroll], [data-slot="main.conversation"], [data-slot="conversation"], [data-slot="conversation.view"], div[data-slot="conversation"] > [data-phase], main[role="main"], #root > div > main) {
        background-color: var(--nb-bg-dark) !important;
        background-image:
          linear-gradient(to right, transparent 56px, rgba(248, 113, 113, 0.22) 56px, rgba(248, 113, 113, 0.22) 58px, transparent 58px),
          linear-gradient(to right, var(--nb-ink-engineering-dark) 1px, transparent 1px),
          linear-gradient(to bottom, var(--nb-ink-engineering-dark) 1px, transparent 1px) !important;
        background-size: 100% 100%, var(--nb-size-engineering) var(--nb-size-engineering), var(--nb-size-engineering) var(--nb-size-engineering) !important;
        background-repeat: no-repeat, repeat, repeat !important;
        background-attachment: local !important;
      }

      /* ---------------- 3. 极简点阵 (dots) ---------------- */
      body[data-nb-enabled="true"][data-nb-style="dots"]:not([data-ds-dark-theme]) :is([data-conversation-scroll], [data-slot="main.conversation"], [data-slot="conversation"], [data-slot="conversation.view"], div[data-slot="conversation"] > [data-phase], main[role="main"], #root > div > main) {
        background-color: var(--nb-bg-light) !important;
        background-image: radial-gradient(circle, var(--nb-ink-dots-light) 1.2px, transparent 1.2px) !important;
        background-size: var(--nb-size-dots) var(--nb-size-dots) !important;
        background-attachment: local !important;
      }

      body[data-nb-enabled="true"][data-nb-style="dots"][data-ds-dark-theme] :is([data-conversation-scroll], [data-slot="main.conversation"], [data-slot="conversation"], [data-slot="conversation.view"], div[data-slot="conversation"] > [data-phase], main[role="main"], #root > div > main) {
        background-color: var(--nb-bg-dark) !important;
        background-image: radial-gradient(circle, var(--nb-ink-dots-dark) 1.2px, transparent 1.2px) !important;
        background-size: var(--nb-size-dots) var(--nb-size-dots) !important;
        background-attachment: local !important;
      }

      /* ---------------- 4. 笔记本横线 (lines) ---------------- */
      body[data-nb-enabled="true"][data-nb-style="lines"]:not([data-ds-dark-theme]) :is([data-conversation-scroll], [data-slot="main.conversation"], [data-slot="conversation"], [data-slot="conversation.view"], div[data-slot="conversation"] > [data-phase], main[role="main"], #root > div > main) {
        background-color: var(--nb-bg-light) !important;
        background-image: linear-gradient(to bottom, transparent 27px, var(--nb-ink-lines-light) 27px, var(--nb-ink-lines-light) 28px) !important;
        background-size: 100% var(--nb-size-lines) !important;
        background-attachment: local !important;
      }

      body[data-nb-enabled="true"][data-nb-style="lines"][data-ds-dark-theme] :is([data-conversation-scroll], [data-slot="main.conversation"], [data-slot="conversation"], [data-slot="conversation.view"], div[data-slot="conversation"] > [data-phase], main[role="main"], #root > div > main) {
        background-color: var(--nb-bg-dark) !important;
        background-image: linear-gradient(to bottom, transparent 27px, var(--nb-ink-lines-dark) 27px, var(--nb-ink-lines-dark) 28px) !important;
        background-size: 100% var(--nb-size-lines) !important;
        background-attachment: local !important;
      }

      /* ---------------- 5. 「设置 → 通用设置」中的行 ---------------- */
      .dsh-nb-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 16px 0;
        border-bottom: 0.5px solid var(--dsw-alias-border-l2);
      }
      .dsh-nb-row-text { min-width: 0; }
      .dsh-nb-row-title {
        font-size: 14px;
        line-height: 20px;
        color: var(--dsw-alias-label-primary);
      }
      .dsh-nb-row-desc {
        margin-top: 4px;
        font-size: 12px;
        line-height: 18px;
        color: var(--dsw-alias-label-secondary);
      }
      .dsh-nb-row-warn {
        margin-top: 2px;
        font-size: 12px;
        line-height: 18px;
        color: #d97706;
      }
      .dsh-nb-row-control {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      .dsh-nb-fallback-select {
        height: 28px;
        padding: 0 8px;
        font-size: 13px;
        border-radius: 8px;
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-1);
        border: 1px solid var(--dsw-alias-border-l2);
        outline: none;
        cursor: pointer;
      }

      /* ---------------- 6. 纸张配色行 ---------------- */
      .dsh-nb-color-row {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
        padding: 14px 0;
        border-bottom: 0.5px solid var(--dsw-alias-border-l2);
      }
      .dsh-nb-color-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .dsh-nb-color-header-left {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
        min-width: 0;
      }
      .dsh-nb-color-header-left .dsh-nb-row-title {
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        color: var(--dsw-alias-label-primary);
        flex-shrink: 0;
      }
      .dsh-nb-color-header-left .dsh-nb-row-desc {
        font-size: 12px;
        line-height: 18px;
        color: var(--dsw-alias-label-secondary);
        margin-top: 0;
      }
      .dsh-nb-color-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .dsh-nb-color-warn {
        font-size: 12px;
        line-height: 18px;
        color: #d97706;
      }
      .dsh-nb-color-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        padding: 2px 8px;
        border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1);
        border: 1px solid var(--dsw-alias-border-l2);
        color: var(--dsw-alias-label-secondary);
        white-space: nowrap;
      }
      .dsh-nb-color-badge.has-warn {
        border-color: #d97706;
      }
      .dsh-nb-color-toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .dsh-nb-swatch-group {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .dsh-nb-swatch {
        position: relative;
        width: 26px;
        height: 26px;
        padding: 0;
        border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l2);
        background: transparent;
        cursor: pointer;
        overflow: hidden;
        flex-shrink: 0;
        transition: transform 0.15s ease, border-color 0.15s ease;
      }
      .dsh-nb-swatch:hover {
        border-color: var(--dsw-alias-label-secondary);
        transform: translateY(-1px);
      }
      .dsh-nb-swatch.is-active {
        outline: 2px solid var(--dsw-alias-label-primary);
        outline-offset: 1px;
      }
      .dsh-nb-swatch-chip {
        display: block;
        width: 100%;
        height: 100%;
        background-size: 6px 6px;
        background-repeat: repeat;
      }
      .dsh-nb-divider {
        width: 1px;
        height: 18px;
        margin: 0 2px;
        background: var(--dsw-alias-border-l2);
        flex-shrink: 0;
      }
      .dsh-nb-custom {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .dsh-nb-custom-item {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .dsh-nb-item-tag {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary);
        user-select: none;
      }
      .dsh-nb-pick {
        position: relative;
        display: inline-block;
        width: 26px;
        height: 26px;
        border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l2);
        overflow: hidden;
        cursor: pointer;
        flex-shrink: 0;
      }
      .dsh-nb-pick:hover { border-color: var(--dsw-alias-label-secondary); }
      .dsh-nb-pick input[type="color"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        padding: 0;
        border: none;
        opacity: 0;
        cursor: pointer;
      }
      .dsh-nb-hex {
        width: 68px;
        height: 26px;
        padding: 0 5px;
        font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        border-radius: 6px;
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-1);
        border: 1px solid var(--dsw-alias-border-l2);
        outline: none;
      }
      .dsh-nb-hex:focus { border-color: var(--dsw-alias-label-secondary); }
      .dsh-nb-reset {
        height: 26px;
        padding: 0 8px;
        font-size: 12px;
        border-radius: 6px;
        cursor: pointer;
        color: var(--dsw-alias-label-secondary);
        background: transparent;
        border: 1px solid var(--dsw-alias-border-l2);
        transition: all 0.15s ease;
      }
      .dsh-nb-reset:hover {
        color: var(--dsw-alias-label-primary);
        border-color: var(--dsw-alias-label-secondary);
      }

      /* ---------------- 7. 浓度 / 尺寸滑块 + 预览条 ---------------- */
      .dsh-nb-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 6px 0 2px;
      }
      .dsh-nb-slider-row {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: var(--dsw-alias-label-secondary);
      }
      .dsh-nb-slider-label {
        flex-shrink: 0;
        width: 42px;
      }
      .dsh-nb-slider-val {
        flex-shrink: 0;
        width: 38px;
        text-align: right;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        color: var(--dsw-alias-label-primary);
        font-size: 11px;
      }
      .dsh-nb-slider {
        flex: 1;
        -webkit-appearance: none;
        appearance: none;
        height: 4px;
        border-radius: 2px;
        background: var(--dsw-alias-border-l2);
        outline: none;
        cursor: pointer;
      }
      .dsh-nb-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--dsw-alias-label-primary);
        cursor: pointer;
        border: 2px solid var(--dsw-alias-bg-layer-1);
      }
      .dsh-nb-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--dsw-alias-label-primary);
        cursor: pointer;
        border: 2px solid var(--dsw-alias-bg-layer-1);
      }
      .dsh-nb-preview {
        height: 48px;
        border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l2);
        overflow: hidden;
        position: relative;
        padding: 8px 10px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--dsw-alias-label-primary);
        display: flex;
        align-items: center;
        transition: background-color 0.15s ease, background-image 0.15s ease;
      }
      .dsh-nb-preview-text {
        position: relative;
        z-index: 1;
        user-select: none;
      }
      .dsh-nb-preview-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        flex-shrink: 0;
      }
      .dsh-nb-icon-btn {
        width: 26px;
        height: 26px;
        padding: 0;
        border-radius: 6px;
        border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-1);
        cursor: pointer;
        font-size: 14px;
        color: var(--dsw-alias-label-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      }
      .dsh-nb-icon-btn:hover {
        color: var(--dsw-alias-label-primary);
        border-color: var(--dsw-alias-label-secondary);
        background: var(--dsw-alias-bg-layer-2);
      }
      .dsh-nb-icon-btn:active {
        transform: scale(0.94);
      }
    `;
  }

  // ------------------------------------------------------- 设置页 React 组件
  function useGridState() {
    const [snap, setSnap] = React.useState(snapshot);
    React.useEffect(function () {
      return subscribe(function () {
        setSnap(snapshot());
      });
    }, []);
    return snap;
  }

  function useTheme() {
    const [theme, setTheme] = React.useState(function () {
      return activeTheme();
    });
    React.useEffect(function () {
      return subscribe(function () {
        const next = activeTheme();
        setTheme(function (prev) {
          return prev === next ? prev : next;
        });
      });
    }, []);
    return theme;
  }

  // 色卡缩略图：纸底色 + 同色系迷你格线，所见即所得
  function chipStyle(pair) {
    const ink = hexToRgba(pair.ink, 0.5);
    return {
      backgroundColor: pair.bg,
      backgroundImage:
        'linear-gradient(to right, ' + ink + ' 1px, transparent 1px), linear-gradient(to bottom, ' + ink + ' 1px, transparent 1px)'
    };
  }

  function NotebookGridRow() {
    const snap = useGridState();

    const options = STYLES.map(function (s) {
      return { value: s.id, label: s.icon + ' ' + (isZh() ? s.label : s.en) };
    });

    const styleControl = SegmentedControl
      ? h(SegmentedControl, {
          key: 'style',
          id: 'dsh-notebook-grid-style-seg',
          value: snap.style,
          options: options,
          onChange: setStyle,
          label: T('纸张样式', 'Paper style')
        })
      : h(
          'select',
          {
            key: 'style',
            className: 'dsh-nb-fallback-select',
            value: snap.style,
            onChange: function (e) {
              setStyle(e.target.value);
            }
          },
          options.map(function (o) {
            return h('option', { key: o.value, value: o.value }, o.label);
          })
        );

    const enableControl = Switch
      ? h(Switch, {
          key: 'enabled',
          checked: snap.enabled,
          onChange: setEnabled,
          label: T('启用笔记本网格背景', 'Enable notebook grid background')
        })
      : h('input', {
          key: 'enabled',
          type: 'checkbox',
          checked: snap.enabled,
          onChange: function (e) {
            setEnabled(e.target.checked);
          }
        });

    return h('div', { className: 'dsh-nb-row' }, [
      h('div', { key: 'text', className: 'dsh-nb-row-text' }, [
        h('div', { key: 'title', className: 'dsh-nb-row-title' }, T('笔记本网格背景', 'Notebook grid background')),
        h(
          'div',
          { key: 'desc', className: 'dsh-nb-row-desc' },
          T(
            '为会话区域铺设方格、点阵或横线纸张纹理，自动跟随明暗主题。',
            'Paints a squared, dotted or ruled paper texture behind the conversation area, following the light/dark theme.'
          )
        )
      ]),
      h('div', { key: 'control', className: 'dsh-nb-row-control' }, [styleControl, enableControl])
    ]);
  }

  function HexInput(props) {
    const [text, setText] = React.useState(props.value);
    React.useEffect(
      function () {
        setText(props.value);
      },
      [props.value]
    );
    return h('input', {
      className: 'dsh-nb-hex',
      type: 'text',
      value: text,
      spellCheck: false,
      'aria-label': props.label,
      title: props.label,
      onFocus: beginCustomEdit,
      onChange: function (e) {
        const raw = e.target.value;
        setText(raw);
        const hex = normalizeHex(raw);
        if (hex) props.onCommit(hex);
      },
      onBlur: function () {
        setText(props.value);
      }
    });
  }

  function ColorPick(props) {
    return h(
      'label',
      { className: 'dsh-nb-pick', title: props.label },
      h('input', {
        type: 'color',
        value: props.value,
        'aria-label': props.label,
        onFocus: beginCustomEdit,
        onClick: beginCustomEdit,
        onChange: function (e) {
          props.onCommit(normalizeHex(e.target.value) || e.target.value);
        }
      }),
      h('span', { className: 'dsh-nb-swatch-chip', style: { backgroundColor: props.value } })
    );
  }

  function NotebookColorRow() {
    const snap = useGridState();
    const theme = useTheme();
    const pair = currentPair(theme);
    const custom = snap.custom[theme] || DEFAULT_CUSTOM[theme];
    const warn = contrastWarn(pair, theme);
    const themeLabel = theme === 'dark' ? T('暗色主题', 'dark theme') : T('亮色主题', 'light theme');

    const swatches = PALETTES.map(function (p) {
      const c = p[theme];
      const active = snap.palette === p.id;
      const label = (isZh() ? p.label : p.en) + ' · ' + c.bg;
      return h(
        'button',
        {
          key: p.id,
          type: 'button',
          className: 'dsh-nb-swatch' + (active ? ' is-active' : ''),
          title: label,
          'aria-label': label,
          'aria-pressed': active,
          onClick: function () {
            setPalette(p.id);
          }
        },
        h('span', { className: 'dsh-nb-swatch-chip', style: chipStyle(c) })
      );
    });

    const customArea = h('div', { key: 'custom', className: 'dsh-nb-custom' }, [
      h('span', { key: 'bgwrap', className: 'dsh-nb-custom-item' }, [
        h('span', { key: 'bgtag', className: 'dsh-nb-item-tag' }, T('纸底', 'Paper')),
        h(ColorPick, {
          key: 'bgpick',
          value: custom.bg,
          label: T('自定义纸底色', 'Custom paper color'),
          onCommit: function (hex) {
            setCustomColor('bg', hex);
          }
        }),
        h(HexInput, {
          key: 'bghex',
          value: custom.bg,
          label: T('自定义纸底色（hex）', 'Custom paper color (hex)'),
          onCommit: function (hex) {
            setCustomColor('bg', hex);
          }
        })
      ]),
      h('span', { key: 'inkwrap', className: 'dsh-nb-custom-item' }, [
        h('span', { key: 'inktag', className: 'dsh-nb-item-tag' }, T('线条', 'Line')),
        h(ColorPick, {
          key: 'inkpick',
          value: custom.ink,
          label: T('自定义网格线色', 'Custom grid line color'),
          onCommit: function (hex) {
            setCustomColor('ink', hex);
          }
        }),
        h(HexInput, {
          key: 'inkhex',
          value: custom.ink,
          label: T('自定义网格线色（hex）', 'Custom grid line color (hex)'),
          onCommit: function (hex) {
            setCustomColor('ink', hex);
          }
        })
      ]),
      h(
        'button',
        {
          key: 'reset',
          type: 'button',
          className: 'dsh-nb-reset',
          title: T('恢复经典配色', 'Reset to the classic palette'),
          onClick: resetColors
        },
        T('重置', 'Reset')
      )
    ]);

    const badgeText =
      paletteName(snap.palette) +
      ' (' +
      themeLabel +
      ') · ' +
      T('底', 'bg') +
      ' ' +
      pair.bg +
      ' · ' +
      T('线', 'line') +
      ' ' +
      pair.ink;

    const header = h('div', { key: 'header', className: 'dsh-nb-color-header' }, [
      h('div', { key: 'left', className: 'dsh-nb-color-header-left' }, [
        h('span', { key: 'title', className: 'dsh-nb-row-title' }, T('纸张配色', 'Paper colors')),
        h(
          'span',
          { key: 'desc', className: 'dsh-nb-row-desc' },
          T('成对切换纸底与网格线，暗色与亮色模式独立保存', 'Pairs of paper & line colors, saved per theme')
        )
      ]),
      h('div', { key: 'right', className: 'dsh-nb-color-header-right' }, [
        warn ? h('span', { key: 'warn', className: 'dsh-nb-color-warn' }, '⚠ ' + warn) : null,
        h('span', { key: 'badge', className: 'dsh-nb-color-badge' + (warn ? ' has-warn' : '') }, badgeText)
      ])
    ]);

    const toolbar = h('div', { key: 'toolbar', className: 'dsh-nb-color-toolbar' }, [
      h('div', { key: 'swatches', className: 'dsh-nb-swatch-group' }, swatches),
      h('span', { key: 'div', className: 'dsh-nb-divider' }),
      customArea
    ]);

    // 实时预览：把当前纹理 + 浓度 + 尺寸直接铺在预览条上
    const curStyle = STYLES.find(function (s) { return s.id === snap.style; }) || STYLES[0];
    const curSize = snap.sizeOverride[snap.style] || DEFAULT_SIZE[snap.style];
    const curInk = hexToRgba(inkForStyle(pair, snap.style), alphaForStyle(pair, curStyle));
    const previewBg = function () {
      const base = { backgroundColor: pair.bg };
      if (snap.style === 'grid') {
        base.backgroundImage = 'linear-gradient(to right, ' + curInk + ' 1px, transparent 1px), linear-gradient(to bottom, ' + curInk + ' 1px, transparent 1px)';
        base.backgroundSize = curSize + 'px ' + curSize + 'px';
      } else if (snap.style === 'engineering') {
        base.backgroundImage = 'linear-gradient(to right, transparent 56px, rgba(239,68,68,0.25) 56px, rgba(239,68,68,0.25) 58px, transparent 58px), linear-gradient(to right, ' + curInk + ' 1px, transparent 1px), linear-gradient(to bottom, ' + curInk + ' 1px, transparent 1px)';
        base.backgroundSize = '100% 100%, ' + curSize + 'px ' + curSize + 'px, ' + curSize + 'px ' + curSize + 'px';
      } else if (snap.style === 'dots') {
        base.backgroundImage = 'radial-gradient(circle, ' + curInk + ' 1.2px, transparent 1.2px)';
        base.backgroundSize = curSize + 'px ' + curSize + 'px';
      } else if (snap.style === 'lines') {
        base.backgroundImage = 'linear-gradient(to bottom, transparent 27px, ' + curInk + ' 27px, ' + curInk + ' 28px)';
        base.backgroundSize = '100% ' + curSize + 'px';
      }
      return base;
    };

    const effAlpha = alphaForStyle(pair, curStyle);
    const effAlphaDisp = effAlpha >= 0.1 ? effAlpha.toFixed(2) : effAlpha.toFixed(3);

    const controls = h('div', { key: 'controls', className: 'dsh-nb-controls' }, [
      // 浓度滑块
      h('div', { key: 'alpha', className: 'dsh-nb-slider-row' }, [
        h('span', { key: 'al', className: 'dsh-nb-slider-label' }, T('浓度', 'Opacity')),
        h('input', {
          key: 'aslider', type: 'range', className: 'dsh-nb-slider',
          min: ALPHA_MIN, max: ALPHA_MAX, step: 0.05, value: snap.alphaScale,
          onChange: function (e) { setAlphaScale(parseFloat(e.target.value)); }
        }),
        h('span', { key: 'av', className: 'dsh-nb-slider-val' }, effAlphaDisp)
      ]),
      // 尺寸滑块
      h('div', { key: 'size', className: 'dsh-nb-slider-row' }, [
        h('span', { key: 'sl', className: 'dsh-nb-slider-label' }, T('尺寸', 'Size')),
        h('input', {
          key: 'sslider', type: 'range', className: 'dsh-nb-slider',
          min: SIZE_MIN, max: SIZE_MAX, step: 1, value: curSize,
          onChange: function (e) { setSizeOverride(snap.style, parseInt(e.target.value, 10)); }
        }),
        h('span', { key: 'sv', className: 'dsh-nb-slider-val' }, curSize + 'px')
      ]),
      // 预览条
      h('div', { key: 'preview', className: 'dsh-nb-preview', style: previewBg() }, [
        h('span', { key: 'pt', className: 'dsh-nb-preview-text' }, T('Aa 你好 · 123', 'Aa 你好 · 123')),
        h('div', { key: 'pact', className: 'dsh-nb-preview-actions' }, [
          h('button', {
            key: 'sync', type: 'button', className: 'dsh-nb-icon-btn',
            title: T('同步到另一主题', 'Sync to the other theme'),
            onClick: syncCustomAcrossThemes
          }, '🔄'),
          h('button', {
            key: 'rand', type: 'button', className: 'dsh-nb-icon-btn',
            title: T('随机配色', 'Random palette'),
            onClick: randomPalette
          }, '🎲')
        ])
      ])
    ]);

    return h('div', { className: 'dsh-nb-color-row' }, [header, toolbar, controls]);
  }

  // -------------------------------------------------------------------- apply
  function observeTheme() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
    const mo = new MutationObserver(function () {
      notify();
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
  }

  function apply(ctx) {
    if (typeof document === 'undefined') return;

    cleanupLegacyElements();
    injectStylesheet();

    state.style = readStyle();
    state.enabled = readEnabled();
    state.palette = readPalette();
    state.custom = readCustom();
    state.alphaScale = readAlphaScale();
    state.sizeOverride = readSizeOverride();
    applyState();
    observeTheme();

    // 历史版本可能残留常驻的悬浮按钮，延迟再清一次，确保界面上不再出现
    setTimeout(cleanupLegacyElements, 1500);
    setTimeout(cleanupLegacyElements, 4000);

    try {
      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register(
          {
            name: 'settings.general.item',
            id: 'notebook-grid',
            order: 20
          },
          NotebookGridRow
        );
      });
    } catch (err) {
      console.warn('[notebook-grid] 注册设置项失败：', err);
    }

    try {
      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register(
          {
            name: 'settings.general.item',
            id: 'notebook-grid-colors',
            order: 21
          },
          NotebookColorRow
        );
      });
    } catch (err) {
      console.warn('[notebook-grid] 注册配色设置项失败：', err);
    }

    if (typeof ctx.effect === 'function') {
      ctx.effect(function () {
        return function () {
          cleanupLegacyElements();
        };
      });
    }
  }

  exports.apply = apply;
  exports.inject = ['slots'];

  return module.exports;
}

if (typeof window !== 'undefined') {
  if (window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
    window.__ModuleLoader__.load({
      id: 'dsh-plugin-notebook-grid',
      factory: factory
    });
  } else {
    try {
      const mod = factory(typeof require === 'function' ? require : () => ({}));
      if (mod && mod.apply) mod.apply({});
    } catch {}
  }
}
