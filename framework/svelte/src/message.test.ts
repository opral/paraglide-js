import { render } from "svelte/server";
import { expect, test } from "vitest";
import { m } from "./paraglide/messages.js";
import Message from "./Message.svelte";
import { renderMessage } from "./message.js";

function normalizeSsrBody(body: string): string {
	return body.replace(/<!--[\s\S]*?-->/g, "");
}

test("renders compiled plain messages when parts() is not present", () => {
	const { body } = render(Message, {
		props: { message: m.hello, inputs: { name: "Ada" } },
	});

	expect(normalizeSsrBody(body)).toBe("Hello Ada");
	expect("parts" in m.hello).toBe(false);
});

test("renders compiled markup and exposes options/attributes as records", () => {
	const { body } = render(Message, {
		props: {
			message: m.cta,
			inputs: {},
			markup: {
				link: (props: {
					children?: string;
					options: { to: string };
					attributes: { track?: true };
				}) =>
					`<a href="${props.options.to}" data-track="${props.attributes.track === true ? "true" : "false"}">${props.children ?? ""}</a>`,
			},
		},
	});

	expect(normalizeSsrBody(body)).toBe(
		'<a href="/docs" data-track="true">Read docs</a>'
	);
});

test("renders compiled nested markup", () => {
	const { body } = render(Message, {
		props: {
			message: m.nested_cta,
			inputs: {},
			markup: {
				link: (props: { children?: string; options: { to: string } }) =>
					`<a href="${props.options.to}">${props.children ?? ""}</a>`,
				strong: (props: { children?: string }) =>
					`<strong>${props.children ?? ""}</strong>`,
			},
		},
	});

	expect(normalizeSsrBody(body)).toBe(
		'<a href="/docs"><strong>Read docs</strong></a>'
	);
});

test("enforces markup props at type level", () => {
	if (false) {
		// @ts-expect-error markup renderers are required for markup messages
		renderMessage<typeof m.cta>({ message: m.cta, inputs: {} });
		// @ts-expect-error plain messages do not accept a markup prop
		renderMessage<typeof m.hello>({ message: m.hello, inputs: { name: "Ada" }, markup: { link: () => "" } });
	}

	expect(true).toBe(true);
});
