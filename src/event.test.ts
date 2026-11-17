import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  Client,
  DiscordAPIError,
  Message,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
} from 'discord.js'
import { Logger } from '@book000/node-utils'
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

function createUnknownMessageError() {
  return new DiscordAPIError(
    { message: 'Unknown Message', code: RESTJSONErrorCodes.UnknownMessage },
    RESTJSONErrorCodes.UnknownMessage,
    404,
    'GET',
    '/channels/c/messages/m',
    {}
  )
}

async function flushPromises() {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

/**
 * Builds stubs for a Discord channel and its messages.
 *
 * @param sendGate Deferred that `channel.send` waits on before returning a reply
 * @param translation Text returned by the mocked translation
 */
function createEnvironment(sendGate?: Deferred, translation = 'こんにちは') {
  const replies = new Map<string, ReplyStub>()
  const translateGates = new Map<string, Deferred>()
  // Errors that `channel.send` rejects with, keyed by its 1-based call number
  const sendErrors = new Map<number, Error>()
  let replyCounter = 0
  let sendCallCounter = 0

  const addReply = (id: string) => {
    const stub: ReplyStub = {
      id,
      edit: jest.fn(() => Promise.resolve(stub)),
      delete: jest.fn(() => Promise.resolve(stub)),
    }
    replies.set(id, stub)
    return stub
  }

  const channel = {
    isTextBased: () => true,
    permissionsFor: () =>
      new PermissionsBitField(PermissionFlagsBits.SendMessages),
    send: jest.fn(async () => {
      sendCallCounter++
      const sendError = sendErrors.get(sendCallCounter)
      if (sendGate) {
        await sendGate.promise
      }
      if (sendError) {
        throw sendError
      }
      replyCounter++
      return addReply(`reply-${replyCounter}`)
    }),
    messages: {
      fetch: jest.fn((id: string) => {
        const reply = replies.get(id)
        return reply
          ? Promise.resolve(reply)
          : Promise.reject(createUnknownMessageError())
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
      return translation
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
    addReply,
    sendErrors,
    translate,
    translateGates,
    createMessage,
    handler: new EventHandler(client, config),
  }
}

// Two lines of 1000 characters do not fit one 1900-character chunk
const twoChunkTranslation = `${'あ'.repeat(1000)}\n${'い'.repeat(1000)}`

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

  describe('fetching saved replies', () => {
    it('should keep existing replies and saved data when a fetch fails transiently', async () => {
      const { handler, channel, replies, createMessage } = createEnvironment()
      await handler.onMessageCreate(createMessage('source-1', 'first'))
      await handler.onMessageCreate(createMessage('source-2', 'second'))
      channel.send.mockClear()
      fs.writeFileSync(
        repliesPath,
        JSON.stringify({ 'source-1': ['reply-1', 'reply-2'] })
      )
      const error = new Error('network down')
      const fetchExisting = channel.messages.fetch.getMockImplementation()
      channel.messages.fetch.mockImplementation((id: string) =>
        id === 'reply-2'
          ? Promise.reject(error)
          : (fetchExisting?.(id) ?? Promise.reject(new Error('no stub')))
      )

      await expect(
        handler.onMessageUpdate(
          createMessage('source-1'),
          createMessage('source-1')
        )
      ).rejects.toBe(error)

      expect(replies.get('reply-1')?.delete).not.toHaveBeenCalled()
      expect(replies.get('reply-1')?.edit).not.toHaveBeenCalled()
      expect(channel.send).not.toHaveBeenCalled()
      expect(readReplies()).toEqual({ 'source-1': ['reply-1', 'reply-2'] })
    })

    it('should recreate all replies when Discord confirms one no longer exists', async () => {
      const { handler, channel, replies, createMessage } = createEnvironment()
      await handler.onMessageCreate(createMessage('source-1'))
      fs.writeFileSync(
        repliesPath,
        JSON.stringify({ 'source-1': ['reply-1', 'reply-gone'] })
      )

      await handler.onMessageUpdate(
        createMessage('source-1'),
        createMessage('source-1')
      )

      expect(replies.get('reply-1')?.delete).toHaveBeenCalledTimes(1)
      expect(channel.send).toHaveBeenCalledTimes(2)
      expect(readReplies()).toEqual({ 'source-1': ['reply-2'] })
    })
  })

  describe('partial failure while replying', () => {
    const seedReplies = (ids: string[]) => {
      fs.writeFileSync(repliesPath, JSON.stringify({ 'source-1': ids }))
    }

    it('should track the sent chunk and reject when another chunk fails to send', async () => {
      const { handler, sendErrors, createMessage } = createEnvironment(
        undefined,
        twoChunkTranslation
      )
      const sendError = new Error('send failed')
      sendErrors.set(2, sendError)

      await expect(
        handler.onMessageCreate(createMessage('source-1'))
      ).rejects.toBe(sendError)

      expect(readReplies()).toEqual({ 'source-1': ['reply-1'] })
    })

    it('should send only the missing chunk when the message is processed again', async () => {
      const { handler, channel, replies, sendErrors, createMessage } =
        createEnvironment(undefined, twoChunkTranslation)
      sendErrors.set(2, new Error('send failed'))
      await handler.onMessageCreate(createMessage('source-1')).catch(() => null)
      sendErrors.clear()
      channel.send.mockClear()

      await handler.onMessageCreate(createMessage('source-1'))

      expect(channel.send).toHaveBeenCalledTimes(1)
      expect(replies.get('reply-1')?.edit).toHaveBeenCalledTimes(1)
      expect(readReplies()).toEqual({ 'source-1': ['reply-1', 'reply-2'] })
      expect(replies.size).toBe(2)
    })

    it('should not write an entry when every chunk fails to send', async () => {
      const { handler, sendErrors, createMessage } = createEnvironment(
        undefined,
        twoChunkTranslation
      )
      const firstError = new Error('first send failed')
      sendErrors.set(1, firstError)
      sendErrors.set(2, new Error('second send failed'))

      await expect(
        handler.onMessageCreate(createMessage('source-1'))
      ).rejects.toBe(firstError)

      expect(fs.existsSync(repliesPath)).toBe(false)
    })

    it('should keep tracking an existing reply whose edit fails and delete nothing', async () => {
      const { handler, addReply, createMessage } = createEnvironment(
        undefined,
        twoChunkTranslation
      )
      const first = addReply('reply-a')
      const second = addReply('reply-b')
      seedReplies(['reply-a', 'reply-b'])
      const editError = new Error('edit failed')
      second.edit.mockRejectedValueOnce(editError)

      await expect(
        handler.onMessageCreate(createMessage('source-1'))
      ).rejects.toBe(editError)

      expect(readReplies()).toEqual({ 'source-1': ['reply-a', 'reply-b'] })
      expect(first.edit).toHaveBeenCalledTimes(1)
      expect(first.delete).not.toHaveBeenCalled()
      expect(second.delete).not.toHaveBeenCalled()
    })

    it('should keep tracking surplus replies and delete nothing when an edit fails', async () => {
      const { handler, addReply, createMessage } = createEnvironment(
        undefined,
        twoChunkTranslation
      )
      const first = addReply('reply-a')
      const second = addReply('reply-b')
      const surplus = addReply('reply-c')
      seedReplies(['reply-a', 'reply-b', 'reply-c'])
      const editError = new Error('edit failed')
      second.edit.mockRejectedValueOnce(editError)

      await expect(
        handler.onMessageCreate(createMessage('source-1'))
      ).rejects.toBe(editError)

      expect(readReplies()).toEqual({
        'source-1': ['reply-a', 'reply-b', 'reply-c'],
      })
      for (const reply of [first, second, surplus]) {
        expect(reply.delete).not.toHaveBeenCalled()
      }
    })

    it('should log how many chunks failed', async () => {
      const warn = jest.fn()
      jest
        .spyOn(Logger, 'configure')
        .mockReturnValue({ warn } as unknown as Logger)
      const { handler, sendErrors, createMessage } = createEnvironment(
        undefined,
        twoChunkTranslation
      )
      sendErrors.set(2, new Error('send failed'))

      await handler.onMessageCreate(createMessage('source-1')).catch(() => null)

      expect(warn).toHaveBeenCalledWith(
        '❌ Failed to send or edit 1 of 2 reply chunks'
      )
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
