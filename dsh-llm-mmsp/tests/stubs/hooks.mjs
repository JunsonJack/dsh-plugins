/**
 * 模块解析替身：把 `@deepseek-ai/dsh-llm` 指向本地 stub。
 *
 * 只在**测试**里用。DSH 里跑的是真正的 `dsh-llm`。
 *
 * ⚠️ **为什么不用包的 `node_modules/` shim**：
 * shim 会**遮蔽**真正的 `@deepseek-ai/dsh-llm`（Node 的解析先找最近的
 * `node_modules`）——那意味着装进 DSH 的包里带着一份假的服务实现。本插件
 * 的一次线上验证就是因为它而必须重跑一遍。
 *
 * ⚠️ **为什么不用 `register()` + loader 文件**：
 * Windows 上 `register('./loader.mjs')`（相对路径）与 `register('file:///…')`
 * 都会失败——前者被当成裸路径（协议读成 `f:`），后者被 Node 内部转回裸路径。
 * `module.registerHooks()` 走的是**内联**钩子，没有这一步路径转换。
 *
 * @module dsh-llm-mmsp/stubs/hooks
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STUB_PATH = fileURLToPath(new URL('./dsh-llm.mjs', import.meta.url));
const STUB_SOURCE = readFileSync(STUB_PATH, 'utf8');

registerHooks({
  /**
   * resolve 钩子：把 `@deepseek-ai/dsh-llm` 指向本地 stub 源码。
   *
   * @param {string} specifier - 模块说明符。
   * @param {object} context - 解析上下文。
   * @param {Function} nextResolve - 下一个解析器。
   * @returns {object} 解析结果。
   */
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-llm') {
      return { url: `file:///${STUB_PATH.replace(/\\/g, '/')}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  /**
   * load 钩子：直接返回 stub 源码（省一次磁盘读）。
   *
   * @param {string} url - 模块 URL。
   * @param {object} context - 加载上下文。
   * @param {Function} nextLoad - 下一个加载器。
   * @returns {object} 加载结果。
   */
  load(url, context, nextLoad) {
    if (url.endsWith('/dsh-llm.mjs')) {
      return { format: 'module', source: STUB_SOURCE, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
