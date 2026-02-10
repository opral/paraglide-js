import { render } from "svelte/server";
import { expect, test } from "vitest";
import { m } from "./paraglide/messages.js";
import ParaglideMessage from "./Message.svelte";
import MessageCTATest from "./MessageCTATest.svelte";
import MessageCTAWithComponentTest from "./MessageCTAWithComponentTest.svelte";
import MessageNestedCTATest from "./MessageNestedCTATest.svelte";
import { renderMessage } from "./message.js";

function normalizeSsrBody(body: string): string {
	return body.replace(/<!--[\s\S]*?-->/g, "");
}

test("renders compiled plain messages when parts() is not present", () => {
	const { body } = render(ParaglideMessage, {
		props: { message: m.hello, inputs: { name: "Ada" } },
	});

	expect(normalizeSsrBody(body)).toBe("Hello Ada");
	expect("parts" in m.hello).toBe(false);
});

test("renders compiled markup and exposes options/attributes to snippets", () => {
	const { body } = render(MessageCTATest, {});

	expect(normalizeSsrBody(body)).toBe(
		'<a href="/docs" data-track="true">Read docs</a>'
	);
});

test("renders svelte component in markup", () => {
	const { body } = render(MessageCTAWithComponentTest, {});

	expect(normalizeSsrBody(body)).toBe(
		'<a href="/docs" data-track="true">🔗 Read docs</a>'
	);
});

test("renders compiled nested markup", () => {
	const { body } = render(MessageNestedCTATest, {});

	expect(normalizeSsrBody(body)).toBe(
		'<a href="/docs"><strong>Read docs</strong></a>'
	);
});

test("enforces markup props at type level", () => {
	if (false) {
		// @ts-expect-error markup snippets are required for markup messages
		renderMessage<typeof m.cta>({ message: m.cta, inputs: {} });
		renderMessage<typeof m.hello>({
			message: m.hello,
			inputs: { name: "Ada" },
			// @ts-expect-error plain messages do not accept markup snippets
			link: undefined as any,
		});
	}

	expect(true).toBe(true);
});
