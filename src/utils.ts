import { Logger } from '@book000/node-utils'

interface TranslateResponse {
  response: {
    result: string
  }
}

export const Utils = {
  /**
   * Wraps Markdown and Discord formatting in `<span translate="no">` so the translator leaves it untouched.
   */
  escape(text: string): string {
    return (
      text
        // --- Markdown escaping ---
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
        // --- Discord escaping ---
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
   * Reverts the escaping done by {@link Utils.escape}.
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
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
    )
  },
  /**
   * Translates a message through the Google Apps Script web app.
   *
   * @param gasUrl URL of the deployed Google Apps Script web app
   * @param message Text to translate
   * @param before Source language code
   * @param after Target language code
   * @returns The translated text, or null if translation failed
   */
  async translate(
    gasUrl: string,
    message: string,
    before = 'en',
    after = 'ja'
  ): Promise<string | null> {
    const logger = Logger.configure('Utils.translate')

    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          before,
          after,
          text: message,
          mode: 'html',
        }),
      })
      if (!res.ok) {
        logger.warn(`❌ Failed to translate message: ${res.status}`)
        return null
      }
      const data = (await res.json()) as TranslateResponse
      return data.response.result
    } catch (error) {
      logger.warn(`❌ Error while translating message: ${String(error)}`)
      return null
    }
  },
  /**
   * Splits text into chunks of at most `limit` characters, breaking on line boundaries
   * (a single line longer than the limit is split by character count).
   *
   * @param limit Maximum number of characters per chunk
   */
  chunkedText(text: string, limit: number): string[] {
    const lines = text.split('\n')
    const chunks: string[] = []

    const currentChunk: string[] = []

    for (const line of lines) {
      // Adding this line would exceed the limit: flush the current chunk (if non-empty)
      if (
        currentChunk.join('\n').length + line.length > limit &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.join('\n'))
        currentChunk.length = 0
      }

      // A line longer than the limit is split by character count
      if (line.length > limit) {
        for (let index = 0; index < line.length; index += limit) {
          chunks.push(line.slice(index, index + limit))
        }
        continue
      }

      // Defensive re-check; unreachable after the flush above
      if (currentChunk.join('\n').length + line.length > limit) {
        chunks.push(currentChunk.join('\n'))
        currentChunk.length = 0
      }

      currentChunk.push(line)
    }

    if (currentChunk.join('\n').length > 0) {
      chunks.push(currentChunk.join('\n'))
    }

    return chunks
  },
}
