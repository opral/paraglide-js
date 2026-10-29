import fs from "node:fs/promises";

const input = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
const groups = {};
function add(group, metric, value) {
	if (Array.isArray(value)) {
		for (const item of value) add(group, metric, item);
		return;
	}
	if (typeof value !== "number" || !Number.isFinite(value)) return;
	((groups[group] ??= {})[metric] ??= []).push(value);
}
for (const record of input.results) {
	const group = [record.framework, record.kind, record.scenario]
		.filter(Boolean)
		.join("/");
	for (const key of [
		"coldCompilerAndViteMs",
		"initialSsrGraphMs",
		"initialSsrModules",
		"maxRssKiB",
		"startToFirstHtmlMs",
		"readyToFirstHtmlMs",
		"readyMs",
		"buildMs",
		"typecheckMs",
		"pipelineMs",
		"clientChunks",
		"clientJsBytes",
		"clientGzipBytes",
		"retainedUnusedMessages",
	])
		add(group, key, record[key]);
	if (record.compilerBuildStartCallsMs)
		add(group, "compilerBuildStartMs", record.compilerBuildStartCallsMs[0]);
	if (record.output)
		for (const [key, value] of Object.entries(record.output))
			add(group, "output." + key, value);
	if (record.kind === "integrated-compiler") {
		add(
			group,
			"compilerAndFirstSsrMs",
			record.coldCompilerAndViteMs + record.initialSsrGraphMs
		);
		add(group, "resourceWriteAndQueueMs", record.updatesMs);
		add(group, "invalidatedSsrReloadMs", record.updatedSsrLoadsMs);
		add(
			group,
			"queueAndSsrMs",
			record.updatesMs.map(
				(value, index) => value + record.updatedSsrLoadsMs[index]
			)
		);
	}
	if (record.kind === "http-dev")
		for (const edit of record.edits) {
			add(group, "watchedWriteToHtmlMs", edit.ms);
			add(group, "editTransientErrors", edit.transientErrors);
		}
	add(group, "warmRequestMs", record.warmRequestsMs);
	if (record.productionHttp) {
		add(
			group,
			"production.startToFirstHtmlMs",
			record.productionHttp.startToFirstHtmlMs
		);
		add(
			group,
			"production.readyToFirstHtmlMs",
			record.productionHttp.readyToFirstHtmlMs
		);
		add(
			group,
			"production.warmRequestMs",
			record.productionHttp.warmRequestsMs
		);
	}
}
const summary = Object.fromEntries(
	Object.entries(groups).map(([group, metrics]) => [
		group,
		Object.fromEntries(
			Object.entries(metrics).map(([metric, values]) => {
				values.sort((a, b) => a - b);
				const middle = Math.floor(values.length / 2);
				return [
					metric,
					{
						median:
							values.length % 2
								? values[middle]
								: (values[middle - 1] + values[middle]) / 2,
						min: values[0],
						max: values.at(-1),
						n: values.length,
					},
				];
			})
		),
	])
);
console.log(JSON.stringify({ metadata: input.metadata, summary }, null, 2));
