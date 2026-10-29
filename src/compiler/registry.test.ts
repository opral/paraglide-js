import { afterEach, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import type { FunctionReference } from "@inlang/sdk";
import { compileAnnotation } from "./compile-annotation.js";
import { compileMessage } from "./compile-message.js";
import { createRegistry } from "./registry.js";

afterEach(() => vi.restoreAllMocks());

function spyConstructor(
	name: "PluralRules" | "NumberFormat" | "DateTimeFormat" | "RelativeTimeFormat"
) {
	const Original = Intl[name];
	return vi
		.spyOn(Intl, name)
		.mockImplementation((...args: any[]) => Reflect.construct(Original, args));
}

async function loadRegistry() {
	const source = createRegistry();
	return import(
		`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
	);
}

test(`reuses each formatter with fresh equivalent options`, async () => {
	const registry = await loadRegistry();
	const cases = [
		["plural", "PluralRules", 2, { type: "cardinal" }, "other"],
		["number", "NumberFormat", 12, { minimumFractionDigits: 2 }, "12.00"],
		[
			"datetime",
			"DateTimeFormat",
			"2026-10-11",
			{ timeZone: "UTC", year: "numeric" },
			"2026",
		],
		[
			"relativetime",
			"RelativeTimeFormat",
			-1,
			{ unit: "day", numeric: "auto" },
			"yesterday",
		],
	] as const;
	for (const [fn, name, input, options, expected] of cases) {
		const spy = spyConstructor(name);
		for (let i = 0; i < 100; i++)
			expect(registry[fn]("en", input, { ...options }, true)).toBe(expected);
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	}
	expect(registry.icuPound("en", 3, { offset: 1 })).toBe("2");
});

test(`default-zone datetime follows host TZ changes; explicit zones stay cached`, () => {
	// TZ changes affect Intl in Node's main thread, not Vitest worker threads.
	const url = `data:text/javascript;base64,${Buffer.from(createRegistry()).toString("base64")}`;
	execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
			import assert from "node:assert/strict";
			const module = await import(${JSON.stringify(url)});
			const registry = module;
			const Native = Intl.DateTimeFormat;
			let constructions = 0;
			Intl.DateTimeFormat = new Proxy(Native, {
				construct(target, args, newTarget) {
					constructions++;
					return Reflect.construct(target, args, newTarget);
				}
			});
			const input = "2026-01-01T02:00:00Z";
			for (const options of [undefined, {}, { timeZone: undefined }, { hour: "numeric" }]) {
				const start = constructions;
				process.env.TZ = "UTC";
				const utc = registry.datetime("en", input, options, true);
				assert.equal(utc, new Native("en", options).format(new Date(input)));
				process.env.TZ = "America/New_York";
				const newYork = registry.datetime("en", input, options, true);
				assert.equal(newYork, new Native("en", options).format(new Date(input)));
				assert.notEqual(utc, newYork);
				assert.equal(constructions - start, 2);
			}
			const start = constructions;
			process.env.TZ = "UTC";
			const utc = registry.datetime("en", input, { timeZone: "UTC" }, true);
			process.env.TZ = "America/New_York";
			assert.equal(registry.datetime("en", input, { timeZone: "UTC" }, true), utc);
			assert.equal(constructions - start, 1);
		`,
		],
		{ env: { ...process.env, TZ: "UTC" }, timeout: 10000 }
	);
});

test("keys distinguish locales and options, independent of property order", async () => {
	const registry = await loadRegistry();
	const expectedGerman = new Intl.NumberFormat("de", {
		style: "currency",
		currency: "EUR",
	}).format(2);
	const spy = spyConstructor("NumberFormat");
	const options = { style: "currency", currency: "USD" };
	expect(registry.number("en", 2, options, true)).toBe("$2.00");
	expect(
		registry.number("en", 2, { currency: "USD", style: "currency" }, true)
	).toBe("$2.00");
	expect(spy).toHaveBeenCalledTimes(1);
	options.currency = "EUR";
	expect(registry.number("en", 2, options, true)).toBe("€2.00");
	expect(registry.number("de", 2, options, true)).toBe(expectedGerman);
	expect(spy.mock.calls.filter(([locale]) => locale === "en")).toHaveLength(2);
});

