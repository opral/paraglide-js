"use client";

import Link from "next/link";
import { m } from "@/paraglide/messages";
import { localizeHref, setLocale, type Locale } from "@/paraglide/runtime";

export default function ClientSideLocaleSwitch({ locale }: { locale: Locale }) {
	return (
		<div>
			<p data-testid="client-message">
				{m.example_message({ username: "Client" }, { locale })}
			</p>
			<Link href={localizeHref("/", { locale: "en" })}>Navigate to 'en'</Link>{" "}
			<Link href={localizeHref("/", { locale: "de" })}>Navigate to 'de'</Link>
			<div>
				<button onClick={() => setLocale("en")}>Switch to 'en'</button>
			</div>
			<div>
				<button onClick={() => setLocale("de")}>Switch to 'de'</button>
			</div>
		</div>
	);
}
