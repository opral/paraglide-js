## ShouldRedirectClientInput

Defined in: [runtime/should-redirect.js:14](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

### Properties

#### locale?

> `optional` **locale**: `any`

Defined in: [runtime/should-redirect.js:17](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

#### request?

> `optional` **request**: `undefined`

Defined in: [runtime/should-redirect.js:15](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

#### url?

> `optional` **url**: `string` \| `URL`

Defined in: [runtime/should-redirect.js:16](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

***

## ShouldRedirectResult

Defined in: [runtime/should-redirect.js:21](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

### Properties

#### locale

> **locale**: `any`

Defined in: [runtime/should-redirect.js:23](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

#### redirectUrl

> **redirectUrl**: `undefined` \| `URL`

Defined in: [runtime/should-redirect.js:24](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

Destination URL when a redirect is required.

#### shouldRedirect

> **shouldRedirect**: `boolean`

Defined in: [runtime/should-redirect.js:22](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

Indicates whether the consumer should perform a redirect.

***

## ShouldRedirectServerInput

Defined in: [runtime/should-redirect.js:9](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

### Properties

#### locale?

> `optional` **locale**: `any`

Defined in: [runtime/should-redirect.js:12](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

#### request

> **request**: `Request`

Defined in: [runtime/should-redirect.js:10](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

#### url?

> `optional` **url**: `string` \| `URL`

Defined in: [runtime/should-redirect.js:11](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

***

## CustomClientStrategyHandler

> **CustomClientStrategyHandler**\<\> = `object`

Defined in: [runtime/strategy.js:22](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/strategy.js)

### Type Parameters

### Type Declaration

#### getLocale()

> **getLocale**: () => `Promise`\<`string` \| `undefined`\> \| `string` \| `undefined`

##### Returns

`Promise`\<`string` \| `undefined`\> \| `string` \| `undefined`

#### setLocale()

> **setLocale**: (`locale`) => `Promise`\<`void`\> \| `void`

##### Parameters

###### locale

`string`

##### Returns

`Promise`\<`void`\> \| `void`

***

## CustomServerStrategyHandler

> **CustomServerStrategyHandler**\<\> = `object`

Defined in: [runtime/strategy.js:18](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/strategy.js)

### Type Parameters

### Type Declaration

#### getLocale()

> **getLocale**: (`request?`) => `Promise`\<`string` \| `undefined`\> \| `string` \| `undefined`

##### Parameters

###### request?

`Request`

##### Returns

`Promise`\<`string` \| `undefined`\> \| `string` \| `undefined`

***

## Locale

> **Locale** = `any`

Defined in: [runtime/ambient.d.ts:10](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/ambient.d.ts)

***

## ParaglideAsyncLocalStorage

> **ParaglideAsyncLocalStorage**\<\> = `object`

Defined in: [runtime/variables.js:133](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

### Type Parameters

### Type Declaration

#### run()

> **run**: (`store`, `cb`) => `any`

##### Parameters

###### store

###### locale?

[`Locale`](#locale-3)

###### messageCalls?

`Set`\<`string`\>

###### origin?

`string`

###### cb

`any`

##### Returns

`any`

#### getStore()

> **getStore**(): `undefined` \| \{ `locale?`: [`Locale`](#locale-3); `messageCalls?`: `Set`\<`string`\>; `origin?`: `string`; \}

##### Returns

`undefined` \| \{ `locale?`: [`Locale`](#locale-3); `messageCalls?`: `Set`\<`string`\>; `origin?`: `string`; \}

***

## SetLocaleFn()

> **SetLocaleFn**\<\> = (`newLocale`, `options?`) => `void` \| `Promise`\<`void`\>

Defined in: [runtime/set-locale.js:35](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/set-locale.js)

### Type Parameters

### Parameters

#### newLocale

[`Locale`](#locale-3)

#### options?

##### reload?

`boolean`

### Returns

`void` \| `Promise`\<`void`\>

***

## ShouldRedirectInput

> **ShouldRedirectInput**\<\> = [`ShouldRedirectServerInput`](#shouldredirectserverinput) \| [`ShouldRedirectClientInput`](#shouldredirectclientinput)

Defined in: [runtime/should-redirect.js:19](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

### Type Parameters

***

## baseLocale

> `const` **baseLocale**: `"en"` = `"en"`

Defined in: [runtime/variables.js:9](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

The project's base locale.

### Example

```ts
if (locale === baseLocale) {
    // do something
  }
```

***

## cookieMaxAge

> `const` **cookieMaxAge**: `number`

Defined in: [runtime/variables.js:25](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

***

## cookieName

> `const` **cookieName**: `string` = `"<cookie-name>"`

Defined in: [runtime/variables.js:22](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

***

## disableAsyncLocalStorage

> `const` **disableAsyncLocalStorage**: `false` = `false`

Defined in: [runtime/variables.js:146](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

***

## experimentalMiddlewareLocaleSplitting

> `const` **experimentalMiddlewareLocaleSplitting**: `false` = `false`

Defined in: [runtime/variables.js:148](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

***

## experimentalStaticLocale

> `const` **experimentalStaticLocale**: `any` = `undefined`

Defined in: [runtime/variables.js:154](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

***

## isServer

> `const` **isServer**: `boolean`

Defined in: [runtime/variables.js:150](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

***

## locales

> `const` **locales**: readonly \[`"en"`, `"de"`\]

Defined in: [runtime/variables.js:19](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

The project's locales that have been specified in the settings.

### Example

```ts
if (locales.includes(userSelectedLocale) === false) {
    throw new Error('Locale is not available');
  }
```

***

## routeStrategies

> `const` **routeStrategies**: `object`[] = `[]`

Defined in: [runtime/variables.js:49](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

Route-level strategy overrides.

`match` uses URLPattern syntax.

### Type Declaration

#### exclude?

> `optional` **exclude**: `boolean`

#### match

> **match**: `string`

#### strategy?

> `optional` **strategy**: (`` `custom-${string}` `` \| `"cookie"` \| `"baseLocale"` \| `"globalVariable"` \| `"url"` \| `"preferredLanguage"` \| `"localStorage"`)[]

***

## serverAsyncLocalStorage

> **serverAsyncLocalStorage**: `undefined` \| [`ParaglideAsyncLocalStorage`](#paraglideasynclocalstorage) = `undefined`

Defined in: [runtime/variables.js:144](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

Server side async local storage that is set by `serverMiddleware()`.

The variable is used to retrieve the locale and origin in a server-side
rendering context without effecting other requests.

***

## strategy

> `const` **strategy**: (`` `custom-${string}` `` \| `"cookie"` \| `"baseLocale"` \| `"globalVariable"` \| `"url"` \| `"preferredLanguage"` \| `"localStorage"`)[]

Defined in: [runtime/variables.js:36](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

***

## urlPatterns

> `const` **urlPatterns**: `object`[] = `[]`

Defined in: [runtime/variables.js:56](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

The used URL patterns.

### Type Declaration

#### localized

> **localized**: \[`any`, `string`\][]

#### pattern

> **pattern**: `string`

***

## assertIsLocale()

> **assertIsLocale**(`input`): `any`

Defined in: [runtime/assert-is-locale.js:10](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/assert-is-locale.js)

Asserts that the input is a locale.

### Parameters

#### input

`any`

The input to check.

### Returns

`any`

The input if it is a locale.

### Throws

If the input is not a locale.

***

## defineCustomClientStrategy()

> **defineCustomClientStrategy**(`strategy`, `handler`): `void`

Defined in: [runtime/strategy.js:73](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/strategy.js)

Defines a custom strategy that is executed on the client.

### Parameters

#### strategy

`any`

The name of the custom strategy to define. Must follow the pattern custom-name with alphanumeric characters, hyphens, or underscores.

#### handler

[`CustomClientStrategyHandler`](#customclientstrategyhandler)

The handler for the custom strategy, which should implement the
methods getLocale and setLocale.

### Returns

`void`

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#write-your-own-strategy

***

## defineCustomServerStrategy()

> **defineCustomServerStrategy**(`strategy`, `handler`): `void`

Defined in: [runtime/strategy.js:53](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/strategy.js)

Defines a custom strategy that is executed on the server.

### Parameters

#### strategy

`any`

The name of the custom strategy to define. Must follow the pattern custom-name with alphanumeric characters, hyphens, or underscores.

#### handler

[`CustomServerStrategyHandler`](#customserverstrategyhandler)

The handler for the custom strategy, which should implement
the method getLocale.

### Returns

`void`

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#write-your-own-strategy

***

## deLocalizeHref()

> **deLocalizeHref**(`href`): `string`

Defined in: [runtime/localize-href.js:110](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/localize-href.js)

High-level URL de-localization function optimized for client-side UI usage.

This is a convenience wrapper around `deLocalizeUrl()` that provides features
needed in the UI:

- Accepts relative paths (e.g., "/de/about")
- Returns relative paths when possible
- Handles string input/output instead of URL objects

### Parameters

#### href

`string`

The href to de-localize (can be relative or absolute)

### Returns

`string`

The de-localized href, relative if input was relative

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing

### Example

```typescript
// In a React/Vue/Svelte component
const LocaleSwitcher = ({ href }) => {
  // Remove locale prefix before switching
  const baseHref = deLocalizeHref(href);
  return locales.map(locale =>
    <a href={localizeHref(baseHref, { locale })}>
      Switch to {locale}
    </a>
  );
};

// Examples:
deLocalizeHref("/de/about")  // => "/about"
deLocalizeHref("/fr/store")  // => "/store"

// Cross-origin links remain absolute
deLocalizeHref("https://example.com/de/about")
// => "https://example.com/about"
```

For server-side URL de-localization (e.g., in middleware), use `deLocalizeUrl()`
which provides more precise control over URL handling.

***

## deLocalizeUrl()

> **deLocalizeUrl**(`url`): `URL`

Defined in: [runtime/localize-url.js:188](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/localize-url.js)

Low-level URL de-localization function, primarily used in server contexts.

This function is designed for server-side usage where you need precise control
over URL de-localization, such as in middleware or request handlers. It works with
URL objects and always returns absolute URLs.

For client-side UI components, use `deLocalizeHref()` instead, which provides
a more convenient API with relative paths.

### Parameters

#### url

The URL to de-localize. If string, must be absolute.

`string` | `URL`

### Returns

`URL`

The de-localized URL, always absolute

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing

### Examples

```typescript
// Server middleware example
app.use((req, res, next) => {
  const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  const baseUrl = deLocalizeUrl(url);

  // Store the base URL for later use
  req.baseUrl = baseUrl;
  next();
});
```

```typescript
// Using with URL patterns
const url = new URL("https://example.com/de/about");
deLocalizeUrl(url); // => URL("https://example.com/about")

// Using with domain-based localization
const url = new URL("https://de.example.com/store");
deLocalizeUrl(url); // => URL("https://example.com/store")
```

***

## extractLocaleFromCookie()

> **extractLocaleFromCookie**(): `undefined` \| `string`

Defined in: [runtime/extract-locale-from-cookie.js:12](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/extract-locale-from-cookie.js)

Extracts a cookie from the document.

Will return undefined if the document is not available or if the cookie is not set.
The `document` object is not available in server-side rendering, so this function should not be called in that context.

### Returns

`undefined` \| `string`

***

## extractLocaleFromHeader()

> **extractLocaleFromHeader**(`request`): `any`

Defined in: [runtime/extract-locale-from-header.js:12](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/extract-locale-from-header.js)

### Parameters

#### request

`Request`

### Returns

`any`

***

## extractLocaleFromNavigator()

> **extractLocaleFromNavigator**(): `any`

Defined in: [runtime/extract-locale-from-navigator.js:12](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/extract-locale-from-navigator.js)

### Returns

`any`

***

## extractLocaleFromRequest()

> **extractLocaleFromRequest**(`request`): `any`

Defined in: [runtime/extract-locale-from-request.js:34](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/extract-locale-from-request.js)

Extracts a locale from a request.

Use the function on the server to extract the locale
from a request.

The function goes through the strategies in the order
they are defined. If a strategy returns an invalid locale,
it will fall back to the next strategy.

Note: Custom server strategies are not supported in this synchronous version.
Use `extractLocaleFromRequestAsync` if you need custom server strategies with async getLocale methods.

### Parameters

#### request

`Request`

### Returns

`any`

### Example

```ts
const locale = extractLocaleFromRequest(request);
```

***

## extractLocaleFromRequestAsync()

> **extractLocaleFromRequestAsync**(`request`): `Promise`\<`any`\>

Defined in: [runtime/extract-locale-from-request-async.js:36](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/extract-locale-from-request-async.js)

Asynchronously extracts a locale from a request.

This function supports async custom server strategies, unlike the synchronous
`extractLocaleFromRequest`. Use this function when you have custom server strategies
that need to perform asynchronous operations (like database calls) in their getLocale method.

The function first processes any custom server strategies asynchronously, then falls back
to the synchronous `extractLocaleFromRequest` for all other strategies.

### Parameters

#### request

`Request`

### Returns

`Promise`\<`any`\>

### See

[https://github.com/opral/inlang-paraglide-js/issues/527#issuecomment-2978151022](https://github.com/opral/inlang-paraglide-js/issues/527#issuecomment-2978151022)

### Examples

```ts
// Basic usage
  const locale = await extractLocaleFromRequestAsync(request);
```

```ts
// With custom async server strategy
  defineCustomServerStrategy("custom-database", {
    getLocale: async (request) => {
      const userId = extractUserIdFromRequest(request);
      return await getUserLocaleFromDatabase(userId);
    }
  });

  const locale = await extractLocaleFromRequestAsync(request);
```

***

## extractLocaleFromUrl()

> **extractLocaleFromUrl**(`url`): `any`

Defined in: [runtime/extract-locale-from-url.js:26](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/extract-locale-from-url.js)

Extracts the locale from a given URL using native URLPattern.

### Parameters

#### url

The full URL from which to extract the locale.

`string` | `URL`

### Returns

`any`

The extracted locale, or undefined if no locale is found.

***

## generateStaticLocalizedUrls()

> **generateStaticLocalizedUrls**(`urls`): `URL`[]

Defined in: [runtime/generate-static-localized-urls.js:52](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/generate-static-localized-urls.js)

Generates localized URL variants for all provided URLs based on your configured locales and URL patterns.

This function is essential for Static Site Generation (SSG) where you need to tell your framework
which pages to pre-render at build time. It's also useful for generating sitemaps and
`<link rel="alternate" hreflang>` tags for SEO.

The function respects your `urlPatterns` configuration - if you have translated pathnames
(e.g., `/about` → `/ueber-uns` for German), it will generate the correct localized paths.

### Parameters

#### urls

(`string` \| `URL`)[]

List of canonical URLs or paths to generate localized versions for.
  Can be absolute URLs (`https://example.com/about`) or paths (`/about`).
  Paths are resolved against `http://localhost` internally.

### Returns

`URL`[]

Array of URL objects representing all localized variants.
  The order follows each input URL with all its locale variants before moving to the next URL.

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/static-site-generation

### Examples

```ts
// Basic usage - generate all locale variants for a list of paths
const localizedUrls = generateStaticLocalizedUrls([
  "/",
  "/about",
  "/blog/post-1",
]);
// Returns URL objects for each locale:
// ["/en/", "/de/", "/en/about", "/de/about", "/en/blog/post-1", "/de/blog/post-1"]
```

```ts
// Use with framework SSG APIs
// SvelteKit
export function entries() {
  const paths = ["/", "/about", "/contact"];
  return generateStaticLocalizedUrls(paths).map(url => ({
    locale: extractLocaleFromUrl(url)
  }));
}
```

```ts
// Sitemap generation
const allPages = ["/", "/about", "/blog"];
const sitemapUrls = generateStaticLocalizedUrls(allPages);
```

***

## getLocale()

> **getLocale**(): `any`

Defined in: [runtime/get-locale.js:53](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/get-locale.js)

Get the current locale.

The locale is resolved using your configured strategies (URL, cookie, localStorage, etc.)
in the order they are defined. In SSR contexts, the locale is retrieved from AsyncLocalStorage
which is set by the `paraglideMiddleware()`.

### Returns

`any`

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy - Configure locale detection strategies

### Example

```ts
if (getLocale() === 'de') {
    console.log('Germany 🇩🇪');
  } else if (getLocale() === 'nl') {
    console.log('Netherlands 🇳🇱');
  }
```

***

## getStrategyForUrl()

> **getStrategyForUrl**(`url`): (`` `custom-${string}` `` \| `"cookie"` \| `"baseLocale"` \| `"globalVariable"` \| `"url"` \| `"preferredLanguage"` \| `"localStorage"`)[]

Defined in: [runtime/variables.js:101](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

Returns the strategy to use for a specific URL.

If no route strategy matches (or the matching rule is `exclude: true`),
the global strategy is returned.

### Parameters

#### url

`string` | `URL`

### Returns

(`` `custom-${string}` `` \| `"cookie"` \| `"baseLocale"` \| `"globalVariable"` \| `"url"` \| `"preferredLanguage"` \| `"localStorage"`)[]

***

## getUrlOrigin()

> **getUrlOrigin**(): `string`

Defined in: [runtime/get-url-origin.js:12](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/get-url-origin.js)

The origin of the current URL.

Defaults to "http://y.com" in non-browser environments. If this
behavior is not desired, the implementation can be overwritten
by `overwriteGetUrlOrigin()`.

### Returns

`string`

***

## isExcludedByRouteStrategy()

> **isExcludedByRouteStrategy**(`url`): `boolean`

Defined in: [runtime/variables.js:120](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

Returns whether the given URL is excluded from middleware i18n processing.

### Parameters

#### url

`string` | `URL`

### Returns

`boolean`

***

## isLocale()

> **isLocale**(`locale`): `locale is any`

Defined in: [runtime/is-locale.js:16](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/is-locale.js)

Check if something is an available locale.

### Parameters

#### locale

`any`

### Returns

`locale is any`

### Example

```ts
if (isLocale(params.locale)) {
    setLocale(params.locale);
  } else {
    setLocale('en');
  }
```

***

## localizeHref()

> **localizeHref**(`href`, `options?`): `string`

Defined in: [runtime/localize-href.js:45](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/localize-href.js)

High-level URL localization function optimized for client-side UI usage.

This is a convenience wrapper around `localizeUrl()` that provides features
needed in UI:

- Accepts relative paths (e.g., "/about")
- Returns relative paths when possible
- Automatically detects current locale if not specified
- Handles string input/output instead of URL objects

### Parameters

#### href

`string`

The href to localize (can be relative or absolute)

#### options?

Options for localization

##### locale?

`string`

Target locale. If not provided, uses `getLocale()`

### Returns

`string`

The localized href, relative if input was relative

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing

### Example

```typescript
// In a React/Vue/Svelte component
const NavLink = ({ href }) => {
  // Automatically uses current locale, keeps path relative
  return <a href={localizeHref(href)}>...</a>;
};

// Examples:
localizeHref("/about")
// => "/de/about" (if current locale is "de")
localizeHref("/store", { locale: "fr" })
// => "/fr/store" (explicit locale)

// Cross-origin links remain absolute
localizeHref("https://other-site.com/about")
// => "https://other-site.com/de/about"
```

For server-side URL localization (e.g., in middleware), use `localizeUrl()`
which provides more precise control over URL handling.

***

## localizeUrl()

> **localizeUrl**(`url`, `options?`): `URL`

Defined in: [runtime/localize-url.js:55](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/localize-url.js)

Lower-level URL localization function, primarily used in server contexts.

This function is designed for server-side usage where you need precise control
over URL localization, such as in middleware or request handlers. It works with
URL objects and always returns absolute URLs.

For client-side UI components, use `localizeHref()` instead, which provides
a more convenient API with relative paths and automatic locale detection.

### Parameters

#### url

The URL to localize. If string, must be absolute.

`string` | `URL`

#### options?

Options for localization

##### locale?

`string`

Target locale. If not provided, uses getLocale()

### Returns

`URL`

The localized URL, always absolute

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing

### Examples

```typescript
// Server middleware example
app.use((req, res, next) => {
  const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  const localized = localizeUrl(url, { locale: "de" });

  if (localized.href !== url.href) {
    return res.redirect(localized.href);
  }
  next();
});
```

```typescript
// Using with URL patterns
const url = new URL("https://example.com/about");
localizeUrl(url, { locale: "de" });
// => URL("https://example.com/de/about")

// Using with domain-based localization
const url = new URL("https://example.com/store");
localizeUrl(url, { locale: "de" });
// => URL("https://de.example.com/store")
```

***

## overwriteGetLocale()

> **overwriteGetLocale**(`fn`): `void`

Defined in: [runtime/get-locale.js:150](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/get-locale.js)

Overwrite the `getLocale()` function.

Use this function to overwrite how the locale is resolved. This is useful
for custom locale resolution or advanced use cases like SSG with concurrent rendering.

### Parameters

#### fn

() => `any`

### Returns

`void`

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy

### Example

```ts
overwriteGetLocale(() => {
    return Cookies.get('locale') ?? baseLocale
  });
```

***

## overwriteGetUrlOrigin()

> **overwriteGetUrlOrigin**(`fn`): `void`

Defined in: [runtime/get-url-origin.js:29](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/get-url-origin.js)

Overwrite the getUrlOrigin function.

Use this function in server environments to
define how the URL origin is resolved.

### Parameters

#### fn

() => `string`

### Returns

`void`

***

## overwriteServerAsyncLocalStorage()

> **overwriteServerAsyncLocalStorage**(`value`): `void`

Defined in: [runtime/variables.js:166](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/variables.js)

Sets the server side async local storage.

The function is needed because the `runtime.js` file
must define the `serverAsyncLocalStorage` variable to
avoid a circular import between `runtime.js` and
`server.js` files.

### Parameters

#### value

`undefined` | [`ParaglideAsyncLocalStorage`](#paraglideasynclocalstorage)

### Returns

`void`

***

## overwriteSetLocale()

> **overwriteSetLocale**(`fn`): `void`

Defined in: [runtime/set-locale.js:182](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/set-locale.js)

Overwrite the `setLocale()` function.

Use this function to overwrite how the locale is set. For example,
modify a cookie, env variable, or a user's preference.

### Parameters

#### fn

[`SetLocaleFn`](#setlocalefn)

### Returns

`void`

### Example

```ts
overwriteSetLocale((newLocale) => {
    // set the locale in a cookie
    return Cookies.set('locale', newLocale)
  });
```

***

## setLocale()

> **setLocale**(`newLocale`, `options?`): `void` \| `Promise`\<`void`\>

Defined in: [runtime/set-locale.js:59](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/set-locale.js)

Set the locale.

Updates the locale using your configured strategies (cookie, localStorage, URL, etc.).
By default, this reloads the page on the client to reflect the new locale. Reloading
can be disabled by passing `reload: false` as an option, but you'll need to ensure
the UI updates to reflect the new locale.

If any custom strategy's `setLocale` function is async, then this function
will become async as well.

### Parameters

#### newLocale

`any`

#### options?

##### reload?

`boolean`

### Returns

`void` \| `Promise`\<`void`\>

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy

### Examples

```ts
setLocale('en');
```

```ts
setLocale('en', { reload: false });
```

***

## shouldRedirect()

> **shouldRedirect**(`input?`): `Promise`\<[`ShouldRedirectResult`](#shouldredirectresult)\>

Defined in: [runtime/should-redirect.js:63](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/should-redirect.js)

Determines whether a redirect is required to align the current URL with the active locale.

This helper mirrors the logic that powers `paraglideMiddleware`, but works in both server
and client environments. It evaluates the configured strategies in order, computes the
canonical localized URL, and reports when the current URL does not match.

When called in the browser without arguments, the current `window.location.href` is used.

### Parameters

#### input?

[`ShouldRedirectInput`](#shouldredirectinput) = `{}`

### Returns

`Promise`\<[`ShouldRedirectResult`](#shouldredirectresult)\>

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing#client-side-redirects

### Examples

```ts
// Client side usage (e.g. TanStack Router beforeLoad hook)
async function beforeLoad({ location }) {
  const decision = await shouldRedirect({ url: location.href });

  if (decision.shouldRedirect) {
    throw redirect({ to: decision.redirectUrl.href });
  }
}
```

```ts
// Server side usage with a Request
export async function handle(request) {
  const decision = await shouldRedirect({ request });

  if (decision.shouldRedirect) {
    return Response.redirect(decision.redirectUrl, 307);
  }

  return render(request, decision.locale);
}
```

***

## trackMessageCall()

> **trackMessageCall**(`safeModuleId`, `locale`): `void`

Defined in: [runtime/track-message-call.js:7](https://github.com/opral/paraglide-js/tree/main/src/compiler/runtime/track-message-call.js)

### Parameters

#### safeModuleId

`string`

#### locale

`any`

### Returns

`void`
