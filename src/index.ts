export type AppValue = string | number | null
export type AppColumn = { name: string; type: 'TEXT' | 'INTEGER' | 'REAL'; primaryKey?: boolean; notNull?: boolean }
export type AppOperation =
  | { type: 'insert'; table: string; values: Record<string, AppValue> }
  | { type: 'update'; table: string; values: Record<string, AppValue>; where: Record<string, AppValue> }
  | { type: 'delete'; table: string; where: Record<string, AppValue> }
  | { type: 'select'; table: string; where?: Record<string, AppValue>; orderBy?: Array<{ column: string; direction: 'asc' | 'desc' }>; limit?: number; offset?: number }
export type AppMigration = { version: number; tables?: Array<{ name: string; columns: AppColumn[] }>; addColumns?: Array<{ table: string; column: AppColumn }>; operations?: AppOperation[] }
export type Theme = 'light' | 'dark'
export interface AppContext { appId: string; apiVersion: { major: number; minor: number }; capabilities: string[] }
export interface ModelRequest { prompt: string; providerId?: string; modelId?: string }
export interface ModelResult { text: string }
export interface NotificationRequest { title: string; body?: string }
export type WorkbenchBrowserRequest =
  | { type: 'open'; tabId: string; url: string }
  | { type: 'control'; tabId: string; action: 'back' | 'forward' | 'reload' | 'stop' | 'close' }
  | { type: 'layout'; tabId: string; visible: boolean; bounds: { x: number; y: number; width: number; height: number } }

export interface DirectoryGrant { id: string; name: string; access: 'read' | 'readwrite' }
export interface FileLocation { path: string; grant?: string }
export interface ViewRequest { viewId: number; requestId: string; method: string; params?: unknown }
export type ViewControl =
  | { type: 'open'; key: string; directory: string; entry: string }
  | { type: 'close'; id: number }
  | { type: 'layout'; id: number; visible: boolean; bounds: { x: number; y: number; width: number; height: number } }
  | { type: 'reply'; id: number; requestId: string; ok: boolean; value?: unknown; error?: string }
  | { type: 'event'; id: number; event: string; value: unknown }

export class MiraSdkError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'MiraSdkError' }
}

type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }

/** A port is supplied by the Mira host for one app instance and must not be shared. */
export class MiraAppSdk {
  private readonly pending = new Map<string, Pending>()
  private readonly themeListeners = new Set<(theme: Theme) => void>()
  private readonly viewListeners = new Set<(event: { event: string; value: any }) => void>()
  private closed = false

  constructor(private readonly port: MessagePort, private readonly timeoutMs = 30000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid request timeout')
    port.addEventListener('message', this.onMessage)
    port.addEventListener('messageerror', this.onMessageError)
    port.start()
  }

