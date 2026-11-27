#!/usr/bin/env node
/**
 * Regenerate lib/index.js from the dsh-acp bundle that ships with the installed
 * dsh CLI, then re-apply the mode wiring. Run this after every dsh upgrade:
 *
 *   node sync.mjs                 # auto-detect the newest nvmd/npm install
 *   node sync.mjs --from <path>   # explicit .../dsh-acp/lib/index.js
 *
 * The generated file is the upstream bridge plus:
 *   - `modes` on session/new and session/resume responses,
 *   - a `category: "mode"` select config option in every configOptions payload,
 *   - session/set_mode and session/set_config_option(id: "mode") handlers,
 *   - current_mode_update / config_option_update pushes when the durable
 *     permission preset or plan state changes.
 *
 * Every edit is anchored on exact upstream text and asserts a single match, so
 * an upstream refactor fails loudly here instead of silently dropping a fix.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "lib/index.js");

function candidates() {
	const home = homedir();
	const list = [];
	const pushVersions = (root) => {
		if (!existsSync(root)) return;
		for (const version of readdirSync(root)) {
			list.push(join(root, version, "node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-acp/lib/index.js"));
			list.push(join(root, version, "node_modules/@deepseek-ai/dsh-acp/lib/index.js"));
		}
	};
	pushVersions(join(home, ".nvmd/versions"));
	pushVersions(join(home, "AppData/Roaming/npm/node_modules"));
	list.push(join(home, "AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-acp/lib/index.js"));
	list.push("/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-acp/lib/index.js");
	return list.filter((path) => existsSync(path));
}

function upstreamPath() {
	const flag = process.argv.indexOf("--from");
	if (flag !== -1) {
		const explicit = process.argv[flag + 1];
		if (explicit === undefined) throw new Error("sync: --from needs a path to dsh-acp/lib/index.js");
		return resolve(explicit);
	}
	const found = candidates();
	if (found.length === 0) throw new Error("sync: could not find an installed dsh-acp bundle; pass --from <path>");
	// Newest install wins: nvmd keeps versions side by side, and dsh upgrades add new ones.
	return found.sort().at(-1);
}

function replaceOnce(source, from, to, label) {
	const index = source.indexOf(from);
	if (index === -1) throw new Error(`sync: anchor not found (${label}); upstream dsh-acp changed — update sync.mjs`);
	if (source.indexOf(from, index + 1) !== -1) throw new Error(`sync: anchor is not unique (${label}); update sync.mjs`);
	return source.slice(0, index) + to + source.slice(index + from.length);
}

const source = readFileSync(upstreamPath(), "utf8");
let out = source;

// 1. Pull in the mode helpers.
out = replaceOnce(
	out,
	'import { installModelSelection } from "@deepseek-ai/dsh-agent";\n',
	'import { installModelSelection } from "@deepseek-ai/dsh-agent";\nimport { MODE_CONFIG_ID, applyMode, buildModeState, currentModeId, modeConfigOption } from "./modes.js";\n',
	"import"
);

// 2. Remember the last pushed mode so one change produces one update.
out = replaceOnce(
	out,
	"\tinflight;\n\tclosing;\n",
	"\tinflight;\n\tclosing;\n\t/** The last mode id pushed to the client, so one change yields one update. */\n\tpublishedModeId;\n",
	"AcpSession fields"
);

// 3. Advertise the mode option in every configOptions payload.
out = replaceOnce(
	out,
	"\tconfigOptions(signal) {\n\t\tthis.assertActive();\n\t\treturn this.modelControl.options(signal);\n\t}\n",
	"\tconfigOptions(signal) {\n\t\tthis.assertActive();\n\t\treturn Promise.resolve(this.modelControl.options(signal)).then((configOptions) => [...configOptions, modeConfigOption(this.ctx, this.agent)]);\n\t}\n",
	"configOptions"
);

