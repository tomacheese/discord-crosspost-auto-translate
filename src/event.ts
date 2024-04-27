import {
  Client,
  Message,
  MessageFlags,
  PartialMessage,
  PermissionFlagsBits,
  TextBasedChannel,
} from 'discord.js'
import { Configuration } from './config'
import { Logger } from '@book000/node-utils'
import { Utils } from './utils'
import fs from 'node:fs'

export class EventHandler {
  private client: Client
  private config: Configuration

  constructor(client: Client, config: Configuration) {
    this.client = client
    this.config = config
  }

  /**
   * メッセージが送信されたときに呼び出されるメソッド。
   *
   * @param message メッセージ
   */
  public async onMessageCreate(message: Message | PartialMessage) {
    await this.processMessage(message)
  }

  /**
   * メッセージが編集されたときに呼び出されるメソッド。
   *
   * @param _oldMessage 旧メッセージ
   * @param newMessage 新メッセージ
   */
  public async onMessageUpdate(
    _oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ) {
    await this.processMessage(newMessage)
  }

  /**
   * メッセージを処理するメソッド。
   *
   * @param message メッセージ
   */
  private async processMessage(message: Message | PartialMessage) {
    const logger = Logger.configure('Discord.processMessage')

    // メッセージがpartialの場合は詳細を取得
    if (message.partial) {
      message = await message.fetch()
    }
    // チャンネルがテキストベースのチャンネルかつ、Guildチャンネルでない場合は無視
    if (!message.channel.isTextBased() || !message.inGuild()) {
      return
    }
    // メッセージがCrosspostされたメッセージでない場合は無視
    if (!message.flags.has('IsCrosspost')) {
      return
    }
    // 自分自身の情報を取得できない場合は無視
    const me = this.client.user
    if (!me) {
      logger.warn('❌ Failed to get self user')
      return
    }
    // メッセージが自分自身のメッセージの場合は無視
    if (message.author.id === me.id) {
      logger.warn('❌ Message is from myself')
      return
    }
    // そのチャンネルに発言する権限がない場合は無視
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

    // メッセージを翻訳
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

    // 翻訳前と翻訳後のメッセージが同じ場合は無視
    if (message.content === unescapedText) {
      logger.warn('❌ Translated message is same as original message')
      return
    }

    // 翻訳後のメッセージを送信
    // 翻訳後のテキストが空の場合は無視
    if (unescapedText.trim().length === 0) {
      logger.warn('❌ Translated message is empty')
      return
    }

    // 翻訳後のテキストが1900文字以上の場合は、1900文字を超える行から分割して送信
    // すでに送信したことがある場合は、メッセージを編集。ない場合は、メッセージを送信
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

    // リプライを保存
    this.saveReplies(message, newMessages)

    // 不要なメッセージを削除
    const deleteMessages = replies.filter(
      (reply) =>
        reply && !newMessages.some((message) => message.id === reply.id)
    )
    const deletePromises = deleteMessages.map(async (reply) => {
      if (!reply) return
      return await reply.delete().catch(() => null)
    })
    await Promise.all(deletePromises)
  }

  /**
   * メッセージに対するリプライを取得する
   *
   * @param message メッセージ
   * @returns リプライメッセージの配列（削除されている場合は null が配列要素に入る）
   */
  private getReplies(message: Message): Promise<(Message | null)[]> {
    const path = process.env.REPLIES_MESSAGE_PATH ?? 'data/replies.json'

    if (!fs.existsSync(path)) {
      // ファイルが存在しない場合は空の配列を返す
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
   * メッセージに対するリプライを保存する
   *
   * @param message メッセージ
   * @param replies リプライメッセージの配列
   */
  private saveReplies(message: Message, replies: Message[]) {
    const path = process.env.REPLIES_MESSAGE_PATH ?? 'data/replies.json'

    const data: Record<string, string[]> = fs.existsSync(path)
      ? JSON.parse(fs.readFileSync(path, 'utf8'))
      : {}

    data[message.id] = replies.map((reply) => reply.id)

    fs.writeFileSync(path, JSON.stringify(data))
  }

  /**
   * メッセージが一つでも削除されている場合、すべてのメッセージを削除する
   *
   * @param channel チャンネル
   * @param messageIds メッセージID
   */
  private async deleteMessagesIfAlreadyDeleted(messages: (Message | null)[]) {
    // 一つでもメッセージが存在しなかったら、すべてのメッセージを削除する
    if (!messages.some((message) => !message)) {
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
   * メッセージを編集するか、新しいメッセージを送信する
   *
   * @param channel チャンネル
   * @param messages メッセージの配列
   * @param reference 参照するメッセージ
   * @param contents メッセージの内容の配列
   * @returns 編集または新規送信されたメッセージの配列
   */
  private async replaceOrCreateMessage(
    channel: TextBasedChannel,
    messages: (Message | null)[],
    reference: Message,
    contents: string[]
  ) {
    const promises: Promise<Message>[] = []
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
