import { expect, test, vi } from "vitest";

vi.mock("vite", () => {
	throw new Error("The package entry point eagerly imported Vite");
});

test("imports the compiler API without loading the optional Vite peer", async () => {
	const { compile } = await import("./index.js");

	expect(compile).toBeTypeOf("function");
});
