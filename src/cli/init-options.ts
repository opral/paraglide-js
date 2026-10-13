export type InitOptions = {
	yes?: boolean;
	nonInteractive?: boolean;
	allowDirty?: boolean;
	project?: string;
	outdir?: string;
	lint?: "none" | "eslint" | "oxlint";
	check?: boolean;
	sherlock?: boolean;
	machineTranslation?: boolean;
};
