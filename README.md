# discord-crosspost-auto-translate

Automatically translates and replies to cross-posted messages.

## Requirements

- Native Node.js or Docker
- Google App Script
  - The script in [gas-script.js](gas-script.js) must be installed and deployed as a web app.
- Vaild Discord bot & token

### Setup gas-script.js

1. Create a Google Apps Script file and write the contents of [gas-script.js](gas-script.js).
2. Click Deploy -> New deploy and create a new deployment for the web app.  
   Specify "everyone" as the user who can access.
3. Copy the URL of the created web app.

## Installation

Works in Node.js or Docker Compose environment.

### Docker Compose (Recommended)

If you want to use Docker Compose, write the following in `compose.yaml`:

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

You can then refer to the [configuration section](#configuration) to create a configuration file and then launch it with `docker compose up -d`.

### Native Node.js

If running in a Node.js environment, the version specified in [.node-version](.node-version) is recommended.

Download and extract `discord-crosspost-auto-translate_vX.Y.Z.zip` from the [release page](https://github.com/tomacheese/discord-crosspost-auto-translate/releases) in the latest release.  
After that, you can start it with `node index.js` after creating a configuration file with reference to [Configuration section](#configuration).

## Configuration

The configuration file `data/config.json` is used by default.  
If the environment variable `CONFIG_FILE` or `CONFIG_PATH` is set, the specified value is taken as the path to the configuration file.

See here for the JSON Schema of the configuration file: [schema/Configuration.json](schema/Configuration.json)

```json
{
  "$schema": "https://raw.githubusercontent.com/tomacheese/discord-crosspost-auto-translate/master/schema/Configuration.json"
}
```

## License

The license for this project is [MIT License](LICENSE).
