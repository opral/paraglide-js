import {
	HeadContent,
	Scripts,
	createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Paraglide JS" },
			{ name: "theme-color", content: "#ffffff" },
			{ name: "robots", content: "index, follow" },
		],
		links: [
			{ rel: "preconnect", href: "https://rsms.me/" },
			{ rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
			{ rel: "stylesheet", href: appCss },
			{
				rel: "icon",
				type: "image/png",
				href: "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/assets/paraglideNoBg.png",
			},
		],
	}),
	shellComponent: RootDocument,
	notFoundComponent: NotFoundPage,
});

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="flex min-h-screen flex-col">
				<Header />
				<main className="flex-1">{children}</main>
				<Footer />
				<Scripts />
			</body>
		</html>
	);
}

function NotFoundPage() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center px-6">
			<div className="text-center">
				<p className="text-6xl font-semibold tracking-tight text-slate-900">404</p>
				<p className="mt-3 text-xl text-slate-600">Not found</p>
				<a
					className="mt-4 inline-block text-sm font-medium text-[#3451b2] transition-colors hover:text-[#3a5ccc]"
					href="/"
				>
					Back to docs
				</a>
			</div>
		</div>
	);
}
