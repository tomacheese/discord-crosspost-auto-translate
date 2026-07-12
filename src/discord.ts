import { Client, GatewayIntentBits, Partials } from 'discord.js'
import { Logger } from '@book000/node-utils'
import { Config } from './config'
import { EventHandler } from './event'

export class Discord {
  private config: Config
  public readonly client: Client

  constructor(config: Config) {
    const logger = Logger.configure('Discord.constructor')
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.User],
    })
    this.client = client
    client.on('ready', this.onReady.bind(this))

    const eventHandler = new EventHandler(client, config)
    client.on('messageCreate', (message) => {
      if (!message.inGuild()) {
        return
      }
      ;(async () => {
        try {
          await eventHandler.onMessageCreate(message)
        } catch (error) {
          logger.error('Failed to process message', error as Error)
        }
      })()
    })
    client.on('messageUpdate', (oldMessage, newMessage) => {
      if (!oldMessage.inGuild() || !newMessage.inGuild()) {
        return
      }
      ;(async () => {
        try {
          await eventHandler.onMessageUpdate(oldMessage, newMessage)
        } catch (error) {
          logger.error('Failed to process message update', error as Error)
        }
      })()
    })

    ;(async () => {
      try {
        await client.login(config.get('discord').token)
      } catch (error) {
        Logger.configure('Discord').error('Failed to login', error as Error)
      }
    })()

    this.config = config
  }

  public getClient() {
    return this.client
  }

  public getConfig() {
    return this.config
  }

  public async close() {
    await this.client.destroy()
  }

  onReady() {
    const logger = Logger.configure('Discord.onReady')
    logger.info(`👌 ready: ${this.client.user?.tag}`)
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
