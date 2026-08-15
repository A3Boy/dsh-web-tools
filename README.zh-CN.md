<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="180" />
</p>

# dsh-web-tools

DeepSeek Harness 的多 Provider Web Search / Fetch 插件。

`dsh-web-tools` 通过 DSH 原生 `ctx.web` 接入多个搜索服务，并在一个设置页面中管理 Provider、凭据、额度状态和 fallback。Agent 仍然使用 DSH 原有的 `web_search` 与 `web_fetch`，不需要感知底层使用的是 Tavily、Exa、Brave 或其他搜索服务。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/Tests-12%20unit%20%2B%20smoke%20passing-brightgreen.svg)](test/)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) | **简体中文**

</div>

<!-- 建议在正式发布前替换为真实 Settings 截图 -->

<!-- ![dsh-web-tools Settings](assets/settings.png) -->

## 功能

* 支持 Tavily、Exa、Firecrawl、Brave、You.com、Jina 和 SearXNG。
* 通过 DSH 原生 `web_search` / `web_fetch` 暴露能力，不增加一组 `tavily_search`、`exa_search` 之类的模型工具。
* 可以设置默认搜索 Provider 和有序的 fallback 链。
* 每个 Provider 可以保存多个凭据，并按最少使用优先选择。
* 记录 Provider 和凭据的认证失败、限流、超时、额度耗尽等状态。
* 在上游提供接口时读取余额或额度信息，并标记数据来源。
* Tavily、Exa、Firecrawl、Jina 支持搜索后的内容获取能力。
* SearXNG 可以作为默认搜索源或 fallback，不要求使用商业 Search API。
* 提供 DSH Web 设置卡，可以配置 Provider、凭据、超时和搜索参数，并执行连接测试和测试搜索。

## 支持的 Provider

