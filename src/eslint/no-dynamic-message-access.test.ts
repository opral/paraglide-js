import { describe, test, expect } from "vitest";
import { RuleTester, Linter } from "eslint";
import { RuleTester as RuleTester9 } from "eslint9";
import tsParser from "@typescript-eslint/parser";
import plugin from "./index.js";
import { noDynamicMessageAccess } from "./no-dynamic-message-access.js";

const named = 'import { m } from "./paraglide/messages.js";';
const namespace = 'import * as labels from "$lib/paraglide/messages";';
const dynamic = [{ messageId: "dynamicAccess" }];
const copy = [{ messageId: "catalogCopy" }];

// The two majors expose different generic tester types; exercise the same runtime API.
for (const Tester of [
	RuleTester9 as unknown as typeof RuleTester,
	RuleTester,
]) {
	Tester.describe = (name, fn) => describe(name, fn);
	Tester.it = (name, fn) => test(name, fn);
	new Tester({
		languageOptions: { ecmaVersion: "latest", sourceType: "module" },
	}).run("no-dynamic-message-access", noDynamicMessageAccess, {
		valid: [
			`${named} m.greeting({ name: "Ada" });`,
			`${named} m["user.profile.title"]();`,
			`${named} m[\`greeting\`]();`,
			`${named} m[42]();`,
			`${named} const allowed = new Map([["hello", m.greeting]]); allowed.get(key)?.();`,
			`${named} const messages = { greeting: m.greeting }; messages[key]?.();`,
			`${namespace} labels.greeting();`,
			`${named} function render(m) { return m[key](); }`,
			`${namespace} function render(labels) { return labels[key](); }`,
			`${named} { const m = {}; m[key]; }`,
			'import { m } from "./unrelated/messages.js"; m[key]();',
			'import * as m from "./other.js"; m[key]();',
			`${named} m.greeting[method]();`,
			`${named} const { greeting } = m; greeting();`,
			`${named} const { ["greeting"]: greeting } = m; greeting();`,
			`${named} const a = b; const b = a; a[key]();`,
			'import { greeting as m } from "./paraglide/messages.js"; m[method]();',
		],
		invalid: [
			{
				code: 'import { m } from "$lib/i18n/messages.js"; m[key]();',
				options: [{ messageModuleDirectories: ["i18n"] }],
				errors: dynamic,
			},
			{ code: `${named} m[key]();`, errors: dynamic },
			{ code: `${named} const fn = m[key];`, errors: dynamic },
			{ code: `${named} m[\`hello_\${name}\`]();`, errors: dynamic },
			{ code: `${named} m["hello_" + name]();`, errors: dynamic },
			{ code: `${named} m?.[key]?.();`, errors: dynamic },
			{
				code: 'import { m as messages } from "@/paraglide/messages.js"; messages[key]();',
				errors: dynamic,
			},
			{ code: `${namespace} labels[key]();`, errors: dynamic },
			{ code: `${namespace} labels.m[key]();`, errors: dynamic },
			{ code: `${namespace} labels["m"][key]();`, errors: dynamic },
			{
				code: `${named} const alias = m; const second = alias; second[key]();`,
				errors: dynamic,
			},
			{
				code: `${namespace} const { m: alias } = labels; alias[key]();`,
				errors: dynamic,
			},
			{ code: `${named} const { [key]: message } = m;`, errors: dynamic },
			{ code: `${named} const { greeting, ...rest } = m;`, errors: copy },
			{ code: `${named} const catalog = { ...m };`, errors: copy },
			{
				code: 'import * as labels from "./generated/messages.js"; labels[key]();',
				options: [{ messageModules: ["./generated/messages.js"] }],
				errors: dynamic,
			},
			{
				code: 'import { m } from "@app/translations"; m[key]();',
				options: [{ messageModules: ["@app/translations"] }],
				errors: dynamic,
			},
		],
	});

	new Tester({ languageOptions: { parser: tsParser } }).run(
		"no-dynamic-message-access (TypeScript)",
		noDynamicMessageAccess,
		{
			valid: [
				{
					code: `${named} const labels: Record<string, () => string> = { hello: m.greeting }; labels[key]();`,
					filename: "app.ts",
				},
				{
					code: `${named} function render(m: Record<string, () => string>, key: string) { return m[key](); }`,
					filename: "app.ts",
				},
			],
			invalid: [
				{
					code: `${named} (m as typeof m)[key]();`,
					filename: "app.ts",
					errors: dynamic,
				},
				{ code: `${named} m![key]();`, filename: "app.ts", errors: dynamic },
				{
					code: `${named} (m satisfies typeof m)[key]();`,
					filename: "app.ts",
					errors: dynamic,
				},
				{
					code: `${named} const alias = m as typeof m; alias[key]();`,
					filename: "app.ts",
					errors: dynamic,
				},
			],
		}
	);
}

test("public plugin config reports dynamic access without an unsafe autofix", () => {
	const linter = new Linter();
	const config = {
		plugins: { paraglide: plugin },
		rules: { "paraglide/no-dynamic-message-access": "error" as const },
	};
	const code = `${named} m[key]();`;
	const result = linter.verifyAndFix(code, config);
	expect(result.messages).toHaveLength(1);
	expect(result.messages[0]?.ruleId).toBe(
		"paraglide/no-dynamic-message-access"
	);
	expect(result.messages[0]?.message).toContain("local map");
	expect(result.fixed).toBe(false);
	expect(result.output).toBe(code);
});
