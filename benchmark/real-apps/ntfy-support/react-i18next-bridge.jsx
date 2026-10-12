import * as React from "react";
import { useMemo, useSyncExternalStore } from "react";
import {
	localeSnapshot,
	subscribeLocale,
	translateKey,
	default as i18n,
} from "./i18next-bridge.js";
import { transMessages } from "./trans-messages.js";
import { callTranslation, prepareMessageInputs } from "./translation-inputs.js";

export function I18nextProvider({ children }) {
	return children;
}

export function useTranslation() {
	const locale = useSyncExternalStore(subscribeLocale, localeSnapshot, () => "en");
	const t = useMemo(() => (key, options) => translateKey(key, options), [locale]);
	return { t, i18n, ready: true };
}

function renderParts(parts, components = {}) {
	const root = [];
	const frames = [{ name: null, children: root }];
	let key = 0;
	const componentAt = (name) =>
		Array.isArray(components)
			? components[Number(name)]
			: components[name];
	const renderFrame = (frame) => {
		const custom = componentAt(frame.name);
		if (React.isValidElement(custom)) {
			return React.cloneElement(custom, { key: `ntfy-trans-${key++}` }, frame.children);
		}
		if (["br", "strong", "b", "em", "i", "code", "span"].includes(frame.name)) {
			return React.createElement(frame.name, { key: `ntfy-trans-${key++}` }, frame.children);
		}
		return frame.children;
	};
	for (const part of parts) {
		if (part.type === "text") {
			frames.at(-1).children.push(part.value);
		} else if (part.type === "markup-start") {
			frames.push({ name: part.name, children: [] });
		} else if (part.type === "markup-end") {
			if (frames.length > 1) frames.at(-2).children.push(renderFrame(frames.pop()));
		} else if (part.type === "markup-standalone") {
			const custom = componentAt(part.name);
			if (React.isValidElement(custom)) {
				frames.at(-1).children.push(
					React.cloneElement(custom, { key: `ntfy-trans-${key++}` }),
				);
			} else if (["br"].includes(part.name)) {
				frames.at(-1).children.push(
					React.createElement(part.name, { key: `ntfy-trans-${key++}` }),
				);
			}
		}
	}
	while (frames.length > 1) frames.at(-2).children.push(renderFrame(frames.pop()));
	return root;
}

export function Trans({ i18nKey, components, values, count, children }) {
	useTranslation();
	const fn = transMessages[i18nKey];
	if (!fn) return children ?? i18nKey;
	const inputs = { ...(values ?? {}) };
	if (count !== undefined) inputs.count = count;
	const prepared = prepareMessageInputs(i18nKey, inputs);
	if (fn.parts) return renderParts(fn.parts(prepared), components);
	return callTranslation(i18nKey, fn, inputs);
}

export const withTranslation = () => (Component) => {
	function TranslatedComponent(props) {
		const { t, i18n: instance } = useTranslation();
		return React.createElement(Component, { ...props, t, i18n: instance });
	}
	TranslatedComponent.displayName = `withTranslation(${Component.displayName ?? Component.name ?? "Component"})`;
	return TranslatedComponent;
};
