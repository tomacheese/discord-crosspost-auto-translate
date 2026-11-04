# discord-crosspost-auto-translate

Automatically translates and replies to cross-posted messages.

## Requirements

- Node.js or Docker
- A Google Apps Script web app
  - [gas-script.js](gas-script.js) must be deployed as a web app (see below).
- A Discord bot and its token
  - The bot needs the Message Content intent enabled, and permission to view channels and send messages in the channels it should reply in.

### Setup gas-script.js

1. Create a Google Apps Script project and paste the contents of [gas-script.js](gas-script.js).
2. Click Deploy -> New deployment and deploy it as a web app.
   Set "Who has access" to "Anyone".
3. Copy the URL of the deployed web app and set it as `translate.gasUrl` in the [configuration](#configuration).

## Installation

### Docker Compose (Recommended)

Write the following in `compose.yaml`:

```yaml
services:
  app:
    image: ghcr.io/tomacheese/discord-crosspost-auto-translate
    volumes:
      - type: bind
        source: ./data
        target: /data/
    init: true
    restart: always
```

Create `data/config.json` as described in the [configuration section](#configuration), then start it with `docker compose up -d`.

### Native Node.js

Use the Node.js version specified in [.node-version](.node-version) and [pnpm](https://pnpm.io/).
After creating `data/config.json` as described in the [configuration section](#configuration), run:

```bash
pnpm install
pnpm start
```

## Configuration

The configuration file is `data/config.json` by default.
If the environment variable `CONFIG_PATH` or `CONFIG_FILE` is set, its value is used as the path to the configuration file (the Docker image sets `CONFIG_PATH=/data/config.json`).

```json
{
  "discord": {
    "token": "your-discord-bot-token"
  },
  "translate": {
    "gasUrl": "https://script.google.com/macros/s/xxxxxxxx/exec",
    "fromLanguage": "en",
    "toLanguage": "ja"
  }
}
```

- `discord.token` (required): Discord bot token.
- `translate.gasUrl` (required): URL of the deployed GAS web app.
- `translate.fromLanguage` (optional, default `en`): Source language code.
- `translate.toLanguage` (optional, default `ja`): Target language code.

The IDs of the replies the bot has sent are stored in `data/replies.json` (override with the `REPLIES_MESSAGE_PATH` environment variable), so that edited messages update the existing replies.

## License

The license for this project is [MIT License](LICENSE).
