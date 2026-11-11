# 接入指南

本文对应 SDK 0.3.0与 Mira 宿主 API 1.3。接口细节见 [API 参考](api.md)，维护步骤见 [开发与发布](development.md)。

## 运行条件

Mira 与 Harness 指同一个桌面主应用；Workbench 等可选安装应用称为子应用。本 SDK 面向子应用的网页前端，实际能力由 Mira 的 Electron 主进程提供。

SDK 是 ESM 包，提供 JavaScript 和 TypeScript 类型声明。将其与子应用前端一起构建，构建输出使用相对资源路径。SDK 不启动 Electron、不提供数据库引擎或模型服务，也不在普通浏览器中自动模拟宿主。

真实接入需要宿主识别应用包、创建隔离应用页面并交付连接。`connectMiraApp()` 应在浏览器客户端调用；普通顶层网页没有 Mira 的连接入口时会返回 `UNAVAILABLE`。服务端渲染阶段不要调用该函数。

## 安装

SDK 0.3.0 通过 GitHub 标签分发，尚未发布到 npm。固定安装该版本：

```sh
npm install github:MiraWorkspace/Mira-App-SDK#v0.3.0
```

GitHub 安装通过 `prepare` 自动构建，需要 Node.js、npm、Git，并能下载构建依赖。不要关闭安装脚本，否则包中可能缺少生成的 `dist/`。

应用仍按包名导入：

```ts
import { connectMiraApp } from '@mira/app-sdk'
```

完成 npm 发布后，可改为 `npm install @mira/app-sdk@0.3.0`。更新依赖后需要重新构建、分发子应用，已生成的应用包不会自动切换 SDK 版本。

## 应用清单

构建目录中提供 `app-manifest.json` 和网页入口。例如只使用数据库与主题时：

```json
{
  "manifestVersion": 1,
  "id": "example-notes",
  "name": "示例笔记",
  "version": "0.1.0",
  "entry": "index.html",
  "runtime": "platform",
  "minShellVersion": "0.1.0-beta.1",
  "platformApi": { "major": 1, "minor": 3 },
  "requiredCapabilities": ["storage:app", "appearance:read"]
}
```

| 字段 | 含义 |
| --- | --- |
| `manifestVersion` | 当前为 `1` |
| `id` | 字母开头的小写字母、数字、连字符，最长 64 字符 |
| `name`、`version` | 显示名称和 SemVer 应用版本；不是 SDK 版本 |
| `entry` | 包内相对网页路径，不能指向外部网址或越出包目录 |
| `runtime` | 显式声明 `platform` 使用隔离应用运行时，要求 API 至少为 1.1 |
| `minShellVersion` | 应用实际验证过的最低 Mira 版本；示例值需要按发布情况调整 |
| `platformApi` | 应用要求的宿主 API 版本，本文示例使用 1.3 |
| `requiredCapabilities` | 本应用使用的宿主能力列表 |

可选 `description` 和包内相对路径 `icon` 用于显示说明与图标。宿主检查清单、版本兼容和安装身份。子应用通过调试目录扫描或“发现”安装；SDK 不提供子应用安装接口，也不能通过参数切换应用身份。

## 能力与权限

| 清单能力 | 对应接口 |
| --- | --- |
| 无额外能力 | `context.get()` |
| `storage:app` | `storage.migrate()`、`storage.transaction()` |
| `appearance:read` | `appearance.get()` 与主题变化事件 |
| `models:generate` | `models.listProviders/listModels/chat/generate()` |
| `web:search` | `web.search()`、允许 `models.chat({ webSearch: true })` 使用内置搜索和网页读取（API 1.3，同时需模型权限） |
| `notifications:send` | `notifications.send()` |
| `files:app` | `files` 下的全部方法 |
| `views:create` | `views.control()` 与视图消息 |
| `workbench:manage` | Workbench 专用浏览器、网站图标、旧网站数据读取 |

第一方子应用使用宿主认可的安装身份及清单能力，当前不弹 SDK 权限授权框；身份不能由应用在清单中自行声明。调用时宿主仍逐次校验权限。`context.get()` 返回当前连接的实际能力列表，申请能力并不意味着任意页面都能获得连接。

`workbench:manage` 仅供宿主识别的 Workbench 正式版与测试版使用。旧小程序迁移方法另需 `storage:app`，详见 [专用接口](api.md#workbench-专用接口)。

Workbench 自己管理的小程序不会直接成为 Mira 子应用。小程序通道连接所属应用，所属应用负责解释和授权请求；不能将小程序自报的身份视为宿主授权。

## 建立和释放连接

```ts
import { connectMiraApp } from '@mira/app-sdk'

const sdk = await connectMiraApp()
const context = await sdk.context.get()
console.log(context.appId, context.apiVersion, context.capabilities)

const applyTheme = (theme: 'light' | 'dark') => {
  document.documentElement.dataset.theme = theme
}
const unsubscribe = sdk.appearance.subscribe(applyTheme)
applyTheme(await sdk.appearance.get())

// 在页面或组件销毁时调用；同时清理应用自己创建的其他订阅。
const dispose = () => {
  unsubscribe()
  sdk.dispose()
}
window.addEventListener('pagehide', dispose, { once: true })
```

主题示例要求清单声明 `appearance:read`。订阅不会自动读取初始值，取消订阅不会关闭 SDK。组件框架中将清理函数接入组件卸载钩子；应用实例应统一管理连接，避免重复建立连接。

导航、关闭、停用或宿主撤销会话后，旧连接不能继续使用。重新打开页面时重新连接，不能复用旧实例。`dispose()` 会拒绝仍在等待响应的请求，但不保证取消宿主已经开始的操作。

## 验证接入

先确认 `context.get()` 的应用身份和 API 版本，再逐项验证清单中使用的能力：数据重启后可读、目录只读限制有效、主题跟随、断连可处理、隔离视图关闭后能清理状态。模型与通知还需要真实供应商配置及操作系统环境。

本 SDK 仓库的单元测试验证客户端消息与握手行为。它们不启动真实宿主，不等同于模型、文件权限、系统通知或 macOS/Windows 安装版验收。