test("preserves cardinal, ordinal, offsets, relative units and defaults", async () => {
	const registry = await loadRegistry();
	expect(registry.plural("en", 2, { type: "cardinal" })).toBe("other");
	expect(registry.plural("en", 2, { type: "ordinal" })).toBe("two");
	expect(registry.plural("en", 2, { offset: 1 })).toBe("one");
	expect(
		registry.relativetime("en", -1, { unit: "day", numeric: "auto" })
	).toBe("yesterday");
	expect(
		registry.relativetime("en", -1, { unit: "year", numeric: "auto" })
	).toBe("last year");
	const spy = spyConstructor("PluralRules");
	expect(registry.plural("en", 1)).toBe("one");
	expect(registry.plural("en", 1, {}, true)).toBe("one");
	expect(registry.plural("en", 1, { type: undefined }, true)).toBe("one");
	expect(spy).toHaveBeenCalledTimes(1);
});

test("preserves changing accessors, inherited options and object-valued options", async () => {
	const registry = await loadRegistry();
	let digits = 0;
	const accessor = {
		get minimumFractionDigits() {
			return digits++;
		},
	};
	expect(registry.number("en", 2, accessor)).toBe("2");
	expect(registry.number("en", 2, accessor)).toBe("2.0");
	const inherited = Object.create({ minimumFractionDigits: 1 });
	expect(registry.number("en", 2, inherited)).toBe("2.0");
	Object.getPrototypeOf(inherited).minimumFractionDigits = 2;
	expect(registry.number("en", 2, inherited)).toBe("2.00");
	let currency = "USD";
	const options = { style: "currency", currency: { toString: () => currency } };
	expect(registry.number("en", 2, options)).toBe("$2.00");
	currency = "EUR";
	expect(registry.number("en", 2, options)).toBe("€2.00");
});

test("preserves invalid option errors, without caching failures", async () => {
	const registry = await loadRegistry();
	const spy = spyConstructor("NumberFormat");
	for (let i = 0; i < 2; i++) {
		expect(() =>
			registry.number("en", 2, { minimumFractionDigits: NaN })
		).toThrow(RangeError);
		expect(() => registry.number("en", 2, null)).toThrow(TypeError);
	}
	expect(spy).toHaveBeenCalledTimes(4);
});

test("bounds each constructor cache and evicts oldest entries", async () => {
	const registry = await loadRegistry();
	const spy = spyConstructor("NumberFormat");
	for (let i = 0; i < 257; i++)
		registry.number(
			"en",
			i,
			{
				minimumIntegerDigits: (i % 21) + 1,
				minimumFractionDigits: Math.floor(i / 21),
			},
			true
		);
	registry.number(
		"en",
		2,
		{
			minimumIntegerDigits: 1,
			minimumFractionDigits: 0,
		},
		true
	);
	expect(spy).toHaveBeenCalledTimes(258);
});

test("uses a replacement constructor after a polyfill is installed", async () => {
	const registry = await loadRegistry();
	expect(registry.plural("en", 2)).toBe("other");
	const replacement = spyConstructor("PluralRules");
	expect(registry.plural("en", 2)).toBe("other");
	expect(registry.plural("en", 2)).toBe("other");
	expect(replacement).toHaveBeenCalledTimes(1);
});

