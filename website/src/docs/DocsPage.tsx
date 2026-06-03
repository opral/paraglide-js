import { useEffect, useState } from "react";
import type { DocsHeading, DocsPageData, DocsSection } from "./data";
import { initMarkdownInteractive } from "../components/markdown-interactive";

const loadedImports = new Set<string>();

export function DocsPage({ data }: { data: DocsPageData }) {
	const headings = data.headings ?? [];
	const [activeId, setActiveId] = useState<string>("");
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [mobileOnThisPageOpen, setMobileOnThisPageOpen] = useState(false);
	const [copied, setCopied] = useState(false);

	const copyMarkdown = async () => {
		try {
			await navigator.clipboard.writeText(data.rawMarkdown);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch (error) {
			console.error("Failed to copy markdown:", error);
		}
	};

	useEffect(() => {
		if (!data.imports || data.imports.length === 0) return;
		data.imports.forEach((url) => {
			if (loadedImports.has(url)) return;
			loadedImports.add(url);
			import(/* @vite-ignore */ url).catch((error) => {
				console.error(`Failed to load web component from ${url}:`, error);
			});
		});
	}, [data.imports]);

	useEffect(() => {
		initMarkdownInteractive();
	}, []);

	useEffect(() => {
		if (headings.length === 0) return;

		const handleScroll = () => {
			const headingElements = headings
				.map((heading) => ({
					id: heading.id,
					el: document.getElementById(heading.id),
				}))
				.filter((heading) => heading.el !== null) as Array<{
				id: string;
				el: HTMLElement;
			}>;

			if (headingElements.length === 0) return;
			let currentId = headingElements[0]!.id;

			for (const { id, el } of headingElements) {
				if (el.getBoundingClientRect().top <= 140) {
					currentId = id;
				} else {
					break;
				}
			}

			setActiveId(currentId);
		};

		handleScroll();
		let ticking = false;
		const onScroll = () => {
			if (ticking) return;
			window.requestAnimationFrame(() => {
				handleScroll();
				ticking = false;
			});
			ticking = true;
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [headings]);

	const copyButton = (
		<button
			type="button"
			onClick={copyMarkdown}
			className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
		>
			{copied ? <CheckIcon /> : <CopyIcon />}
			{copied ? "Copied!" : "Copy markdown"}
		</button>
	);

	const hasH1 = /^<h1[\s>]/i.test(data.markdown.trim());
	const h1Match = hasH1 ? data.markdown.match(/^(<h1[^>]*>.*?<\/h1>)/is) : null;
	const h1Html = h1Match ? (h1Match[1] ?? "") : "";
	const restHtml = h1Match ? data.markdown.slice(h1Match[0]!.length) : data.markdown;

	return (
		<>
			<div className="sticky top-16 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
				<button
					type="button"
					onClick={() => {
						setMobileMenuOpen(!mobileMenuOpen);
						setMobileOnThisPageOpen(false);
					}}
					className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
					aria-controls="docs-mobile-menu"
					aria-expanded={mobileMenuOpen}
				>
					<MenuIcon />
					Menu
				</button>
				<button
					type="button"
					onClick={() => {
						setMobileOnThisPageOpen(!mobileOnThisPageOpen);
						setMobileMenuOpen(false);
					}}
					className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
					aria-controls="docs-mobile-toc"
					aria-expanded={mobileOnThisPageOpen}
				>
					On this page
					<ChevronIcon isOpen={mobileOnThisPageOpen} />
				</button>
			</div>

			{mobileMenuOpen ? (
				<MobileDrawer id="docs-mobile-menu" label="Documentation menu">
					<DocNav
						sections={data.sections}
						currentRoute={data.pagePath}
						onNavigate={() => setMobileMenuOpen(false)}
					/>
				</MobileDrawer>
			) : null}

			{mobileOnThisPageOpen ? (
				<MobileDrawer id="docs-mobile-toc" label="On this page">
					<OnThisPage
						headings={headings}
						activeId={activeId}
						onNavigate={() => setMobileOnThisPageOpen(false)}
					/>
				</MobileDrawer>
			) : null}

			<div className="bg-white">
				<div className="mx-auto max-w-7xl px-4 sm:px-6">
					<div className="flex gap-6">
						<aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 lg:block">
							<div className="h-full overflow-y-auto pb-8 pr-2 pt-5">
								<DocNav sections={data.sections} currentRoute={data.pagePath} />
							</div>
						</aside>

						<section className="min-h-[calc(100vh-4rem)] min-w-0 flex-1 pb-16">
							{hasH1 ? (
								<>
									<div className="flex items-start justify-between gap-4 pt-5">
										<div
											className="marketplace-markdown min-w-0 flex-1 [&>h1]:!mt-0 [&>h1]:!pt-0"
											dangerouslySetInnerHTML={{ __html: h1Html }}
										/>
										{copyButton}
									</div>
									<MarkdownHtml html={restHtml} />
								</>
							) : (
								<>
									<div className="flex justify-end pb-2 pt-5">{copyButton}</div>
									<MarkdownHtml html={data.markdown} />
								</>
							)}

							{data.editUrl ? (
								<div className="mt-12">
									<a
										href={data.editUrl}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
									>
										<EditIcon />
										Edit this page on GitHub
									</a>
								</div>
							) : null}

							<PageNavigation data={data} />
						</section>

						<aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 xl:block">
							<div className="h-full overflow-y-auto pb-8 pl-2 pt-5">
								<OnThisPage headings={headings} activeId={activeId} />
							</div>
						</aside>
					</div>
				</div>
			</div>
		</>
	);
}

function MarkdownHtml({ html }: { html: string }) {
	return (
		<div
			className="marketplace-markdown pb-2.5"
			onMouseDown={(event) => {
				const anchor = (event.target as HTMLElement).closest("a");
				if (anchor?.getAttribute("href")?.startsWith("#")) {
					event.preventDefault();
				}
			}}
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

function DocNav({
	sections,
	currentRoute,
	onNavigate,
}: {
	sections: DocsSection[];
	currentRoute: string;
	onNavigate?: () => void;
}) {
	return (
		<nav aria-label="Documentation" className="flex flex-col gap-1 text-sm text-slate-700">
			{sections.map((section, index) => (
				<div key={section.title} className={index === 0 ? "" : "pt-4"}>
					<p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
						{section.title}
					</p>
					<div className="flex flex-col gap-1">
						{section.pages.map((page) => {
							const isActive = currentRoute === page.route;
							return page.isExternal ? (
								<a
									key={page.route}
									href={page.href}
									target="_blank"
									rel="noreferrer"
									className="flex justify-between rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
									onClick={onNavigate}
								>
									{page.title}
									<ArrowIcon />
								</a>
							) : (
								<a
									key={page.route}
									href={page.href}
									className={`rounded-md px-3 py-2 text-sm transition-colors ${
										isActive
											? "bg-slate-200 font-semibold text-slate-950"
											: "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
									}`}
									onClick={onNavigate}
								>
									{page.title}
								</a>
							);
						})}
					</div>
				</div>
			))}
		</nav>
	);
}

function OnThisPage({
	headings,
	activeId,
	onNavigate,
}: {
	headings: DocsHeading[];
	activeId: string;
	onNavigate?: () => void;
}) {
	if (headings.length === 0) return null;

	return (
		<nav aria-label="On this page" className="text-sm text-slate-700">
			<p className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
				On this page
			</p>
			<div className="flex flex-col">
				{headings.map((heading) => {
					const isActive = heading.id === activeId;
					const indent =
						heading.level === 3
							? "pl-6"
							: heading.level === 2
								? "pl-4"
								: "pl-3";
					return (
						<a
							key={heading.id}
							href={`#${heading.id}`}
							className={`border-l-2 py-1 text-left text-sm transition-colors ${indent} ${
								isActive
									? "border-blue-500 font-medium text-slate-900"
									: "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"
							}`}
							onClick={(event) => {
								event.preventDefault();
								window.history.pushState(null, "", `#${heading.id}`);
								scrollToAnchor(heading.id);
								onNavigate?.();
							}}
						>
							{heading.text}
						</a>
					);
				})}
			</div>
		</nav>
	);
}

function PageNavigation({ data }: { data: DocsPageData }) {
	const previous = data.prevPagePath ? findNavPage(data, data.prevPagePath) : undefined;
	const next = data.nextPagePath ? findNavPage(data, data.nextPagePath) : undefined;

	if (!previous && !next) return null;

	return (
		<div className="mt-12 grid gap-4 border-t border-slate-200 pt-8 sm:grid-cols-2">
			{previous ? (
				<a
					href={previous.route}
					className="rounded-lg border border-slate-200 p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
				>
					<p className="text-xs font-medium uppercase tracking-wide text-slate-600">
						Previous
					</p>
					<p className="mt-1 font-medium text-slate-900">{previous.title}</p>
				</a>
			) : (
				<div />
			)}
			{next ? (
				<a
					href={next.route}
					className="rounded-lg border border-slate-200 p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 sm:text-right"
				>
					<p className="text-xs font-medium uppercase tracking-wide text-slate-600">
						Next
					</p>
					<p className="mt-1 font-medium text-slate-900">{next.title}</p>
				</a>
			) : null}
		</div>
	);
}

function findNavPage(data: DocsPageData, route: string) {
	for (const section of data.sections) {
		const page = section.pages.find((entry) => entry.route === route);
		if (page) return page;
	}
	return undefined;
}

function MobileDrawer({
	children,
	id,
	label,
}: {
	children: React.ReactNode;
	id: string;
	label: string;
}) {
	return (
		<div
			id={id}
			role="region"
			aria-label={label}
			className="fixed bottom-0 left-0 right-0 top-[105px] z-50 overflow-y-auto bg-white lg:hidden"
		>
			<div className="px-4 pb-8 pt-4">{children}</div>
		</div>
	);
}

function scrollToAnchor(anchor: string) {
	const element = document.getElementById(anchor);
	if (element) {
		window.scrollTo({
			top: element.offsetTop - 96,
			behavior: "smooth",
		});
	}
}

function CopyIcon() {
	return (
		<svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" />
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg aria-hidden="true" className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
			<path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
		</svg>
	);
}

function MenuIcon() {
	return (
		<svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
		</svg>
	);
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
	return (
		<svg
			aria-hidden="true"
			className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
		</svg>
	);
}

function ArrowIcon() {
	return (
		<svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-7-7 7 7-7 7" />
		</svg>
	);
}

function EditIcon() {
	return (
		<svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586Z" />
		</svg>
	);
}
