import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const repo = path.resolve(".");
const appCheckout = path.join(repo, ".real-apps/anything-llm-source");
const destination = path.join(
	repo,
	".real-apps/anything-native-metadata-control"
);
const localeKeys = [
	"en",
	"zh",
	"zh-tw",
	"es",
	"de",
	"fr",
	"ko",
	"lo",
	"et",
	"ru",
	"it",
	"pt",
	"he",
	"nl",
	"vi",
	"fa",
	"tr",
	"ar",
	"da",
	"ja",
	"lv",
	"pl",
	"ro",
	"cs",
	"lt",
	"ca",
	"id",
	"hr",
	"sv",
	"hi",
	"bg",
];

await fs.rm(destination, { recursive: true, force: true });
await fs.mkdir(destination, { recursive: true });
const archive = execFileSync(
	"git",
	["-C", appCheckout, "archive", "HEAD", "frontend"],
	{ maxBuffer: 64 * 1024 * 1024 }
);
execFileSync("tar", ["-x", "-C", destination], { input: archive });

const frontend = path.join(destination, "frontend");
const sourceModules = path.join(appCheckout, "frontend/node_modules");
await fs.symlink(
	path.relative(frontend, sourceModules),
	path.join(frontend, "node_modules"),
	"dir"
);
const hook = `import i18n from "@/i18n";

const supportedLocaleKeys = ${JSON.stringify(localeKeys)};

export function useLanguageOptions() {
  const supportedLanguages = [...supportedLocaleKeys];
  const languageNames = new Intl.DisplayNames(supportedLanguages, {
    type: "language",
  });
  const changeLanguage = (newLang = "en") => {
    if (!supportedLocaleKeys.includes(newLang)) return false;
    i18n.changeLanguage(newLang);
  };

  return {
    currentLanguage: i18n.language || "en",
    supportedLanguages,
    getLanguageName: (lang = "en") => languageNames.of(lang),
    changeLanguage,
  };
}
`;
await fs.writeFile(
	path.join(frontend, "src/hooks/useLanguageOptions.js"),
	hook
);
console.log(
	JSON.stringify(
		{
			destination: path.relative(repo, frontend),
			localeCount: localeKeys.length,
			sourceCommit: execFileSync(
				"git",
				["-C", appCheckout, "rev-parse", "HEAD"],
				{ encoding: "utf8" }
			).trim(),
		},
		null,
		2
	)
);
