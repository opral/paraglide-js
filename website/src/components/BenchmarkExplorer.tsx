import { useEffect, useId, useState } from "react";
import data from "../../../benchmark/results/explorer.json";
import { MarkdownHtml } from "../docs/DocsPage";

const names: Record<string, string> = {
	paraglide: "Paraglide JS",
	"i18next-bundled": "i18next · bundled",
	"i18next-http-global": "i18next · HTTP catalog",
	"i18next-http-routes": "i18next · HTTP routes",
};
type Result = (typeof data.summary)[number];
type Metric = "ready" | "initialBytes" | "journeyBytes";
const metrics: Record<
	Metric,
	{
		label: string;
		controlLabel: string;
		unit: string;
		value: (r: Result) => number;
	}
> = {
	ready: {
		label: "Initial translated DOM readiness",
		controlLabel: "DOM readiness (ms)",
		unit: "ms",
		value: (r) => r.steps.initial.readyMs.median,
	},
	initialBytes: {
		label: "Initial Brotli transfer",
		controlLabel: "Initial transfer (KiB)",
		unit: "KiB",
		value: (r) => r.initialWire.median / 1024,
	},
	journeyBytes: {
		label: "Full journey Brotli transfer",
		controlLabel: "Journey transfer (KiB)",
		unit: "KiB",
		value: (r) => r.journeyWire.median / 1024,
	},
};
const steps = [
	["initial", "Cold visit"],
	["navigate", "Navigate"],
	["switch-locale", "Switch locale"],
	["revisit", "Revisit"],
	["switch-back", "Switch back"],
] as const;
const number = (value: number) => value.toFixed(1);

