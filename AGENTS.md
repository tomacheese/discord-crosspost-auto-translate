# AGENTS.md

## Language

- Commit descriptions, PR/Issue text, code comments, docstrings (JSDoc), and documentation are written in English.
- Exceptions:
  - End-user-facing notification/UI text.
  - Japanese data patterns, fixtures, and test assertions (for example the Japanese strings in `src/*.test.ts`).
  - Quotations and technical identifiers.
  - The Japanese fork-PR approval comment text in `.github/workflows/docker.yml` and its `body-includes: Environment 承認待ち` match key; they must match each other.
- `package.json` is always English.
- Developer-facing log and error messages are English.

## Overview

A Discord bot that detects cross-posted (announcement-follow) messages, translates them through a Google Apps Script (GAS) web app, and replies to the original message with the translation.
When a message is edited, the existing replies are edited or recreated.

## Commands

```bash
pnpm install     # Install dependencies
pnpm dev         # Run with tsx watch
pnpm start       # Run once with tsx
pnpm compile     # Type-check and build to dist (tsc -p .)
pnpm test        # Jest
pnpm lint        # Prettier check + ESLint + tsc
pnpm fix         # Prettier write + ESLint fix
pnpm generate-schema  # Generate schema/Configuration.json from src/config.ts
```

## Architecture

- `src/main.ts`: Entry point. Loads and validates `data/config.json`, starts the bot, and closes the client on SIGINT.
- `src/discord.ts`: discord.js client setup (intents, `messageCreate` / `messageUpdate` wiring).
- `src/event.ts`: `EventHandler`. `processMessage` is the core logic: filter, translate, then send/edit/delete replies.
- `src/keyed-queue.ts`: `KeyedLatestQueue`. Serializes work per message ID and collapses waiting tasks into the latest one.
- `src/utils.ts`: `Utils.escape` / `unescape` (protect formatting from translation), `translate` (calls the GAS web app via `fetch`), `chunkedText`.
- `src/config.ts`: Config type and validation (`@book000/node-utils` `ConfigFramework`). The path is `data/config.json`, overridable with `CONFIG_PATH` / `CONFIG_FILE`.
- `gas-script.js`: Code deployed to Google Apps Script. It does not run in this repository's Node.js environment; do not apply Node-side lint/type conventions to it.
- Tests are Jest (`src/*.test.ts`).

## Rules and invariants

- Never commit the Discord token or other secrets; they live only in `data/config.json`. Never log secrets.
- Do not enable `skipLibCheck` in `tsconfig.json`.
- Public functions and interfaces get JSDoc.
- Keep the existing emoji log prefixes (`❌` `🤖` `👌` etc.).
- Only handle messages with the `IsCrosspost` flag, and never reply to the bot's own messages (prevents reply loops).
- Replies must use `allowedMentions: { parse: [] }`, and new replies are sent with `MessageFlags.SuppressNotifications`.
- Translated text is split into chunks of at most 1900 characters (Discord's limit is 2000).
- `Utils.escape` / `unescape` must stay symmetric: any new escape pattern needs a matching unescape and tests in `src/utils.test.ts`.
- `data/replies.json` (override: `REPLIES_MESSAGE_PATH`) maps original message ID to reply IDs. It is written to a temp file and renamed so it is not corrupted if the process dies mid-write.
- Do not add commits to Renovate-created PRs.
