/**
 * One selectable mode axis over DSH's own durable session state:
 *
 *   default     工作区内读写，需要更高权限时询问   (preset workspace-write, plan off)
 *   plan        先探索并给出计划，批准后再执行      (preset workspace-write, plan on)
 *   full-access 不受工作区限制，且不再询问          (preset danger-full-access, plan off)
 *
 * The mode is never stored separately: it is always derived from
 * `ctx.permissionPresets` and `ctx.planMode`, so Tern and every other DSH
 * surface (TUI, web, desktop) show the same value for the same session.
 *
 * Pure helpers only — no ACP SDK import, so this file does not care which copy
 * of the SDK the host loaded.
 */

export const MODE_CONFIG_ID = "mode";
export const MODE_DEFAULT = "default";
export const MODE_PLAN = "plan";
export const MODE_FULL_ACCESS = "full-access";

const WORKSPACE_PRESET = "workspace-write";
const FULL_ACCESS_PRESET = "danger-full-access";

const MODE_DEFINITIONS = [
	{ id: MODE_DEFAULT, name: "默认", description: "工作区内读写；需要更高权限时询问" },
	{ id: MODE_PLAN, name: "计划", description: "先探索并给出计划，批准后再执行" },
	{ id: MODE_FULL_ACCESS, name: "完全访问", description: "不受工作区限制，且不再询问" }
];

const MODE_IDS = new Set(MODE_DEFINITIONS.map((mode) => mode.id));

/** The live permission-preset service, or undefined when this profile has none. */
function presetService(ctx) {
	const presets = ctx.get?.("permissionPresets");
	if (presets === void 0 || typeof presets.set !== "function") return void 0;
	let names;
	try {
		names = presets.names;
	} catch (_unavailable) {
		return void 0;
	}
	return Array.isArray(names) ? presets : void 0;
}

/** The live plan-mode controller, or undefined when this profile has none. */
function planService(ctx) {
	const plan = ctx.get?.("planMode");
	return plan !== void 0 && typeof plan.set === "function" ? plan : void 0;
}

/** Whether plan mode is selected, including a selection queued mid-turn. */
function planSelected(ctx, agent) {
	const plan = planService(ctx);
	if (plan === void 0) return false;
	try {
		const state = plan.get(agent);
		return (state.pending ?? state.active) === true;
	} catch (_unavailable) {
		return false;
	}
}

/** Every mode this profile can actually switch to. */
export function availableModes(ctx) {
	const presets = presetService(ctx);
	const plan = planService(ctx);
	return MODE_DEFINITIONS.filter((mode) => {
		if (mode.id === MODE_PLAN) return plan !== void 0;
		if (mode.id === MODE_FULL_ACCESS) return presets !== void 0 && presets.names.includes(FULL_ACCESS_PRESET);
		return true;
	}).map((mode) => ({ ...mode }));
}

/** The mode currently in effect for one agent. */
export function currentModeId(ctx, agent) {
	if (planSelected(ctx, agent)) return MODE_PLAN;
	const presets = presetService(ctx);
	if (presets === void 0) return MODE_DEFAULT;
	let current;
	try {
		current = presets.current(agent.session);
	} catch (_unavailable) {
		return MODE_DEFAULT;
	}
	return current === FULL_ACCESS_PRESET ? MODE_FULL_ACCESS : MODE_DEFAULT;
}

/** The `modes` payload of session/new and session/resume. */
export function buildModeState(ctx, agent) {
	return {
		currentModeId: currentModeId(ctx, agent),
		availableModes: availableModes(ctx)
	};
}

/**
 * The `category: "mode"` config option, so clients that render config options
 * instead of the `modes` field still get one mode selector.
 */
export function modeConfigOption(ctx, agent) {
	return {
		id: MODE_CONFIG_ID,
		name: "模式",
		description: "访问权限与计划模式",
		category: "mode",
		type: "select",
		currentValue: currentModeId(ctx, agent),
		options: availableModes(ctx).map(({ id, name, description }) => ({
			value: id,
			name,
			description
		}))
	};
}

/** Whether a client-supplied id names a mode this profile advertises. */
export function isModeId(ctx, modeId) {
	if (!MODE_IDS.has(modeId)) return false;
	return availableModes(ctx).some((mode) => mode.id === modeId);
}

/**
 * Apply one client mode selection to the session's durable state.
 * @param ctx - ACP plugin context carrying the optional preset/plan services.
 * @param agent - the session's own top-level Agent.
 * @param modeId - one of the advertised mode ids.
 * @param invalid - builds the request error used for an unusable selection.
 */
export function applyMode(ctx, agent, modeId, invalid) {
	if (!isModeId(ctx, modeId)) throw invalid(`unknown mode: ${modeId}`);
	const presets = presetService(ctx);
	const plan = planService(ctx);
	const selectPreset = (name) => {
		if (presets === void 0) return;
		if (!presets.names.includes(name)) throw invalid(`permission preset "${name}" is unavailable in this profile`);
		presets.set(agent.session, name);
	};
	if (modeId === MODE_PLAN) {
		selectPreset(WORKSPACE_PRESET);
		if (plan !== void 0) plan.set(agent, true);
		return;
	}
	if (plan !== void 0) plan.set(agent, false);
	if (modeId === MODE_FULL_ACCESS) {
		selectPreset(FULL_ACCESS_PRESET);
		return;
	}
	if (presets === void 0) return;
	const fallback = presets.names.includes(WORKSPACE_PRESET) ? WORKSPACE_PRESET : presets.defaultPreset;
	if (typeof fallback === "string" && fallback !== "") selectPreset(fallback);
}
