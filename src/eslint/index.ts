import type { ESLint } from "eslint";
import { noDynamicMessageAccess } from "./no-dynamic-message-access.js";

/** ESLint plugin for applications using generated Paraglide messages. */
const plugin: ESLint.Plugin = {
	meta: { name: "@inlang/paraglide-js/eslint" },
	rules: { "no-dynamic-message-access": noDynamicMessageAccess },
};

export default plugin;
