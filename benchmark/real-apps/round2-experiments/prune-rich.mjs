import { parse } from "acorn";
import MagicString from "magic-string";
const walk = (n, f, p) => {
	if (!n || typeof n !== "object") return;
	if (n.type) f(n, p);
	for (const v of Object.values(n)) {
		if (Array.isArray(v)) v.forEach((x) => walk(x, f, n));
		else if (v && typeof v === "object") walk(v, f, n);
	}
};
export function pruneRich(code) {
	let original = code;
	for (let round = 0; round < 5; round++) {
		const ast = parse(code, { ecmaVersion: "latest", sourceType: "module" }),
			s = new MagicString(code),
			candidates = new Map(),
			refs = new Map();
		let dynamic = false;
		walk(ast, (n) => {
			if (n.type === "CallExpression" && n.callee?.name === "eval")
				dynamic = true;
			if (
				n.type !== "VariableDeclarator" ||
				n.id?.type !== "Identifier" ||
				n.init?.type !== "CallExpression" ||
				n.init.callee?.object?.name !== "Object" ||
				n.init.callee?.property?.name !== "assign"
			)
				return;
			const a = n.init.arguments,
				p = a[1]?.properties;
			if (
				a.length !== 2 ||
				a[0]?.type !== "ArrowFunctionExpression" ||
				p?.length !== 1 ||
				p[0].key?.name !== "parts" ||
				p[0].value.type !== "ArrowFunctionExpression"
			)
				return;
			candidates.set(n.id.name, {
				id: n.id,
				init: n.init,
				plain: a[0],
				parts: p[0].value,
			});
		});
		if (dynamic) return null;
		walk(ast, (n, p) => {
			if (
				n.type !== "Identifier" ||
				!candidates.has(n.name) ||
				n === candidates.get(n.name).id
			)
				return;
			if (p?.type === "MemberExpression" && p.property === n && !p.computed)
				return;
			if (p?.type === "Property" && p.key === n && !p.computed && !p.shorthand)
				return;
			const a = refs.get(n.name) ?? [];
			a.push({ n, p });
			refs.set(n.name, a);
		});
		let edits = 0;
		for (const [name, c] of candidates) {
			const r = refs.get(name) ?? [];
			if (!r.length) continue;
			const plainOnly = r.every(
					({ n, p }) => p.type === "CallExpression" && p.callee === n
				),
				partsOnly = r.every(
					({ n, p }) =>
						p.type === "MemberExpression" &&
						p.object === n &&
						!p.computed &&
						p.property.name === "parts"
				);
			if (plainOnly) {
				s.overwrite(
					c.init.start,
					c.init.end,
					code.slice(c.plain.start, c.plain.end)
				);
				edits++;
			} else if (partsOnly) {
				s.overwrite(
					c.init.start,
					c.init.end,
					`({parts:${code.slice(c.parts.start, c.parts.end)}}).parts`
				);
				for (const { p } of r) s.overwrite(p.start, p.end, name);
				edits++;
			}
		}
		if (!edits) break;
		code = s.toString();
	}
	return code === original ? null : { code, map: null };
}