| Provider                                      | Search | Fetch | Quota / Usage             | 说明                                    |
| --------------------------------------------- | :----: | :---: | ------------------------- | ------------------------------------- |
| [Tavily](https://tavily.com)                  |    ✅   |   ✅   | 官方 `/usage`               | 面向 Agent / RAG 的 Search、Extract、Crawl |
| [Exa](https://exa.ai)                         |    ✅   |   ✅   | Usage / Key Budget        | 语义搜索，可返回网页文本和 highlights              |
| [Firecrawl](https://firecrawl.dev)            |    ✅   |   ✅   | 官方 Credit Usage           | Search、Scrape、Crawl，适合继续读取网页          |
| [Brave Search](https://brave.com/search/api/) |    ✅   |   —   | Rate-limit headers        | 使用 Brave 独立 Web 索引                    |
| [You.com](https://you.com)                    |    ✅   |   —   | 官方 Balance API            | Web + News，单次可返回较多结果                  |
| [Jina](https://jina.ai)                       |    ✅   |   ✅   | Best-effort token balance | Search + Reader，适合把网页转成 LLM 可读文本      |
| [SearXNG](https://docs.searxng.org)           |    ✅   |   —   | 无平台额度                     | 自托管 Meta Search                       |

计划增加：Serper、Parallel、Perplexity。

### 各 Provider 的特点

| 维度 | Tavily | Exa | Firecrawl | Brave | You.com | Jina | SearXNG |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **定位** | Agent / RAG 默认搜索 | 语义 / 神经检索 | Search → Scrape → Crawl | 独立 Web 索引 | 通用搜索 + News | Search + Reader | 自托管 Meta Search |
| **核心强项** | Search+Extract+Crawl+Map 一套 API | 找相似/相关内容，返回文本/highlights | 动态网页 → 干净 Markdown | 自建索引，Web/News/Images/Videos/LLM context | 单次最多 100 结果，丰富过滤 | s.jina.ai 搜 + r.jina.ai URL→LLM 文本 | 聚合多上游源，隐私、无画像 |
| **Fetch 能力** | ✅ Extract | ✅ 返回内容 | ✅ Scrape/Crawl | — | —（有 Livecrawl，Adapter 未接） | ✅ Reader | — |
| **免费额度** | 1,000 credits/月 | $20 注册 + $10/月 | 1,000 credits/月 + 1,000 Search credits | $5/月 ≈ 1,000 次 | $100 一次性 | 10M tokens 一次性 | 无平台配额 |
| **计费方式** | credits（Basic=1） | 按请求（$7/1k） | 每 10 结果 2 credits | 按请求（$5/1k） | 按调用（$5/1k） | 按 token | 无 |
| **适合场景** | ⭐ 通用默认 Agent 搜索 | 🧠 研究 / 语义检索 | 📖 搜到 URL 后继续读页面 | 🌐 通用实时搜索 | 💰 大量免费实验 | 📄 网页转 LLM 文本 | 🏠 永久 fallback / 私有部署 |

注意⚠️：

- **Tavily / Exa / Firecrawl / Jina** 都带内容获取能力——web_search 找到 URL 后可继续 web_fetch 读取正文。
- **You.com** 官方有 Contents / Livecrawl API，但当前 dsh-web-tools 的 You.com Adapter 以 Search 为主。
- **Brave** 免费计划要求绑定银行卡用于反滥用验证。
- **SearXNG** 无平台额度，但不代表上游搜索源无限制——实际可用性受实例配置、网络和上游引擎限制。
- 免费额度与价格以各 Provider 官网为准，可能随上游调整。

## 免费额度参考

以下数据按 **2026-08-16** 的官方页面整理。免费计划和价格可能调整，使用前以各 Provider 官网为准。

| Provider     | 当前免费额度                                                | 类型          |
| ------------ | ----------------------------------------------------- | ----------- |
| Tavily       | 1,000 credits / 月                                     | 每月刷新        |
| Exa          | 注册 $20 credits；之后 $10 / 月                             | 注册赠送 + 每月刷新 |
| Firecrawl    | 1,000 credits / 月；当前 Pricing 另列 +1,000 Search credits | 每月刷新        |
| Brave Search | $5 credits / 月，Search 约 1,000 次                       | 每月刷新        |
| You.com      | 新账号 $100 credits                                      | 一次性         |
| Jina         | 新用户 10M tokens                                        | 一次性         |
| SearXNG      | 无平台额度                                                 | 自托管         |

如果不知道先配置哪一家，可以从 Tavily 或 Exa 开始；需要传统 Web 搜索覆盖时加入 Brave，需要继续读取网页时加入 Firecrawl 或 Jina。SearXNG 更适合作为自托管方案或最后一级 fallback。

## Provider 优先级与 fallback

Host 使用下面几个配置决定一次搜索的尝试顺序：

```text
defaultProvider
fallbackOrder[]
maxFallbackProviders
```

例如：

```text
Tavily → Exa → Brave → SearXNG
```

Tavily 请求失败后，只有被分类为可恢复的错误才会继续尝试下一家。

当前会触发 fallback 的情况包括：

```text
401 / 403
408
429
5xx
网络错误
请求超时
Provider unavailable
请求被取消
```

认证失败的凭据会被标记为 unhealthy，同时允许搜索继续尝试下一个 Provider。

以下错误不会自动切换 Provider：

```text
400 bad request
本地配置错误
```

对于未知 Provider 错误，当前策略是尝试下一个 Provider。

一次搜索会记录实际尝试过的 Provider、结果状态和延迟，方便在设置页面或日志中排查问题。

### 设置页面的排序

Host 已经支持完整的有序 `fallbackOrder`。

当前设置卡可以修改默认 Provider 和 fallback 配置；完整的有序排序交互仍在继续完善。后续计划让设置页面直接编辑整个搜索优先级，而不是只调整第一项 fallback。

内部配置仍保持：

```text
defaultProvider + fallbackOrder
```

不会因为 UI 调整改变 Host 的路由契约。

## 凭据池

每个 Provider 可以配置多个 API Key。

例如：

```text
Tavily
├── Key A
├── Key B
└── Key C
```

当前选择策略为 **least-used-first**：

1. 从 healthy 的凭据中选择使用次数最少的 Key。
2. 使用次数相同时按配置顺序选择。
3. 调用失败的 Key 会被标记为 unhealthy，并暂时跳过。
4. 当前池中所有 Key 都不可用后，健康状态会被重置，允许后续请求重新尝试。

凭据值可以使用逗号、空格、换行或分号分隔。

凭据池用于团队 Key、不同 Workspace、Key rollover、环境隔离等正常的多凭据场景，不用于绕过 Provider 的账户或服务限制。

## 额度查询

不同 Provider 的额度单位并不相同，因此插件不会把它们强制换算成同一种百分比。

可能出现的类型包括：

```text
credits
requests
tokens
USD
self-hosted
```

当前实现区分权威数据和非权威数据。只有 Provider 自己返回的权威额度可以用于路由层判断“已经耗尽”；best-effort 或本地估算不会参与这种判断。

| Provider  | 数据来源                               | 当前状态                    |
| --------- | ---------------------------------- | ----------------------- |
| Tavily    | 官方 `/usage`                        | 已实现                     |
| Firecrawl | 官方 `/v2/team/credit-usage`         | 已实现                     |
| You.com   | 官方 Account Balance API             | 已实现                     |
| Exa       | Team Management usage / key budget | Adapter 已有，设置 UI 仍在完善   |
| Brave     | Search 响应中的 `X-RateLimit-*`        | 响应头解析已有，完整 quota 展示仍在完善 |
| Jina      | Reader 返回中的余额信息                    | Best-effort             |
| SearXNG   | 无平台额度                              | Self-hosted             |

如果额度查询失败，只影响状态展示，不影响 Provider 的 Search 能力。

## Search 与 Fetch

Agent 侧仍然使用：

```text
web_search
web_fetch
```

典型流程：

```text
web_search
    ↓
找到候选 URL
    ↓
web_fetch
    ↓
读取正文
```

当前 Tavily、Exa、Firecrawl 和 Jina Adapter 可以利用各自的内容获取能力。Brave、You.com 和 SearXNG 当前主要作为 Search Provider 使用。

## 设置页面

安装到 `web` profile 后，配置入口位于：

```text
Settings
→ Plugins
→ Plugin configuration
→ dsh-web-tools
```

设置卡目前用于管理：

* 插件启用状态
* 默认 Provider
* fallback 配置
* 最大结果数
* Search timeout
* Provider 启用 / 禁用
* API Key / 凭据池
* Provider Base URL
* Provider 连接测试
* Quota 状态
* Test Search

Test Search 会发起一次实际搜索，并返回实际使用的 Provider、延迟和搜索结果，不需要先创建 Agent 会话。

<!-- 建议补两张实际截图：
![Provider Settings](assets/settings-providers.png)
![Test Search](assets/test-search.png)
-->

## SearXNG

配置 SearXNG 后，可以将它放在任意搜索优先级位置：

```text
Tavily → Exa → Brave → SearXNG
```

也可以只配置 SearXNG，不使用任何商业 Search Provider。

这种方式适合本地部署、Homelab、企业内网或希望自行控制搜索基础设施的环境。

## 安装

当前仓库可以直接从 GitHub 安装：

```bash
dsh plugin --profile web add github:A3Boy/dsh-web-tools
```

安装后重启正在运行的 `dsh web`，然后打开插件设置页完成 Provider 配置。

检查 profile 组合结果：

```bash
dsh --profile web --dump-config
```

更新：

```bash
dsh plugin --profile web update dsh-web-tools
```

移除：

```bash
dsh plugin --profile web remove dsh-web-tools
```

插件通过 DSH Profile Bundle 接入，不需要修改 DeepSeek Harness core。

> 如果后续发布 npm package，可以把 npm 安装命令作为默认安装方式，同时保留 GitHub 安装方式。

## 配置

敏感凭据由 DSH Credentials 保存。

当前 credential refs：

| Provider  | Credential ref        | 说明                     |
| --------- | --------------------- | ---------------------- |
| Tavily    | `WEB_TOOLS_TAVILY`    | 支持多个 Key               |
| Exa       | `WEB_TOOLS_EXA`       | 支持多个 Key               |
| Firecrawl | `WEB_TOOLS_FIRECRAWL` | Search + Scrape        |
| Brave     | `WEB_TOOLS_BRAVE`     | `X-Subscription-Token` |
| You.com   | `WEB_TOOLS_YOU`       | Search + Balance       |
| Jina      | `WEB_TOOLS_JINA`      | Search + Reader        |
| SearXNG   | `WEB_TOOLS_SEARXNG`   | 自托管配置                  |

非敏感配置保存在 `dsh-web-tools` settings namespace。

主要配置项：

```text
enabled
defaultProvider
fallbackOrder
maxFallbackProviders
maxResults
searchTimeoutMs
providerBaseUrls
providerEnabled
```

## 架构

```text
DSH Agent
   │
   │ web_search / web_fetch
   ↓
dsh-tool-web
   ↓
ctx.web
   │ searchProvider: dsh-web-tools
   ↓
SearchHubProvider
   ├── Provider Registry
   ├── Fallback
   ├── Credential Pools
   ├── Quota
   ├── Health / Stats
   └── Provider Adapters
        ├── Tavily
        ├── Exa
        ├── Firecrawl
        ├── Brave
        ├── You.com
        ├── Jina
        └── SearXNG
```

设置页面与 Host 的关系：

```text
Web Client
   ↓
/web-tools/api/*
   ↓
Host routes
   ├── config
   ├── credentials
   ├── provider test
   ├── test search
   └── quota
   ↓
ctx.settings / ctx.credentials
```

Provider routing 不使用额外的 LLM 请求，也不会增加模型可见的 Tool 数量。

## 安全

API Key 只在 Host 侧解析，不会把完整凭据返回浏览器。

当前实现还包括：

* 浏览器只获得配置状态或经过掩码的凭据信息。
* 测试结果和日志不返回完整 API Key。
* 配置写操作限制在本地配置平面。
* 不要求经过 `dsh-web-tools` 自己的远程服务器。
* 不提供共享 API Key。
* 插件本身不上传 Search usage telemetry。
* 可以只使用自托管 SearXNG。

## 当前验证

当前仓库已经完成以下检查：

| 项目                                                 | 状态           |
| -------------------------------------------------- | ------------ |
| Host TypeScript 类型检查                               | ✅            |
| Client TypeScript 类型检查                             | ✅            |
| pool / fallback / Jina balance / Brave header 单元测试 | ✅ 12 passing |
| 配置、凭据隐藏、quota、测试接口、loopback fence 路由 smoke         | ✅            |
| Tavily 实际 Search + 官方 quota                        | ✅            |
| Exa 实际 Search + 双 Key 凭据池                          | ✅            |
| Firecrawl 实际 Search + Fetch + quota                | ✅            |
| Web profile `--dump-config` 安装检查                   | ✅            |
| 非 loopback 配置写入拒绝                                  | ✅            |

Brave、You.com、Jina 和 SearXNG 已有 Provider Adapter，但暂未在上表中标记为和 Tavily / Exa / Firecrawl 相同级别的真实 E2E 验证，后续补齐后再更新这里。

## 当前限制

* Host 支持完整 `fallbackOrder`，设置 UI 的完整顺序编辑仍待补齐。
* Exa Team Management usage 已有 Adapter，设置页面还需要补完对应配置。
* Brave rate-limit header 已有解析逻辑，完整 quota/describe 展示仍待接入。
* Provider 的免费额度和定价来自上游服务，不属于本项目稳定 API，README 中的数据可能随上游调整。
* 自托管 SearXNG 的搜索质量和稳定性取决于实例及其启用的上游引擎。

## 开发

```bash
npm install

# Host
npx tsc -p tsconfig.json --noEmit

# Client
npx tsc -p tsconfig.client.json --noEmit

# Build
npx tsc -p tsconfig.build.json

# Unit tests
node --experimental-strip-types --test src/host/logic.test.ts

# Route smoke tests
node --experimental-strip-types test/routes.smoke.mjs
```

本地开发需要能够解析 DSH peer dependencies。可以将开发目录连接到 DSH profile 使用的 `node_modules`。

如果插件没有出现在：

```bash
dsh --profile web --dump-config
```

先检查 profile 是否已经加载 `dsh-web-tools` bundle。

如果设置卡没有出现，完整重启 `dsh web`。Client bundle 在进程启动时加载。

## Provider 开发

Provider Adapter 位于：

```text
src/host/providers/
```

新增 Provider 需要实现 `ProviderAdapter` 契约，并在 Provider registry 中注册。

Search Adapter 负责把第三方 API 的返回结果转换成插件内部统一结果；如果 Provider 还支持 Fetch 或 Quota，可以分别提供对应实现。

Agent 侧不需要增加新的工具。

更多开发约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## Roadmap

* 完整的搜索优先级 / fallback 排序 UI
* Exa Team Management usage 设置
* Brave quota/describe 接入
* Serper Provider
* Parallel Provider 与 OAuth balance
* Perplexity Provider
* Provider 实际搜索对比与测试
* 用量历史展示

Roadmap 不代表固定版本承诺，具体顺序根据实现和上游 API 变化调整。

## 让编码 Agent 帮助安装

<details>
<summary>展开安装提示词</summary>

```text
安装 dsh-web-tools，仓库：
https://github.com/A3Boy/dsh-web-tools

要求：
- 使用当前 DSH profile 的标准 plugin 安装方式。
- 不要读取、打印或要求我粘贴 API Key。
- 不要修改 DeepSeek Harness core。
- 安装后使用 `dsh --profile web --dump-config` 检查组合配置。
- 未经询问不要终止或重启正在运行的 DSH 进程。
- 报告插件是否成功进入 web profile。
```

</details>

## Contributing

Issue 和 PR 都欢迎。

如果要增加新的 Search Provider，建议先查看现有 Adapter 和 [CONTRIBUTING.md](CONTRIBUTING.md)，尽量保持 Provider 层简单，不增加新的 Agent 工具或额外路由层。

## License

[MIT](LICENSE) © A3Boy
