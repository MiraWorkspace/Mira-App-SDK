import { MessageChannel } from 'node:worker_threads'
import { describe, expect, it, vi } from 'vitest'
import { MiraAppSdk, MiraSdkError } from '../src/index'

function setup(timeout = 1000) {
  const channel = new MessageChannel()
  return { sdk: new MiraAppSdk(channel.port1 as unknown as MessagePort, timeout), host: channel.port2 }
}

describe('Mira app SDK', () => {
  it('routes out-of-order replies to the matching requests and propagates host errors', async () => {
    const { sdk, host } = setup()
    const messages: Array<{ id: string; method: string }> = []
    host.on('message', message => {
      messages.push(message)
      if (messages.length === 2) {
        host.postMessage({ type: 'mira:response', id: messages[1].id, ok: true, value: 'dark' })
        host.postMessage({ type: 'mira:response', id: messages[0].id, ok: false, error: { code: 'DENIED', message: 'Denied' } })
      }
    })
    const first = sdk.context.get(), second = sdk.appearance.get()
    await expect(first).rejects.toMatchObject({ code: 'DENIED', message: 'Denied' })
    await expect(second).resolves.toBe('dark')
    expect(messages.map(message => message.method)).toEqual(['context.get', 'appearance.get'])
    sdk.dispose(); host.close()
  })

  it('delivers theme updates only while subscribed and rejects pending requests on disconnect', async () => {
    const { sdk, host } = setup()
    const listener = vi.fn(), unsubscribe = sdk.appearance.subscribe(listener)
    host.postMessage({ type: 'mira:event', event: 'appearance.changed', value: 'dark' })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledExactlyOnceWith('dark'))
    unsubscribe()
    const pending = sdk.models.generate({ prompt: 'hello' })
    host.postMessage({ type: 'mira:event', event: 'appearance.changed', value: 'light' })
    host.postMessage({ type: 'mira:disconnect' })
    await expect(pending).rejects.toMatchObject({ code: 'DISCONNECTED' })
    expect(listener).toHaveBeenCalledOnce()
    await expect(sdk.context.get()).rejects.toBeInstanceOf(MiraSdkError)
    host.close()
  })

  it('times out unanswered requests and ignores late replies', async () => {
    const { sdk, host } = setup(20)
    await expect(sdk.storage.transaction([{ type: 'select', table: 'items' }])).rejects.toMatchObject({ code: 'TIMEOUT' })
    sdk.dispose(); host.close()
  })

  it('allows model calls enough time for the host model deadline', async () => {
    vi.useFakeTimers()
    const port = { addEventListener: vi.fn(), removeEventListener: vi.fn(), start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
    const sdk = new MiraAppSdk(port as unknown as MessagePort, 1000)
    const pending = sdk.models.generate({ prompt: 'hello' })
    const rejected = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(74999)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    await rejected
    sdk.dispose(); vi.useRealTimers()
  })
})
