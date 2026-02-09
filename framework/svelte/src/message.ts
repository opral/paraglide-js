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
	children?: string;
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
) => string;

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
	children: string[];
	options: MessageMarkupOptions;
	attributes: MessageMarkupAttributes;
};

export function Message<
	TMessage extends MessageLike<any, any, any>,
>(props: MessageProps<NoInfer<TMessage>> & { message: TMessage }): string {
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
	return renderParts(parts, {
		inputs,
		messageOptions,
		markup: markup as AnyMarkupRenderers | undefined,
	});
}

export const renderMessage = Message;

function renderParts<TInputs, TOptions extends MessageOptions = MessageOptions>(
	parts: MessagePart[],
	args: {
		inputs: TInputs;
		messageOptions?: TOptions;
		markup?: AnyMarkupRenderers;
	}
): string {
	const rootChildren: string[] = [];
	const stack: OpenMarkupFrame[] = [];

	const appendNode = (node: string) => {
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

	return rootChildren.join("");
}

function renderMarkup<TInputs, TOptions extends MessageOptions = MessageOptions>(
	args: {
		name: string;
		children: string[];
		options: MessageMarkupOptions;
		attributes: MessageMarkupAttributes;
		inputs: TInputs;
		messageOptions?: TOptions;
		markup?: AnyMarkupRenderers;
	}
): string {
	const renderer = args.markup?.[args.name];
	const children = args.children.join("");

	if (renderer) {
		return renderer({
			name: args.name,
			children: children.length === 0 ? undefined : children,
			inputs: args.inputs,
			messageOptions: args.messageOptions,
			options: args.options,
			attributes: args.attributes,
		});
	}

	return children;
}
