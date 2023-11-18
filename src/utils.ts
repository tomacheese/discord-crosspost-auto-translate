import { Logger } from '@book000/node-utils'
import axios from 'axios'

export const Utils = {
  /**
   * テキストをエスケープするメソッド。MarkdownおよびDiscordのフォーマットをエスケープします。
   *
   * @param text エスケープするテキスト。
   * @returns エスケープされたテキスト。
   */
  escape(text: string): string {
    return (
      text
        // --- markdownエスケープ ---
        // <https://example.com> -> <span translate="no" data-type="url">https://example.com</span>
        // https://example.com -> <span translate="no" data-type="url">https://example.com</span>
        .replaceAll(
          /<((?:https?:\/\/)?[\w.-]+(?:\.[\w.-]+)+(?:\/[\w%&./=?-]*)?)>/g,
          '<span translate="no" data-type="url">$1</span>'
        )
        // ```console.log("Hello, world!");``` -> <span translate="no" data-type="code-block">console.log("Hello, world!");</span>
        .replaceAll(
          /```([\S\s]+?)```/g,
          '<span translate="no" data-type="code-block">$1</span>'
        )
        // `escape` -> <span translate="no" data-type="code">escape</span>
        .replaceAll(
          /`([\S\s]+?)`/g,
          '<span translate="no" data-type="code">$1</span>'
        )
        // *italic* -> <span translate="no" data-type="strong-or-italic">*</span>italic<span translate="no" data-type="strong-or-italic">*</span>
        // **bold** -> <span translate="no" data-type="strong-or-italic">**</span>bold<span translate="no" data-type="strong-or-italic">**</span>
        .replaceAll(
          /(\*{1,2})(\S+?)\1/g,
          '<span translate="no" data-type="strong-or-italic">$1</span>$2<span translate="no" data-type="strong-or-italic">$1</span>'
        )
        // --- discordエスケープ ---
        // <@123456789012345678> -> <span translate="no" data-type="formatting"><@123456789012345678></span>
        // <#123456789012345678> -> <span translate="no" data-type="formatting"><#123456789012345678></span>
        // <@&123456789012345678> -> <span translate="no" data-type="formatting"><@&123456789012345678></span>
        // <:name:123456789012345678> -> <span translate="no" data-type="formatting"><:anamet:123456789012345678></span>
        // <a:name:123456789012345678> -> <span translate="no" data-type="formatting"><a:name:123456789012345678></span>
        // <@!123456789012345678> -> <span translate="no" data-type="formatting"><@!123456789012345678></span>
        .replaceAll(
          /<[#:@at]\S+>/g,
          '<span translate="no" data-type="formatting">$&</span>'
        )
        // <<1234567890:customize> -> <span translate="no" data-type="formatting"><1234567890:customize></span>
        .replaceAll(
          /<\d+:\S+>/g,
          '<span translate="no" data-type="formatting">$&</span>'
        )
    )
  },
  /**
   * エスケープされたテキストを元に戻すメソッド。MarkdownおよびDiscordのフォーマットを元に戻します。
   *
   * @param text - 元に戻すテキスト。
   * @returns 元に戻されたテキスト。
   */
  unescape(text: string): string {
    return (
      text
        // --- markdown unescape ---
        // <span translate="no" data-type="url">https://example.com</span> -> <https://example.com>
        .replaceAll(
          /<span translate="no" data-type="url">([\S\s]+?)<\/span>/g,
          '<$1>'
        )
        // <span translate="no" data-type="code-block">console.log("Hello, world!");</span> -> ```console.log("Hello, world!");```
        .replaceAll(
          /<span translate="no" data-type="code-block">([\S\s]+?)<\/span>/g,
          '```$1```'
        )
        // <span translate="no" data-type="code">escape</span> -> `escape`
        .replaceAll(
          /<span translate="no" data-type="code">([\S\s]+?)<\/span>/g,
          '`$1`'
        )
        // <span translate="no" data-type="strong-or-italic">*</span>italic<span translate="no" data-type="strong-or-italic">*</span> -> *italic*
        // <span translate="no" data-type="strong-or-italic">**</span>bold<span translate="no" data-type="strong-or-italic">**</span> -> **bold**
        .replaceAll(
          /<span translate="no" data-type="strong-or-italic">(\*{1,2})<\/span>([\S\s]+?)<span translate="no" data-type="strong-or-italic">\1<\/span>/g,
          '$1$2$1'
        )
        // --- discord unescape ---
        // <span translate="no" data-type="formatting"><@123456789012345678></span> -> <@123456789012345678>
        // <span translate="no" data-type="formatting"><#123456789012345678></span> -> <#123456789012345678>
        // <span translate="no" data-type="formatting"><@&123456789012345678></span> -> <@&123456789012345678>
        // <span translate="no" data-type="formatting"><:name:123456789012345678></span> -> <:name:123456789012345678>
        // <span translate="no" data-type="formatting"><a:name:123456789012345678></span> -> <a:name:123456789012345678>
        // <span translate="no" data-type="formatting"><@!123456789012345678></span> -> <@!123456789012345678>
        .replaceAll(
          /<span translate="no" data-type="formatting">(<[#:@at]\S+>)<\/span>/g,
          '$1'
        )
        // <span translate="no" data-type="formatting"><1234567890:customize></span> -> <<1234567890:customize>
        .replaceAll(
          /<span translate="no" data-type="formatting">(<\d+:\S+>)<\/span>/g,
          '$1'
        )
    )
  },
  /**
   * 指定されたGoogle Apps Script URLを使用して、与えられたメッセージを一つの言語から別の言語に翻訳します。
   *
   * @param gasUrl 翻訳に使用するGoogle Apps ScriptサービスのURL。
   * @param message 翻訳対象のテキストメッセージ。
   * @param before 元の言語の言語コード（デフォルトは英語の 'en'）。
   * @param after 翻訳後の言語の言語コード（デフォルトは日本語の 'ja'）。
   * @returns 翻訳されたメッセージ（文字列）。翻訳が失敗した場合は null。
   */
  async translate(
    gasUrl: string,
    message: string,
    before = 'en',
    after = 'ja'
  ): Promise<string | null> {
    const logger = Logger.configure('Utils.translate')

    // Google Apps Scriptサービスに翻訳リクエストを送信
    const response = await axios.post(
      gasUrl,
      {
        before,
        after,
        text: message,
        mode: 'html',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      }
    )

    // レスポンスのステータスに応じて、翻訳が成功したかどうかを確認
    if (response.status !== 200) {
      logger.warn(`❌ メッセージの翻訳に失敗しました：${response.status}`)
      return null
    }

    // レスポンスから翻訳されたメッセージを返す
    return response.data.response.result
  },
  /**
   * 改行されたテキストを指定された文字数制限内で分割する
   *
   * @param {string} text 分割対象のテキスト
   * @param {number} limit 1つのチャンクに含める最大の文字数
   * @returns 制限内で分割されたテキストの配列
   */
  chunkedText(text: string, limit: number): string[] {
    // テキストを行ごとに分割
    const lines = text.split('\n')
    // チャンクを格納するための配列
    const chunks: string[] = []

    // 現在のチャンクを表す配列
    const currentChunk: string[] = []

    // 各行に対して、以下の処理を実施
    // 現在のチャンクの文字数が追加することによって制限を超える場合は、現在のチャンクが空でない場合に限り、現在のチャンクを保存して新しいチャンクを作成
    // 1行の文字数が制限を超えている場合は、1行を文字数で分割してチャンクに追加
    // 1行の文字数が制限を超えてはいないが、現在のチャンクの文字数が追加することによって制限を超える場合は、現在のチャンクを保存して新しいチャンクを作成
    // それ以外の場合は、現在のチャンクに行を追加
    for (const line of lines) {
      // 現在のチャンクの文字数が追加することによって制限を超える場合は、現在のチャンクが空でない場合に限り、現在のチャンクを保存して新しいチャンクを作成
      if (
        currentChunk.join('\n').length + line.length > limit &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.join('\n'))
        currentChunk.length = 0
      }

      // 1行の文字数が制限を超えている場合は、1行を文字数で分割してチャンクに追加
      if (line.length > limit) {
        for (let index = 0; index < line.length; index += limit) {
          chunks.push(line.slice(index, index + limit))
        }
        continue
      }

      // 1行の文字数が制限を超えてはいないが、現在のチャンクの文字数が追加することによって制限を超える場合は、現在のチャンクを保存して新しいチャンクを作成
      if (currentChunk.join('\n').length + line.length > limit) {
        chunks.push(currentChunk.join('\n'))
        currentChunk.length = 0
      }

      // 現在のチャンクに行を追加
      currentChunk.push(line.trim())
    }

    // ループ終了後、最後のチャンクが残っていれば保存
    if (currentChunk.join('\n').length > 0) {
      chunks.push(currentChunk.join('\n'))
    }

    // 分割されたテキストの配列を返す
    return chunks
  },
}
