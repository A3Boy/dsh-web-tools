<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="180" />
</p>

# dsh-web-tools

**给 DeepSeek Harness 的 `web_search` / `web_fetch` 增加可配置的多搜索源后端。**

同时配置 Tavily、Exa、Firecrawl、Brave、You.com、Jina 或 SearXNG；某个搜索源限流、额度耗尽或不可用时，按设定顺序自动切换到下一家。Agent 仍然使用 DSH 原来的 `web_search` / `web_fetch`，不增加任何新工具。

**BYOK** · API Key 保存在 DSH Credentials 中，请求直接发给对应 Provider，本项目不提供中转服务器。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) | **简体中文**

</div>

<!-- 设置页主截图（Settings → Plugins → Plugin configuration → dsh-web-tools） -->
<!-- ![dsh-web-tools Settings](assets/settings.png) -->

> 7 Providers · Native DSH tools · Fallback · BYOK · SearXNG

---

## 为什么用它

* **7 个搜索 Provider**：Tavily、Exa、Firecrawl、Brave、You.com、Jina、SearXNG
* **保持 DSH 原生工具**：模型只看到 `web_search` / `web_fetch`，没有 `tavily_search` 之类的 Provider 专属 Tool
* **自定义优先级**：默认 Provider + 有序 fallback 链
* **多 API Key + 健康状态 + 额度**：凭据池、Provider health、quota 状态
* **原生 DSH 设置页**：Provider、凭据、测试连接、Test Search 全在一个页面

## 快速开始

### Requirements

* DeepSeek Harness：目前针对 `0.1.0-rc.6` 开发和测试
* 使用 DSH `web` profile
* 安装外部 bundle 需要 `pnpm`
* 商业 Provider 使用自己的 API Key；SearXNG 可无商业 API Key 使用

### 安装

```bash
dsh plugin --profile web add github:A3Boy/dsh-web-tools
```

重启 `dsh web`，然后打开插件设置页配置 Provider。插件通过 DSH 官方 **Profile Bundle** 机制接入，不修改 Harness core。

```bash
# 检查组合配置
dsh --profile web --dump-config

# 更新 / 移除
dsh plugin --profile web update dsh-web-tools
dsh plugin --profile web remove dsh-web-tools
```

### 配置 Provider

1. `Settings → Plugins → Plugin configuration → dsh-web-tools`
2. 填入各 Provider 的 API Key（多个 Key 用逗号分隔 → 凭据池）
3. 选择默认 Provider，调整 fallback 顺序
4. 用 **Test Search** 直接跑一次真实搜索验证

## Providers