test("direct calls preserve effective proxy options", async () => {
	const registry = await loadRegistry();
	let style = "short";
	const options = new Proxy(
		{},
		{
			get: (_, key) =>
				key === "dateStyle" ? style : key === "timeZone" ? "UTC" : undefined,
		}
	);
	const input = "2026-10-11";
	expect(registry.datetime("en", input, options)).toBe(
		new Intl.DateTimeFormat("en", {
			dateStyle: "short",
			timeZone: "UTC",
		}).format(new Date(input))
	);
	style = "full";
	expect(registry.datetime("en", input, options)).toBe(
		new Intl.DateTimeFormat("en", {
			dateStyle: "full",
			timeZone: "UTC",
		}).format(new Date(input))
	);
});

test("direct calls never invoke prototype or descriptor traps", async () => {
	const registry = await loadRegistry();
	let probes = 0;
	const options = new Proxy(
		{},
		{
			getPrototypeOf() {
				probes++;
				return Object.prototype;
			},
			getOwnPropertyDescriptor() {
				probes++;
				return undefined;
			},
			get(_, key) {
				return key === "minimumFractionDigits" ? probes : undefined;
			},
		}
	);
	expect(registry.number("en", 2, options)).toBe("2");
	expect(probes).toBe(0);
});

test("keeps the cache helper private in the generated registry", async () => {
	const registry = await loadRegistry();
	expect(registry).not.toHaveProperty("getIntlFormatter");
	expect(registry).not.toHaveProperty("ownOptions");
	expect(registry).not.toHaveProperty("ownOption");
});

test("does not enumerate proxy option keys or inspect descriptors", async () => {
	const registry = await loadRegistry();
	const options = new Proxy(
		{},
		{
			ownKeys() {
				throw new Error("must not enumerate");
			},
			getOwnPropertyDescriptor() {
				throw new Error("must not inspect");
			},
			getPrototypeOf() {
				throw new Error("must not inspect prototype");
			},
		}
	);
	expect(registry.number("en", 2, options)).toBe("2");
});

test("does not touch later getters after Intl rejects an earlier option", async () => {
	const registry = await loadRegistry();
	let touched = false;
	const options = {
		localeMatcher: "invalid",
		get currency() {
			touched = true;
			return "USD";
		},
	};
	expect(() => registry.number("en", 1, options)).toThrow(RangeError);
	expect(touched).toBe(false);
});

