import axios from 'axios'
import config from 'config'
import { Client, Intents, MessageFlags, TextChannel } from 'discord.js'

function escape(text: string): string {
  return text
    .replaceAll(
      /https?:\/\/[^\s]+/g,
      '<span translate="no" data-type="url">$&</span>'
    )
    .replaceAll(
      /```([\s\S\n]+?)```/g,
      '<span translate="no" data-type="code-block">$1</span>'
    )
    .replaceAll(
      /`([\s\S\n]+?)`/g,
      '<span translate="no" data-type="code">$1</span>'
    )
    .replaceAll(
      /<[@#at:]\S+>/g,
      '<span translate="no" data-type="formatting">$&</span>'
    )
    .replaceAll(/\*\*/g, '<span translate="no" data-type="strong">**</span>')
}
function unescape(text: string): string {
  return text
    .replaceAll(/<span translate="no" data-type="url">([^<]+)<\/span>/g, '$1')
    .replaceAll(
      /<span translate="no" data-type="code-block">([\s\S\n]+?)<\/span>/g,
      '```$1```'
    )
    .replaceAll(
      /<span translate="no" data-type="formatting">([\s\S\n]+?)<\/span>/g,
      '$1'
    )
    .replaceAll(
      /<span translate="no" data-type="strong">([\s\S\n]+?)<\/span>/g,
      '$1'
    )
}

async function translate(
  message: string,
  before = 'en',
  after = 'ja'
): Promise<string | null> {
  const GASUrl = config.get('GASUrl') as string
  const response = await axios.post(
    GASUrl,
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
  if (response.status !== 200) {
    return null
  }
  console.log(response.data)
  return response.data.response.result
}

const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
})

client.on('ready', async () => {
  console.log(`ready: ${client.user?.tag}`)
})

client.on('messageCreate', async (message) => {
  if (!(message.channel instanceof TextChannel)) {
    return // テキストチャンネルのメッセージではない
  }
  if (!message.flags.has(MessageFlags.FLAGS.IS_CROSSPOST)) {
    // フォローメッセージではない
    return
  }
  if (message.author.id === client.user?.id) {
    return // 自分自身
  }
  if (message.content.length === 0) {
    return // 空文字列
  }
  await translate(escape(message.content), 'auto', 'ja')
    .then((result) => {
      console.log('Result: ' + result)
      if (result === null) {
        return
      }
      result = unescape(result)
      if (message.content === result) {
        return
      }
      message.reply(result)
    })
    .catch((error) => {
      console.error(error)
    })
})

client.login(config.get('discordToken'))
