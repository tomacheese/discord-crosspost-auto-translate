import {
  Client,
  GuildTextBasedChannel,
  Message,
  MessageFlags,
  PartialMessage,
  PermissionFlagsBits,
} from 'discord.js'
import { Configuration } from './config'
import { Logger } from '@book000/node-utils'
import { Utils } from './utils'
import { KeyedLatestQueue } from './keyed-queue'
import fs from 'node:fs'

export class EventHandler {
  private client: Client
  private config: Configuration
  private readonly queue = new KeyedLatestQueue()

  constructor(client: Client, config: Configuration) {
    this.client = client
    this.config = config
  }

  /**
   * Called when a message is created.
   * Processing of the same message is serialized.
   */
  public async onMessageCreate(message: Message<true> | PartialMessage) {
    await this.queue.run(message.id, () => this.processMessage(message))
  }

  /**
   * Called when a message is edited.
   * Processing of the same message is serialized, and waiting edits are collapsed into the latest one.
   */
  public async onMessageUpdate(
    _oldMessage: Message<true> | PartialMessage,
    newMessage: Message<true> | PartialMessage
  ) {
    await this.queue.run(newMessage.id, () => this.processMessage(newMessage))
  }

  /**
   * Translates a cross-posted message and replies to it (or updates the existing replies).
   */
  private async processMessage(message: Message<true> | PartialMessage) {
    const logger = Logger.configure('Discord.processMessage')

    // Fetch the full message if it is partial
    if (message.partial) {
      const messageTemp = await message.fetch()
      if (!messageTemp.inGuild()) {
        return
      }
      message = messageTemp
    }
    // Ignore messages that are not in a guild text-based channel
    if (!message.channel.isTextBased() || !message.inGuild()) {
      return
    }
    // Ignore messages that are not crossposted
    if (!message.flags.has('IsCrosspost')) {
      return
    }
    // Ignore if our own user is unavailable
    const me = this.client.user
    if (!me) {
      logger.warn('❌ Failed to get self user')
      return
    }
    // Ignore our own messages (avoids reply loops)
    if (message.author.id === me.id) {
      logger.warn('❌ Message is from myself')
      return
    }
    // Ignore if we cannot send messages in this channel
    const permissions = message.channel.permissionsFor(me)
    if (!permissions) {
      logger.warn('❌ Failed to get my permissions')
      return
    }
    if (!permissions.has(PermissionFlagsBits.SendMessages)) {
      logger.warn('❌ I do not have permission to send messages')
      return
    }

    const config = this.config
    const translateGasUrl = config.get('translate').gasUrl
    const fromLanguage = config.get('translate').fromLanguage
    const toLanguage = config.get('translate').toLanguage

    const escapedText = Utils.escape(message.content)
    const translatedMessage = await Utils.translate(
      translateGasUrl,
      escapedText,
      fromLanguage,
      toLanguage
    )
    if (!translatedMessage) {
      logger.warn('❌ Failed to translate message')
      return
    }
    const unescapedText = Utils.unescape(translatedMessage)

    // Ignore if the translation is identical to the original
    if (message.content === unescapedText) {
      logger.warn('❌ Translated message is same as original message')
      return
    }

    // Ignore if the translated text is empty
    if (unescapedText.trim().length === 0) {
      logger.warn('❌ Translated message is empty')
      return
    }

    // Split long translations into chunks that fit Discord's limit of 2000 characters.
    // Edit the replies we already sent; send new ones otherwise.
    const chunks = Utils.chunkedText(unescapedText, 1900)
    const replies = await this.getReplies(message)
    const isRefreshed = await this.deleteMessagesIfAlreadyDeleted(replies)
    if (isRefreshed) {
      replies.length = 0
    }

    const newMessages = await this.replaceOrCreateMessage(
      message.channel,
      replies,
      message,
      chunks
    )

    this.saveReplies(message, newMessages)

    // Delete replies that are no longer needed
    const deleteMessages = replies.filter(
      (reply) =>
        reply && newMessages.every((message) => message.id !== reply.id)
    )
    const deletePromises = deleteMessages.map(async (reply) => {
      return reply ? await reply.delete().catch(() => null) : undefined
    })
    await Promise.all(deletePromises)
  }

  /**
   * Fetches the replies we previously sent for a message.
   *
   * @returns Reply messages (an element is null if that reply has been deleted)
   */
  private getReplies(
    message: Message<true>
  ): Promise<(Message<true> | null)[]> {
    const path = process.env.REPLIES_MESSAGE_PATH ?? 'data/replies.json'

    if (!fs.existsSync(path)) {
      // No saved replies yet
      return Promise.resolve([])
    }

    const data: Record<string, string[]> = JSON.parse(
      fs.readFileSync(path, 'utf8')
    )

    const replyIds = data[message.id] ?? []
    const replyPromises = replyIds.map(async (id: string) => {
      return await message.channel.messages.fetch(id).catch(() => null)
    })
    return Promise.all(replyPromises)
  }

  /**
   * Saves the replies we sent for a message.
   */
  private saveReplies(message: Message<true>, replies: Message<true>[]) {
    const path = process.env.REPLIES_MESSAGE_PATH ?? 'data/replies.json'

    const data: Record<string, string[]> = fs.existsSync(path)
      ? JSON.parse(fs.readFileSync(path, 'utf8'))
      : {}

    data[message.id] = replies.map((reply) => reply.id)

    // Write to a temp file and rename so replies.json is not corrupted if the process dies mid-write
    const temporaryPath = `${path}.tmp`
    fs.writeFileSync(temporaryPath, JSON.stringify(data))
    fs.renameSync(temporaryPath, path)
  }

  /**
   * Deletes all replies if any of them has already been deleted.
   *
   * @param messages Reply messages (null for ones that no longer exist)
   * @returns true if the replies were deleted and must be recreated
   */
  private async deleteMessagesIfAlreadyDeleted(
    messages: (Message<true> | null)[]
  ) {
    // If any reply is missing, delete all of them
    if (messages.every(Boolean)) {
      return false
    }

    await Promise.all(
      messages.map(async (message) => {
        if (!message) return
        try {
          return await message.delete()
        } catch {
          return null
        }
      })
    )
    return true
  }

  /**
   * Edits existing replies or sends new ones.
   *
   * @param messages Existing replies (null for ones that no longer exist)
   */
  private async replaceOrCreateMessage(
    channel: GuildTextBasedChannel,
    messages: (Message<true> | null)[],
    reference: Message<true>,
    contents: string[]
  ): Promise<Message<true>[]> {
    const promises: Promise<Message<true>>[] = []
    for (const [index, content] of contents.entries()) {
      const message = messages.length > index ? messages[index] : null
      if (message) {
        promises.push(
          message.edit({
            content,
            allowedMentions: { parse: [] },
          })
        )
      } else {
        promises.push(
          channel.send({
            content,
            allowedMentions: { parse: [] },
            reply: {
              messageReference: reference,
              failIfNotExists: false,
            },
            flags: MessageFlags.SuppressNotifications,
          })
        )
      }
    }
    return await Promise.all(promises)
  }
}
