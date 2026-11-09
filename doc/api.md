# API 参考

对应 SDK 0.2.0 与 Mira 宿主 API 1.2。本文同时说明客户端方法和当前宿主限制；主进程服务不会因安装 SDK 而在普通网页中出现。应用清单与连接步骤见 [接入指南](getting-started.md)。

## 连接与生命周期

```ts
connectMiraApp(timeoutMs?: number): Promise<MiraAppSdk>
new MiraAppSdk(port: MessagePort, timeoutMs?: number)
sdk.dispose(): void
```

`connectMiraApp()` 默认等待连接 10000 毫秒，只接受当前顶层页面的隔离 preload，或嵌入页面的父窗口交付的连接。它的参数控制握手等待时间，不是后续方法的请求超时。

`MiraAppSdk` 构造器用于已经持有宿主交付端口的调用方和测试，默认方法请求超时为 30000 毫秒。应用通常使用 `connectMiraApp()`，无需自行创建端口。超时参数必须是大于零的有限数。

`dispose()` 可重复调用，会关闭端口、清空订阅，将待完成请求以 `DISCONNECTED` 拒绝。SDK 不自动重连或重试；超时不会取消宿主侧操作，不能据此认定写入失败或成功。

## 应用上下文

```ts
sdk.context.get(): Promise<AppContext>
```

不需要额外能力，返回宿主绑定的身份与能力：

```ts
interface AppContext {
  appId: string
  apiVersion: { major: number; minor: number }
  capabilities: string[]
}
```

当前 Mira 宿主返回 API 1.2。该方法不接受应用 ID，不返回模型凭据、宿主路由或用户完整配置。

## 数据库存储

需要 `storage:app`。

```ts
sdk.storage.migrate(migrations: AppMigration[], namespace?: string): Promise<number>
sdk.storage.transaction(operations: AppOperation[], namespace?: string): Promise<unknown[]>
```

默认访问当前应用独立 SQLite 数据库。可选 `namespace` 在应用内部进一步隔离数据库：以小写字母开头，只含小写字母、数字、连字符，最长 64 字符。同名 namespace 在不同应用中不共享数据，也不能用它选择其他应用。

`migrate()` 返回迁移后的数据库版本。迁移按版本递增，从 1 连续新增；已执行的同内容迁移可重复提交，不能修改历史迁移。支持创建表、添加可空且非主键列，以及不含 `select` 的数据操作。表、列名以字母开头，只含字母、数字、下划线，最长 63 字符，不能使用 `sqlite_`、`mira_` 前缀。

```ts
await sdk.storage.migrate([{
  version: 1,
  tables: [{ name: 'notes', columns: [
    { name: 'id', type: 'TEXT', primaryKey: true },
    { name: 'title', type: 'TEXT', notNull: true },
  ] }],
}])

await sdk.storage.transaction([
  { type: 'insert', table: 'notes', values: { id: 'one', title: '第一条' } },
])
const [rows] = await sdk.storage.transaction([
  { type: 'select', table: 'notes', orderBy: [{ column: 'id', direction: 'asc' }], limit: 100, offset: 0 },
])
console.log(rows)
```

| 操作 | 参数 | 对应结果 |
| --- | --- | --- |
| `insert` | `table`、`values` | 插入行数 |
| `update` | `table`、`values`、非空 `where` | 更新行数 |
| `delete` | `table`、非空 `where` | 删除行数 |
| `select` | `table`、可选 `where/orderBy/limit/offset` | 行对象数组 |

字段类型为 `TEXT / INTEGER / REAL`，值为 `string / number / null`，数值必须有限。`where` 为字段相等条件，多字段以 AND 连接；不支持任意 SQL、范围表达式、JOIN 或事务回调。`transaction()` 按操作顺序返回结果数组，整体原子执行，失败回滚。

当前宿主限制：单次最多 10000 个操作、100 个查询、4 MiB 序列化操作内容；查询默认 100 行，`limit` 为 1–1000，`offset` 为非负安全整数；排序最多 8 列。每个字段映射最多 64 项，字符串值最多 1048576 个 JavaScript 字符。一次最多提交 100 个迁移，每个迁移的建表、加列与数据操作合计最多 100 项，序列化内容最多 1 MiB。

## 文件和目录授权

全部需要 `files:app`。

```ts
interface FileLocation { path: string; grant?: string }
interface DirectoryGrant { id: string; name: string; access: 'read' | 'readwrite' }
```

不传 `grant` 时，相对路径位于当前应用专属文件区。传入目录授权 ID 后，路径相对于用户选择的目录。授权绑定应用并持久化保存，不能跨应用使用；SDK 不向页面暴露授权目录的绝对路径。

