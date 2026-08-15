import { Link, createFileRoute } from "@tanstack/react-router";
import { buildBlogIndexHead, loadBlogIndex } from "../../blog/data";
import type { BlogAuthor } from "../../blog/data";

export const Route = createFileRoute("/blog/")({
	loader: loadBlogIndex,
	head: buildBlogIndexHead,
	component: BlogIndexPage,
});

function BlogIndexPage() {
	const { posts } = Route.useLoaderData();

	return (
		<div className="bg-white text-slate-900">
			<div className="mx-auto max-w-3xl px-6 py-16">
				<h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900">
					Blog
				</h1>
				<p className="mb-12 text-lg leading-8 text-slate-600">
					Updates, technical notes, and implementation guides for Paraglide JS.
				</p>

				<div className="flex flex-col gap-6">
					{posts.map((post) => (
						<Link
							key={post.slug}
							to="/blog/$slug"
							params={{ slug: post.slug }}
							className="-mx-6 block rounded-xl p-6 transition-colors hover:bg-slate-50"
						>
							<article className="flex gap-6">
								{post.ogImage ? (
									<div className="hidden h-24 w-40 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:block">
										<img
											src={post.ogImage}
											alt=""
											className="h-full w-full object-cover"
										/>
									</div>
								) : null}
								<div className="min-w-0 flex-1">
									<h2 className="text-xl font-semibold text-slate-900">
										{post.title}
									</h2>
									<p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
										{post.description}
									</p>
									<div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
										<Authors authors={post.authors} />
										{post.date ? (
											<>
												<span className="text-slate-300">.</span>
												<time dateTime={post.date}>{formatDate(post.date)}</time>
											</>
										) : null}
									</div>
								</div>
							</article>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}

function Authors({ authors }: { authors?: BlogAuthor[] }) {
	if (!authors || authors.length === 0) return null;
	return (
		<>
			{authors.map((author) => (
				<span key={author.name} className="inline-flex items-center gap-2">
					{author.avatar ? (
						<img
							src={author.avatar}
							alt=""
							className="h-5 w-5 rounded-full object-cover"
						/>
					) : null}
					<span>{author.name}</span>
				</span>
			))}
		</>
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
