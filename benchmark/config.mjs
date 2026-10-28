export const locales = [
	"en",
	"de",
	"es",
	"fr",
	"it",
	"pt",
	"nl",
	"pl",
	"ja",
	"ar",
];
export const variants = [
	"paraglide",
	"i18next-bundled",
	"i18next-http-global",
	"i18next-http-routes",
];
export const scenarios = [200, 1000, 4000].flatMap((total) =>
	[50, 200]
		.filter((used) => 20 + 5 * (used - 20) <= total)
		.flatMap((used) =>
			[2, 5, 10].map((localeCount) => ({ total, used, localeCount }))
		)
);
export const nameOf = (s, variant) =>
	`l${s.localeCount}-m${s.used}-n${s.total}-${variant}`;
export const settings = {
	repeats: 5,
	compression: "br",
	brotliQuality: 5,
	latencyMs: 40,
	downloadBytesPerSecond: 1_250_000,
	uploadBytesPerSecond: 625_000,
	cpuSlowdown: 4,
};
