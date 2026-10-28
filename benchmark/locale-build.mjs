import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, ".work", "locale-build");
await fs.mkdir(output, { recursive: true });
for (const name of ["corpus", "node_modules"]) {
	try {
		await fs.symlink(path.join(root, name), path.join(output, name), "dir");
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
	}
}
const env = {
	...process.env,
	BENCHMARK_COHORT: "locale-build",
	BENCHMARK_OUTPUT: output,
};
for (const script of process.argv.includes("--saved")
	? []
	: ["build.mjs", "correctness.mjs", "measure.mjs", "report.mjs"]) {
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [path.join(root, script)], {
			cwd: output,
			env,
			stdio: "inherit",
		});
		child.on("error", reject);
		child.on("exit", (code) =>
			code === 0 ? resolve() : reject(Error(`${script} exited ${code}`))
		);
	});
}
if (process.env.SMOKE) {
	console.log(`Smoke run complete; diagnostics: ${output}`);
	process.exit(0);
}
const raw = JSON.parse(
	await fs.readFile(path.join(output, "results.json"), "utf8")
);
const summary = JSON.parse(
	await fs.readFile(path.join(output, "summary.json"), "utf8")
);
const checks = JSON.parse(
	await fs.readFile(path.join(output, "correctness.json"), "utf8")
);
if (
	checks.length !== 75 ||
	checks.some((r) => !r.valid) ||
	raw.results.length !== 375 ||
	raw.results.some((r) => !r.valid || r.steps.length !== 4) ||
	summary.summary.length !== 75 ||
	summary.summary.some((r) => r.repeats !== 5)
)
	throw Error("Incomplete locale-build matrix");
const snapshot = {
	measuredAt: raw.measuredAt,
	versions: raw.versions,
	settings: raw.settings,
	environment: raw.environment,
	validation: {
		builds: checks.length,
		journeys: raw.results.length,
		stringsChecked: checks.reduce((sum, r) => sum + r.messagesChecked, 0),
		pluralAssertions: checks.reduce((sum, r) => sum + r.pluralAssertions, 0),
	},
};
const rows = summary.summary.map((r) => ({
	variant: r.variant,
	localeCount: r.localeCount,
	used: r.used,
	total: r.total,
	initialWire: r.initialWire,
	journeyWire: r.journeyWire,
	steps: Object.fromEntries(
		Object.entries(r.steps).map(([key, value]) => [
			key,
			{ readyMs: value.readyMs, wire: value.wire },
		])
	),
}));
await fs.writeFile(
	path.join(root, "results/locale-build.json"),
	JSON.stringify(snapshot, null, 2).slice(0, -2) +
		',\n  "summary": [\n' +
		rows.map((r) => "    " + JSON.stringify(r)).join(",\n") +
		"\n  ]\n}\n"
);
await fs.copyFile(
	path.join(output, "summary.csv"),
	path.join(root, "results/locale-build.csv")
);
console.log(
	`Published compact locale-build results. Raw diagnostics remain in ${output}`
);
const variants = [
	"paraglide",
	"paraglide-per-locale",
	"i18next-bundled",
	"i18next-http-global",
	"i18next-http-routes",
];
const groups = rows
	.filter((r) => r.variant === "paraglide-per-locale")
	.map((r) =>
		variants.map((variant) =>
			rows.find(
				(other) =>
					other.variant === variant &&
					other.localeCount === r.localeCount &&
					other.used === r.used &&
					other.total === r.total
			)
		)
	);
if (groups.some((group) => group.some((r) => !r)))
	throw Error("Missing implementation");
const header =
	"| Locales | Used / route | Catalog | Default Paraglide | Per-locale Paraglide | i18next bundled | i18next HTTP catalog | i18next HTTP routes |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n";
const table = (metric) =>
	header +
	groups
		.map(
			(group) =>
				`| ${group[0].localeCount} | ${group[0].used} | ${group[0].total} | ${group.map(metric).join(" | ")} |`
		)
		.join("\n");
const kib = (bytes) => (bytes / 1024).toFixed(1) + " KiB";
const ms = (milliseconds) => milliseconds.toFixed(0) + " ms";
const names = [
	"Default Paraglide",
	"Per-locale Paraglide",
	"i18next bundled",
	"i18next HTTP catalog",
	"i18next HTTP routes",
];
const wins = (index, metric) =>
	groups.filter((group) => metric(group[1]) < metric(group[index])).length;
const comparisons = [0, 2, 3, 4]
	.map(
		(index) =>
			`| ${names[index]} | ${wins(index, (r) => r.steps.initial.readyMs.median)}/15 | ${wins(index, (r) => r.initialWire.median)}/15 | ${wins(index, (r) => r.journeyWire.median)}/15 |`
	)
	.join("\n");
