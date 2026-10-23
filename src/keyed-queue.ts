interface KeyState {
  /** 直前に投入された処理の完了を表す Promise。 */
  tail: Promise<void>
  /** 最後に採番した投入番号。 */
  latest: number
  /** 実行中または待機中の処理の数。 */
  count: number
}

/**
 * キーごとに処理を直列化し、待機中の処理は最新の 1 件に集約するキュー。
 */
export class KeyedLatestQueue {
  private readonly states = new Map<string, KeyState>()

  /**
   * キーごとに直列化して処理を実行する。
   *
   * 同じキーの処理が実行中または待機中に、より新しい処理が投入された場合、
   * 実行を開始する前の古い処理は実行されずに完了扱いになる。
   * 実行を開始した処理は中断されない。
   *
   * @param key 直列化の単位となるキー
   * @param task 実行する処理
   * @returns 処理の完了を表す Promise。処理が失敗した場合は同じエラーで reject する
   */
  async run(key: string, task: () => Promise<void>): Promise<void> {
    // 採番から末尾の更新までは await を挟まず、同期的に完結させる
    let state = this.states.get(key)
    if (!state) {
      state = { tail: Promise.resolve(), latest: 0, count: 0 }
      this.states.set(key, state)
    }
    const ticket = ++state.latest
    state.count++
    const previous = state.tail
    // 末尾を reject させると、先行処理の失敗が後続を巻き込むため resolve のみにする
    const completion = Promise.withResolvers<undefined>()
    state.tail = completion.promise

    try {
      await previous
      // 判定と実行の間に await を挟むと、その間に投入された処理を見落とす
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
