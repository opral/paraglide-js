import { Fragment, type ReactNode } from "react";
import type {
	MessageMetadata,
	MessageMarkupAttributes,
	MessageMarkupOptions,
	MessageMarkupSchema,
	MessageMarkupTag,
	MessagePart,
} from "@inlang/paraglide-js";

export type MessageOptions = {
	locale?: string;
};

export type MessageLike<
	TInputs = Record<string, never>,
	TOptions extends MessageOptions = MessageOptions,
	TMarkup extends MessageMarkupSchema = MessageMarkupSchema,
> = ((
	inputs: TInputs,
	options?: TOptions
) => string) & {
	parts?: (inputs: TInputs, options?: TOptions) => MessagePart[];
} & MessageMetadata<TInputs, TOptions, TMarkup>;

type MessageMetadataOf<TMessage extends MessageLike<any, any, any>> =
	TMessage extends MessageMetadata<
		infer TInputs,
		infer TOptions,
		infer TMarkup
	>
		? {
				inputs: TInputs;
				options: TOptions;
				markup: TMarkup;
			}
		: never;

type MessageInputs<TMessage extends MessageLike<any, any, any>> =
	MessageMetadataOf<TMessage> extends { inputs: infer TInputs }
		? TInputs
		: Parameters<TMessage> extends [infer TInputs, ...unknown[]]
			? TInputs
			: Record<string, never>;

type SignatureOptions<TMessage extends MessageLike<any, any, any>> =
	Parameters<TMessage> extends [unknown, infer TOptions, ...unknown[]]
		? TOptions
		: MessageOptions;

type NormalizeOptions<TOptions> = [TOptions] extends [undefined]
	? MessageOptions
	: NonNullable<TOptions> extends MessageOptions
		? NonNullable<TOptions>
		: MessageOptions;

type MessageRuntimeOptions<TMessage extends MessageLike<any, any, any>> = NormalizeOptions<
	MessageMetadataOf<TMessage> extends { options: infer TOptions }
		? TOptions
		: SignatureOptions<TMessage>
>;

type MessageMarkup<TMessage extends MessageLike<any, any, any>> =
	MessageMetadataOf<TMessage> extends { markup: infer TMarkup }
		? TMarkup extends MessageMarkupSchema
			? TMarkup
			: MessageMarkupSchema
		: MessageMarkupSchema;

type NoInfer<T> = [T][T extends any ? 0 : never];

export type MarkupRendererProps<
	TInputs,
	TOptions extends MessageOptions = MessageOptions,
	TTag extends MessageMarkupTag = MessageMarkupTag,
	TName extends string = string,
> = {
	name: TName;
	children?: ReactNode;
	inputs: TInputs;
	messageOptions?: TOptions;
	options: TTag["options"];
	attributes: TTag["attributes"];
};

export type MarkupRenderer<
	TInputs,
	TOptions extends MessageOptions = MessageOptions,
	TTag extends MessageMarkupTag = MessageMarkupTag,
	TName extends string = string,
> = (
	props: MarkupRendererProps<TInputs, TOptions, TTag, TName>
) => ReactNode;

type MarkupRenderersForSchema<
	TInputs,
	TOptions extends MessageOptions,
	TMarkup extends MessageMarkupSchema,
> = {
	[TName in keyof TMarkup & string]: MarkupRenderer<
		TInputs,
		TOptions,
		TMarkup[TName] extends MessageMarkupTag ? TMarkup[TName] : MessageMarkupTag,
		TName
	>;
};

type AnyMarkupRenderer = MarkupRenderer<
	unknown,
	MessageOptions,
	MessageMarkupTag,
	string
>;

type AnyMarkupRenderers = Partial<Record<string, AnyMarkupRenderer>>;

type MessageBaseProps<TMessage extends MessageLike<any, any, any>> = {
	message: TMessage;
	inputs: MessageInputs<TMessage>;
	options?: MessageRuntimeOptions<TMessage>;
};

type MessageMarkupProps<TMessage extends MessageLike<any, any, any>> =
	keyof MessageMarkup<TMessage> extends never
		? {
				markup?: never;
			}
		: {
				markup: MarkupRenderersForSchema<
					MessageInputs<TMessage>,
					MessageRuntimeOptions<TMessage>,
					MessageMarkup<TMessage>
				>;
			};

