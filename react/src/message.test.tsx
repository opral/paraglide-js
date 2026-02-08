import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { type MessagePart } from "@inlang/paraglide-js";
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

test("throws on missing markup renderer by default", () => {
	const message = Object.assign(() => "Hello world", {
		parts: () =>
			[
				{ type: "markup-start", name: "b", options: {}, attributes: {} },
				{ type: "text", value: "Hello" },
				{ type: "markup-end", name: "b", options: {}, attributes: {} },
			] as MessagePart[],
	});

	expect(() =>
		renderToStaticMarkup(<Message message={message} inputs={{}} />)
	).toThrowError('Missing renderer for markup "b"');
});

test("can unwrap missing markup renderers", () => {
	const message = Object.assign(() => "Hello world", {
		parts: () =>
			[
				{ type: "markup-start", name: "b", options: {}, attributes: {} },
				{ type: "text", value: "Hello" },
				{ type: "markup-end", name: "b", options: {}, attributes: {} },
			] as MessagePart[],
	});

	const html = renderToStaticMarkup(
		<Message message={message} inputs={{}} missingMarkup="unwrap" />
	);

	expect(html).toBe("Hello");
});
