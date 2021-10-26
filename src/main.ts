import axios from 'axios'
import config from 'config'
import { Client, Intents, MessageFlags, TextChannel } from 'discord.js'

async function translate(
  message: string,
  before = 'en',
  after = 'ja'
): Promise<string | null> {
  const GASUrl = config.get('GASUrl')
  const response = await axios.get(
    `${GASUrl}?text=${encodeURI(message)}&before=${before}&after=${after}`
  )
  if (response.status !== 200) {
    return null
  }
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
  await translate(message.content, 'en', 'ja')
    .then((result) => {
      if (result === null) {
        return
      }
      message.reply(result)
    })
    .catch((error) => {
      console.error(error)
    })
})

client.login(config.get('discordToken'))
