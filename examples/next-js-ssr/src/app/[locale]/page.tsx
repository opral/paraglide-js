import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { m } from "@/paraglide/messages";
import { isLocale, localizeHref, type Locale } from "@/paraglide/runtime";

async function greeting(locale: Locale) {
	"use cache";
	// Locale is part of the cache key; English and German cannot share output.
	return m.example_message({ username: "Samuel" }, { locale });
}

async function RequestDetails() {
	// Request-time APIs belong inside Suspense, outside cached functions.
	const locale = (await headers()).get("x-paraglide-locale");
	return <p data-testid="request-locale">Request locale: {locale}</p>;
}

export default async function Home({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	if (!isLocale(locale)) notFound();
	return (
		<>
			<p data-testid="server-message">{await greeting(locale)}</p>
			<Link href={localizeHref("/subpage", { locale })}>go to subpage</Link>
			<Suspense fallback={<p>Loading request...</p>}>
				<RequestDetails />
			</Suspense>
		</>
	);
}