| Provider | Search | Fetch | 更适合 |
| --- | :---: | :---: | --- |
| [Tavily](https://tavily.com) | ✅ | ✅ | 通用 Agent 搜索 |
| [Exa](https://exa.ai) | ✅ | ✅ | 语义检索、研究 |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ | 搜索后继续读取网页 |
| [Brave Search](https://brave.com/search/api/) | ✅ | — | 传统 Web 搜索 |
| [You.com](https://you.com) | ✅ | — | Web / News |
| [Jina](https://jina.ai) | ✅ | ✅ | 网页正文读取 |
| [SearXNG](https://docs.searxng.org) | ✅ | — | 自托管 |

不知道选哪家：

* **通用**：Tavily
* **研究 / 语义搜索**：Exa
* **需要读取正文**：Firecrawl / Jina
* **传统 Web 搜索**：Brave
* **自托管 / 隐私**：SearXNG

<details>
<summary><b>Provider 选型参考</b>：免费额度与价格（2026-08-16）</summary>

| Provider | 免费额度 | 类型 | 计费 |
| --- | --- | --- | --- |
| Tavily | 1,000 credits / 月 | 每月刷新 | credits（Basic=1） |
| Exa | $20 注册 + $10/月 | 注册 + 每月 | 按请求（$7/1k） |
| Firecrawl | 1,000 credits + 1,000 Search credits / 月 | 每月刷新 | 每 10 结果 2 credits |
| Brave | $5/月 ≈ 1,000 次 | 每月刷新 | 按请求（$5/1k） |
| You.com | $100 一次性 | 一次性 | 按调用（$5/1k） |
| Jina | 10M tokens 一次性 | 一次性 | 按 token |
| SearXNG | 无平台额度 | 自托管 | 无 |

价格与免费额度来自上游官网，可能随上游调整，使用前以各 Provider 官网为准。

</details>

## Fallback

一次搜索的尝试顺序：

```text
Tavily → Exa → Brave → SearXNG
```

默认 Provider 出现**可恢复故障**时自动切下一家：

```text
401 / 403 · 408 · 429 · 5xx · 网络错误 · 超时 · Provider unavailable
```

认证失败的凭据会被标记 unhealthy，同时继续尝试下一家。

以下错误**不**切换 Provider：`400 bad request`、本地配置错误。

调用方主动取消（abort）会**立即终止整个搜索链**，不会切换到下一家。

## Settings

配置入口：

```text
Settings → Plugins → Plugin configuration → dsh-web-tools
```

管理：启用开关、默认 Provider、fallback 顺序、单 Provider 超时、Provider 启用/禁用、API Key / 凭据池、Base URL、连接测试、Quota 状态、Test Search。

> 搜索结果数量由 DSH 工具层（`web_search`）控制，插件不覆盖。整体搜索超时也由 DSH 工具层控制；设置页的"单 Provider 超时"指单个搜索源最多等待多久，超时后切换下一家。

<!-- 截图：Provider 配置 / Test Search -->
<!-- ![Provider Settings](assets/settings-providers.png) -->
<!-- ![Test Search](assets/test-search.png) -->

## Credentials & Quota

### 凭据池

每个 Provider 可配置多个 API Key：

```text
Tavily
├── Key A
├── Key B
└── Key C
```

多个 Key 按 **least-used-first** 选择。**只有认证失败（401/403）会把 Key 标记为 unhealthy**，且保持到凭据内容变化；429/5xx/网络/超时是 Provider 侧问题，Key 保持健康。认证失败会在同一 Provider 内自动尝试下一把 Key，全部失败才切换 Provider。Key 用逗号/空格/换行/分号分隔。

凭据池用于团队 Key、不同 Workspace、Key rollover、环境隔离等正常场景，不用于绕过 Provider 限制。

### 额度

不同 Provider 单位不同（credits / requests / tokens / USD / self-hosted），插件不强行换算成百分比。

Quota 分为 **authoritative** 和 **best-effort** 两类，用于设置页展示。**Quota 不参与搜索路由**——搜索失败由真实请求错误（402/429 等）触发 fallback。

| Provider | 数据来源 | 状态 |
| --- | --- | --- |
| Tavily | 官方 `/usage` | ✅ 已实现 |
| Firecrawl | 官方 `/v2/team/credit-usage` | ✅ 已实现 |
| You.com | 官方 Account Balance API | ✅ 已实现 |
| Exa | 无公开余额 API | 本地估算（非权威） |
| Brave | `X-RateLimit-*` 响应头 | ✅ 已实现（搜索时捕获，UI 显示剩余请求 + 更新时间） |
| Jina | Reader 余额信息 | Best-effort |
| SearXNG | 无平台额度 | Self-hosted |

多 Key 池的 Provider（如 Tavily）只查询池中第一把 Key 的额度，设置页会标注"显示第 1 把 Key 的额度"。额度查询失败只影响展示，不影响搜索；结果缓存 5 分钟，不轮询。

## Search & Fetch

```text
web_search → 候选 URL → web_fetch → 读取正文
```

Tavily、Exa、Firecrawl、Jina 使用各自原生内容获取能力；Brave、You.com、SearXNG 主要作 Search 使用。

> **说明**：`web_fetch` 按搜索优先级逐个尝试具备 Fetch 能力的 Provider，但**不沿用 `web_search` 本次实际命中的 Provider**，也不保证返回目标网页的真实 HTTP status/final URL（Provider 原生 extract 通常直接给正文）。需要严格 Fetch 语义（真实 status/重定向/截断）时，可依赖 DSH 官方 HTTP Fetch，而用本插件 Provider 的 extract 增强正文。

## Security & Privacy

* API Key 只在 Host 侧解析，**完整凭据永不返回浏览器**（浏览器只看到 configured/masked 状态）。
* 测试结果与日志不返回完整 API Key。
* 配置写入限制在本地配置平面。
* **不经过 dsh-web-tools 自己的远程服务器**，不提供共享 Key。
* 不上传 Search usage telemetry。
* 可只使用自托管 SearXNG。

## Compatibility / Limitations

* 针对 DeepSeek Harness `0.1.0-rc.6` 开发测试；DSH 仍处 developer preview，可能有不兼容变更。
* `web_fetch` 不保证真实 HTTP status/final URL 语义（见 Search & Fetch 说明）。
* SearXNG 质量取决于实例及其启用的上游引擎。
* 免费额度/价格来自上游，可能变动。

## 架构

```mermaid
flowchart TD
    Agent[DSH Agent] -->|web_search / web_fetch| Tool[dsh-tool-web]
    Tool --> Web[ctx.web]
    Web -->|searchProvider: dsh-web-tools| Hub[SearchHubProvider]

    Hub --> Registry[Provider Registry]
    Hub --> FB[Fallback]
    Hub --> Pools[Credential Pools]
    Hub --> Quota[Quota]
    Hub --> Health[Health / Stats]

    Registry --> T[Tavily]
    Registry --> E[Exa]
    Registry --> F[Firecrawl]
    Registry --> B[Brave]
    Registry --> Y[You.com]
    Registry --> J[Jina]
    Registry --> S[SearXNG]
```

设置页与 Host：

```mermaid
flowchart LR
    Client[Web Client] -->|/web-tools/api/*| Routes[Host routes]
    Routes --> Cfg[config]
    Routes --> Cred[credentials]
    Routes --> Test[provider test]
    Routes --> TS[test search]
    Routes --> Q[quota]
    Cfg --> S1[ctx.settings]
    Cred --> S2[ctx.credentials]
```

路由不使用额外 LLM 请求，不增加模型可见 Tool。

## 验证

| 验证 | 状态 |
| --- | --- |
| TypeScript / Build | ✅ |
| Unit（pool / fallback / Jina / Brave header） | ✅ |
| Route smoke（config · credential 零泄漏 · quota · 持久化先后 · loopback/cross-site 403） | ✅ |
| Runtime invariants（abort 不 fallback · timeout 真 abort 后 fallback · 401 仅标 key · fetch 多 key 轮换） | ✅ |
| Tavily Search + Quota | ✅ E2E |
| Exa Search + 凭据池 | ✅ E2E |
| Firecrawl Search + Fetch + Quota | ✅ E2E |
| Brave / You / Jina / SearXNG | Adapter ready，E2E 待补 |

## 开发

```bash
npm install
npx tsc -p tsconfig.json --noEmit           # Host
npx tsc -p tsconfig.client.json --noEmit    # Client
npx tsc -p tsconfig.build.json              # Build
npm test                                    # Unit + route smoke + runtime invariants
```

本地开发需要能解析 DSH peer dependencies（可链接到 DSH profile 的 `node_modules`）。插件未出现在 `--dump-config` 时检查 bundle 加载；设置卡未出现时完整重启 `dsh web`。

## Provider 开发

Provider Adapter 位于 `src/host/providers/`。新增 Provider 实现 `ProviderAdapter` 契约并在 registry 注册；支持 Fetch / Quota 的可分别提供实现。Agent 侧无需新工具。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## Roadmap

* Serper、Parallel（OAuth）、Perplexity Provider
* Provider 实际搜索对比、用量历史
* 可选：`web_fetch` 回归 DSH 官方 HTTP Fetch 语义

## 让编码 Agent 安装

<details>
<summary>展开安装提示词</summary>

```text
安装 dsh-web-tools，仓库：
https://github.com/A3Boy/dsh-web-tools

要求：
- 使用当前 DSH profile 的标准 plugin 安装方式。
- 不要读取、打印或要求粘贴 API Key。
- 不要修改 DeepSeek Harness core。
- 安装后用 `dsh --profile web --dump-config` 检查组合配置。
- 未经询问不要终止或重启正在运行的 DSH 进程。
- 报告插件是否成功进入 web profile。
```

</details>

## Contributing

Issue 和 PR 都欢迎。新增 Provider 前先看现有 Adapter 和 [CONTRIBUTING.md](CONTRIBUTING.md)，保持 Provider 层简单。

## License

[MIT](LICENSE) © A3Boy
