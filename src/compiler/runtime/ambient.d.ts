/**
 * Declared globablly to write the runtime functions.
 */
export declare global {
	/**
	 * Locale used by the variable strategy.
	 */
	let _locale: string;
	type Locale = import("./type-definitions.js").Locale;
	let pathToRegexp: {
		match: (path: string) => (pathname: string) => any;
		compile: (path: string) => (params: any) => string;
	};
}
