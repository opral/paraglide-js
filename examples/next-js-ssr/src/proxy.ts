import { NextRequest, NextResponse } from "next/server";
import { paraglideMiddleware } from "./paraglide/server";

export function proxy(request: NextRequest) {
	return paraglideMiddleware(request, ({ request, locale }) => {
		// Paraglide delocalizes the URL. Restore the locale for Next's route state:
		// public / -> internal /en, public /de/subpage -> internal /de/subpage.
		const url = new URL(request.url);
		url.pathname = `/${locale}${url.pathname === "/" ? "" : url.pathname}`;
		const headers = new Headers(request.headers);
		headers.set("x-paraglide-locale", locale);
		return NextResponse.rewrite(url, { request: { headers } });
	});
}

export const config = {
	matcher: ["/((?!api|_next|.*\\..*).*)"],
};