await fs.writeFile(
	path.join(root, "LOCALE-BUILD.md"),
	`# Per-locale build benchmark

Measured ${new Date(raw.measuredAt).toLocaleString("en-US", { timeZone: "America/Mexico_City", timeZoneName: "short", dateStyle: undefined, year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}. Separate cohort from the published in-place language-switching benchmark: 75 application configurations, five repetitions, and 375 validated journeys.

## What changes

The experimental variant uses the published Paraglide ${raw.versions["@inlang/paraglide-js"]} Vite plugin with \`experimentalPerLocaleBuild: true\` and its default \`locale-modules\` output. It runs through \`createBuilder().buildApp()\`; deployment selects the native HTML/asset graph from \`paraglide-vite-locales.json\`. The emitted graphs are copied intact to the benchmark server. There are no compiler changes or extra output optimizations. Default Paraglide uses its normal \`message-modules\` output. Both use static message references through the generated messages entry point.

All implementations use the same client-rendered application, source translations, interpolation values, native Intl date formatting, and plural assertions. Locale counts are 2, 5, and 10; catalog sizes are 200, 1,000, and 4,000; pages use 50 or 200 messages where the catalog can supply five routes. Initial language is English. The existing HTTP catalog and route-namespace implementations remain separate.

Each journey starts with an empty browser-context cache: English route 0 → English route 1 → switch once to the last configured language with a full document navigation to route 1 → visit route 0 in that language. Every implementation reloads for the language change. Browser HTTP caches remain enabled throughout, including across the reload; an in-memory i18next instance is recreated with the document. Route changes within a language use dynamic imports.

The main metric is navigation start to translated text in the DOM. It includes resource loading, initialization, translation, and DOM updates, and excludes LCP, paint, and general interaction readiness. For language changes, the readiness clock starts at the new document's navigation start. Full-journey bytes include the initial load, route navigation, one language change, and the final route visit.

## Per-locale wins by competitor

Counts compare medians across 15 scenarios. Small timing differences can be noise; five runs on one host do not establish universal performance.

| Compared with | Initial DOM readiness | Initial wire bytes | Journey wire bytes |
| --- | --- | --- | --- |
${comparisons}

Per-locale output reduces initial readiness time and transfer size compared with default Paraglide in the tested five- and ten-locale scenarios. Default Paraglide remains smaller and faster initially in all five two-locale scenarios, although some timing differences are only a few milliseconds.

The experimental layout removes inactive languages, but its shared locale chunk in this fixture eagerly includes messages used by later routes. Preserving route-level message splitting within each locale graph is the next optimization to evaluate. A language change also loads a new graph, whereas default Paraglide can reuse already cached multilingual modules. The journey tables retain that cost even though language changes are limited to one per journey.

## Initial translated DOM readiness

${table((r) => ms(r.steps.initial.readyMs.median))}

## Initial Brotli transfer

Wire sizes include response headers, as reported by Chromium. KiB = 1,024 bytes.

${table((r) => kib(r.initialWire.median))}

## Journey Brotli transfer with one language change

${table((r) => kib(r.journeyWire.median))}

## Language-change DOM readiness

${table((r) => ms(r.steps["switch-locale"].readyMs.median))}

## Conditions and validation

Same profile as the published benchmark: 40 ms emulated latency, 10 Mbps download, 5 Mbps upload, 4× CPU throttling, actual Brotli at quality 5, production minification and Vite module preloading enabled. Trials run sequentially with implementation order rotated between repetitions. Host: ${raw.environment.platform} ${raw.environment.arch}, ${raw.environment.cpu}, Node ${raw.environment.node}, Chromium ${raw.environment.chromium}. Versions: ${Object.entries(
		raw.versions
	)
		.map(([name, version]) => name + " " + version)
		.join(", ")}.

All ${checks.length} configurations passed every configured locale and all five routes before measurement: ${snapshot.validation.stringsChecked.toLocaleString("en-US")} rendered strings and ${snapshot.validation.pluralAssertions.toLocaleString("en-US")} plural outputs. Every timed journey also validates rendered text, interpolation, locale, route, plurals, dates, and compressed responses; browser errors abort measurement.

## Reproduce

From the repository root after installing the pinned dependencies and Chromium:

\`\`\`sh
pnpm --filter @inlang/paraglide-js-benchmark bench:locales
\`\`\`

\`SMOKE=1\` runs one scenario and one repetition without replacing committed results. The runner keeps all builds and diagnostic logs in ignored \`benchmark/.work/locale-build/\`. Only [compact scenario results](./results/locale-build.json) and [CSV](./results/locale-build.csv) are committed. Timing and transfer ranges are retained in the compact JSON. Use \`bench:locales --saved\` to regenerate the compact results and this report from a completed local run.
`
);
