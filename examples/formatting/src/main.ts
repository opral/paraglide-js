import * as assert from "node:assert";
import { test } from "node:test";
import { m } from "./paraglide/messages.js";
import { setLocale } from "./paraglide/runtime.js";

test("formats numbers using locale-specific separators", async () => {
	setLocale("en");
	assert.strictEqual(
		m.personal_balance({ amount: 1000.57 }),
		"Your balance is 1,000.57."
	);

	setLocale("de");
	assert.strictEqual(
		m.personal_balance({ amount: 1000.57 }),
		"Ihr Kontostand ist 1.000,57."
	);
});

test("formats numbers with Intl.NumberFormat options", async () => {
	setLocale("en");
	assert.strictEqual(
		m.personal_balance_fixed_decimals({ amount: 1000.5 }),
		"Balance: 1,000.50."
	);

	setLocale("de");
	assert.strictEqual(
		m.personal_balance_fixed_decimals({ amount: 1000.5 }),
		"Kontostand: 1.000,50."
	);
});

test("respects locale override per call", async () => {
	setLocale("en");
	assert.strictEqual(
		m.personal_balance({ amount: 1000.57 }, { locale: "de" }),
		"Ihr Kontostand ist 1.000,57."
	);
});

test("formats dates using locale-specific ordering", async () => {
	const date = new Date("2022-04-01T00:00:00.000Z");

	setLocale("en");
	assert.strictEqual(
		m.purchase_date({ date }),
		"Purchase date: 04/01/2022."
	);

	setLocale("de");
	assert.strictEqual(
		m.purchase_date({ date }),
		"Kaufdatum: 01.04.2022."
	);
});