// 4. Route configId "mode" through the mode axis, and add the mode methods.
out = replaceOnce(
	out,
	"\tsetConfig(configId, value, signal) {\n\t\tthis.assertActive();\n\t\treturn this.modelControl.set(configId, value, signal);\n\t}\n",
	`\tsetConfig(configId, value, signal) {
\t\tthis.assertActive();
\t\tif (configId === MODE_CONFIG_ID) {
\t\t\tapplyMode(this.ctx, this.agent, value, invalidParams$1);
\t\t\treturn Promise.resolve(this.configOptions(signal));
\t\t}
\t\treturn this.modelControl.set(configId, value, signal);
\t}
\t/** The ACP mode state advertised on session creation and resume. */
\tmodeState() {
\t\tthis.assertActive();
\t\treturn buildModeState(this.ctx, this.agent);
\t}
\t/** Apply one client mode selection and push the resulting state. */
\tasync setMode(modeId) {
\t\tthis.assertActive();
\t\tapplyMode(this.ctx, this.agent, modeId, invalidParams$1);
\t\tawait this.publishMode();
\t\treturn {};
\t}
\t/** Push the derived mode once, ordered behind any pending output. */
\tpublishMode() {
\t\tif (this.closing !== void 0) return Promise.resolve();
\t\t// Read the state when the push actually runs: one applyMode emits several
\t\t// durable events (plan off, preset change), and only the final state matters.
\t\tconst delivery = this.outputTail.then(async () => {
\t\t\tif (this.closing !== void 0) return;
\t\t\tconst modeId = currentModeId(this.ctx, this.agent);
\t\t\tif (this.publishedModeId === modeId) return;
\t\t\tthis.publishedModeId = modeId;
\t\t\tawait this.notify({
\t\t\t\tsessionId: this.agent.session.id,
\t\t\t\tupdate: {
\t\t\t\t\tsessionUpdate: "current_mode_update",
\t\t\t\t\tcurrentModeId: modeId
\t\t\t\t}
\t\t\t});
\t\t\tif (this.closing !== void 0) return;
\t\t\tawait this.notify({
\t\t\t\tsessionId: this.agent.session.id,
\t\t\t\tupdate: {
\t\t\t\t\tsessionUpdate: "config_option_update",
\t\t\t\t\tconfigOptions: await this.configOptions()
\t\t\t\t}
\t\t\t});
\t\t});
\t\tthis.outputTail = delivery.catch((error) => {
\t\t\tthis.ctx.logger.warn(\`acp: mode update delivery failed: \${errorChain(error)}\`);
\t\t});
\t\treturn this.outputTail;
\t}
`,
	"setConfig"
);

// 5. Model topology notifications must carry the mode option too.
out = replaceOnce(
	out,
	"\t\tthis.modelControl.options().then((configOptions) => {\n",
	"\t\tthis.configOptions().then((configOptions) => {\n",
	"topologyChanged"
);

// 6. Durable permission/plan changes (including the agent approving a plan) push the mode.
out = replaceOnce(
	out,
	"\tonSessionEvent(session, event) {\n\t\tif (event.type === \"turn/start\" && this.inflight?.turn !== void 0) {\n",
	"\tonSessionEvent(session, event) {\n\t\tif (event.type === \"plan/mode\" || event.type === \"permission/preset\") this.publishMode();\n\t\tif (event.type === \"turn/start\" && this.inflight?.turn !== void 0) {\n",
	"onSessionEvent"
);

// 7. session/new carries modes.
out = replaceOnce(
	out,
	"\t\t\t\treturn {\n\t\t\t\t\tsessionId,\n\t\t\t\t\tconfigOptions\n\t\t\t\t};\n",
	"\t\t\t\treturn {\n\t\t\t\t\tsessionId,\n\t\t\t\t\tconfigOptions,\n\t\t\t\t\tmodes: record.modeState()\n\t\t\t\t};\n",
	"newSession"
);

// 8. session/resume carries modes.
out = replaceOnce(
	out,
	"\t\t\t\t\treturn { configOptions: await record.configOptions(signal) };\n",
	"\t\t\t\t\treturn {\n\t\t\t\t\t\tconfigOptions: await record.configOptions(signal),\n\t\t\t\t\t\tmodes: record.modeState()\n\t\t\t\t\t};\n",
	"resumeSession"
);

// 9. session/set_mode request handler.
out = replaceOnce(
	out,
	`\t\tasync setSessionConfigOption(params, signal) {
\t\t\tassertOpen();
\t\t\tconst record = requireSession(brandString(params.sessionId));
\t\t\ttry {
\t\t\t\treturn { configOptions: await record.setConfig(params.configId, params.value, signal) };
\t\t\t} catch (error) {
\t\t\t\tif (error instanceof AcpModelConfigError) throw invalidParams(error.message);
\t\t\t\tthrow error;
\t\t\t}
\t\t},
`,
	`\t\tasync setSessionConfigOption(params, signal) {
\t\t\tassertOpen();
\t\t\tconst record = requireSession(brandString(params.sessionId));
\t\t\ttry {
\t\t\t\treturn { configOptions: await record.setConfig(params.configId, params.value, signal) };
\t\t\t} catch (error) {
\t\t\t\tif (error instanceof AcpModelConfigError) throw invalidParams(error.message);
\t\t\t\tthrow error;
\t\t\t}
\t\t},
\t\tasync setSessionMode(params) {
\t\t\tassertOpen();
\t\t\treturn requireSession(brandString(params.sessionId)).setMode(params.modeId);
\t\t},
`,
	"setSessionMode"
);

// 10. Register the set_mode method on the connection.
out = replaceOnce(
	out,
	".onRequest(methods.agent.session.setConfigOption, ({ params, signal }) => implementation.setSessionConfigOption(params, signal))",
	".onRequest(methods.agent.session.setConfigOption, ({ params, signal }) => implementation.setSessionConfigOption(params, signal)).onRequest(methods.agent.session.setMode, ({ params }) => implementation.setSessionMode(params))",
	"setMode registration"
);

// Keep the label stable for the loader and for diagnostics.
if (!out.includes('const name = "acp";')) throw new Error("sync: unexpected module name; upstream dsh-acp changed");

writeFileSync(target, out);
console.log(`sync: wrote ${target} from ${upstreamPath()}`);
