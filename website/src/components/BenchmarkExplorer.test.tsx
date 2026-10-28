// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkContent, BenchmarkExplorer } from "./BenchmarkExplorer";
import { loadDocsPage } from "../docs/data";
import { buildPageHead } from "../docs/seo";
import { paraglideStaticPages } from "../ssg/static-pages";
import results from "../../../benchmark/results/summary.json";

const selected = results.summary.filter(
	(r) => r.localeCount === 10 && r.used === 200 && r.total === 1000
);
const paraglide = selected.find((r) => r.variant === "paraglide")!;
const httpRoutes = selected.find((r) => r.variant === "i18next-http-routes")!;

afterEach(cleanup);

describe("benchmark explorer", () => {
	it("renders the complete results and default explorer without JavaScript", async () => {
		const page = await loadDocsPage("/benchmark");
		const html = renderToStaticMarkup(
			<BenchmarkContent html={page.markdown} />
		);
		const document = new DOMParser().parseFromString(html, "text/html");
		const captions = [...document.querySelectorAll("caption")].map(
			(c) => c.textContent
		);
		expect(captions).toContain("Initial translated DOM readiness (ms)");
		expect(document.querySelectorAll("table").length).toBeGreaterThanOrEqual(5);
		expect(document.body.textContent).toContain(
			`${(paraglide.initialWire.median / 1024).toFixed(0)} KiB`
		);
		expect(document.body.textContent).toContain(
			`${results.losses.length}/${results.comparisons.length}`
		);
		expect(document.body.textContent).toContain("187,000 rendered strings");
		expect(
			document.querySelector('a[href="/benchmark-data/results.json"]')
		).not.toBeNull();
		expect(document.querySelector("canvas")).toBeNull();
		expect(document.querySelector("[data-benchmark-explorer]")).toBeNull();
		expect(page.imports).toBeUndefined();
		expect(paraglideStaticPages()).toContain("/benchmark");
		expect(buildPageHead(page).links).toContainEqual({
			rel: "canonical",
			href: "https://paraglidejs.com/benchmark",
		});
	});

	it("filters scenarios and metrics without dropping implementations", () => {
		render(<BenchmarkExplorer />);
		expect(
			screen.getByRole("table", {
				name: "Initial translated DOM readiness (ms)",
			})
		).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Locales"), {
			target: { value: "10" },
		});
		fireEvent.change(screen.getByLabelText("Messages used per route"), {
			target: { value: "200" },
		});
		fireEvent.change(screen.getByLabelText("Metric"), {
			target: { value: "initialBytes" },
		});
		const table = screen.getByRole("table", {
			name: "Initial Brotli transfer (KiB)",
		});
		const paraglideRow = within(table)
			.getByRole("rowheader", { name: "Paraglide JS" })
			.closest("tr")!;
		const httpRow = within(table)
			.getByRole("rowheader", { name: "i18next · HTTP routes" })
			.closest("tr")!;
		expect(
			within(paraglideRow).getByText(
				(paraglide.initialWire.median / 1024).toFixed(1)
			)
		).toBeTruthy();
		expect(
			within(httpRow).getByText(
				(httpRoutes.initialWire.median / 1024).toFixed(1)
			)
		).toBeTruthy();
		expect(within(table).getAllByRole("row")).toHaveLength(5);
		fireEvent.change(screen.getByLabelText("Metric"), {
			target: { value: "journeyBytes" },
		});
		expect(
			screen.getByRole("table", { name: "Full journey Brotli transfer (KiB)" })
		).toBeTruthy();
		expect(
			within(
				within(
					screen.getByRole("table", {
						name: "Full journey Brotli transfer (KiB)",
					})
				)
					.getByRole("rowheader", { name: "Paraglide JS" })
					.closest("tr")!
			).getByText((paraglide.journeyWire.median / 1024).toFixed(1))
		).toBeTruthy();
		const unavailable = within(
			screen.getByLabelText("Total catalog messages")
		).getByRole("option", { name: "200" }) as HTMLOptionElement;
		expect(unavailable.disabled).toBe(true);
	});
});
