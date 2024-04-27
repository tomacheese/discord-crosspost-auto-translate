import { ConfigFramework } from '@book000/node-utils'

export interface ConfigInterface {
  discord: {
    token: string
  }
  translate: {
    gasUrl: string
    fromLanguage?: string
    toLanguage?: string
  }
}

export class Configuration extends ConfigFramework<ConfigInterface> {
  protected validates(): Record<string, (config: ConfigInterface) => boolean> {
    return {
      'discord is required': (config) => !!config.discord,
      'discord.token is required': (config) => !!config.discord.token,
      'discord.token must be a string': (config) =>
        typeof config.discord.token === 'string',
      'translate is required': (config) => !!config.translate,
      'translate.gasUrl is required': (config) => !!config.translate.gasUrl,
      'translate.gasUrl must be a string': (config) =>
        typeof config.translate.gasUrl === 'string',
      'translate.fromLanguage must be a string': (config) =>
        typeof config.translate.fromLanguage === 'string' ||
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        config.translate.fromLanguage === undefined,
      'translate.toLanguage must be a string': (config) =>
        typeof config.translate.toLanguage === 'string' ||
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        config.translate.toLanguage === undefined,
    }
  }
}
