import { MessageChannel } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectMiraApp } from '../src/index'

afterEach(() => vi.unstubAllGlobals())
function message(target: EventTarget, source: unknown, port: MessagePort) {
  const event = new Event('message')
  Object.defineProperties(event, { source: { value: source }, data: { value: { type: 'mira:app-connect' } }, ports: { value: [port] } })
  target.dispatchEvent(event)
}

describe('application SDK connection handshake', () => {
  it('accepts the isolated preload connection for a top-level application', async () => {
    const frame = Object.assign(new EventTarget(), { parent: undefined as unknown, miraAppHost: { ready: vi.fn() } })
    frame.parent = frame
    vi.stubGlobal('window', frame)
    const channel = new MessageChannel(), connecting = connectMiraApp()
    expect(frame.miraAppHost.ready).toHaveBeenCalledOnce()
    message(frame, {}, channel.port1 as unknown as MessagePort)
    message(frame, frame, channel.port1 as unknown as MessagePort)
    const sdk = await connecting
    sdk.dispose(); channel.port2.close()
  })

  it('only accepts the parent frame when embedded and rejects ordinary top-level pages', async () => {
    const parent = { postMessage: vi.fn() }, frame = Object.assign(new EventTarget(), { parent })
    vi.stubGlobal('window', frame)
    const channel = new MessageChannel(), connecting = connectMiraApp()
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'mira:app-ready' }, '*')
    message(frame, frame, channel.port1 as unknown as MessagePort)
    message(frame, parent, channel.port1 as unknown as MessagePort)
    const sdk = await connecting
    sdk.dispose(); channel.port2.close()
    vi.stubGlobal('window', { parent: null })
    const standalone = globalThis.window as unknown as { parent: unknown }
    standalone.parent = standalone
    await expect(connectMiraApp()).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })
})
