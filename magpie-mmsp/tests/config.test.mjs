// 供应商弹窗那份 providers.json 的读取测试
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { magpieConfigDir, dialogHeaders, pluginOptions } from "../lib/magpie-config.mjs";

function fixture(providers) {
  const dir = mkdtempSync(join(tmpdir(), "magpie-cfg-"));
  writeFileSync(join(dir, "providers.json"), JSON.stringify(providers), "utf8");
  return dir; // 系统临时目录，交给系统清理
}

test("magpieConfigDir 优先 MAGPIE_CONFIG_DIR，其次 XDG，最后 ~/.config/magpie", () => {
  assert.equal(magpieConfigDir({ MAGPIE_CONFIG_DIR: "D:/custom" }), "D:/custom");
  assert.match(magpieConfigDir({ XDG_CONFIG_HOME: "D:/xdg" }), /xdg[\\/]magpie$/);
  assert.match(magpieConfigDir({}), /\.config[\\/]magpie$/);
});

test("dialogHeaders 取出对象形态的 headers，找不到就是 null", () => {
  const dir = fixture({ providers: [{ id: "mmsp", headers: { "x-a": "1" } }, { id: "other" }] });
  assert.deepEqual(dialogHeaders("mmsp", { configDir: dir }), { "x-a": "1" });
  assert.equal(dialogHeaders("nope", { configDir: dir }), null);
  assert.equal(dialogHeaders("", { configDir: dir }), null);
});

test("dialogHeaders 兼容顶层数组，坏文件/缺文件都返回 null", () => {
  const arrayDir = fixture([{ id: "mmsp", headers: { "x-b": "2" } }]);
  assert.deepEqual(dialogHeaders("mmsp", { configDir: arrayDir }), { "x-b": "2" });

  const brokenDir = mkdtempSync(join(tmpdir(), "magpie-cfg-bad-"));
  writeFileSync(join(brokenDir, "providers.json"), "{ not json", "utf8");
  assert.equal(dialogHeaders("mmsp", { configDir: brokenDir }), null);
  assert.equal(dialogHeaders("mmsp", { configDir: join(brokenDir, "missing") }), null);
});

test("dialogHeaders 按 mtime 刷新缓存，文件变了能看到新值", () => {
  const dir = fixture({ providers: [{ id: "mmsp", headers: { "x-a": "1" } }] });
  const cache = new Map();
  assert.equal(dialogHeaders("mmsp", { configDir: dir, cache })["x-a"], "1");

  writeFileSync(join(dir, "providers.json"), JSON.stringify({ providers: [{ id: "mmsp", headers: { "x-a": "2" } }] }), "utf8");
  const future = new Date(Date.now() + 5000);
  utimesSync(join(dir, "providers.json"), future, future);

  assert.equal(dialogHeaders("mmsp", { configDir: dir, cache })["x-a"], "2");
});

test("默认缓存跨调用共享：同一文件重复读直接命中（同一对象引用）", () => {
  const dir = fixture({ providers: [{ id: "mmsp", headers: { "x-a": "1" } }] });
  const first = dialogHeaders("mmsp", { configDir: dir });
  const second = dialogHeaders("mmsp", { configDir: dir });
  assert.equal(first, second);
  assert.equal(second["x-a"], "1");
});

test("dialogHeaders 只认对象形态的 headers，数组与缺省都算没有", () => {
  const arrayDir = fixture({ providers: [{ id: "mmsp", headers: [["x", "1"]] }] });
  assert.equal(dialogHeaders("mmsp", { configDir: arrayDir }), null);

  const noneDir = fixture({ providers: [{ id: "mmsp" }] });
  assert.equal(dialogHeaders("mmsp", { configDir: noneDir }), null);
});

function pluginsFixture(plugins) {
  const dir = mkdtempSync(join(tmpdir(), "magpie-plugins-"));
  writeFileSync(join(dir, "plugins.json"), JSON.stringify({ plugins }), "utf8");
  return dir;
}

test("pluginOptions 按本地目录路径认出自己这条", () => {
  const dir = pluginsFixture([
    { spec: "@magpie-community/opencode-zcode-auth@latest" },
    { spec: "D:\\magpie-plugins\\magpie-mmsp", options: { headers: "x-a: 1" } },
  ]);
  assert.deepEqual(pluginOptions(["D:\\magpie-plugins\\magpie-mmsp"], { configDir: dir }), { headers: "x-a: 1" });
  // 大小写与斜杠方向都不影响
  assert.deepEqual(pluginOptions(["d:/magpie-plugins/MAGPIE-MMSP"], { configDir: dir }), { headers: "x-a: 1" });
});

test("pluginOptions 也认包名，包括带版本后缀的写法", () => {
  const dir = pluginsFixture([{ spec: "magpie-mmsp@1.2.3", options: { baseURL: "https://x" } }]);
  assert.deepEqual(pluginOptions(["magpie-mmsp"], { configDir: dir }), { baseURL: "https://x" });

  const scoped = pluginsFixture([{ spec: "@me/magpie-mmsp@latest", options: { headers: "y: 2" } }]);
  assert.deepEqual(pluginOptions(["@me/magpie-mmsp"], { configDir: scoped }), { headers: "y: 2" });
});

test("pluginOptions 没有匹配项、坏文件、数组形态都安全返回 null", () => {
  const none = pluginsFixture([{ spec: "other-plugin", options: { headers: "x" } }]);
  assert.equal(pluginOptions(["magpie-mmsp"], { configDir: none }), null);

  const broken = mkdtempSync(join(tmpdir(), "magpie-plugins-bad-"));
  writeFileSync(join(broken, "plugins.json"), "nope", "utf8");
  assert.equal(pluginOptions(["magpie-mmsp"], { configDir: broken }), null);
  assert.equal(pluginOptions([], { configDir: broken }), null);

  const arrayOptions = pluginsFixture([{ spec: "magpie-mmsp", options: ["x"] }]);
  assert.equal(pluginOptions(["magpie-mmsp"], { configDir: arrayOptions }), null);
});

test("pluginOptions 按 mtime 刷新：面板改完选项立刻能读到新值", () => {
  const dir = pluginsFixture([{ spec: "magpie-mmsp", options: { headers: "x-a: 1" } }]);
  const cache = new Map();
  assert.equal(pluginOptions(["magpie-mmsp"], { configDir: dir, cache }).headers, "x-a: 1");

  writeFileSync(join(dir, "plugins.json"), JSON.stringify({ plugins: [{ spec: "magpie-mmsp", options: { headers: "x-a: 2" } }] }), "utf8");
  const future = new Date(Date.now() + 5000);
  utimesSync(join(dir, "plugins.json"), future, future);

  assert.equal(pluginOptions(["magpie-mmsp"], { configDir: dir, cache }).headers, "x-a: 2");
});
