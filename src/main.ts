import { Logger } from '@book000/node-utils'
import { Config } from './config'
import { Discord } from './discord'

function main() {
  const logger = Logger.configure('main')
  const config = new Config('data/config.json')
  config.load()
  if (!config.validate()) {
    logger.error('❌ Configuration is invalid')
    logger.error(
      `💡 Missing check(s): ${config.getValidateFailures().join(', ')}`
    )
    return
  }

  logger.info('🤖 Starting discord-crosspost-auto-translate')
  const discord = new Discord(config)
  process.once('SIGINT', () => {
    logger.info('👋 SIGINT signal received.')
    ;(async () => {
      try {
        await discord.close()
        process.exit(0)
      } catch (error) {
        logger.error('Failed to close Discord client', error as Error)
        process.exit(1)
      }
    })()
  })
}

main()
