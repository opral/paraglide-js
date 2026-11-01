import { defineConfig } from "vitest/config";

// Unit tests do not need Start's server/client React environments or prerenderer.
export default defineConfig({
	esbuild: { jsx: "automatic" },
});
