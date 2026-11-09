# @mira/app-sdk

Mira 桌面端子应用的 TypeScript SDK，提供应用上下文、独立 SQLite、文件与目录授权、隔离视图、主题同步、模型生成和系统通知。SDK 0.2.0 对应宿主 API 1.2。

## 安装与使用

源码独立维护于 [Mira-App-SDK](https://github.com/MiraWorkspace/Mira-App-SDK)。在 npm 首次发布前，可从 GitHub 安装：

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

完整接口、清单与权限说明见 [SDK 文档](https://github.com/MiraWorkspace/Mira-Harness/blob/main/docs/MIRA_APP_PLATFORM_SDK.md)。

## 本地开发

```sh
git clone https://github.com/MiraWorkspace/Mira-App-SDK.git
cd Mira-App-SDK
npm ci
npm test
npm run build
```

`dist/` 是生成文件，不提交到 Git。`npm ci` 会自动构建；SDK 单元测试覆盖消息响应、主题事件、超时、断连及宿主握手。

## 维护与发布

在项目目录执行：

```sh
npm install
npm pack --dry-run
npm login --registry=https://registry.npmjs.org/
npm publish
```

发布账号必须拥有 `@mira` scope 的发布权限。`npm pack` 和 `npm publish` 自动先构建 JavaScript 与类型声明；发布目标固定为 npm 官方公共仓库。已发布版本不能覆盖，更新前需调整版本号。发布成功后，子应用执行 `npm install @mira/app-sdk@新版本` 更新；现有构建不会自动升级。
