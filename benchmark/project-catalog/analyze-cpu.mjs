import fs from "node:fs";
import path from "node:path";
const input = process.argv[2];
if (!input)
	throw Error("Usage: node analyze-cpu.mjs input.cpuprofile [output.json]");
const profile = JSON.parse(fs.readFileSync(input, "utf8")),
	nodes = new Map(profile.nodes.map((node) => [node.id, node])),
	parents = new Map();
for (const node of profile.nodes)
	for (const child of node.children ?? []) parents.set(child, node.id);
function stage(node) {
	const frame = node.callFrame,
		url = frame.url,
		name = frame.functionName;
	if (name === "(garbage collector)") return "garbage collection";
	if (name === "(idle)") return "idle / asynchronous IO wait";
	if (url.includes("/import-export/catalogRows.js"))
		return "catalog row normalization / defensive copies";
	if (
		url.includes("/project/createCatalogLoader.js") ||
		url.includes("/project/directoryPlugins.js")
	)
		return "catalog loading / plugin IO";
	if (url.startsWith("data:")) return "plugin import / parser";
	if (
		url.includes("/emit-ts-declarations.js") ||
		url.includes("/emit-supporting-declarations.js")
	)
		return "direct declarations";
	if (url.includes("/services/file-handling/write-output.js"))
		return "output hashing / file publication";
	if (
		url.includes("/compiler/compile-") &&
		!url.includes("/compile-project.js")
	)
		return "message JavaScript generation";
	if (
		url.includes("/compiler/jsdoc-types.js") ||
		url.includes("/compiler/message-locals.js") ||
		url.includes("/compiler/input-alias.js") ||
		url.includes("/compiler/match-literals.js") ||
		url.includes("/compiler/variable-access.js")
	)
		return "message JavaScript generation";
	if (url.includes("/compiler/output-structure/"))
		return "output layout assembly";
	if (
		url.includes("/compiler/runtime/") ||
		url.includes("/compiler/server/") ||
		url.includes("/compiler/registry.js")
	)
		return "supporting runtime generation";
	if (url.includes("/compiler/compile-project.js"))
		return "compiler orchestration";
	if (url.includes("/compiler/compile.js")) return "compile orchestration";
	return undefined;
}
const self = new Map(),
	groups = new Map();
let total = 0;
for (let i = 0; i < (profile.samples ?? []).length; i++) {
	const id = profile.samples[i],
		ms = (profile.timeDeltas?.[i] ?? 0) / 1000;
	total += ms;
	self.set(id, (self.get(id) ?? 0) + ms);
	let at = id,
		group;
	while (at !== undefined) {
		const node = nodes.get(at);
		if (!node) break;
		group = stage(node);
		if (group) break;
		at = parents.get(at);
	}
	group ??= "native / runtime / unattributed";
	groups.set(group, (groups.get(group) ?? 0) + ms);
}
const groupRows = [...groups]
	.map(([name, ms]) => ({ name, ms, percent: (100 * ms) / total }))
	.sort((a, b) => b.ms - a.ms);
const topSelf = [...self]
	.map(([id, ms]) => {
		const n = nodes.get(id),
			f = n.callFrame;
		return {
			name: f.functionName || "(anonymous)",
			url: f.url.startsWith("data:") ? "data:plugin" : f.url,
			line: f.lineNumber + 1,
			ms,
			percent: (100 * ms) / total,
		};
	})
	.sort((a, b) => b.ms - a.ms)
	.slice(0, 50);
const summary = {
	input,
	scope:
		"CPU sampling starts immediately before public compile() or diagnostic phases and stops before output hashing/validation by benchmark harness. Groups attribute each sample once to nearest recognized ancestor; inclusive phase timers remain required for wall-clock bottlenecks.",
	sampleCount: profile.samples?.length ?? 0,
	sampledMs: total,
	profileMs: (profile.endTime - profile.startTime) / 1000,
	groups: groupRows,
	topSelf,
};
const output =
	process.argv[3] ?? input.replace(/\.cpuprofile$/, ".summary.json");
fs.writeFileSync(output, JSON.stringify(summary, null, 2));
console.log(
	JSON.stringify(
		{ output, sampleCount: summary.sampleCount, groups: groupRows },
		null,
		2
	)
);
