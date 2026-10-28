import { createFileRoute } from "@tanstack/react-router";
import { DocsPage } from "../docs/DocsPage";
import { loadDocsPage } from "../docs/data";
import { buildPageHead } from "../docs/seo";
import { BenchmarkContent } from "../components/BenchmarkExplorer";

export const Route = createFileRoute("/benchmark")({
	loader: () => loadDocsPage("/benchmark"),
	head: ({ loaderData }) => (loaderData ? buildPageHead(loaderData) : {}),
	component: () => (
		<DocsPage
			data={Route.useLoaderData()}
			renderMarkdown={(html) => <BenchmarkContent html={html} />}
		/>
	),
});
