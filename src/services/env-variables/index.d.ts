/**
 * Avoiding TypeScript errors before the `createIndexFile` script
 * is invoked by defining the type ahead of time.
 */

/**
 * Env variables that are available at runtime.
 */
export declare const ENV_VARIABLES: {
	/**
	 * The Package version from package.json
	 *
	 * This value is inlined by vite during build to avoid having to read the package.json
	 * at runtime
	 */
	PARJS_PACKAGE_VERSION: string;
};
