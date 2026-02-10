import type { SvelteComponentTyped } from "svelte";
import type { MessageLike, MessageProps } from "./message.js";

declare class ParaglideMessage<
	TMessage extends MessageLike<any, any, any> = MessageLike<any, any, any>,
> extends SvelteComponentTyped<MessageProps<TMessage>> {}

export default ParaglideMessage;
