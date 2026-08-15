import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { paraglideMiddleware } from './paraglide/server.js'

const fetch = createStartHandler({
  handler: defaultStreamHandler,
})

export default {
  fetch(request: Request) {
    // TanStack Router owns URL rewriting, so keep the original request URL.
    return paraglideMiddleware(request, () => fetch(request))
  },
}
