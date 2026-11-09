// 面板与插件展示名的一致性：面板是静态 HTML，拿不到 package.json，
// 插件名里的版本号只写在 package.json 的 magpie.name 里——用测试守住它，
// 避免升版本时忘了改名，导致界面上显示的版本落后于实际代码。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

test("panel: package.json 声明的 panels 文件都存在", () => {
  const panels = pkg.magpie?.panels ?? [];
  assert.ok(panels.length > 0, "应该至少声明一个面板");
  for (const panel of panels) {
    assert.equal(typeof panel.slot, "string");
    assert.ok(["agents", "usage", "settings", "provider"].includes(panel.slot), `未知 slot: ${panel.slot}`);
    assert.equal(typeof panel.file, "string");
    assert.ok(existsSync(resolve(root, panel.file)), `面板文件不存在：${panel.file}`);
  }
});

test("panel: 插件展示名里的版本号与 package.json 一致", () => {
  // 版本号只放在插件这边（插件弹窗看得到），供应商那边的名字保持干净。
  const name = pkg.magpie?.name ?? "";
  assert.ok(name.includes(`v${pkg.version}`), `magpie.name 应含 v${pkg.version}，实际：${name}`);
});

test("panel: 面板不再自带版本号（版本只在插件弹窗展示）", () => {
  const file = pkg.magpie?.panels?.[0]?.file;
  assert.ok(file, "缺少面板声明");
  const html = readFileSync(resolve(root, file), "utf8");
  assert.doesNotMatch(html, /const VERSION = '/, "面板不该再写死版本号");
  assert.doesNotMatch(html, /#ver\b/, "面板不该再引用版本号元素");
});

test("panel: 供应商名不带版本号", () => {
  const entry = readFileSync(resolve(root, "index.mjs"), "utf8");
  assert.doesNotMatch(entry, /name: `MMSP \(penguin\) v/, "供应商名不该带版本号");
});

test("panel: 面板引用了 magpie bridge", () => {
  const html = readFileSync(resolve(root, pkg.magpie.panels[0].file), "utf8");
  assert.match(html, /_magpie\/bridge\.js/, "面板必须引入 bridge 才能读写插件选项");
});
