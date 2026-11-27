import assert from "node:assert/strict";
import { test } from "node:test";

import { MODE_CONFIG_ID, applyMode, availableModes, buildModeState, currentModeId, isModeId, modeConfigOption } from "../lib/modes.js";

const invalid = (message) => Object.assign(new Error(message), { code: -32602 });

function fake({ presets = ["workspace-write", "danger-full-access"], plan = true } = {}) {
	const session = { preset: "workspace-write" };
	const agent = { session, plan: false };
	const presetsService = {
		names: presets,
		defaultPreset: presets[0],
		current: (target) => target.preset,
		set: (target, name) => {
			target.preset = name;
		}
	};
	const planService = {
		get: (target) => ({ active: target.plan }),
		set: (target, active) => {
			target.plan = active;
		}
	};
	const ctx = { get: (name) => (name === "permissionPresets" ? presetsService : name === "planMode" && plan ? planService : void 0) };
	return { ctx, agent, session, presetsService, planService };
}

test("derives the mode from preset and plan state", () => {
	const { ctx, agent, session } = fake();
	assert.equal(currentModeId(ctx, agent), "default");
	session.preset = "danger-full-access";
	assert.equal(currentModeId(ctx, agent), "full-access");
	agent.plan = true;
	session.preset = "workspace-write";
	assert.equal(currentModeId(ctx, agent), "plan");
});

test("counts a pending plan selection", () => {
	const { ctx, agent } = fake();
	ctx.get("planMode").get = () => ({ active: false, pending: true });
	assert.equal(currentModeId(ctx, agent), "plan");
});

test("applyMode writes preset and plan state", () => {
	const { ctx, agent, session } = fake();

	applyMode(ctx, agent, "plan", invalid);
	assert.equal(session.preset, "workspace-write");
	assert.equal(agent.plan, true);
	assert.equal(currentModeId(ctx, agent), "plan");

	applyMode(ctx, agent, "full-access", invalid);
	assert.equal(session.preset, "danger-full-access");
	assert.equal(agent.plan, false);
	assert.equal(currentModeId(ctx, agent), "full-access");

	applyMode(ctx, agent, "default", invalid);
	assert.equal(session.preset, "workspace-write");
	assert.equal(agent.plan, false);
	assert.equal(currentModeId(ctx, agent), "default");
});

test("rejects an unknown mode id", () => {
	const { ctx, agent } = fake();
	assert.throws(() => applyMode(ctx, agent, "yolo", invalid), /unknown mode/);
});

test("hides full-access when the preset is not configured", () => {
	const { ctx, agent } = fake({ presets: ["read-only", "workspace-write"] });
	assert.deepEqual(
		availableModes(ctx).map((mode) => mode.id),
		["default", "plan"]
	);
	assert.equal(isModeId(ctx, "full-access"), false);
	assert.throws(() => applyMode(ctx, agent, "full-access", invalid), /unknown mode/);
});

test("hides plan when the profile has no plan service", () => {
	const { ctx, agent } = fake({ plan: false });
	assert.deepEqual(
		availableModes(ctx).map((mode) => mode.id),
		["default", "full-access"]
	);
	assert.throws(() => applyMode(ctx, agent, "plan", invalid), /unknown mode/);
	assert.doesNotThrow(() => applyMode(ctx, agent, "full-access", invalid));
});

test("exposes only default when the profile has neither service", () => {
	const ctx = { get: () => void 0 };
	const agent = { session: {} };
	assert.deepEqual(
		availableModes(ctx).map((mode) => mode.id),
		["default"]
	);
	assert.equal(currentModeId(ctx, agent), "default");
	assert.doesNotThrow(() => applyMode(ctx, agent, "default", invalid));
});

test("builds the ACP modes and config option payloads", () => {
	const { ctx, agent } = fake();
	assert.deepEqual(buildModeState(ctx, agent), {
		currentModeId: "default",
		availableModes: [
			{ id: "default", name: "默认", description: "工作区内读写；需要更高权限时询问" },
			{ id: "plan", name: "计划", description: "先探索并给出计划，批准后再执行" },
			{ id: "full-access", name: "完全访问", description: "不受工作区限制，且不再询问" }
		]
	});

	const option = modeConfigOption(ctx, agent);
	assert.equal(option.id, MODE_CONFIG_ID);
	assert.equal(option.category, "mode");
	assert.equal(option.type, "select");
	assert.equal(option.currentValue, "default");
	assert.deepEqual(
		option.options.map((entry) => entry.value),
		["default", "plan", "full-access"]
	);
});
