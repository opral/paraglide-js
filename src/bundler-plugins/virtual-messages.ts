import { createHash } from "node:crypto";
import path from "node:path";
import type { ViteDevServer, ModuleNode, Plugin } from "vite";
import { createVitePlugin } from "unplugin";
import { unpluginFactory, type ParaglidePluginOptions } from "./unplugin.js";

export function singleMessageDeclaration(output: Record<string, string>) {
	const result = Object.fromEntries(
		Object.entries(output).filter(
			([name]) =>
				(!name.startsWith("messages/") || !name.endsWith(".d.ts")) &&
				name !== "messages/package.json"
		)
	);
	const localizedString =
		'export type LocalizedString = import("../runtime.js").LocalizedString;';
	const definitions = Object.entries(output)
		.filter(
			([name]) =>
				name.startsWith("messages/") &&
				name.endsWith(".d.ts") &&
				name !== "messages/_index.d.ts"
		)
		.map(([, code]) => code.replace(localizedString, ""))
		.join("\n");
	let body = (localizedString + "\n" + definitions).replaceAll(
		'"../runtime.js"',
		'"./runtime.js"'
	);
	// These non-generic exported aliases have a fixed spelling in our direct
	// emitter. Extract only that generated form; do not parse/typecheck JS.
	// A production emitter should produce these aliases from metadata directly.
	const typeNames = [
		...body.matchAll(/^export type ([A-Za-z_$][\w$]*) = /gm),
	].map(([, name]) => name);
	const values = [
		...[...definitions.matchAll(/^export const ([A-Za-z_$][\w$]*):/gm)].map(
			([, name]) => [name, name]
		),
		...[
			...definitions.matchAll(
				/^export \{ ([A-Za-z_$][\w$]*) as ("(?:[^"\\]|\\.)*") \};/gm
			),
		].map(([, local, name]) => [JSON.parse(name!), local!]),
	];
	// Local aliases avoid thousands of self-module imports while preserving
	// namespace type exports. Resolve their targets in the root scope first.
	const names = new Set([...typeNames, ...values.map(([, local]) => local)]);
	const aliases: string[] = [];
	const types = typeNames.map((name, index) => {
		let alias = `__ParaglideNamespaceType_${index}`;
		while (names.has(alias)) alias += "_";
		names.add(alias);
		aliases.push(`type ${alias} = ${name};`);
		return `export type ${name} = ${alias};`;
	});

	// The public root m is the namespace, while a message whose ID is m is
	// available as m.m. Keep its private binding separate in this flat file.
	const shadowed = values.find(([name]) => name === "m");
	if (shadowed) {
		let local = "__paraglide_message_m";
		while (definitions.includes(`const ${local}:`)) local += "_";
		body = body.replace(/^export const m:/m, `declare const ${local}:`);
		shadowed[1] = local;
	}
	result["messages.d.ts"] =
		body +
		"\n" +
		aliases.join("\n") +
		`
export declare const m: {
	${values.map(([name, local]) => `readonly ${JSON.stringify(name)}: typeof ${local};`).join("\n")}
};
export declare namespace m {
	${types.join("\n")}
}
`;
	return result;
}