test("compiled messages reuse formatters for their plain option literals", async () => {
	const compiled = compileMessage(
		[{ type: "input-variable", name: "amount" }],
		{ id: "price", bundleId: "price", locale: "en", selectors: [] },
		[
			{
				id: "price",
				matches: [],
				pattern: [
					{
						type: "expression",
						arg: { type: "variable-reference", name: "amount" },
						annotation: {
							type: "function-reference",
							name: "number",
							options: [],
						},
					},
				],
			},
		]
	);
	const source = `${createRegistry()}\nconst registry = { number };\nexport const price = ${compiled.code}`;
	const { price } = await import(
		`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
	);
	const spy = spyConstructor("NumberFormat");
	for (let i = 0; i < 100; i++) expect(price({ amount: 12 })).toBe("12");
	expect(spy).toHaveBeenCalledTimes(1);
});

test("compiler-created object-valued options retain dynamic coercion", async () => {
	const registry = await loadRegistry();
	let currency = "USD";
	const options = { style: "currency", currency: { toString: () => currency } };
	expect(registry.number("en", 2, options, true)).toBe("$2.00");
	currency = "EUR";
	expect(registry.number("en", 2, options, true)).toBe("€2.00");
});

test("preserves options inherited from an extended Object.prototype", async () => {
	const registry = await loadRegistry();
	expect(registry.number("en", 2, {}, true)).toBe("2");
	const previous = Object.getOwnPropertyDescriptor(
		Object.prototype,
		"minimumFractionDigits"
	);
	try {
		Object.defineProperty(Object.prototype, "minimumFractionDigits", {
			value: 2,
			configurable: true,
		});
		expect(registry.number("en", 2, {}, true)).toBe("2.00");
	} finally {
		if (previous)
			Object.defineProperty(
				Object.prototype,
				"minimumFractionDigits",
				previous
			);
		else Reflect.deleteProperty(Object.prototype, "minimumFractionDigits");
	}
});

type Option = FunctionReference["options"][number];

function literal(name: string, value: string): Option {
	return { name, value: { type: "literal", value } };
}

let compiledCalls = 0;

async function compileCall(name: string, options: Option[]) {
	const code = compileAnnotation("input", "en", {
		type: "function-reference",
		name,
		options,
	});
	// a distinct module each time, with its own registry state
	const source = `// ${compiledCalls++}\n${createRegistry()}\nconst registry = { plural, number, icuPound, datetime, relativetime };\nexport const format = (input) => ${code}`;
	const registry = await import(
		`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
	);
	return { code, registry };
}

/** Runs `run` while Object.prototype has the property, then restores it. */
function withPrototypeProperty(
	name: string,
	descriptor: PropertyDescriptor,
	run: () => void
) {
	const previous = Object.getOwnPropertyDescriptor(Object.prototype, name);
	Object.defineProperty(Object.prototype, name, {
		...descriptor,
		configurable: true,
	});
	try {
		run();
	} finally {
		if (previous) Object.defineProperty(Object.prototype, name, previous);
		else Reflect.deleteProperty(Object.prototype, name);
	}
}

test("compiled literal options pass the runtime key and share its formatter", async () => {
	const cases: Array<
		[
			annotation: string,
			constructor: Parameters<typeof spyConstructor>[0],
			options: Option[],
			input: unknown,
			expected: string,
			equivalent: [fn: string, options: Record<string, unknown> | undefined],
		]
	> = [
		["plural", "PluralRules", [], 1, "one", ["plural", { offset: undefined }]],
		[
			"plural",
			"PluralRules",
			[literal("type", "ordinal")],
			2,
			"two",
			["plural", { type: "ordinal" }],
		],
		[
			"plural",
			"PluralRules",
			[literal("offset", "1")],
			2,
			"one",
			["plural", { offset: 1 }],
		],
		[
			"number",
			"NumberFormat",
			[literal("useGrouping", "false"), literal("minimumFractionDigits", "2")],
			1234.5,
			"1234.50",
			["number", { minimumFractionDigits: 2, useGrouping: false }],
		],
		[
			"icu:pound",
			"NumberFormat",
			[literal("offset", "1")],
			1234,
			"1,233",
			["number", undefined],
		],
		[
			"datetime",
			"DateTimeFormat",
			[literal("timeZone", "UTC"), literal("year", "numeric")],
			"2026-10-11",
			"2026",
			["datetime", { year: "numeric", timeZone: "UTC" }],
		],
		[
			"relativetime",
			"RelativeTimeFormat",
			[literal("unit", "day"), literal("numeric", "auto")],
			-1,
			"yesterday",
			["relativetime", { numeric: "auto", unit: "day" }],
		],
	];
	for (const [
		annotation,
		name,
		options,
		input,
		expected,
		[fn, equivalent],
	] of cases) {
		const { code, registry } = await compileCall(annotation, options);
		expect(code).toMatch(/, '\["en",.*\]'\)$/);
		const spy = spyConstructor(name);
		for (let i = 0; i < 100; i++) expect(registry.format(input)).toBe(expected);
		// the same options with a runtime key reuse that formatter
		registry[fn]("en", input, equivalent && { ...equivalent }, true);
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	}
});

test("compiled literal options ignore options added to Object.prototype", async () => {
	const date = "2026-01-01T02:00:00Z";
	const cases: Array<
		[
			annotation: string,
			options: Option[],
			input: unknown,
			name: string,
			value: unknown,
		]
	> = [
		["number", [], 2, "minimumFractionDigits", 2],
		["number", [], 2, "style", "percent"],
		["plural", [], 1, "offset", 1],
		["icu:pound", [], 1234, "offset", 1],
		["relativetime", [literal("unit", "day")], -1, "numeric", "auto"],
		[
			"datetime",
			[literal("timeZone", "UTC"), literal("year", "numeric")],
			date,
			"calendar",
			"buddhist",
		],
		["datetime", [literal("hour", "numeric")], date, "timeZone", "Asia/Tokyo"],
		// the registry's own cache state
		["number", [], 2, "caches", 1],
		// invalid values that would make every call throw
		["number", [], 2, "maximumFractionDigits", 500],
		["datetime", [literal("hour", "numeric")], date, "timeZone", "Not/A_Zone"],
	];
	for (const [annotation, options, input, name, value] of cases) {
		const cached = await compileCall(annotation, options);
		const expected = cached.registry.format(input);
		withPrototypeProperty(name, { value }, () =>
			expect(cached.registry.format(input)).toBe(expected)
		);
		// added before the first call
		const fresh = await compileCall(annotation, options);
		withPrototypeProperty(name, { value }, () =>
			expect(fresh.registry.format(input)).toBe(expected)
		);
	}
});

test("literal datetime options without their own time zone follow host TZ changes, despite an inherited one", () => {
	// TZ changes affect Intl in Node's main thread, not Vitest worker threads.
	const url = `data:text/javascript;base64,${Buffer.from(createRegistry()).toString("base64")}`;
	execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
			import assert from "node:assert/strict";
			const registry = await import(${JSON.stringify(url)});
			const input = "2026-01-01T02:00:00Z";
			const native = () => new Intl.DateTimeFormat("en", { hour: "numeric" }).format(new Date(input));
			const format = () => registry.datetime("en", input, { hour: "numeric" }, '["en",[["hour","numeric"]]]');
			process.env.TZ = "UTC";
			const expected = native();
			Object.prototype.timeZone = "America/New_York";
			const utc = format();
			assert.equal(utc, expected);
			process.env.TZ = "America/Los_Angeles";
			const losAngeles = format();
			delete Object.prototype.timeZone;
			assert.equal(losAngeles, native());
			assert.notEqual(utc, losAngeles);
		`,
		],
		{ env: { ...process.env, TZ: "UTC" }, timeout: 10000 }
	);
});

