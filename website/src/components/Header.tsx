import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { GITHUB_REPOSITORY, NPM_URL } from "../site";

const SOCIAL_PROOF = {
	npmWeeklyDownloads: {
		label: "303k weekly downloads",
		title: "303,000 weekly npm downloads",
	},
	githubStars: {
		label: "442 stars",
		title: "442 GitHub stars",
	},
};

export function Header() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	return (
		<header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
			<div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
				<Link to="/" className="flex min-w-0 items-center gap-2 hover:opacity-80">
					<img
						src="https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/assets/paraglideNoBg.png"
						alt=""
						className="h-8 w-8 shrink-0"
					/>
					<span className="truncate text-base font-semibold text-slate-950">
						Paraglide JS
					</span>
				</Link>

				<nav
					aria-label="Primary"
					className="hidden items-center gap-4 text-sm font-medium text-slate-600 sm:flex"
				>
					<Link to="/blog" className="text-slate-950 hover:text-slate-600">
						Blog
					</Link>
					<a
						href={NPM_URL}
						target="_blank"
						rel="noreferrer"
						className="group inline-flex items-center gap-1.5 text-slate-950 hover:text-slate-600"
						title={SOCIAL_PROOF.npmWeeklyDownloads.title}
					>
						<NpmIcon />
						NPM
						<SocialProofMetric>{SOCIAL_PROOF.npmWeeklyDownloads.label}</SocialProofMetric>
					</a>
					<a
						href={GITHUB_REPOSITORY}
						target="_blank"
						rel="noreferrer"
						className="group inline-flex items-center gap-1.5 text-slate-950 hover:text-slate-600"
						title={SOCIAL_PROOF.githubStars.title}
					>
						<GitHubIcon />
						GitHub
						<SocialProofMetric>{SOCIAL_PROOF.githubStars.label}</SocialProofMetric>
					</a>
				</nav>

				<button
					type="button"
					onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
					className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 sm:hidden"
					aria-label="Toggle menu"
					aria-controls="site-mobile-menu"
					aria-expanded={mobileMenuOpen}
				>
					{mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
				</button>
			</div>

			{mobileMenuOpen ? (
				<div
					id="site-mobile-menu"
					className="border-t border-slate-200 bg-white px-4 py-3 sm:hidden"
				>
					<div className="flex flex-col gap-3 text-sm font-medium text-slate-700">
						<Link
							to="/blog"
							className="text-slate-950"
							onClick={() => setMobileMenuOpen(false)}
						>
							Blog
						</Link>
						<a
							href={NPM_URL}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5"
							title={SOCIAL_PROOF.npmWeeklyDownloads.title}
						>
							<NpmIcon />
							NPM
							<SocialProofMetric>{SOCIAL_PROOF.npmWeeklyDownloads.label}</SocialProofMetric>
						</a>
						<a
							href={GITHUB_REPOSITORY}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5"
							title={SOCIAL_PROOF.githubStars.title}
						>
							<GitHubIcon />
							GitHub
							<SocialProofMetric>{SOCIAL_PROOF.githubStars.label}</SocialProofMetric>
						</a>
					</div>
				</div>
			) : null}
		</header>
	);
}

function SocialProofMetric({ children }: { children: string }) {
	return (
		<span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium leading-none text-slate-600 group-hover:bg-slate-200 group-hover:text-slate-700">
			{children}
		</span>
	);
}

function NpmIcon() {
	return (
		<svg
			className="h-4 w-4 shrink-0"
			viewBox="0 0 16 16"
			aria-hidden="true"
		>
			<rect x="1" y="3" width="14" height="10" rx="1" fill="#cb3837" />
			<path d="M3 5h10v6h-2V7H9v4H7V7H5v4H3V5Z" fill="#fff" />
		</svg>
	);
}

function GitHubIcon() {
	return (
		<svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
			<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
		</svg>
	);
}

function MenuIcon() {
	return (
		<svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
		</svg>
	);
}
