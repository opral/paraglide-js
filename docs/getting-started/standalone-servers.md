---
title: Standalone Servers
description: Set up Paraglide with Hono, Express, Fastify, or Elysia - without a meta-framework.
---

# Standalone Servers

This guide covers setting up Paraglide with standalone server frameworks like Hono, Express, Fastify, or Elysia - without a meta-framework like Next.js or SvelteKit.

Paraglide's middleware is simple: request in, response out. It detects the locale and gets out of your way - no routing takeover, no magic.

## Setup

```bash
npx @inlang/paraglide-js init
```

This installs dependencies, creates message files, and sets up compilation.

## Compiling Messages

Without a bundler plugin, compile messages via CLI:

```bash
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide
```

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "build": "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide && your-build-command",
    "dev": "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide && your-dev-command"
  }
}
```

Or compile programmatically at startup:

```ts
import { compile } from '@inlang/paraglide-js'

await compile({
  project: './project.inlang',
  outdir: './src/paraglide',
})
```

## Framework Examples

### Hono

```ts
import { Hono } from 'hono'
import { paraglideMiddleware } from './src/paraglide/server.js'
import { getLocale } from './src/paraglide/runtime.js'
import * as m from './src/paraglide/messages.js'

const app = new Hono()

app.use('*', (c, next) => {
  return paraglideMiddleware(c.req.raw, () => next())
})

app.get('/', (c) => {
  return c.json({
    locale: getLocale(),
    message: m.hello({ name: 'World' }),
  })
})

export default app
```

### Express

Express uses Node.js request/response objects, so you need to convert to Web API Request:

```ts
import express from 'express'
import { paraglideMiddleware } from './src/paraglide/server.js'
import { getLocale } from './src/paraglide/runtime.js'
import * as m from './src/paraglide/messages.js'

const app = express()

app.use(async (req, res, next) => {
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`
  const webRequest = new Request(url, {
    method: req.method,
    headers: new Headers(req.headers as Record<string, string>),
  })

  await paraglideMiddleware(webRequest, async ({ locale }) => {
    req.locale = locale
    return new Response()
  })

  next()
})

app.get('/', (req, res) => {
  res.json({
    locale: getLocale(),
    message: m.hello({ name: 'World' }),
  })
})

app.listen(3000)
```

### Fastify

```ts
import Fastify from 'fastify'
import { paraglideMiddleware } from './src/paraglide/server.js'
import { getLocale } from './src/paraglide/runtime.js'
import * as m from './src/paraglide/messages.js'

const app = Fastify()

app.addHook('preHandler', async (req, reply) => {
  const url = `${req.protocol}://${req.hostname}${req.url}`
  const webRequest = new Request(url, {
    method: req.method,
    headers: new Headers(req.headers as Record<string, string>),
  })

  await paraglideMiddleware(webRequest, async ({ locale }) => {
    req.locale = locale
    return new Response()
  })
})

app.get('/', async (req, reply) => {
  return {
    locale: getLocale(),
    message: m.hello({ name: 'World' }),
  }
})

app.listen({ port: 3000 })
```

### Elysia

```ts
import { Elysia } from 'elysia'
import { paraglideMiddleware } from './src/paraglide/server.js'
import { getLocale } from './src/paraglide/runtime.js'
import * as m from './src/paraglide/messages.js'

const app = new Elysia()
  .derive(async ({ request }) => {
    let locale = 'en'
    await paraglideMiddleware(request, async ({ locale: l }) => {
      locale = l
      return new Response()
    })
    return { locale }
  })
  .get('/', () => ({
    locale: getLocale(),
    message: m.hello({ name: 'World' }),
  }))
  .listen(3000)
```

## Configuration

Configure locale detection strategy in your compile options:

```ts
await compile({
  project: './project.inlang',
  outdir: './src/paraglide',
  strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
})
```

Or via CLI:

```bash
npx @inlang/paraglide-js compile \
  --project ./project.inlang \
  --outdir ./src/paraglide \
  --strategy url,cookie,preferredLanguage,baseLocale
```

## See Also

- [Middleware Guide](../middleware) - Middleware lifecycle and troubleshooting
- [Strategy Configuration](../strategy) - Configure locale detection
- [Compiling Messages](../compiling-messages) - CLI and programmatic options
