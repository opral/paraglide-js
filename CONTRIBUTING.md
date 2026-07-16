# Contributing

## Prerequisites

- [Node.js](https://nodejs.org/en/) (v20 or higher)
- [pnpm](https://pnpm.io/) (v8 or higher)

> [!IMPORTANT]
> If you are developing on Windows, you need to use [WSL](https://en.wikipedia.org/wiki/Windows_Subsystem_for_Linux).

## Development

### Getting started

1. Clone the repo.
2. Run `pnpm i`.
3. Run `pnpm dev`, `pnpm build`, and `pnpm test`.

## Opening a PR

1. Run `pnpm run ci` to run all tests and checks.
2. Run `pnpm dlx changeset` to write a changelog and trigger a version bump. Watch [this video](https://www.loom.com/share/1c5467ae3a5243d79040fc3eb5aa12d6) to see how to use changesets.
