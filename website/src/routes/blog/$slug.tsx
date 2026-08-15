import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	buildBlogPostHead,
	loadBlogPost,
} from "../../blog/data";
import { initMarkdownInteractive } from "../../components/markdown-interactive";

export const Route = createFileRoute("/blog/$slug")({
	loader: async ({ params }) => loadBlogPost(params.slug),
	head: ({ loaderData }) => buildBlogPostHead(loaderData),
	component: BlogPostPage,
});

function BlogPostPage() {
	const post = Route.useLoaderData();
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!post.imports || post.imports.length === 0) return;
		post.imports.forEach((url) => {
			import(/* @vite-ignore */ url).catch((error) => {
				console.error(`Failed to load web component from ${url}:`, error);
			});
		});
	}, [post.imports]);

	useEffect(() => {
		initMarkdownInteractive();
	}, []);

	const copyUrl = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch (error) {
			console.error("Failed to copy URL:", error);
		}
	};

	return (
		<div className="bg-white text-slate-900">
			<header className="border-b border-slate-200 bg-white">
				<div className="mx-auto max-w-4xl px-6 py-16">
					<nav aria-label="Breadcrumb" className="mb-8 flex justify-center">
						<Link
							to="/blog"
							className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
						>
							<BackIcon />
							Blog
						</Link>
					</nav>

					<h1 className="mb-8 text-center text-3xl font-bold text-slate-900 md:text-4xl">
						{post.title}
					</h1>

					{post.authors && post.authors.length > 0 ? (
						<div className="mb-8 flex flex-wrap justify-center gap-6">
							{post.authors.map((author) => (
								<div key={author.name} className="flex items-center gap-3">
									{author.avatar ? (
										<img
											src={author.avatar}
											alt=""
											className="h-10 w-10 rounded-full object-cover"
										/>
									) : null}
									<span className="font-medium text-slate-900">{author.name}</span>
								</div>
							))}
						</div>
					) : null}

					<div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6 text-sm text-slate-500">
						<div className="flex items-center gap-4">
							<span>{post.readingTime} min read</span>
							<button
								type="button"
								onClick={copyUrl}
								className="text-[#3451b2] transition-colors hover:text-[#3a5ccc]"
							>
								{copied ? "Copied!" : "Copy URL"}
							</button>
						</div>
						{post.date ? <time dateTime={post.date}>{formatDate(post.date)}</time> : null}
					</div>
				</div>
			</header>

			<div className="mx-auto max-w-3xl px-6 py-12">
				<article
					className="marketplace-markdown [&>h1:first-child]:hidden"
					dangerouslySetInnerHTML={{ __html: post.html }}
				/>

				{post.prevPost || post.nextPost ? (
					<nav aria-label="Blog post navigation" className="mt-12 grid gap-4 border-t border-slate-200 pt-8 sm:grid-cols-2">
						<div>
							{post.prevPost ? (
								<Link
									to="/blog/$slug"
									params={{ slug: post.prevPost.slug }}
									className="block rounded-lg border border-slate-200 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
								>
									<p className="text-xs font-medium uppercase tracking-wide text-slate-600">
										Previous post
									</p>
									<p className="mt-1 font-medium text-slate-900">
										{post.prevPost.title}
									</p>
								</Link>
							) : null}
						</div>
						<div>
							{post.nextPost ? (
								<Link
									to="/blog/$slug"
									params={{ slug: post.nextPost.slug }}
									className="block rounded-lg border border-slate-200 p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 sm:text-right"
								>
									<p className="text-xs font-medium uppercase tracking-wide text-slate-600">
										Next post
									</p>
									<p className="mt-1 font-medium text-slate-900">
										{post.nextPost.title}
									</p>
								</Link>
							) : null}
						</div>
					</nav>
				) : null}
			</div>
		</div>
	);
}

function BackIcon() {
	return (
		<svg
			aria-hidden="true"
			className="h-4 w-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M19 12H5M12 19l-7-7 7-7" />
		</svg>
	);
}

function formatDate(dateString: string) {
	try {
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
			timeZone: "UTC",
		});
	} catch {
		return dateString;
	}
}
