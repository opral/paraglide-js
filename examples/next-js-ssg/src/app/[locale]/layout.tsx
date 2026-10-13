import { notFound } from "next/navigation";
import { isLocale, getTextDirection, locales } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import ClientSideLocaleSwitch from "./ClientSideLocaleSwitch";

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
				{children}
			</body>
		</html>
	);
}
