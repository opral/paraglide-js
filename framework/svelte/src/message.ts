import type {
	MessageMetadata,
	MessageMarkupAttributes,
	MessageMarkupOptions,
	MessageMarkupSchema,
	MessageMarkupTag,
	MessagePart,
} from "@inlang/paraglide-js";
import type { Snippet } from "svelte";

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

export type NoInfer<T> = [T][T extends any ? 0 : never];

type MarkupRendererBaseProps<TTag extends MessageMarkupTag = MessageMarkupTag> = {
	options: TTag["options"];
	attributes: TTag["attributes"];
};

export type MarkupRendererProps<
	TInputs,
	TOptions extends MessageOptions = MessageOptions,
	TTag extends MessageMarkupTag = MessageMarkupTag,
> = {
	children?: Snippet;
	inputs: TInputs;
	messageOptions?: TOptions;
} & MarkupRendererBaseProps<TTag>;

export type MarkupRenderer<
	TInputs,
	TOptions extends MessageOptions = MessageOptions,
	TTag extends MessageMarkupTag = MessageMarkupTag,
> = Snippet<[MarkupRendererProps<TInputs, TOptions, TTag>]>;

type MarkupRenderersForSchema<
	TInputs,
	TOptions extends MessageOptions,
	TMarkup extends MessageMarkupSchema,
> = {
	[TName in keyof TMarkup & string]: MarkupRenderer<
		TInputs,
		TOptions,
		TMarkup[TName] extends MessageMarkupTag ? TMarkup[TName] : MessageMarkupTag
	>;
};

type MessageBaseProps<TMessage extends MessageLike<any, any, any>> = {
	message: TMessage;
	inputs: MessageInputs<TMessage>;
	options?: MessageRuntimeOptions<TMessage>;
};

export type MessageMarkupProps<TMessage extends MessageLike<any, any, any>> =
	keyof MessageMarkup<TMessage> extends never
		? Record<string, never>
		: MarkupRenderersForSchema<
					MessageInputs<TMessage>,
					MessageRuntimeOptions<TMessage>,
					MessageMarkup<TMessage>
			  >;

export type MessageProps<TMessage extends MessageLike<any, any, any>> =
	MessageBaseProps<TMessage> & MessageMarkupProps<TMessage>;

export type Child<
	TInputs,
	TOptions extends MessageOptions = MessageOptions,
	TTag extends MessageMarkupTag = MessageMarkupTag,
> =
	| string
	| ({
			snippet: MarkupRenderer<TInputs, TOptions, TTag>;
			children: Child<TInputs, TOptions, TTag>[];
	  } & MarkupRendererBaseProps<TTag>);

export type OpenMarkupFrame<
	TInputs,
	TOptions extends MessageOptions = MessageOptions,
	TTag extends MessageMarkupTag = MessageMarkupTag,
> = {
	name: string;
	snippet?: MarkupRenderer<TInputs, TOptions, TTag>;
	children: Child<TInputs, TOptions, TTag>[];
	options: MessageMarkupOptions;
	attributes: MessageMarkupAttributes;
};

export function renderMessage<TMessage extends MessageLike<any, any, any>>(
	props: MessageProps<NoInfer<TMessage>> & { message: TMessage }
): Child<MessageInputs<TMessage>, MessageRuntimeOptions<TMessage>>[] {
	const { message, inputs, options, ...rest } = props;
	const markup = rest as unknown as MessageMarkupProps<TMessage>;
	const callableMessage = message as MessageLike<
		MessageInputs<TMessage>,
		MessageRuntimeOptions<TMessage>,
		MessageMarkup<TMessage>
	>;

	if (typeof callableMessage.parts !== "function") {
		return [callableMessage(inputs, options)];
	}

	const rootChildren: Child<
		MessageInputs<TMessage>,
		MessageRuntimeOptions<TMessage>
	>[] = [];
	const stack: OpenMarkupFrame<
		MessageInputs<TMessage>,
		MessageRuntimeOptions<TMessage>
	>[] = [];
	const parts = callableMessage.parts(inputs, options);

	const appendNode = (
		node: Child<MessageInputs<TMessage>, MessageRuntimeOptions<TMessage>>
	) => {
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
			case "markup-start": {
				const snippet = markup[part.name as keyof typeof markup] as
					| MarkupRenderer<
							MessageInputs<TMessage>,
							MessageRuntimeOptions<TMessage>
					  >
					| undefined;
				stack.push({
					name: part.name,
					snippet,
					children: [],
					options: part.options,
					attributes: part.attributes,
				});
				break;
			}
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
				if (!frame.snippet) {
					for (const child of frame.children) {
						appendNode(child);
					}
					break;
				}
				appendNode({
					snippet: frame.snippet,
					children: frame.children,
					options: frame.options,
					attributes: frame.attributes,
				});
				break;
			}
			case "markup-standalone": {
				const snippet = markup[part.name as keyof typeof markup] as
					| MarkupRenderer<
							MessageInputs<TMessage>,
							MessageRuntimeOptions<TMessage>
					  >
					| undefined;
				if (!snippet) {
					break;
				}
				appendNode({
					snippet,
					children: [],
					options: part.options,
					attributes: part.attributes,
				});
				break;
			}
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
