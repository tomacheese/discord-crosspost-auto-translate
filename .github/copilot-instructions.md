# GitHub Copilot review guidelines

Project overview, commands, architecture, and rules are in [AGENTS.md](../AGENTS.md). Review in English.

## Review focus

- **Secrets**: The Discord token must not be hard-coded anywhere other than `data/config.json`, and must not appear in logs.
- **Configuration**: The types in `src/config.ts` and the validation must stay consistent with how settings are used.
- **Error handling**: Exceptions in async code must not be swallowed. Failures of Discord API calls and `fetch` must be handled and logged.
- **Translation logic**: When changing the escape/unescape or chunking logic in `src/utils.ts`, check that existing regex and replacement behavior is preserved and that `src/utils.test.ts` is added or updated.
- **JSDoc**: Public functions and interfaces have JSDoc.

## Known patterns not to flag

- `gas-script.js` runs on Google Apps Script and is independent of this repository's Node.js conventions.
- Emoji log prefixes (`❌` `🤖` `👌` etc.) are the existing style; do not ask to remove them.
