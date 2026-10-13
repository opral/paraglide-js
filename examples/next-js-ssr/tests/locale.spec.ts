import { test, expect } from "@playwright/test";

const translations = {
	en: {
		greeting: "Hello world Samuel",
		client: "Hello world Client",
		subpage: "This is the subpage.",
	},
	de: {
		greeting: "Guten Tag Samuel",
		client: "Guten Tag Client",
		subpage: "Dies ist die Unterseite.",
	},
};

for (const locale of ["en", "de"] as const) {
	test(`SSR and hydration in ${locale}`, async ({ page, request }) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		const url = locale === "en" ? "/" : "/de";
		const response = await request.get(url);
		expect(response.status()).toBe(200);
		const html = await response.text();
		expect(html).toContain(`lang="${locale}"`);
		expect(html).toContain(translations[locale].greeting);
		expect(html).toContain(translations[locale].client);
		await page.goto(url);
		await expect(page.getByTestId("request-locale")).toHaveText(
			`Request locale: ${locale}`
		);
		await expect(page.getByTestId("server-message")).toHaveText(
			translations[locale].greeting
		);
		await expect(page.getByTestId("client-message")).toHaveText(
			translations[locale].client
		);
		await page.reload();
		await expect(page.getByTestId("client-message")).toHaveText(
			translations[locale].client
		);
		expect(errors).toEqual([]);
	});
}

test("Next Link switches locale without replacing the document", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await page.evaluate(() => {
		(window as typeof window & { localeTestMarker: number }).localeTestMarker =
			1;
	});
	for (const locale of ["de", "en", "de"] as const) {
		await page.getByRole("link", { name: `Navigate to '${locale}'` }).click();
		await expect(page).toHaveURL(locale === "en" ? /\/$/ : /\/de$/);
		await expect(page.locator("html")).toHaveAttribute("lang", locale);
		await expect(
			page.getByTestId("client-message").filter({ visible: true })
		).toHaveText(translations[locale].client);
		await expect(
			page.getByTestId("server-message").filter({ visible: true })
		).toHaveText(translations[locale].greeting);
		await expect(
			page.getByTestId("request-locale").filter({ visible: true })
		).toHaveText(`Request locale: ${locale}`);
		expect(
			await page.evaluate(
				() =>
					(window as typeof window & { localeTestMarker: number })
						.localeTestMarker
			)
		).toBe(1);
	}
	await page.goBack();
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(
		page.getByTestId("client-message").filter({ visible: true })
	).toHaveText(translations.en.client);
	expect(errors).toEqual([]);
});

test("localized subpage navigation and programmatic switching", async ({
	page,
}) => {
	await page.goto("/de");
	await page.getByRole("link", { name: "go to subpage" }).click();
	await expect(page).toHaveURL(/\/de\/subpage$/);
	await expect(
		page.getByTestId("server-message").filter({ visible: true })
	).toHaveText(translations.de.subpage);
	await page.getByRole("button", { name: "Switch to 'en'" }).click();
	await expect(page).toHaveURL(/\/subpage$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(
		page.getByTestId("server-message").filter({ visible: true })
	).toHaveText(translations.en.subpage);
	await page.getByRole("link", { name: "go to home" }).click();
	await expect(
		page.getByTestId("server-message").filter({ visible: true })
	).toHaveText(translations.en.greeting);
});

test("request data and cached translations remain isolated across locales", async ({
	request,
}) => {
	await Promise.all(
		Array.from({ length: 100 }, async (_, index) => {
			const locale = index % 2 === 0 ? "en" : "de";
			const response = await request.get(locale === "en" ? "/" : "/de");
			expect(response.status()).toBe(200);
			const html = await response.text();
			expect(html).toContain(translations[locale].greeting);
			expect(html).toContain(translations[locale].client);
			expect(html).toMatch(
				new RegExp(`Request locale: (?:<!-- -->)?${locale}`)
			);
		})
	);
});

test("unmatched routes and static asset requests do not throw locale errors", async ({
	request,
}) => {
	const asset = await request.get("/robots.txt");
	expect(asset.status()).toBe(200);
	expect(await asset.text()).toContain("User-agent: *");
	for (const path of ["/de/missing", "/fr", "/favicon.ico"]) {
		const response = await request.get(path);
		expect(response.status()).toBe(404);
		expect(await response.text()).not.toContain("Invalid locale");
	}
});