  private readonly onMessage = (event: MessageEvent) => {
    const data: unknown = event.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) return
    const message = data as Record<string, unknown>
    if (message.type === 'mira:disconnect') { this.dispose(); return }
    if (message.type === 'mira:event' && message.event === 'appearance.changed' && (message.value === 'light' || message.value === 'dark')) {
      for (const listener of this.themeListeners) listener(message.value)
      return
    }
    if (message.type === 'mira:event' && typeof message.event === 'string' && message.event.startsWith('views.')) {
      for (const listener of this.viewListeners) listener({ event: message.event, value: message.value })
      return
    }
    if (message.type !== 'mira:response' || typeof message.id !== 'string') return
    const pending = this.pending.get(message.id)
    if (!pending) return
    if (message.ok !== true && message.ok !== false) return
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    if (message.ok) pending.resolve(message.value)
    else {
      const error = message.error && typeof message.error === 'object' ? message.error as Record<string, unknown> : {}
      pending.reject(new MiraSdkError(typeof error.code === 'string' ? error.code : 'PLATFORM_ERROR', typeof error.message === 'string' ? error.message : 'Mira request failed'))
    }
  }

  private readonly onMessageError = () => { this.dispose() }

  private request<T>(method: string, params?: unknown, timeoutMs = this.timeoutMs): Promise<T> {
    if (this.closed) return Promise.reject(new MiraSdkError('DISCONNECTED', 'Mira connection is closed'))
    const id = crypto.randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new MiraSdkError('TIMEOUT', 'Mira request timed out')) }, timeoutMs)
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer })
      try { this.port.postMessage({ type: 'mira:request', id, method, params }) }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new MiraSdkError('DISCONNECTED', 'Mira request could not be sent')) }
    })
  }

  readonly context = { get: () => this.request<AppContext>('context.get') }
  readonly storage = {
    migrate: (migrations: AppMigration[], namespace?: string) => this.request<number>('storage.migrate', { migrations, namespace }),
    transaction: (operations: AppOperation[], namespace?: string) => this.request<unknown[]>('storage.transaction', { operations, namespace }),
    legacyWorkbenchMiniapps: (id?: string) => this.request<string[] | Uint8Array | null>('storage.legacyWorkbenchMiniapps', { id }),
    importLegacyWorkbenchSites: () => this.request<string | null>('storage.importLegacyWorkbenchSites'),
  }
  readonly appearance = {
    get: () => this.request<Theme>('appearance.get'),
    subscribe: (listener: (theme: Theme) => void) => {
      if (this.closed) throw new MiraSdkError('DISCONNECTED', 'Mira connection is closed')
      this.themeListeners.add(listener)
      return () => { this.themeListeners.delete(listener) }
    },
  }
  readonly models = { generate: (request: ModelRequest) => this.request<ModelResult>('models.generate', request, Math.max(this.timeoutMs, 75000)) }
  readonly notifications = { send: (request: NotificationRequest) => this.request<void>('notifications.send', request) }
  readonly workbench = {
    browser: (request: WorkbenchBrowserRequest) => this.request<void>('workbench.browser', request),
    fetchSiteIcon: (url: string) => this.request<string | null>('workbench.fetchSiteIcon', { url }),
  }
  readonly files = {
    directories: () => this.request<DirectoryGrant[]>('files.directories'),
    read: (input: FileLocation) => this.request<Uint8Array>('files.read', input),
    write: (input: FileLocation & { data: Uint8Array }) => this.request<void>('files.write', input),
    list: (input: Partial<FileLocation> = {}) => this.request<Array<{ name: string; directory: boolean }>>('files.list', input),
    remove: (input: FileLocation) => this.request<void>('files.remove', input),
    selectDirectory: (access: 'read' | 'readwrite') => this.request<DirectoryGrant | null>('files.selectDirectory', { access }, Math.max(this.timeoutMs, 300000)),
    revoke: (id: string) => this.request<void>('files.revoke', { id }),
  }
  readonly views = {
    control: (input: ViewControl) => this.request<number | void>('views.control', input),
    subscribe: (listener: (event: { event: string; value: ViewRequest | { viewId: number } }) => void) => {
      this.viewListeners.add(listener)
      return () => { this.viewListeners.delete(listener) }
    },
  }

  dispose() {
    if (this.closed) return
    this.closed = true
    try { this.port.postMessage({ type: 'mira:disconnect' }) } catch { /* The host may already have closed the connection. */ }
    this.port.removeEventListener('message', this.onMessage)
    this.port.removeEventListener('messageerror', this.onMessageError)
    this.port.close()
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new MiraSdkError('DISCONNECTED', 'Mira connection is closed')) }
    this.pending.clear()
    this.themeListeners.clear()
    this.viewListeners.clear()
  }
}

/** Accepts a connection from the parent frame or Mira's isolated application preload. */
export function connectMiraApp(timeoutMs = 10000): Promise<MiraAppSdk> {
  const nativeHost = (window as Window & { miraAppHost?: { ready?: () => void } }).miraAppHost
  const topLevel = window.parent === window
  if (topLevel && typeof nativeHost?.ready !== 'function') return Promise.reject(new MiraSdkError('UNAVAILABLE', 'Mira host is unavailable'))
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Invalid connection timeout'))
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive) }
    const receive = (event: MessageEvent) => {
      if (event.source !== (topLevel ? window : window.parent) || event.data?.type !== 'mira:app-connect' || !event.ports[0]) return
      cleanup()
      resolve(new MiraAppSdk(event.ports[0]))
    }
    const timer = setTimeout(() => { cleanup(); reject(new MiraSdkError('TIMEOUT', 'Mira connection timed out')) }, timeoutMs)
    window.addEventListener('message', receive)
    if (topLevel) nativeHost!.ready!()
    else window.parent.postMessage({ type: 'mira:app-ready' }, '*')
  })
}
