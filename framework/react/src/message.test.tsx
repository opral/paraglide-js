import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { m } from "./paraglide/messages.js";
import { Message } from "./message.js";

test("renders compiled plain messages when parts() is not present", () => {
	const html = renderToStaticMarkup(
		<Message message={m.hello} inputs={{ name: "Ada" }} />
	);

	expect(html).toBe("Hello Ada");
	expect("parts" in m.hello).toBe(false);
});

test("renders compiled markup and exposes options/attributes as records", () => {
	const html = renderToStaticMarkup(
		<Message
			message={m.cta}
			inputs={{}}
			markup={{
				link: ({ children, options, attributes }) => (
					<a
						href={options.to}
						data-track={attributes.track === true ? "true" : "false"}
					>
						{children}
					</a>
				),
			}}
		/>
	);

	expect(html).toBe('<a href="/docs" data-track="true">Read docs</a>');
});

test("renders compiled nested markup", () => {
	const html = renderToStaticMarkup(
		<Message
			message={m.nested_cta}
			inputs={{}}
			markup={{
				link: ({ children, options }) => <a href={options.to}>{children}</a>,
				strong: ({ children }) => <strong>{children}</strong>,
			}}
		/>
	);

	expect(html).toBe('<a href="/docs"><strong>Read docs</strong></a>');
});

test("enforces markup props at type level", () => {
	if (false) {
		// @ts-expect-error markup renderers are required for markup messages
		Message<typeof m.cta>({ message: m.cta, inputs: {} });
		// @ts-expect-error plain messages do not accept a markup prop
		Message<typeof m.hello>({ message: m.hello, inputs: { name: "Ada" }, markup: { link: () => null } });
	}

	expect(true).toBe(true);
});
