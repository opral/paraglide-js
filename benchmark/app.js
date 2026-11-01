import { init, setLanguage, plural } from "./adapter.js";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "en";
let route = Number(params.get("route") ?? 0);
const pages = [
	() => import("./pages/route0.js"),
	() => import("./pages/route1.js"),
	() => import("./pages/route2.js"),
	() => import("./pages/route3.js"),
	() => import("./pages/route4.js"),
];
const root = document.querySelector("#app");
document.querySelector("#navigation").innerHTML = Array.from(
	{ length: 5 },
	(_, i) => `<button data-route="${i}">Route ${i + 1}</button>`
).join("");
document.querySelector("#languages").innerHTML = LOCALES.map(
	(l) => `<button data-locale="${l}">${l}</button>`
).join("");
document.querySelector("#navigation").addEventListener("click", async (e) => {
	if (e.target.dataset.route !== undefined)
		await window.benchmark.go(Number(e.target.dataset.route));
});
document.querySelector("#languages").addEventListener("click", async (e) => {
	if (e.target.dataset.locale)
		await window.benchmark.language(e.target.dataset.locale);
});
async function render(page) {
	document.documentElement.lang = locale;
	document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
	page ??= await pages[route]();
	const values = page.messages();
	root.replaceChildren(
		...values.map((value) => {
			const p = document.createElement("p");
			p.textContent = value;
			return p;
		})
	);
	document.querySelector("#plural").textContent = plural(3);
	document.querySelector("#date").textContent = new Intl.DateTimeFormat(
		locale,
		{ dateStyle: "long", timeZone: "UTC" }
	).format(new Date("2026-10-28T12:00:00Z"));
	window.benchmark.state = { locale, route, values };
}
window.benchmark = {
	ready: false,
	state: null,
	async go(next) {
		route = next;
		await prepare();
	},
	async language(next) {
		const url = new URL(
			LOCALE_PATHS[next] ?? import.meta.env.BASE_URL,
			location.origin
		);
		url.searchParams.set("locale", next);
		url.searchParams.set("route", String(route));
		location.assign(url);
	},
	plural,
};
async function prepare() {
	const [page] = await Promise.all([
		pages[route](),
		setLanguage(locale, route),
	]);
	await render(page);
}
await init();
await prepare();
window.benchmark.ready = true;
window.benchmark.readyAt = performance.now();
