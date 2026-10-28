import fs from "node:fs/promises";
import os from "node:os";
import { chromium } from "playwright";
import { fixture, expectedText, pluralText } from "./fixture.mjs";
import { settings } from "./config.mjs";
import { startServer } from "./server.mjs";

const manifest = JSON.parse(await fs.readFile("build-manifest.json", "utf8"));
const { server, origin } = await startServer();
const browser = await chromium.launch();
const results = [];
const repeats = process.env.SMOKE ? 1 : settings.repeats;
async function trial(build, repeat) {
	const context = await browser.newContext({
		locale: "en-US",
		serviceWorkers: "block",
	});
	const page = await context.newPage();
	const client = await context.newCDPSession(page);
	await client.send("Network.enable");
	await client.send("Network.emulateNetworkConditions", {
		offline: false,
		latency: settings.latencyMs,
		downloadThroughput: settings.downloadBytesPerSecond,
		uploadThroughput: settings.uploadBytesPerSecond,
	});
	await client.send("Emulation.setCPUThrottlingRate", {
		rate: settings.cpuSlowdown,
	});
	const requests = new Map();
	let step = "initial";
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	const pending = new Set();
	client.on("Network.requestWillBeSent", (event) =>
		requests.set(event.requestId, {
			step,
			url: event.request.url,
			start: event.timestamp,
		})
	);
	client.on("Network.requestServedFromCache", (event) => {
		const r = requests.get(event.requestId);
		if (r) r.cached = true;
	});
	client.on("Network.responseReceived", (event) => {
		const r = requests.get(event.requestId);
		if (!r) return;
		r.status = event.response.status;
		r.encoding =
			event.response.headers["Content-Encoding"] ??
			event.response.headers["content-encoding"] ??
			"identity";
		r.contentType = event.response.mimeType;
		r.cached ||= event.response.fromDiskCache;
	});
	client.on("Network.loadingFinished", (event) => {
		const r = requests.get(event.requestId);
		if (!r) return;
		r.wireBytes = event.encodedDataLength;
		const p = client
			.send("Network.getResponseBody", { requestId: event.requestId })
			.then((body) => {
				r.decodedBytes = body.base64Encoded
					? Buffer.from(body.body, "base64").length
					: Buffer.byteLength(body.body);
			})
			.catch((error) => {
				r.bodyError = String(error);
			})
			.finally(() => pending.delete(p));
		pending.add(p);
	});
	client.on("Network.loadingFailed", (event) =>
		errors.push(`${event.errorText}: ${requests.get(event.requestId)?.url}`)
	);
	const f = fixture(build);
	async function validate(route, locale) {
		const actual = await page.evaluate(() => ({
			state: window.benchmark.state,
			lang: document.documentElement.lang,
			values: [...document.querySelectorAll("#app p")].map(
				(el) => el.textContent
			),
			plurals: [0, 1, 2, 3, 11, 100].map((count) =>
				window.benchmark.plural(count)
			),
			date: document.querySelector("#date").textContent,
		}));
		const expected = f.routes[route].map((e) => expectedText(e, locale));
		if (JSON.stringify(actual.values) !== JSON.stringify(expected)) {
			const index = actual.values.findIndex((s, i) => s !== expected[i]);
			throw Error(
				`${build.name} ${step}: translation mismatch at ${index}: ${JSON.stringify(actual.values[index])} vs ${JSON.stringify(expected[index])}`
			);
		}
		if (
			actual.lang !== locale ||
			actual.state.locale !== locale ||
			actual.state.route !== route
		)
			throw Error("Wrong locale or route");
		const expectedPlurals = [0, 1, 2, 3, 11, 100].map((n) =>
			pluralText(locale, n)
		);
		if (JSON.stringify(actual.plurals) !== JSON.stringify(expectedPlurals))
			throw Error(
				`${build.name} plural mismatch: ${JSON.stringify(actual.plurals)} vs ${JSON.stringify(expectedPlurals)}`
			);
		const date = new Intl.DateTimeFormat(locale, {
			dateStyle: "long",
			timeZone: "UTC",
		}).format(new Date("2026-10-28T12:00:00Z"));
		if (actual.date !== date) throw Error("Date mismatch");
		if (errors.length) throw Error(`${build.name}: ${errors.join("; ")}`);
		while (pending.size) await Promise.all([...pending]);
		const resources = [...requests.values()].filter((r) => r.step === step);
		if (resources.some((r) => r.status !== 200 || r.bodyError))
			throw Error(`Bad resource: ${JSON.stringify(resources)}`);
		if (resources.some((r) => !r.cached && r.encoding !== "br"))
			throw Error("Compression was not actually used");
		return resources;
	}
	const steps = [];
	try {
		await page.goto(`${origin}/${build.name}/`, { waitUntil: "load" });
		await page.waitForFunction(() => window.benchmark?.ready);
		let resources = await validate(0, "en");
		steps.push({
			step,
			readyMs: await page.evaluate(() => window.benchmark.readyAt),
			resources,
		});
		if (!Number.isFinite(steps[0].readyMs))
			throw Error("Missing initial readiness timestamp");
		const second = f.locales.at(-1);
		for (const action of [
			{ step: "navigate", route: 1, locale: "en", method: "go", argument: 1 },
			{
				step: "switch-locale",
				route: 1,
				locale: second,
				method: "language",
				argument: second,
			},
			{ step: "revisit", route: 0, locale: second, method: "go", argument: 0 },
			{
				step: "switch-back",
				route: 0,
				locale: "en",
				method: "language",
				argument: "en",
			},
		]) {
			step = action.step;
			const readyMs = await page.evaluate(async ({ method, argument }) => {
				const start = performance.now();
				await window.benchmark[method](argument);
				return performance.now() - start;
			}, action);
			resources = await validate(action.route, action.locale);
			steps.push({ step, readyMs, resources });
		}
		return {
			name: build.name,
			variant: build.variant,
			total: build.total,
			used: build.used,
			localeCount: build.localeCount,
			repeat,
			valid: true,
			steps: steps.map((s) => ({
				...s,
				wireBytes: s.resources.reduce((sum, r) => sum + (r.wireBytes ?? 0), 0),
				decodedBytes: s.resources.reduce(
					(sum, r) => sum + (r.decodedBytes ?? 0),
					0
				),
				requestCount: s.resources.filter((r) => !r.cached && r.wireBytes > 0)
					.length,
			})),
		};
	} finally {
		await context.close();
	}
}
try {
	// Rotate order between rounds to reduce systematic order effects. No
	// simultaneous trials compete for the throttled CPU or network.
	for (let repeat = 0; repeat < repeats; repeat++) {
		const order = manifest.map(
			(_, i) => manifest[(i + repeat) % manifest.length]
		);
		for (const build of order) {
			const result = await trial(build, repeat);
			results.push(result);
			console.log(
				`${results.length}/${manifest.length * repeats} ${build.name} initial=${result.steps[0].wireBytes} journey=${result.steps.reduce((sum, s) => sum + s.wireBytes, 0)} bytes`
			);
			await fs.writeFile(
				"results.partial.json",
				JSON.stringify(results, null, 2)
			);
		}
	}
	const versions = Object.fromEntries(
		await Promise.all(
			[
				"@inlang/paraglide-js",
				"@inlang/plugin-i18next",
				"i18next",
				"i18next-http-backend",
				"vite",
				"playwright",
			].map(async (name) => [
				name,
				JSON.parse(
					await fs.readFile(`node_modules/${name}/package.json`, "utf8")
				).version,
			])
		)
	);
	await fs.writeFile(
		"results.json",
		JSON.stringify(
			{
				measuredAt: new Date().toISOString(),
				versions,
				settings: { ...settings, repeats },
				environment: {
					node: process.version,
					platform: os.platform(),
					arch: os.arch(),
					cpu: os.cpus()[0].model,
					chromium: browser.version(),
				},
				results,
			},
			null,
			2
		)
	);
} finally {
	await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