| 方法 | 返回值与行为 |
| --- | --- |
| `files.directories()` | `Promise<DirectoryGrant[]>`，列出当前应用保存的目录授权 |
| `files.selectDirectory(access)` | `Promise<DirectoryGrant \| null>`，`access` 为 `read` 或 `readwrite`；弹出原生选择器，取消返回 `null` |
| `files.revoke(id)` | `Promise<void>`，撤销指定目录授权，不删除目录内容 |
| `files.read(location)` | `Promise<Uint8Array>`，读取文件字节 |
| `files.write({ path, grant?, data })` | `Promise<void>`，`data` 为 `Uint8Array`；创建父目录并原子替换文件 |
| `files.list(location?)` | `Promise<Array<{ name: string; directory: boolean }>>`，列出直接子项，默认列出应用文件区根目录 |
| `files.remove(location)` | `Promise<void>`，递归删除指定文件或目录 |

```ts
await sdk.files.write({ path: 'notes/first.txt', data: new TextEncoder().encode('你好') })
const bytes = await sdk.files.read({ path: 'notes/first.txt' })
console.log(new TextDecoder().decode(bytes))

const grant = await sdk.files.selectDirectory('read')
if (grant) {
  const entries = await sdk.files.list({ grant: grant.id })
  console.log(entries)
  await sdk.files.revoke(grant.id)
}
```

路径使用 `/` 分隔，最长 1024 字符；拒绝绝对路径、路径穿越、符号链接、反斜杠、控制字符和平台不兼容路径。仅 `list` 可使用空路径表示根目录。读写单文件最大 64 MiB。只读授权不能写入或删除；`remove` 不经过系统废纸篓。选择目录请求的客户端超时至少为 300000 毫秒。

## 主题

需要 `appearance:read` 才能读取主题和接收宿主变化事件。

```ts
sdk.appearance.get(): Promise<'light' | 'dark'>
sdk.appearance.subscribe(listener: (theme: 'light' | 'dark') => void): () => void
```

