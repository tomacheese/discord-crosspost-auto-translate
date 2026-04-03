import { Logger } from '@book000/node-utils'
import { Configuration } from './config'
import { Discord } from './discord'

function main() {
  const logger = Logger.configure('main')
  const config = new Configuration('data/config.json')
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
    discord
      .close()
      .then(() => {
        process.exit(0)
      })
      .catch((err: unknown) => {
        logger.error('Failed to close Discord client', err as Error)
        process.exit(1)
      })
  })
}

main()