export function virtualMessages(
	directory: string,
	initial: Record<string, string>
) {
	const namespace = createHash("sha256")
		.update(path.resolve(directory))
		.digest("hex")
		.slice(0, 16);
	const publicPrefix = `virtual:paraglide/${namespace}/`;
	const prefix = "\0" + publicPrefix;
	let files = initial;
	let server: ViteDevServer | undefined;
	const virtualName = (id: string | undefined) =>
		id?.startsWith(prefix) ? id!.slice(prefix.length) : undefined;
	const relativeName = (id: string) => {
		const absolute = path.resolve(id);
		const relative = path
			.relative(directory, absolute)
			.split(path.sep)
			.join("/");
		return relative.startsWith("../") ? undefined : relative;
	};
	return {
		name: "paraglide-message-delivery-prototype",
		enforce: "pre" as const,
		configureServer(value: ViteDevServer) {
			server = value;
		},
		resolveId(source: string, importer?: string) {
			if (source.startsWith(publicPrefix)) {
				const name = source.slice(publicPrefix.length);
				return Object.hasOwn(files, name) ? prefix + name : null;
			}
			const ownName = virtualName(source);
			if (ownName !== undefined)
				return Object.hasOwn(files, ownName) ? source : null;
			const parent = virtualName(importer);
			let absolute;
			if (source.startsWith(".")) {
				absolute = path.resolve(
					parent !== undefined
						? path.dirname(path.join(directory, parent))
						: path.dirname(importer ?? directory),
					source
				);
			} else if (path.isAbsolute(source)) absolute = source;
			else return null;
			const name = relativeName(absolute);
			if (name !== undefined) {
				if (Object.hasOwn(files, name)) return prefix + name;
				if (!path.extname(name) && Object.hasOwn(files, name + ".js"))
					return prefix + name + ".js";
			}
			if (parent !== undefined && source.startsWith(".")) return absolute;
			return null;
		},
		load(id: string) {
			const name = virtualName(id);
			if (name !== undefined && Object.hasOwn(files, name))
				return {
					code:
						name === "messages.js"
							? files[name]!.replaceAll(
									"'./messages/_index.js'",
									JSON.stringify(publicPrefix + "messages/_index.js")
								)
							: files[name]!,
					map: null,
					moduleSideEffects: false,
				};
			return null;
		},
		api: {
			// Called after a successful compiler publication.
			update(next: Record<string, string>) {
				const changed = [
					...new Set([...Object.keys(files), ...Object.keys(next)]),
				].filter((name) => files[name] !== next[name]);
				files = next;
				if (server) {
					// Invalidate every importer: re-export barrels must not keep stale
					// transformed bindings when a message's exports change.
					const seen = new Set<ModuleNode>();
					const invalidate = (module: ModuleNode | undefined) => {
						if (!module || seen.has(module)) return;
						seen.add(module);
						for (const importer of module.importers) invalidate(importer);
						server!.moduleGraph.invalidateModule(module);
					};
					for (const name of changed)
						invalidate(server.moduleGraph.getModuleById(prefix + name));
					if (changed.length) server.ws.send({ type: "full-reload" });
				}
				return changed;
			},
		},
	};
}

export function createVirtualMessagesPlugins(
	compilerOptions: ParaglidePluginOptions,
	devErrorResponse?: boolean
): Plugin[] {
	let transport: ReturnType<typeof virtualMessages> | undefined;
	let transportDirectory: string | undefined;
	const virtual: Plugin = {
		name: "paraglide-virtual-messages",
		enforce: "pre",
		configureServer(server) {
			viteServer = server;
		},
		async resolveId(source, importer) {
			const direct = transport?.resolveId(source, importer);
			if (direct || !transport || !/(?:^|\/)messages(?:\.js)?$/.test(source))
				return direct;
			// Vite's tsconfigPaths resolver checks file existence before applying
			// a path mapping. Resolve the real declaration through Vite, then
			// map that identity to its virtual implementation.
			const declaration = await this.resolve(
				source.replace(/(?:\.js)?$/, ".d.ts"),
				importer,
				{ skipSelf: true }
			);
			return declaration
				? transport.resolveId(
						declaration.id.replace(/\.d\.ts$/, ".js"),
						importer
					)
				: null;
		},
		load(id) {
			return transport?.load(id);
		},
	};
	let viteServer: import("vite").ViteDevServer | undefined;
	const compiler = createVitePlugin<ParaglidePluginOptions>((options, meta) =>
		unpluginFactory(options, meta, {
			devErrorResponse,
			transformOutput(output, directory) {
				const files = singleMessageDeclaration(output);
				const disk: Record<string, string> = {};
				const implementations: Record<string, string> = {};
				for (const [name, code] of Object.entries(files)) {
					if (
						name.endsWith(".js") &&
						(name === "messages.js" || name.startsWith("messages/"))
					)
						implementations[name] = code;
					else disk[name] = code;
				}
				return {
					output: disk,
					onPublished() {
						if (!transport || transportDirectory !== directory) {
							transport?.api.update({});
							transport = virtualMessages(directory, implementations);
							transportDirectory = directory;
							if (viteServer) transport.configureServer(viteServer);
						} else transport.api.update(implementations);
					},
				};
			},
		})
	);
	return [
		virtual,
		compiler({
			...compilerOptions,
			outputStructure: "message-modules",
			emitTsDeclarations: true,
		}) as Plugin,
	];
}
