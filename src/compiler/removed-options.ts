/** Reject removed options before config parsing or compilation can ignore them. */
export function assertNoRemovedOptions(options: object): void {
	if (Object.hasOwn(options, "additionalFiles")) {
		throw new Error(
			"additionalFiles was removed in Paraglide JS 3. Remove it from your configuration and manage custom files with your own build tooling outside the generated output directory."
		);
	}
}
