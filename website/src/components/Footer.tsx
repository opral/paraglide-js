import { DISCORD_URL, GITHUB_REPOSITORY, NPM_URL } from "../site";

export function Footer() {
	return (
		<footer className="border-t border-slate-200 bg-slate-50">
			<div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-10 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
				<p>Paraglide JS is MIT licensed and maintained by inlang.</p>
				<div className="flex flex-wrap gap-4">
					<a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer" className="hover:text-slate-950">
						GitHub
					</a>
					<a href={NPM_URL} target="_blank" rel="noreferrer" className="hover:text-slate-950">
						npm
					</a>
					<a href={DISCORD_URL} target="_blank" rel="noreferrer" className="hover:text-slate-950">
						Discord
					</a>
					<a href="https://inlang.com" target="_blank" rel="noreferrer" className="hover:text-slate-950">
						inlang
					</a>
				</div>
			</div>
		</footer>
	);
}
