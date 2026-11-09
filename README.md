# @mira/app-sdk

Mira 桌面端子应用的 TypeScript 客户端 SDK。子应用通过宿主提供的消息通道调用模型、数据库、文件、原生视图、主题和通知能力，无需直接依赖 Electron 或访问宿主内部模块。

当前 SDK 版本为 **0.2.0**，本文档描述 **Mira 宿主 API 1.2**。SDK 负责连接、请求响应、事件订阅及错误处理，具体能力由宿主执行并校验权限。

## 安装与使用

在 npm 首次发布前，从本仓库的版本标签安装：

```sh
npm install github:MiraWorkspace/Mira-App-SDK#v0.2.0
```

GitHub 安装会自动构建 SDK，需要开发环境提供 Node.js、npm 和 Git。应用代码仍从 `@mira/app-sdk` 导入。

发布到 npm 后，子应用可以直接安装，无需本地路径或手动复制 SDK：

```sh
npm install @mira/app-sdk@0.2.0
```

```ts
import { connectMiraApp } from '@mira/app-sdk'

const sdk = await connectMiraApp()
const context = await sdk.context.get()
console.log(context.appId, context.capabilities)

// 应用退出时释放连接。
sdk.dispose()
```

将 SDK 与子应用前端一同构建。真实调用需要运行于 Mira 宿主，并在 `app-manifest.json` 中声明所需能力；单独安装 npm 包不会获得宿主权限。普通浏览器中没有 Mira 宿主时，连接会失败。

## 能力

| 接口 | 用途 |
| --- | --- |
| `context` | 当前应用身份、宿主 API 版本、能力列表 |
| `storage` | 应用独立 SQLite、声明式迁移、事务及内部命名空间 |
| `files` | 应用文件读写、用户选择目录的授权与撤销 |
| `views` | 应用自有隔离视图、布局及请求/事件通道 |
| `appearance` | 浅色/深色主题读取与订阅 |
| `models` | 通过宿主配置的模型生成文本 |
| `notifications` | 发送系统通知 |
| `workbench` | Workbench 专用浏览器及网站图标兼容接口 |

## 文档

- [接入指南](doc/getting-started.md)：运行条件、应用清单、权限、连接与释放。
- [API 参考](doc/api.md)：完整公开方法、参数、返回值、示例、限制与错误处理。
- [开发与发布](doc/development.md)：目录结构、构建测试、打包、版本及发布流程。

这些说明均维护在当前仓库的 `doc/` 目录，随 SDK 包一同分发。公开类型定义见 [src/index.ts](src/index.ts)。

## 本地开发

```sh
git clone https://github.com/MiraWorkspace/Mira-App-SDK.git
cd Mira-App-SDK
npm ci
npm test
npm run build
```

`dist/` 是生成文件，不提交到 Git。`npm ci` 会自动构建；SDK 单元测试覆盖消息响应、主题事件、超时、断连及宿主握手。

维护者的完整检查与发布步骤见 [开发与发布](doc/development.md)。
