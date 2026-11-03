interface KeyState {
  /** Resolves when the most recently enqueued task finishes. */
  tail: Promise<void>
  /** Last ticket number issued. */
  latest: number
  /** Number of running or waiting tasks. */
  count: number
}

/**
 * Serializes tasks per key and collapses waiting tasks into the latest one.
 */
export class KeyedLatestQueue {
  private readonly states = new Map<string, KeyState>()

  /**
   * Runs a task serialized per key.
   *
   * If a newer task for the same key is enqueued, older tasks that have not started yet are skipped and treated as completed.
   * A task that has already started is never interrupted.
   *
   * @returns Resolves when the task completes; rejects with the same error if it fails
   */
  async run(key: string, task: () => Promise<void>): Promise<void> {
    // Keep everything from ticket assignment to the tail update synchronous (no await)
    let state = this.states.get(key)
    if (!state) {
      state = { tail: Promise.resolve(), latest: 0, count: 0 }
      this.states.set(key, state)
    }
    const ticket = ++state.latest
    state.count++
    const previous = state.tail
    // The tail only ever resolves; rejecting it would propagate a failure to later tasks
    const completion = Promise.withResolvers<undefined>()
    state.tail = completion.promise

    try {
      await previous
      // An await between this check and the task would miss tasks enqueued in between
      if (ticket !== state.latest) {
        return
      }
      await task()
    } finally {
      completion.resolve(undefined)
      state.count--
      if (state.count === 0) {
        this.states.delete(key)
      }
    }
  }
}
