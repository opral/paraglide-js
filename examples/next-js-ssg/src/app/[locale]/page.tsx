import Link from "next/link.js";
import { m } from "@/paraglide/messages";
import { localizeHref } from "@/paraglide/runtime.js";

import { notFound } from "next/navigation";
import { isLocale } from "@/paraglide/runtime";

export default async function Home({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	if (!isLocale(locale)) notFound();
	return (
		<>
			<p>switching locale via routing</p>
			<Link href={localizeHref("/", { locale: "en" })}>EN</Link>
			<br />
			<Link href={localizeHref("/", { locale: "de" })}>DE</Link>
			<p>{m.example_message({ username: "Samuel" }, { locale })}</p>
		</>
	);
}
