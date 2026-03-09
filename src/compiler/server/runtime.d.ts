import type { Runtime } from "../runtime/type.ts";

export type Locale = string;

export type ParaglideAsyncLocalStorage = {
	run(store: any, callback: () => any): any;
	getStore(): any;
};

export declare const {
	baseLocale,
	locales,
	strategy,
	routeStrategies,
	cookieName,
	urlPatterns,
	serverAsyncLocalStorage,
	experimentalMiddlewareLocaleSplitting,
	isServer,
	disableAsyncLocalStorage,
	getLocale,
	getTextDirection,
	setLocale,
	getUrlOrigin,
	overwriteGetLocale,
	overwriteSetLocale,
	overwriteGetUrlOrigin,
	overwriteServerAsyncLocalStorage,
	assertIsLocale,
	isLocale,
	localizeHref,
	deLocalizeHref,
	localizeUrl,
	deLocalizeUrl,
	shouldRedirect,
	extractLocaleFromUrl,
	extractLocaleFromRequest,
	extractLocaleFromRequestAsync,
	extractLocaleFromCookie,
	extractLocaleFromHeader,
	extractLocaleFromNavigator,
	withMessageCallTracking,
	trackMessageCall,
	getStrategyForUrl,
	isExcludedByRouteStrategy,
}: Runtime;
