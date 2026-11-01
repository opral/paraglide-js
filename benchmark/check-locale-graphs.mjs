import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Inspect resources actually requested by Chromium, not estimated catalog size.
export async function inspectLocaleGraphs(output, raw, fixture) {
	let routes = 0,
		locales = 0;
	const readResources = async (resources) =>
		(
			await Promise.all(
				resources
					.filter((r) => /\.(js|json)$/.test(new URL(r.url).pathname))
					.map((r) =>
						fs.readFile(
							path.join(output, "dist", new URL(r.url).pathname),
							"utf8"
						)
					)
			)
		).join("\n");
	for (const result of raw.results.filter(
		(r) => r.repeat === 0 && r.variant.startsWith("paraglide-per-locale")
	)) {
		const f = fixture(result);
		const initial = await readResources(result.steps[0].resources);
		const navigated = await readResources(
			result.steps.find((s) => s.step === "navigate").resources
		);
		const localized = await readResources(
			result.steps
				.filter((s) => ["switch-locale", "revisit"].includes(s.step))
				.flatMap((s) => s.resources)
		);
		const first = new Set(f.routes[0].map((e) => e.key));
		const last = f.locales.at(-1);
		const candidates = f.routes[1].filter(
			(e) =>
				!first.has(e.key) &&
				!Object.keys(e.inputs).length &&
				/^[A-Za-z0-9 ,.!?:;-]{12,120}$/.test(e.values.en)
		);
		const routeMarker = candidates.find(
			(e) =>
				navigated.includes(e.values.en) &&
				f.routes[0].every((other) => other.values.en !== e.values.en)
		);
		assert(routeMarker, `No observable lazy-route marker for ${result.name}`);
		assert(
			!initial.includes(routeMarker.values.en),
			`Later-route message eagerly loaded: ${result.name}`
		);
		routes++;
		const localeMarker = f.routes[0].find(
			(e) =>
				!Object.keys(e.inputs).length &&
				e.values[last] !== e.values.en &&
				localized.includes(e.values[last]) &&
				!f.routes[0].some((other) => other.values.en === e.values[last])
		);
		assert(
			localeMarker,
			`No observable other-locale marker for ${result.name}`
		);
		assert(
			!initial.includes(localeMarker.values[last]),
			`Inactive-locale message loaded: ${result.name}`
		);
		locales++;
	}
	return { lazyRouteIsolation: routes, inactiveLocaleIsolation: locales };
}
