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
	assert.strictEqual(m.purchase_date({ date }), "Purchase date: 04/01/2022.");

	setLocale("de");
	assert.strictEqual(m.purchase_date({ date }), "Kaufdatum: 01.04.2022.");
});

test("formats relative times with literal units and numeric auto", async () => {
	setLocale("en");
	assert.strictEqual(
		m.last_seen({ duration: -1 }),
		`Last seen ${formatRelativeTime("en", -1, "day", { numeric: "auto" })}.`
	);

	setLocale("de");
	assert.strictEqual(
		m.last_seen({ duration: -1 }),
		`Zuletzt gesehen: ${formatRelativeTime("de", -1, "day", {
			numeric: "auto",
		})}.`
	);
});

test("formats relative times with dynamic units and style options", async () => {
	setLocale("en");
	assert.strictEqual(
		m.relative_update({ duration: -3, unit: "hours" }),
		`Updated ${formatRelativeTime("en", -3, "hours", { style: "short" })}.`
	);

	setLocale("de");
	assert.strictEqual(
		m.relative_update({ duration: 2, unit: "week" }),
		`Aktualisiert ${formatRelativeTime("de", 2, "week", {
			style: "short",
		})}.`
	);
});

test("formats relative times after caller-side threshold selection", async () => {
	setLocale("en");

	for (const minutes of [-45, -125, -60 * 24 * 2]) {
		const input = toRelativeDuration(minutes);

		assert.strictEqual(
			m.relative_update(input),
			`Updated ${formatRelativeTime("en", input.duration, input.unit, {
				style: "short",
			})}.`
		);
	}
});

function toRelativeDuration(minutes: number) {
	const absoluteMinutes = Math.abs(minutes);

	if (absoluteMinutes >= 60 * 24) {
		return {
			duration: Math.round(minutes / (60 * 24)),
			unit: "day",
		};
	}

	if (absoluteMinutes >= 60) {
		return {
			duration: Math.round(minutes / 60),
			unit: "hour",
		};
	}

	return {
		duration: minutes,
		unit: "minute",
	};
}

function formatRelativeTime(
	locale: string,
	duration: number,
	unit: string,
	options: Intl.RelativeTimeFormatOptions = {}
) {
	return new Intl.RelativeTimeFormat(locale, options).format(
		duration,
		unit as Intl.RelativeTimeFormatUnit
	);
}
