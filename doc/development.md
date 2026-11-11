# 开发与发布

## 项目结构

```text
README.md              项目介绍、安装和文档入口
doc/                   接入、接口和维护文档
src/index.ts           全部公开类型与 SDK 客户端实现
tests/                 消息通道与握手单元测试
tsconfig.json          ESM JavaScript 与类型声明构建配置
package.json           包入口、文件白名单、脚本和发布目标
package-lock.json      开发依赖版本锁定
LICENSE                MIT 许可证
dist/                  生成的 index.js 和 index.d.ts，不提交到 Git
```

## 安装、构建与测试

```sh
git clone https://github.com/MiraWorkspace/Mira-App-SDK.git
cd Mira-App-SDK
npm ci
npm test
npm run build
```

`npm ci` 依据锁文件安装开发依赖并通过 `prepare` 构建。编译目标为 ES2022，产出 ESM 与 `.d.ts`；运行时不依赖 TypeScript、Vitest 或 Electron 包。

现有单元测试使用内存 MessageChannel 和模拟页面入口，覆盖响应乱序、宿主错误、主题订阅、超时、断连、顶层 preload 握手及父窗口来源校验。运行这些测试不需要启动 Mira。

SDK 测试不验证主进程的数据库隔离、目录授权、真实供应商、系统通知或原生视图。修改接口后，还需要在支持相应 API 的真实宿主中验证，分别记录 macOS 与 Windows 的安装版结果；不要将单元测试和构建通过表述为所有宿主能力已验收。

## 检查打包内容

```sh
npm pack --dry-run
npm pack
```

两条命令都会通过 `prepare` 构建。包应包含：

```text
dist/index.js
dist/index.d.ts
doc/getting-started.md
doc/api.md
doc/development.md
README.md
LICENSE
package.json
```

`files` 白名单包含 `dist`、`doc`，README、许可证和包元数据由 npm 自动包含。源码与单元测试在 Git 仓库维护，不随 npm 包分发。应用按包根路径导入，不要引用本地 `src/` 或相邻工程目录。

生成的 `.tgz` 可以在独立测试应用中通过 `npm install /实际路径/mira-app-sdk-0.3.0.tgz` 安装，验证导入和类型声明。这是本地发布检查，不是应用长期依赖方式。

## 版本与兼容

包版本和宿主 API 版本是两套编号：当前 SDK 为 0.3.0（GitHub 标签分发，尚未发布到 npm），本文描述 Mira 宿主 API 1.3。修改客户端版本不会自动升级已安装的 Mira，也不会在宿主中新增方法。

同一待发布版本内的功能和修复统一累积，不因每次新增功能、修改或提交递增版本号。规划下一次发布时再确定新版本号，宿主 API 也按兼容性统一管理。已发布的版本和标签不能覆盖。

新增、变更或移除公开接口时，同步更新 [API 参考](api.md)、[接入指南](getting-started.md)、README 示例和相关测试。结合 `context.get()` 返回的版本与能力确认宿主支持情况。SDK 0.2.0 已移除旧 Workbench 小程序生命周期接口，旧调用方需要更新代码并重新构建。

SDK 0.3.0 统一包含 `models.listProviders/listModels/chat`、自主联网对话和 `web.search`，要求宿主 API 1.3；联网功能另需 `web:search` 权限，保留 `generate` 兼容。Workbench 小程序还需由 Workbench 授权转发这些方法。调用方固定依赖 GitHub 的 `v0.3.0` 标签，由锁文件记录确切提交；不使用临时本地包或相邻源码路径。

## GitHub 分发

当前 `v0.3.0` 标签可用于安装；后续版本通过新标签发布。不要覆盖已供用户安装的标签。准备下一次发布时，按变更类型更新版本号与锁文件（以下仅为 patch 示例）：

```sh
npm version patch --no-git-tag-version
npm test
npm pack --dry-run
```

检查差异，提交本次发布的源码、文档、`package.json` 和锁文件，然后创建与包版本对应的标签。例如包版本为 0.3.1 时：

```sh
git tag v0.3.1
git push origin main
git push origin v0.3.1
```

GitHub 用户可执行 `npm install github:MiraWorkspace/Mira-App-SDK#v0.3.1` 更新。需要严格固定客户端实现时，在依赖中锁定 Git 提交或使用已发布的确切 npm 版本。

## npm 发布

当前包名为 `@mira/app-sdk`，发布账号必须拥有 `@mira` scope 的发布权限。GitHub 组织名称不会自动授予同名 npm scope；若使用其他已注册 scope，发布前同步修改包名、导入示例和文档，并让调用方更新依赖。

确认版本、测试和打包内容后执行：

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish
```

`publishConfig` 将目标固定为 npm 官方公共仓库。发布过程自动构建，并可能要求完成 npm 账号验证。发布后用实际版本检查元数据：

```sh
npm view @mira/app-sdk@0.3.0 version --registry=https://registry.npmjs.org/
```

检查命令返回对应版本且独立应用能安装后，才将该版本记录为 npm 已发布。已发布版本不能覆盖。调用方安装新版本并重新构建后才会使用新的 SDK。
