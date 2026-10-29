import fs from "node:fs/promises";
const wrapped = Symbol.for("paraglide.prototype.profile.wrapped");
export function profileCompilerHooks(destination) {
	return {
		name: "paraglide-profile-compiler-hooks",
		enforce: "post",
		configResolved(config) {
			for (const plugin of config.plugins.filter(
				(plugin) => plugin.name === "unplugin-paraglide-js"
			)) {
				const hook =
					typeof plugin.buildStart === "function"
						? plugin.buildStart
						: plugin.buildStart?.handler;
				if (!hook || hook[wrapped]) continue;
				const wrapper = async function (...args) {
					const start = performance.now();
					try {
						return await hook.apply(this, args);
					} finally {
						await fs.appendFile(
							destination,
							JSON.stringify({
								hook: "compiler.buildStart",
								environment: this.environment?.name ?? "unknown",
								ms: performance.now() - start,
							}) + "\n"
						);
					}
				};
				wrapper[wrapped] = true;
				plugin.buildStart =
					typeof plugin.buildStart === "function"
						? wrapper
						: { ...plugin.buildStart, handler: wrapper };
			}
			for (const plugin of config.plugins.filter(
				(plugin) => plugin.name === "paraglide-virtual-messages"
			)) {
				if (plugin.api?.profile) continue;
				const counts = { loads: 0, resolutions: 0 };
				plugin.api = { ...plugin.api, profile: counts };
				for (const key of ["load", "resolveId"]) {
					const hook = plugin[key];
					if (typeof hook !== "function") continue;
					plugin[key] = function (id, ...args) {
						if (typeof id === "string" && id.includes("virtual:paraglide/"))
							counts[key === "load" ? "loads" : "resolutions"]++;
						return hook.call(this, id, ...args);
					};
				}
			}
		},
		async buildEnd() {
			await fs.appendFile(
				destination,
				JSON.stringify({
					hook: "buildEnd",
					environment: this.environment?.name ?? "unknown",
					plugins: this.environment?.config.plugins
						.filter((plugin) => plugin.api?.stats || plugin.api?.profile)
						.map((plugin) => ({
							name: plugin.name,
							stats: plugin.api.stats,
							profile: plugin.api.profile,
						})),
				}) + "\n"
			);
		},
	};
}
