import {
  Client,
  DiscordAPIError,
  GuildTextBasedChannel,
  Message,
  MessageFlags,
  PartialMessage,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
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
      await this.removeObsoleteReplies(message)
      return
    }

    // Ignore if the translated text is empty
    if (unescapedText.trim().length === 0) {
      logger.warn('❌ Translated message is empty')
      await this.removeObsoleteReplies(message)
      return
    }

    // Split long translations into chunks that fit Discord's limit of 2000 characters.
    // Edit the replies we already sent; send new ones otherwise.
    const chunks = Utils.chunkedText(unescapedText, 1900)
    const replies = await this.getReplies(message)
    const { refreshed, retained } =
      await this.deleteMessagesIfAlreadyDeleted(replies)
    if (refreshed) {
      replies.length = 0
    }

    const { messages: newMessages, failures } =
      await this.replaceOrCreateMessage(
        message.channel,
        replies,
        message,
        chunks
      )

    if (failures.length > 0) {
      logger.warn(
        `❌ Failed to send or edit ${failures.length} of ${chunks.length} reply chunks`
      )
      // Keep the surplus replies tracked: they are not deleted while this run is failing
      const surplusReplies = replies
        .slice(chunks.length)
        .filter((reply) => reply !== null)
      const trackedReplies = [...newMessages, ...surplusReplies, ...retained]
      if (trackedReplies.length > 0) {
        this.saveReplies(message, trackedReplies)
      }
      throw failures[0]
    }

    // Save after deleting so a reply that could not be deleted stays tracked for a retry
    const retainedSurplus = await this.deleteReplies(
      replies.filter(
        (reply) =>
          reply && newMessages.every((message) => message.id !== reply.id)
      )
    )
    this.saveReplies(message, [...newMessages, ...retainedSurplus, ...retained])
  }

  /**
   * Deletes the replies sent earlier for a message whose translation is no longer needed.
   * A reply whose deletion fails stays tracked so that a later event retries it.
   */
  private async removeObsoleteReplies(message: Message<true>) {
    const replies = await this.getReplies(message)
    if (replies.length === 0) {
      return
    }

    const retained = await this.deleteReplies(replies)
    this.saveReplies(message, retained)
  }

  /**
   * Fetches the replies we previously sent for a message.
   *
   * @returns Reply messages (an element is null only if Discord confirmed that reply no longer exists)
   * @throws Any other fetch failure (network, permission, ...), so existing replies and saved data are kept
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
      try {
        return await message.channel.messages.fetch(id)
      } catch (error) {
        if (
          error instanceof DiscordAPIError &&
          error.code === RESTJSONErrorCodes.UnknownMessage
        ) {
          return null
        }
        throw error
      }
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

    if (replies.length === 0) {
      Reflect.deleteProperty(data, message.id)
    } else {
      data[message.id] = replies.map((reply) => reply.id)
    }

    // Write to a temp file and rename so replies.json is not corrupted if the process dies mid-write
    const temporaryPath = `${path}.tmp`
    fs.writeFileSync(temporaryPath, JSON.stringify(data))
    fs.renameSync(temporaryPath, path)
  }

  /**
   * Deletes all replies if any of them has already been deleted.
   *
   * @param messages Reply messages (null for ones that no longer exist)
   * @returns `refreshed` is true if the replies must be recreated; `retained`
   *   holds the replies whose deletion failed and that must stay tracked
   */
  private async deleteMessagesIfAlreadyDeleted(
    messages: (Message<true> | null)[]
  ): Promise<{ refreshed: boolean; retained: Message<true>[] }> {
    // If any reply is missing, delete all of them
    return messages.every(Boolean)
      ? { refreshed: false, retained: [] }
      : { refreshed: true, retained: await this.deleteReplies(messages) }
  }

  /**
   * Deletes replies without ever rejecting.
   *
   * @param messages Reply messages (null entries are skipped)
   * @returns The replies whose deletion failed for a reason other than the
   *   reply already being gone; callers must keep tracking them for a retry
   */
  private async deleteReplies(
    messages: (Message<true> | null)[]
  ): Promise<Message<true>[]> {
    const logger = Logger.configure('Discord.deleteReplies')
    const existing = messages.filter((message) => message !== null)
    const results = await Promise.allSettled(
      existing.map((message) => message.delete())
    )

    const retained: Message<true>[] = []
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') continue
      const reason: unknown = result.reason
      if (
        reason instanceof DiscordAPIError &&
        reason.code === RESTJSONErrorCodes.UnknownMessage
      ) {
        continue
      }
      logger.warn(`❌ Failed to delete reply ${existing[index].id}`)
      retained.push(existing[index])
    }
    return retained
  }

  /**
   * Edits existing replies or sends new ones.
   * A failing chunk does not discard the others, so the caller can track them.
   *
   * @param messages Existing replies (null for ones that no longer exist)
   * @returns The replies to track in chunk order (an existing reply stays in
   *   place when its edit fails; a chunk whose send fails has none) and the
   *   rejection reasons in chunk order (empty when every chunk succeeded)
   */
  private async replaceOrCreateMessage(
    channel: GuildTextBasedChannel,
    messages: (Message<true> | null)[],
    reference: Message<true>,
    contents: string[]
  ): Promise<{ messages: Message<true>[]; failures: unknown[] }> {
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
    const results = await Promise.allSettled(promises)

    const tracked: Message<true>[] = []
    const failures: unknown[] = []
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        tracked.push(result.value)
        continue
      }
      failures.push(result.reason)
      const existing = index < messages.length ? messages[index] : null
      if (existing) {
        tracked.push(existing)
      }
    }
    return { messages: tracked, failures }
  }
}
