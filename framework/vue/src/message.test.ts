import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { expect, test } from "vitest";
import { m } from "./paraglide/messages.js";
import { ParaglideMessage, renderMessage } from "./message.js";

test("renders compiled plain messages when parts() is not present", async () => {
	const html = await renderToString(
		createSSRApp(() =>
			h(ParaglideMessage, { message: m.hello, inputs: { name: "Ada" } })
		)
	);

	expect(html).toBe("Hello Ada");
	expect("parts" in m.hello).toBe(false);
});

test("renders compiled markup and exposes options/attributes as records", async () => {
	const html = await renderToString(
		createSSRApp(() =>
			h(ParaglideMessage, {
				message: m.cta,
				inputs: {},
				markup: {
					link: ({ children, options, attributes }) =>
						h(
							"a",
							{
								href: options.to,
								"data-track": attributes.track === true ? "true" : "false",
							},
							children ?? undefined
						),
				},
			})
		)
	);

	expect(html).toBe('<a href="/docs" data-track="true">Read docs</a>');
});

test("renders compiled nested markup", async () => {
	const html = await renderToString(
		createSSRApp(() =>
			h(ParaglideMessage, {
				message: m.nested_cta,
				inputs: {},
				markup: {
					link: ({ children, options }) =>
						h("a", { href: options.to }, children ?? undefined),
					strong: ({ children }) => h("strong", {}, children ?? undefined),
				},
			})
		)
	);

	expect(html).toBe('<a href="/docs"><strong>Read docs</strong></a>');
});

test("enforces markup props at type level", () => {
	if (false) {
		// @ts-expect-error markup renderers are required for markup messages
		renderMessage<typeof m.cta>({ message: m.cta, inputs: {} });
		// @ts-expect-error plain messages do not accept a markup prop
		renderMessage<typeof m.hello>({ message: m.hello, inputs: { name: "Ada" }, markup: { link: () => h("a") } });
	}

	expect(true).toBe(true);
});
