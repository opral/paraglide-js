"use client";

import { m } from "@/paraglide/messages";
import { setLocale, type Locale } from "@/paraglide/runtime";

export default function ClientSideLocaleSwitch({ locale }: { locale: Locale }) {
	return (
		<div>
			<p data-testid="client-message">
				{m.example_message({ username: "Client" }, { locale })}
			</p>
			<div>
				<button onClick={() => setLocale("en")}>Switch to 'en'</button>
			</div>
			<div>
				<button onClick={() => setLocale("de")}>Switch to 'de'</button>
			</div>
		</div>
	);
}
