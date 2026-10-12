import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const webRoot = process.env.FRIGATE_WEB_ROOT;
if (!webRoot) throw new Error("Set FRIGATE_WEB_ROOT to the pinned Frigate web checkout.");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const archiveRoot = new URL(".", import.meta.url);
const sourceLocales = await readJson(
  new URL("./paraglide-project.inlang/settings.json", archiveRoot),
);
const projectMetadata = await readJson(
  new URL("./paraglide-project.inlang/metadata.json", archiveRoot),
);
const routeMap = await readJson(
  new URL("./paraglide-project.inlang/route-message-map.json", archiveRoot),
);
const compilerMetadata = await readJson(
  resolve(webRoot, "src/paraglide/client-locale-split.json"),
);

const sourceNamespaces = projectMetadata.namespaces;
const rawIds = new Set();
const canonicalIds = new Set();
for (const locale of sourceLocales.locales) {
	for (const namespace of sourceNamespaces) {
    const catalogPath = resolve(webRoot, `public/locales/${locale}/${namespace}.json`);
		const catalog = await readJson(catalogPath);
		const visit = (value, path = []) => {
			if (typeof value === "string") {
				rawIds.add(JSON.stringify([namespace, path]));
				canonicalIds.add(
					JSON.stringify([
						namespace,
						path.flatMap((part) => part.split(".")),
					]),
				);
				return;
			}
			if (value && typeof value === "object" && !Array.isArray(value)) {
				for (const [key, child] of Object.entries(value)) {
					visit(child, [...path, key]);
				}
			}
		};
		visit(catalog);
	}
}

assert.equal(sourceLocales.locales.length, 33, "source locale count changed");
assert.equal(rawIds.size, 3040, "raw source message union changed");
assert.equal(canonicalIds.size, 3039, "i18next keySeparator-normalized union changed");
assert.equal(routeMap.length, canonicalIds.size, "adapter route map is incomplete");
assert.equal(compilerMetadata.locales.length, sourceLocales.locales.length);
assert.deepEqual(compilerMetadata.locales, sourceLocales.locales);
assert.equal(compilerMetadata.messages.length, canonicalIds.size);
assert.equal(projectMetadata.unionMessageCount, canonicalIds.size);

const mapIds = new Set(routeMap.map((entry) => entry.id));
assert.equal(mapIds.size, canonicalIds.size, "adapter route map has duplicate IDs");
assert.deepEqual(mapIds, canonicalIds, "adapter route map differs from source catalogs");
assert.deepEqual(
	new Set(compilerMetadata.messages.map((message) => message.publicName)),
	mapIds,
	"compiler output message metadata differs from adapter route map",
);

console.log(
	JSON.stringify({
		locales: sourceLocales.locales.length,
		rawSourceIds: rawIds.size,
		keySeparatorNormalizedIds: canonicalIds.size,
		compiledMessageIds: compilerMetadata.messages.length,
	}, null, 2),
);
