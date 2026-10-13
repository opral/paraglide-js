import Link from "next/link";
import { notFound } from "next/navigation";
import { m } from "@/paraglide/messages";
import { isLocale, localizeHref } from "@/paraglide/runtime";

export default async function Subpage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	if (!isLocale(locale)) notFound();
	return (
		<>
			<p data-testid="server-message">{m.subpage({}, { locale })}</p>
			<Link href={localizeHref("/", { locale })}>go to home</Link>
		</>
	);
}