`subscribe()` 注册本地监听，返回取消函数，不立即回调初始主题，也不授予权限。使用 `get()` 获取当前值，订阅方式见 [接入指南](getting-started.md#建立和释放连接)。

## 模型生成

需要 `models:generate`。

```ts
sdk.models.generate(request: ModelRequest): Promise<ModelResult>

interface ModelRequest { prompt: string; providerId?: string; modelId?: string }
interface ModelResult { text: string }
```

```ts
const { text } = await sdk.models.generate({ prompt: '用一句话解释什么是工作流。' })
console.log(text)
```

不指定模型时使用 Mira 配置的默认模型；指定时必须同时提供 `providerId` 与 `modelId`。当前仅使用可用的聊天模型，密钥由宿主持有。`prompt` 必须非空，最长 100000 个 JavaScript 字符，供应商 ID 最长 128 字符，模型 ID 最长 256 字符。

当前宿主为单条用户提示词调用，返回完整文本，不提供流式输出、多轮消息、附件、工具调用、模型列表或取消接口。输出上限为配置的 `maxTokens` 与 2048 中的较小值，宿主模型请求超时 60000 毫秒，客户端等待至少 75000 毫秒。真实调用可能产生供应商费用。

## 系统通知

需要 `notifications:send`。

```ts
sdk.notifications.send(request: NotificationRequest): Promise<void>
interface NotificationRequest { title: string; body?: string }
```

`title` 必须非空且最多 120 字符；`body` 可省略，提供时必须非空且最多 1000 字符。成功返回表示宿主通知调用完成，显示效果取决于操作系统与通知设置，不返回用户已阅读或点击的结果。

## 隔离视图

需要 `views:create`。页面资源先通过 `files.write()` 等方式写入应用文件区时，另需 `files:app`。

```ts
sdk.views.control(input: ViewControl): Promise<number | void>
sdk.views.subscribe(listener: (event: {
  event: string
  value: ViewRequest | { viewId: number }
}) => void): () => void
```

| `control` 类型 | 参数 | 行为 |
| --- | --- | --- |
| `open` | `key`、`directory`、`entry` | 打开应用自有资源页面，返回视图 ID |
| `layout` | `id`、`visible`、`bounds: { x, y, width, height }` | 设置相对父视图的位置及尺寸，受父视图边界裁剪 |
| `close` | `id` | 关闭所属视图 |
| `reply` | `id`、`requestId`、`ok`、可选 `value/error` | 回复所属视图发来的请求 |
| `event` | `id`、`event`、`value` | 向所属视图发送事件 |

`key` 以小写字母开头，只含小写字母、数字、连字符，最长 64 字符，用于视图会话隔离。`directory` 相对于创建者的专属文件区，不能选择外部授权目录或其他应用；`entry` 相对于该目录。`bounds` 各项为非负有限数。

```ts
// 假设 content/notes/index.html 及其资源已经写入当前应用的文件区。
const id = await sdk.views.control({
  type: 'open', key: 'notes', directory: 'content/notes', entry: 'index.html',
})
if (typeof id === 'number') {
  await sdk.views.control({
    type: 'layout', id, visible: true,
    bounds: { x: 0, y: 0, width: 800, height: 600 },
  })
}
```

`views.request` 的值为 `{ viewId, requestId, method, params? }`，`views.closed` 的值为 `{ viewId }`。`subscribe()` 返回取消函数；监听只分发名称以 `views.` 开头的事件。应用处理示例：

```ts
const unsubscribe = sdk.views.subscribe(({ event, value }) => {
  if (event === 'views.closed') {
    console.log('视图关闭', value.viewId)
    return
  }
  if (event !== 'views.request' || !('requestId' in value)) return
  // 示例默认拒绝；实际应用需要按 viewId 查找自有对象并实现权限校验。
  void sdk.views.control({
    type: 'reply', id: value.viewId, requestId: value.requestId,
    ok: false, error: '此方法尚未开放',
  }).catch(console.error)
})
// 所属应用退出或不再接收视图消息时调用 unsubscribe()。
```

子视图使用隔离环境，不自动继承创建者的 Mira 能力。子视图请求进入创建者的 `views.request`，不会直接进入 Mira 的模型、文件或数据库分发器；创建者负责业务协议与授权，再按需调用宿主 SDK。系统主题也不会自动转发给子视图。

当前顶层子应用可创建自有视图，子视图不能通过此宿主接口继续创建下一层视图。父视图关闭会清理其子视图，其他应用和兄弟视图不能控制不属于自己的视图。

## Workbench 专用接口

仅面向宿主识别的 `mira-workbench` 与 `mira-workbench-test`，普通应用不能通过申请同名能力获得专用身份。

| 方法 | 能力与返回值 |
| --- | --- |
| `workbench.browser(request)` | `workbench:manage`；`Promise<void>` |
| `workbench.fetchSiteIcon(url)` | `workbench:manage`；`Promise<string \| null>` |
| `storage.importLegacyWorkbenchSites()` | `workbench:manage` 和 `storage:app`；`Promise<string \| null>` |
| `storage.legacyWorkbenchMiniapps(id?)` | `storage:app` 加 Workbench 身份；`Promise<string[] \| Uint8Array \| null>` |

`browser()` 支持三类请求：

```ts
type WorkbenchBrowserRequest =
  | { type: 'open'; tabId: string; url: string }
  | { type: 'control'; tabId: string; action: 'back' | 'forward' | 'reload' | 'stop' | 'close' }
  | { type: 'layout'; tabId: string; visible: boolean; bounds: { x: number; y: number; width: number; height: number } }
```

`fetchSiteIcon()` 由宿主请求网站 `/favicon.ico`，成功返回图片 data URL，缺失或下载失败返回 `null`。地址受宿主浏览器 URL 策略限制；当前下载超时 8 秒，最多跟随 3 次重定向，图标大小最多 512 KiB。

`importLegacyWorkbenchSites()` 读取旧网站数据字符串，供 Workbench 解析并迁移，没有旧数据返回 `null`；方法名不代表宿主会替应用写入新业务表。

`legacyWorkbenchMiniapps()` 不传 ID 时列出旧小程序目录 ID；传 ID 时只读导出 ZIP 字节，并在旧数据库存在且目标尚不存在时备份到 Workbench 对应 namespace。旧根目录不存在时返回 `null`（不传 ID 时为 `[]`）；其他读取错误会拒绝请求。迁移不删除源数据、不覆盖目标、不迁移旧授权，也不安装、注册或运行小程序。

SDK 0.2.0 不包含 `workbench.apps/install/review/uninstall/revoke/app`。小程序包格式、注册表、安装更新和业务授权由 Workbench 自行管理。

## 错误与并发

请求错误通常为 `MiraSdkError`，包含稳定 `code` 和可展示的 `message`。构造器和握手超时参数校验会抛出普通 `Error`，不要假设所有异常都具有 `code`。

| 代码 | 含义 |
| --- | --- |
| `UNAVAILABLE` | 普通顶层页面没有 Mira 宿主入口 |
| `TIMEOUT` | 握手或请求等待超时，不代表宿主操作已取消 |
| `DISCONNECTED` | 连接关闭、消息错误或无法发送 |
| `CAPABILITY_DENIED` | 宿主身份授权失效、撤销或能力不足 |
| `UNKNOWN_METHOD` | 宿主不支持该方法 |
| `INVALID_REQUEST` | 宿主分发器识别为请求方法或参数格式无效 |
| `BUSY` | 当前连接已有过多正在处理的请求 |
| `PLATFORM_ERROR` | 其他宿主错误，包括部分服务层参数校验失败 |
| `APPLICATION_DENIED` | 所属应用拒绝自有子视图请求或该请求超时 |

SDK 保留宿主返回的其他错误码；不同宿主可能返回额外代码。当前 Mira 连接最多同时处理 32 个请求。缺少权限时不能靠重复调用取得权限；模型和文件等操作失败应向用户提供明确结果。涉及写入时，超时后先检查实际状态再决定重试。
