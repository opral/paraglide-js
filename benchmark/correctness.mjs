import fs from "node:fs/promises";
import { chromium } from "playwright";
import { fixture, expectedText, pluralText } from "./fixture.mjs";
import { startServer } from "./server.mjs";
import { urlFor } from "./config.mjs";

const manifest = JSON.parse(await fs.readFile("build-manifest.json", "utf8"));
const { server, origin } = await startServer();
const browser = await chromium.launch();
const results = [];
try {
	for (const build of manifest) {
		const context = await browser.newContext({ serviceWorkers: "block" });
		const page = await context.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("console", (message) => {
			if (message.type() === "error") errors.push(message.text());
		});
		page.on("response", (response) => {
			if (response.status() !== 200)
				errors.push(`${response.status()} ${response.url()}`);
		});
		page.on("requestfailed", (request) =>
			errors.push(`${request.failure()?.errorText} ${request.url()}`)
		);
		const f = fixture(build);
		let messagesChecked = 0;
		try {
			await page.goto(origin + urlFor(build));
			await page.waitForFunction(() => window.benchmark?.ready);
			for (const locale of f.locales) {
				await page.goto(origin + urlFor(build, locale));
				await page.waitForFunction(() => window.benchmark?.ready);
				for (let route = 0; route < 5; route++) {
					const actual = await page.evaluate(async (route) => {
						await window.benchmark.go(route);
						return {
							values: [...document.querySelectorAll("#app p")].map(
								(p) => p.textContent
							),
							plurals: [0, 1, 2, 3, 11, 100].map((count) =>
								window.benchmark.plural(count)
							),
							state: window.benchmark.state,
							date: document.querySelector("#date").textContent,
						};
					}, route);
					const expected = f.routes[route].map((e) => expectedText(e, locale));
					if (JSON.stringify(actual.values) !== JSON.stringify(expected)) {
						const i = actual.values.findIndex((v, i) => v !== expected[i]);
						throw Error(
							`${build.name}, ${locale}, route ${route}, message ${i}: ${JSON.stringify(actual.values[i])} !== ${JSON.stringify(expected[i])}`
						);
					}
					const expectedPlurals = [0, 1, 2, 3, 11, 100].map((n) =>
						pluralText(locale, n)
					);
					if (
						JSON.stringify(actual.plurals) !== JSON.stringify(expectedPlurals)
					)
						throw Error(
							`${build.name} ${locale}: plural mismatch ${JSON.stringify(actual.plurals)} !== ${JSON.stringify(expectedPlurals)}`
						);
					if (actual.state.locale !== locale || actual.state.route !== route)
						throw Error("Incorrect route/locale");
					const expectedDate = new Intl.DateTimeFormat(locale, {
						dateStyle: "long",
						timeZone: "UTC",
					}).format(new Date("2026-10-28T12:00:00Z"));
					if (actual.date !== expectedDate)
						throw Error(`${locale}: date mismatch`);
					messagesChecked += expected.length;
				}
			}
			if (errors.length) throw Error(`${build.name}: ${errors.join("; ")}`);
			results.push({
				name: build.name,
				valid: true,
				locales: f.locales.length,
				routes: 5,
				messagesChecked,
				pluralAssertions: f.locales.length * 5 * 6,
			});
			console.log(
				`Correct ${results.length}/${manifest.length}: ${build.name}, ${messagesChecked} rendered strings`
			);
			await fs.writeFile("correctness.json", JSON.stringify(results, null, 2));
		} finally {
			await context.close();
		}
	}
} finally {
	await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
