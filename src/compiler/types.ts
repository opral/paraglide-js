export type Compiled<Node> = {
	/** The original AST node */
	node: Node;
	/** The code generated to implement the AST node */
	code: string;
};

export type {
	LocalizedString,
	MessageMarkupOption,
	MessageMarkupAttribute,
	MessageMarkupOptions,
	MessageMarkupAttributes,
	MessageMarkupTag,
	MessageMarkupSchema,
	MessageMetadata,
	MessagePart,
	MessageFunction,
	MessageBundleFunction,
} from "./runtime/type-definitions.js";
