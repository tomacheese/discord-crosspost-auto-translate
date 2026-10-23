import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  Client,
  Message,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js'
import { Configuration } from './config'
import { EventHandler } from './event'
import { Utils } from './utils'

type Deferred = ReturnType<typeof createDeferred>

interface ReplyStub {
  id: string
  edit: jest.Mock
  delete: jest.Mock
}

function createDeferred() {
  const { promise, resolve } = Promise.withResolvers<undefined>()
  return {
    promise,
    resolve: () => {
      resolve(undefined)
    },
  }
}

async function flushPromises() {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

/**
 * Discord のチャンネルとメッセージのスタブを組み立てる。
 *
 * @param sendGate `channel.send` が返信を返す前に待つ deferred
 * @returns スタブ一式
 */
function createEnvironment(sendGate?: Deferred) {
  const replies = new Map<string, ReplyStub>()
  const translateGates = new Map<string, Deferred>()
  let replyCounter = 0

  const channel = {
    isTextBased: () => true,
    permissionsFor: () =>
      new PermissionsBitField(PermissionFlagsBits.SendMessages),
    send: jest.fn(async () => {
      if (sendGate) {
        await sendGate.promise
      }
      replyCounter++
      const stub: ReplyStub = {
        id: `reply-${replyCounter}`,
        edit: jest.fn(() => Promise.resolve(stub)),
        delete: jest.fn(() => Promise.resolve(stub)),
      }
      replies.set(stub.id, stub)
      return stub
    }),
    messages: {
      fetch: jest.fn((id: string) => {
        const reply = replies.get(id)
        return reply
          ? Promise.resolve(reply)
          : Promise.reject(new Error(`Unknown message ${id}`))
      }),
    },
  }

  const translate = jest
    .spyOn(Utils, 'translate')
    .mockImplementation(async (_gasUrl, text) => {
      const gate = translateGates.get(text)
      if (gate) {
        await gate.promise
      }
      return 'こんにちは'
    })

  const createMessage = (id: string, content = 'hello') =>
    ({
      partial: false,
      id,
      content,
      author: { id: 'author' },
      inGuild: () => true,
      flags: { has: (flag: string) => flag === 'IsCrosspost' },
      channel,
    }) as unknown as Message<true>

  const client = { user: { id: 'bot' } } as unknown as Client
  const config = {
    get: () => ({
      gasUrl: 'https://example.com/gas',
      fromLanguage: 'en',
      toLanguage: 'ja',
    }),
  } as unknown as Configuration

  return {
    channel,
    replies,
    translate,
    translateGates,
    createMessage,
    handler: new EventHandler(client, config),
  }
}

describe('EventHandler', () => {
  let tempDirectory: string
  let repliesPath: string
  let originalRepliesPath: string | undefined

  const readReplies = (): unknown =>
    JSON.parse(fs.readFileSync(repliesPath, 'utf8'))

  beforeEach(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'replies-'))
    repliesPath = path.join(tempDirectory, 'replies.json')
    originalRepliesPath = process.env.REPLIES_MESSAGE_PATH
    process.env.REPLIES_MESSAGE_PATH = repliesPath
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalRepliesPath === undefined) {
      delete process.env.REPLIES_MESSAGE_PATH
    } else {
      process.env.REPLIES_MESSAGE_PATH = originalRepliesPath
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true })
  })

  describe('concurrent events of the same crosspost', () => {
    it('should send the translated reply once and edit it for the later event', async () => {
      const sendGate = createDeferred()
      const { handler, channel, replies, createMessage } =
        createEnvironment(sendGate)
      const message = createMessage('source-1')

      const createRun = handler.onMessageCreate(message)
      await flushPromises()
      const updateRun = handler.onMessageUpdate(message, message)
      await flushPromises()
      sendGate.resolve()
      await Promise.all([createRun, updateRun])

      expect(channel.send).toHaveBeenCalledTimes(1)
      expect(replies.get('reply-1')?.edit).toHaveBeenCalledTimes(1)
      expect(readReplies()).toEqual({ 'source-1': ['reply-1'] })
    })

    it('should translate only the first and the latest of queued events', async () => {
      const { handler, translate, translateGates, createMessage } =
        createEnvironment()
      const message = createMessage('source-1', 'blocked')
      const translateGate = createDeferred()
      translateGates.set('blocked', translateGate)

      const createRun = handler.onMessageCreate(message)
      await flushPromises()
      const updateRuns = [
        handler.onMessageUpdate(message, message),
        handler.onMessageUpdate(message, message),
      ]
      await flushPromises()
      translateGate.resolve()
      await Promise.all([createRun, ...updateRuns])

      expect(translate).toHaveBeenCalledTimes(2)
    })
  })

  describe('concurrent events of different crossposts', () => {
    it('should not block one crosspost on another', async () => {
      const { handler, replies, translateGates, createMessage } =
        createEnvironment()
      const translateGate = createDeferred()
      translateGates.set('blocked', translateGate)

      const blockedRun = handler.onMessageCreate(
        createMessage('source-blocked', 'blocked')
      )
      await handler.onMessageCreate(createMessage('source-free', 'free'))

      expect(readReplies()).toEqual({ 'source-free': ['reply-1'] })

      translateGate.resolve()
      await blockedRun
      expect(replies.size).toBe(2)
    })
  })

  describe('saving replies', () => {
    it('should write to a temporary file and rename it over the replies file', async () => {
      const { handler, createMessage } = createEnvironment()
      const temporaryPath = `${repliesPath}.tmp`
      const writeSpy = jest.spyOn(fs, 'writeFileSync')
      const renameSpy = jest.spyOn(fs, 'renameSync')

      await handler.onMessageCreate(createMessage('source-1'))

      const writtenPaths = writeSpy.mock.calls
        .map(([file]) => file)
        .filter((file) => file === repliesPath || file === temporaryPath)
      expect(writtenPaths).toEqual([temporaryPath])
      expect(renameSpy).toHaveBeenCalledWith(temporaryPath, repliesPath)
    })

    it('should keep the replies file untouched when writing fails', async () => {
      const { handler, createMessage } = createEnvironment()
      const temporaryPath = `${repliesPath}.tmp`
      const original = JSON.stringify({ other: ['reply-x'] })
      fs.writeFileSync(repliesPath, original)
      const error = new Error('write failed')
      const originalWrite = fs.writeFileSync.bind(fs)
      jest
        .spyOn(fs, 'writeFileSync')
        .mockImplementation((file, data, options) => {
          if (file === repliesPath) {
            originalWrite(file, '{"other": ["reply-x"', options)
            throw error
          }
          if (file === temporaryPath) {
            throw error
          }
          originalWrite(file, data, options)
        })

      await expect(
        handler.onMessageCreate(createMessage('source-1'))
      ).rejects.toBe(error)
      expect(fs.readFileSync(repliesPath, 'utf8')).toBe(original)
    })

    it('should keep the replies file untouched when renaming fails', async () => {
      const { handler, createMessage } = createEnvironment()
      const original = JSON.stringify({ other: ['reply-x'] })
      fs.writeFileSync(repliesPath, original)
      const error = new Error('rename failed')
      jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw error
      })

      await expect(
        handler.onMessageCreate(createMessage('source-1'))
      ).rejects.toBe(error)
      expect(fs.readFileSync(repliesPath, 'utf8')).toBe(original)
    })

    it('should keep other entries and leave no temporary file', async () => {
      const { handler, createMessage } = createEnvironment()
      fs.writeFileSync(repliesPath, JSON.stringify({ other: ['reply-x'] }))

      await handler.onMessageCreate(createMessage('source-1'))

      expect(readReplies()).toEqual({
        other: ['reply-x'],
        'source-1': ['reply-1'],
      })
      expect(fs.existsSync(`${repliesPath}.tmp`)).toBe(false)
    })
  })
})
