import { createFileRoute } from "@tanstack/react-router";
import { DocsPage } from "../docs/DocsPage";
import { loadDocsPage } from "../docs/data";
import { buildPageHead } from "../docs/seo";

export const Route = createFileRoute("/$")({
	loader: async ({ params }) => loadDocsPage(params._splat || "/"),
	head: ({ loaderData }) => (loaderData ? buildPageHead(loaderData) : {}),
	component: () => {
		const data = Route.useLoaderData();
		if (!data) return null;
		return <DocsPage data={data} />;
	},
});
