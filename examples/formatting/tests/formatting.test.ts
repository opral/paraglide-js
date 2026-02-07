import { describe, expect, test } from "vitest";
import { m } from "../src/paraglide/messages.js";
import { setLocale } from "../src/paraglide/runtime.js";

describe("number formatting", () => {
	test("formats numbers using locale-specific separators", () => {
		setLocale("en");
		expect(m.personal_balance({ amount: 1000.57 })).toBe(
			"Your balance is 1,000.57."
		);

		setLocale("de");
		expect(m.personal_balance({ amount: 1000.57 })).toBe(
			"Ihr Kontostand ist 1.000,57."
		);
	});

	test("formats numbers with Intl.NumberFormat options", () => {
		setLocale("en");
		expect(m.personal_balance_fixed_decimals({ amount: 1000.5 })).toBe(
			"Balance: 1,000.50."
		);

		setLocale("de");
		expect(m.personal_balance_fixed_decimals({ amount: 1000.5 })).toBe(
			"Kontostand: 1.000,50."
		);
	});

	test("supports per-call locale override", () => {
		setLocale("en");
		expect(m.personal_balance({ amount: 1000.57 }, { locale: "de" })).toBe(
			"Ihr Kontostand ist 1.000,57."
		);
	});
});

describe("datetime formatting", () => {
	test("formats dates using locale-specific ordering", () => {
		const date = new Date("2022-04-01T00:00:00.000Z");

		setLocale("en");
		expect(m.purchase_date({ date })).toBe("Purchase date: 04/01/2022.");

		setLocale("de");
		expect(m.purchase_date({ date })).toBe("Kaufdatum: 01.04.2022.");
	});
});
