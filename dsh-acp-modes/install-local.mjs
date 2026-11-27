#!/usr/bin/env node
/**
 * Copy the generated plugin into the acp profile so dsh's module interception
 * can resolve its bare `@deepseek-ai/*` imports.
 *
 * The copy has to be a real directory under `<profile>/node_modules`: Node
 * resolves a junction or symlink to its real path, and dsh only intercepts
 * module resolution for importers that live inside the profile tree. Outside
 * it, `@deepseek-ai/schemastery` and friends are simply not installed.
 *
 *   node install-local.mjs            # profile "acp" under $DSH_HOME / ~/.dsh
 *   node install-local.mjs --profile desktop
 *
 * Run `node sync.mjs` first after a dsh upgrade.
 */
import { cpSync, existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));

const flag = process.argv.indexOf("--profile");
const profile = flag === -1 ? "acp" : process.argv[flag + 1];
if (!profile) throw new Error("install: --profile needs a name");
const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
const profileDir = join(home, "profiles", profile);
if (!existsSync(profileDir)) throw new Error(`install: no dsh profile at ${profileDir}`);

const destination = join(profileDir, "node_modules", source.name);
const link = existsSync(destination) && lstatSync(destination).isSymbolicLink() === true;
const junction = link || (existsSync(destination) && lstatSync(destination).isJunction?.() === true);
if (junction) {
	console.log(`install: replacing the link at ${destination} with a real copy`);
	rmSync(destination, { recursive: true, force: true });
}
if (!existsSync(join(profileDir, "package.json"))) throw new Error(`install: ${profileDir} has no package.json`);

for (const file of ["package.json", "lib"]) {
	cpSync(join(here, file), join(destination, file), { recursive: true, force: true });
}
const installed = JSON.parse(readFileSync(join(destination, "package.json"), "utf8"));
console.log(`install: ${source.name}@${installed.version} → ${resolve(destination)}`);
console.log("install: restart the dsh ACP process (reopen the agent in Tern) to load it");