export type MessageProps<TMessage extends MessageLike<any, any, any>> =
	MessageBaseProps<TMessage> & MessageMarkupProps<TMessage>;

type OpenMarkupFrame = {
	name: string;
	children: ReactNode[];
	options: MessageMarkupOptions;
	attributes: MessageMarkupAttributes;
};

/**
 * React adapter for Paraglide messages with markup.
 *
 * Uses `message.parts()` when available and falls back to `message()` for plain
 * messages without markup.
 */
export function Message<
	TMessage extends MessageLike<any, any, any>,
>(props: MessageProps<NoInfer<TMessage>> & { message: TMessage }): ReactNode {
	const { message, inputs, options: messageOptions } = props;
	const markup = (props as { markup?: AnyMarkupRenderers }).markup;
	const callableMessage = message as MessageLike<
		MessageInputs<TMessage>,
		MessageRuntimeOptions<TMessage>,
		MessageMarkup<TMessage>
	>;

	if (typeof callableMessage.parts !== "function") {
		return callableMessage(inputs, messageOptions);
	}

	const parts = callableMessage.parts(inputs, messageOptions);
	const nodes = renderParts(parts, {
		inputs,
		messageOptions,
		markup: markup as AnyMarkupRenderers | undefined,
	});

	return toChildren(nodes);
}

function renderParts<TInputs, TOptions extends MessageOptions = MessageOptions>(
	parts: MessagePart[],
	args: {
		inputs: TInputs;
		messageOptions?: TOptions;
		markup?: AnyMarkupRenderers;
	}
): ReactNode[] {
	const rootChildren: ReactNode[] = [];
	const stack: OpenMarkupFrame[] = [];

	const appendNode = (node: ReactNode) => {
		const target = stack[stack.length - 1];
		if (target) {
			target.children.push(node);
		} else {
			rootChildren.push(node);
		}
	};

	for (const part of parts) {
		switch (part.type) {
			case "text":
				appendNode(part.value);
				break;
			case "markup-start":
				stack.push({
					name: part.name,
					children: [],
					options: part.options,
					attributes: part.attributes,
				});
				break;
			case "markup-end": {
				const frame = stack.pop();
				if (!frame) {
					throw new Error(`Unexpected closing markup "${part.name}"`);
				}
				if (frame.name !== part.name) {
					throw new Error(
						`Mismatched markup. Expected closing "${frame.name}" but received "${part.name}"`
					);
				}

				appendNode(
					renderMarkup({
						name: frame.name,
						children: frame.children,
						options: frame.options,
						attributes: frame.attributes,
						...args,
					})
				);
				break;
			}
			case "markup-standalone":
				appendNode(
					renderMarkup({
						name: part.name,
						children: [],
						options: part.options,
						attributes: part.attributes,
						...args,
					})
				);
				break;
		}
	}

	if (stack.length > 0) {
		const stillOpen = stack[stack.length - 1];
		if (stillOpen) {
			throw new Error(`Unclosed markup "${stillOpen.name}"`);
		}
	}

	return rootChildren;
}

function renderMarkup<TInputs, TOptions extends MessageOptions = MessageOptions>(
	args: {
		name: string;
		children: ReactNode[];
		options: MessageMarkupOptions;
		attributes: MessageMarkupAttributes;
		inputs: TInputs;
		messageOptions?: TOptions;
		markup?: AnyMarkupRenderers;
	}
): ReactNode {
	const renderer = args.markup?.[args.name];
	const children = toChildren(args.children);

	if (renderer) {
		return renderer({
			name: args.name,
			children: children === null ? undefined : children,
			inputs: args.inputs,
			messageOptions: args.messageOptions,
			options: args.options,
			attributes: args.attributes,
		});
	}

	return children;
}

function toChildren(nodes: ReactNode[]): ReactNode {
	if (nodes.length === 0) {
		return null;
	}
	if (nodes.length === 1) {
		return nodes[0] ?? null;
	}
	return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}
