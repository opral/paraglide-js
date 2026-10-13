import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale, getTextDirection, locales } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import ClientSideLocaleSwitch from "./ClientSideLocaleSwitch";

// Cache Components needs known root parameters to prerender the locale shell.
export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	if (!isLocale(locale)) notFound();
	return (
		<html lang={locale} dir={getTextDirection(locale)}>
			<body>
				<p>{m.programmatic_locale_switching_info({}, { locale })}</p>
				<ClientSideLocaleSwitch locale={locale} />
				<hr />
				<Suspense fallback={<p>Loading page...</p>}>{children}</Suspense>
			</body>
		</html>
	);
}