test("calls without a key read offset and timeZone as before", async () => {
	const registry = await loadRegistry();
	// converting the input changes the offset before it is read
	const options = { offset: 0 };
	const input = { valueOf: () => ((options.offset = 1), 2) };
	expect(registry.plural("en", input, options)).toBe("one");
	// without the flag, only the constructor reads the time zone, once
	let reads = 0;
	const zoned = {
		hour: "numeric",
		get timeZone() {
			return reads++ === 0 ? "UTC" : "America/New_York";
		},
	};
	expect(registry.datetime("en", "2026-01-01T02:00:00Z", zoned)).toBe("2 AM");
	expect(reads).toBe(1);
});

test("options with a variable, a name that is not an identifier, or a number that is not finite keep the runtime key", async () => {
	const variable: Option = {
		name: "offset",
		value: { type: "variable-reference", name: "shift" },
	};
	expect((await compileCall("icu:pound", [variable])).code).toMatch(
		/\{ offset: i\?\.shift \}\)$/
	);
	const exponent = await compileCall("number", [literal("1e1", "2")]);
	expect(exponent.code).toMatch(/, true\)$/);
	expect(exponent.registry.format(2)).toBe("2");
	const escaped = await compileCall("number", [
		literal("\\u006dinimumFractionDigits", "2"),
	]);
	expect(escaped.code).toMatch(/, true\)$/);
	expect(escaped.registry.format(2)).toBe("2.00");
	const digits = `1${"0".repeat(400)}`;
	const overflow = await compileCall("number", [
		literal("minimumFractionDigits", digits),
	]);
	// the emitted token stays a number literal, not `Infinity`
	expect(overflow.code).toContain(`minimumFractionDigits: ${digits} }, true)`);
	expect(() => overflow.registry.format(2)).toThrow(RangeError);
});
