// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutosave } from './useAutosave.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function mount(saveFn) {
  const api = {}
  function Probe() {
    Object.assign(api, useAutosave(saveFn, { delay: 700 }))
    return null
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => { root.render(<Probe />) })
  return { api, unmount: () => act(() => root.unmount()) }
}

function fireBeforeUnload() {
  const e = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(e)
  return e.defaultPrevented
}

describe('useAutosave', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('flushNow는 이미 서버로 보내는 중인 저장이 끝날 때까지 기다린다', async () => {
    const pending = deferred()
    const saveFn = vi.fn(() => pending.promise)
    const { api, unmount } = mount(saveFn)

    act(() => { api.trigger('A') })
    await act(async () => { vi.advanceTimersByTime(700) })
    expect(saveFn).toHaveBeenCalledWith('A')

    let flushed = false
    const flushing = api.flushNow().then(() => { flushed = true })
    await act(async () => { await Promise.resolve() })
    expect(flushed).toBe(false)

    await act(async () => { pending.resolve(); await flushing })
    expect(flushed).toBe(true)
    unmount()
  })

  it('저장이 끝나기 전에 떠나려 하면 확인창을 띄우고, 끝나면 띄우지 않는다', async () => {
    const pending = deferred()
    const { api, unmount } = mount(vi.fn(() => pending.promise))

    expect(fireBeforeUnload()).toBe(false)
    act(() => { api.trigger('A') })
    expect(fireBeforeUnload()).toBe(true) // 디바운스 대기 중
    await act(async () => { await Promise.resolve() })
    expect(fireBeforeUnload()).toBe(true) // 전송 중
    await act(async () => { pending.resolve(); await api.flushNow() })
    expect(fireBeforeUnload()).toBe(false)
    unmount()
  })

  it('실패하면 최신 값으로 자동 재시도한다', async () => {
    const saveFn = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined)
    const { api, unmount } = mount(saveFn)

    act(() => { api.trigger('A') })
    await act(async () => { await api.flushNow() })
    expect(api.saveState).toBe('error')
    expect(fireBeforeUnload()).toBe(true)

    await act(async () => { vi.advanceTimersByTime(3000) })
    await act(async () => { await api.flushNow() })
    expect(saveFn).toHaveBeenCalledTimes(2)
    expect(saveFn).toHaveBeenLastCalledWith('A')
    expect(api.saveState).toBe('saved')
    unmount()
  })

  it('저장 도중 새로 입력된 값은 이어서 저장된다', async () => {
    const first = deferred()
    const saveFn = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(undefined)
    const { api, unmount } = mount(saveFn)

    act(() => { api.trigger('A') })
    const f1 = api.flushNow()
    await act(async () => { await Promise.resolve() })
    expect(saveFn).toHaveBeenCalledWith('A') // 'A' 전송 중
    act(() => { api.trigger('AB') })
    const f2 = api.flushNow()
    await act(async () => { first.resolve(); await f1; await f2 })
    expect(saveFn.mock.calls.map(c => c[0])).toEqual(['A', 'AB'])
    expect(api.saveState).toBe('saved')
    unmount()
  })
})
