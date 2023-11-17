import { Client, GatewayIntentBits, Partials } from 'discord.js'
import { Logger } from '@book000/node-utils'
import { Configuration } from './config'
import { EventHandler } from './event'

export class Discord {
  private config: Configuration
  public readonly client: Client

  constructor(config: Configuration) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.User],
    })
    this.client.on('ready', this.onReady.bind(this))

    const eventHandler = new EventHandler(this.client, config)
    this.client.on(
      'messageCreate',
      eventHandler.onMessageCreate.bind(eventHandler)
    )
    this.client.on(
      'messageUpdate',
      eventHandler.onMessageUpdate.bind(eventHandler)
    )

    this.client.login(config.get('discord').token)

    this.config = config
  }

  public getClient() {
    return this.client
  }

  public getConfig() {
    return this.config
  }

  public close() {
    this.client.destroy()
  }

  async onReady() {
    const logger = Logger.configure('Discord.onReady')
    logger.info(`👌 ready: ${this.client.user?.tag}`)
  }

  getStackTraceTypeScriptFiles(stack: string) {
    const lines = stack.split('\n')
    const typescriptFiles = lines
      .filter((line) => line.trim().startsWith('at ') && line.includes('.ts:'))
      .map((line) => {
        return line.trim().slice(3)
      })

    return typescriptFiles
  }

  waitReady() {
    return new Promise<void>((resolve) => {
      if (this.client.isReady()) {
        resolve()
      }
      this.client.once('ready', () => {
        resolve()
      })
    })
  }
}
