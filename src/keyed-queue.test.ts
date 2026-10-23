import { KeyedLatestQueue } from './keyed-queue'

function createDeferred() {
  const { promise, resolve, reject } = Promise.withResolvers<undefined>()
  return {
    promise,
    resolve: () => {
      resolve(undefined)
    },
    reject,
  }
}

async function flushPromises() {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function getStateCount(queue: KeyedLatestQueue): number {
  return (queue as unknown as { states: Map<string, unknown> }).states.size
}

describe('KeyedLatestQueue', () => {
  it('should not overlap tasks of the same key', async () => {
    const queue = new KeyedLatestQueue()
    const events: string[] = []
    const first = createDeferred()

    const firstRun = queue.run('key', async () => {
      events.push('first:start')
      await first.promise
      events.push('first:end')
    })
    await flushPromises()
    const secondRun = queue.run('key', () => {
      events.push('second:start')
      return Promise.resolve()
    })

    await flushPromises()
    expect(events).toEqual(['first:start'])

    first.resolve()
    await Promise.all([firstRun, secondRun])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('should run only the latest waiting task and resolve skipped ones', async () => {
    const queue = new KeyedLatestQueue()
    const executed: string[] = []
    const first = createDeferred()

    const firstRun = queue.run('key', async () => {
      executed.push('first')
      await first.promise
    })
    await flushPromises()
    const skippedRun = queue.run('key', () => {
      executed.push('skipped')
      return Promise.resolve()
    })
    const latestRun = queue.run('key', () => {
      executed.push('latest')
      return Promise.resolve()
    })

    await flushPromises()
    first.resolve()

    await expect(firstRun).resolves.toBeUndefined()
    await expect(skippedRun).resolves.toBeUndefined()
    await expect(latestRun).resolves.toBeUndefined()
    expect(executed).toEqual(['first', 'latest'])
  })

  it('should not block tasks of different keys', async () => {
    const queue = new KeyedLatestQueue()
    const blocked = createDeferred()
    const executed: string[] = []

    const blockedRun = queue.run('a', async () => {
      executed.push('a:start')
      await blocked.promise
    })
    await queue.run('b', () => {
      executed.push('b')
      return Promise.resolve()
    })

    expect(executed).toEqual(['a:start', 'b'])

    blocked.resolve()
    await blockedRun
  })

  it('should run the next task and reject the failed one with the same error', async () => {
    const queue = new KeyedLatestQueue()
    const executed: string[] = []
    const first = createDeferred()
    const error = new Error('first failed')

    const firstRun = queue.run('key', async () => {
      executed.push('first')
      await first.promise
    })
    await flushPromises()
    const secondRun = queue.run('key', () => {
      executed.push('second')
      return Promise.resolve()
    })

    await flushPromises()
    first.reject(error)

    await expect(firstRun).rejects.toBe(error)
    await expect(secondRun).resolves.toBeUndefined()
    expect(executed).toEqual(['first', 'second'])
  })

  it('should convert a synchronous throw into a rejection', async () => {
    const queue = new KeyedLatestQueue()
    const error = new Error('sync failure')

    await expect(
      queue.run('key', () => {
        throw error
      })
    ).rejects.toBe(error)
  })

  it('should skip a task superseded before it started', async () => {
    const queue = new KeyedLatestQueue()
    const executed: string[] = []

    const firstRun = queue.run('key', () => {
      executed.push('first')
      return Promise.resolve()
    })
    const secondRun = queue.run('key', () => {
      executed.push('second')
      return Promise.resolve()
    })

    await Promise.all([firstRun, secondRun])
    expect(executed).toEqual(['second'])
  })

  it('should drop the state of a key after all tasks finished', async () => {
    const queue = new KeyedLatestQueue()
    const first = createDeferred()

    const firstRun = queue.run('key', () => first.promise)
    await flushPromises()
    const secondRun = queue.run('key', () => Promise.resolve())

    await flushPromises()
    expect(getStateCount(queue)).toBe(1)

    first.resolve()
    await Promise.all([firstRun, secondRun])
    expect(getStateCount(queue)).toBe(0)
  })
})