export function BenchmarkExplorer() {
	const id = useId();
	const [interactive, setInteractive] = useState(false);
	useEffect(() => setInteractive(true), []);
	const [locales, setLocales] = useState(5);
	const [used, setUsed] = useState(50);
	const [total, setTotal] = useState(1000);
	const [metric, setMetric] = useState<Metric>("ready");
	const rows = data.summary.filter(
		(r) => r.localeCount === locales && r.used === used && r.total === total
	);
	const selected = metrics[metric];
	const max = Math.max(...rows.map(selected.value));
	return (
		<section
			aria-label="Interactive benchmark explorer"
			className="my-6 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-6"
		>
			<p className="mb-4 text-sm text-slate-600">
				Compare the same working application. Lower is better. Every result is
				the median of five runs.
			</p>
			<div className="mb-6 grid grid-cols-2 gap-4">
				<label className="text-sm font-medium" htmlFor={`${id}-locales`}>
					Locales
					<select
						id={`${id}-locales`}
						aria-label="Locales"
						disabled={!interactive}
						value={locales}
						onChange={(e) => setLocales(Number(e.target.value))}
						className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
					>
						{[2, 5, 10].map((n) => (
							<option key={n}>{n}</option>
						))}
					</select>
				</label>
				<label className="text-sm font-medium" htmlFor={`${id}-used`}>
					Messages used per route
					<select
						id={`${id}-used`}
						aria-label="Messages used per route"
						disabled={!interactive}
						value={used}
						onChange={(e) => setUsed(Number(e.target.value))}
						className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
					>
						{[50, 200].map((n) => (
							<option key={n} disabled={n === 200 && total === 200}>
								{n}
							</option>
						))}
					</select>
				</label>
				<label className="text-sm font-medium" htmlFor={`${id}-total`}>
					Total catalog messages
					<select
						id={`${id}-total`}
						aria-label="Total catalog messages"
						disabled={!interactive}
						value={total}
						onChange={(e) => setTotal(Number(e.target.value))}
						className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
					>
						{[200, 1000, 4000].map((n) => (
							<option key={n} disabled={n === 200 && used === 200}>
								{n}
							</option>
						))}
					</select>
				</label>
				<label className="text-sm font-medium" htmlFor={`${id}-metric`}>
					Metric
					<select
						id={`${id}-metric`}
						aria-label="Metric"
						disabled={!interactive}
						value={metric}
						onChange={(e) => setMetric(e.target.value as Metric)}
						className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
					>
						{Object.entries(metrics).map(([key, m]) => (
							<option key={key} value={key}>
								{m.controlLabel}
							</option>
						))}
					</select>
				</label>
			</div>
			<noscript>
				<p className="mb-3 text-sm text-slate-600">
					All results are listed below. Enable JavaScript to filter this
					comparison.
				</p>
			</noscript>
			<p role="status" className="mb-3 text-sm text-slate-600">
				{locales} locales · {used} messages used ·{" "}
				{total.toLocaleString("en-US")} total messages
			</p>
			<div className="overflow-x-auto">
				<table className="w-full text-left text-sm">
					<caption className="mb-3 text-left font-semibold">
						{selected.label} ({selected.unit})
					</caption>
					<thead>
						<tr>
							<th scope="col" className="pb-2">
								Implementation
							</th>
							<th scope="col" className="pb-2 text-right">
								Median ({selected.unit})
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.variant} className="border-t border-slate-200">
								<th scope="row" className="w-2/3 py-3 pr-4 font-medium">
									{names[r.variant]}
									<div
										aria-hidden="true"
										className="mt-2 h-2 rounded bg-slate-200"
									>
										<div
											className={`h-2 rounded ${r.variant === "paraglide" ? "bg-emerald-600" : "bg-blue-600"}`}
											style={{ width: `${(selected.value(r) / max) * 100}%` }}
										/>
									</div>
								</th>
								<td className="py-3 text-right tabular-nums">
									{number(selected.value(r))}
									{metric === "ready" && (
										<span className="mt-1 block text-xs text-slate-500">
											{number(r.steps.initial.readyMs.min)}–
											{number(r.steps.initial.readyMs.max)} ms range
										</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="mt-4 text-xs text-slate-600">
				DOM readiness means translated text has reached the DOM. It is not a
				paint, Core Web Vitals, or interaction-readiness measurement. Transfer
				includes Brotli responses and response headers.
			</p>
			<details className="mt-5">
				<summary className="cursor-pointer text-sm font-medium">
					Explore navigation and locale-switch timing
				</summary>
				<div className="mt-3 overflow-x-auto">
					<table className="w-full text-left text-xs">
						<caption className="mb-2 text-left">
							Median translated DOM update time by journey step (ms)
						</caption>
						<thead>
							<tr>
								<th scope="col" className="pr-3">
									Implementation
								</th>
								{steps.map(([key, label]) => (
									<th scope="col" className="px-2 py-2 text-right" key={key}>
										{label}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr className="border-t border-slate-200" key={r.variant}>
									<th scope="row" className="py-2 pr-3 font-medium">
										{names[r.variant]}
									</th>
									{steps.map(([key]) => (
										<td className="px-2 py-2 text-right tabular-nums" key={key}>
											{number(r.steps[key].readyMs.median)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
			<p className="mt-5 text-xs text-slate-600">
				Paraglide {data.versions["@inlang/paraglide-js"]} · i18next{" "}
				{data.versions.i18next} · Vite {data.versions.vite}. Fixed 40 ms network
				latency, 10 Mbps download, 4× CPU throttling on one host. All scenarios
				remain in the tables below, including cases where Paraglide transfers
				more bytes.
			</p>
		</section>
	);
}

const marker = /<div\s+data-benchmark-explorer(?:="")?\s*>\s*<\/div>/;
export function BenchmarkContent({ html }: { html: string }) {
	// Content and results are rendered on the server; hydration adds filtering.
	// Crawlers and browsers without JavaScript receive the same initial tables.
	const match = marker.exec(html);
	if (!match) return <MarkdownHtml html={html} />;
	return (
		<>
			<MarkdownHtml html={html.slice(0, match.index)} />
			<BenchmarkExplorer />
			<MarkdownHtml html={html.slice(match.index + match[0].length)} />
		</>
	);
}
