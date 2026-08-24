<div align="center">

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/logo.png" alt="dsh-web-tools" width="160" />
</p>

# dsh-web-tools

让 DeepSeek Harness 拥有直连全网与社媒平台的搜索与抓取能力。

**8 大 Web Provider 原生能力适配 · SearchHints 语义编译 · 多源自动容灾 · 小红书 / Twitter X 平台检索**

<p align="center">
  <a href="https://github.com/A3Boy/dsh-web-tools/stargazers">
    <img src="https://img.shields.io/github/stars/A3Boy/dsh-web-tools?style=flat-square&label=Stars" alt="GitHub Stars" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-2ea44f?style=flat-square" alt="MIT License" />
  </a>
  <a href="https://github.com/deepseek-ai/deepseek-harness">
    <img src="https://img.shields.io/badge/DeepSeek%20Harness-Web%20Runtime-4D6BFE?style=flat-square" alt="DeepSeek Harness" />
  </a>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

[English](README.md) | **简体中文**

</div>

## 它解决什么问题

当联网能力只依赖一个 Web Provider 时，额度耗尽、限流或服务异常都可能直接中断检索；而简单接入多个搜索 API，往往又只能使用它们共同支持的基础能力，没有真正发挥不同搜索源各自擅长的搜索模式、分类、时效、域名策略和正文提取能力。

dsh-web-tools 将 Exa、Tavily、Firecrawl、Parallel、Brave、You.com、Jina、SearXNG，以及小红书、Twitter / X 接入 DSH 标准 `web_search` / `web_fetch`。

在统一 DSH 工具接口的同时，dsh-web-tools 通过 SearchHints 归一化查询意图，再针对不同 Provider 分别编译为其支持的原生参数，尽可能使用各家的分类、时效、域名、地区、深度搜索与正文提取能力；同时通过多 API Key、Provider Fallback 和平台专用浏览器会话，提高整个联网链路的可用性。

---

**核心亮点**：

- **8 大 Web Provider 原生能力深度适配**：保持统一 `web_search` / `web_fetch` 接口，但不把不同搜索源压成最低公共能力。针对 Exa、Tavily、Firecrawl、Parallel、Brave、You.com、Jina、SearXNG 分别适配搜索类型、时效、域名策略、地区语言、深度检索与正文提取能力。
- **SearchHints → Provider-specific 参数编译**：将 Query 中的技术 / 论文 / 新闻、时效、域名、地区与语言等搜索意图归一化，再按不同 Provider 的能力映射为各自原生参数；整个过程由确定性代码完成，不增加额外 LLM 调用。
- **小红书与 Twitter / X 平台来源**：Twitter / X 支持原生搜索与推文详情抓取；小红书支持原生笔记详情，搜索默认通过通用 Web 发现，站内原生搜索保留为实验能力。
- **多搜索源调度与自动容灾**：支持多 API Key 分配、鉴权失败切换、429 冷却、Ordered / Round-Robin / Random 路由，以及可配置 Provider Fallback。
- **DSH 原生工具集成**：直接复用标准 `web_search` / `web_fetch`，模型侧无需学习额外工具，同时提供会话级「联网搜索」模式。

```text
                         DSH Agent
                            │
                 web_search / web_fetch
                            │
                            ▼
                       SearchHints
            topic / freshness / domains
               locale / cleanQuery ...
                            │
                 Provider-specific
                    compilation
                            │
      ┌────────┬─────────┬───────────┬──────────┐
      │  Exa   │ Tavily  │ Firecrawl │ Parallel │ ...
      │        │         │           │          │
      │category│ topic   │ github    │objective │
      │ date   │ chunks  │ research  │ policy   │
      │domains │ time    │ tbs       │ queries  │
      └────────┴─────────┴───────────┴──────────┘

```

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/searchOrderAndRouting.png" width="900" alt="dsh-web-tools 搜索策略与多源调度" />
</p>

## 8 大 Web Provider 原生能力深度适配

统一的是 DSH 的工具接口和搜索语义，不统一的是各家 Provider 的能力。

dsh-web-tools 通过 SearchHints 表达查询意图，再针对不同 Provider 分别构造请求，而不是把所有搜索源压缩成一套最低公共参数。

例如，同样是“搜索最近一周的 AI 编程资料”：

* **Exa**：映射分类、ISO 日期范围与域名限制；
* **Firecrawl**：技术查询映射至 `github` 分类，研究类查询映射至 `research`，并结合 `tbs` 时效过滤；
* **Parallel**：组合 `objective`、`search_queries` 与 `source_policy`；
* **Brave Search**：映射 freshness、国家与搜索语言，并优先使用 LLM Context；
* **You.com**：通过 `boost_domains` 对指定域名进行软加权。

这些适配全部由确定性代码完成，不会为了选择 Provider 参数再额外调用一次 LLM。

* **Exa**：精确分类映射（publication / news / financial report）、ISO 日期范围与域名限制。
* **Firecrawl**：代码与技术查询映射至 `github` 分类，论文与学术查询映射至 `research`，并支持 `tbs` 时效、域名限制与 Clean Markdown 抓取。
* **Parallel**：双层语义优化（`objective` 软引导 + `search_queries` 纯净词）与 `source_policy` 域名/时效过滤。
* **Tavily**：支持 `basic` / `advanced` / `fast` / `ultra-fast` 搜索深度；`basic`、`advanced`、`fast` 模式支持 `chunks_per_source` 分块控制，并映射 `news` / `finance` 话题、日期区间、国家与域名约束。
* **Brave Search**：LLM Context 预提取端点，支持 `pd/pw/pm/py` 时效、国家与搜索语言。
* **You.com**：原生 **`boost_domains`** 软加权支持，时效与地区国家过滤。
* **Jina**：搜索关键词降噪与 ReaderLM-v2 高精度 Markdown 正文解析。
* **SearXNG**：自建元搜索支持 `categories` (it/science/news) 与 `time_range`。
* **原生正文提取 (`web_fetch`)**：自动调用支持 Provider 的原生提取接口（如 Exa `/contents`、Tavily `/extract`、Firecrawl `/scrape`、Parallel `/v1/extract`、You.com `/v1/contents`、Jina Reader）。

---

## 平台搜索源（小红书与 Twitter / X）

区别于通用搜索引擎，插件通过专用浏览器会话直接连接社媒平台：

* **原生独立浏览器会话架构**：
  * 基于本机已安装的 Edge / Chrome 专用 Profile 与 CDP 通信。
  * **0 浏览器扩展、0 Playwright / Chromium 外部打包**。Cookie 由专用浏览器 Profile 管理，插件不会将其写入配置、日志或中转服务；浏览器仍会按正常认证流程发送给对应平台。

* **小红书**：
  * **笔记详情与评论抓取 (`web_fetch`)**：通过专用浏览器 Profile 解析 `__INITIAL_STATE__` 结构化数据并自动 DOM 兜底，保留完整 `xsec_token` 签名 URL；页面成功加载评论数据时，同时逐条提取一级评论与已返回的楼中楼回复。
  * **搜索发现 (`web_search`)**：默认采用通用 Web 发现（`site:xiaohongshu.com`）；站内原生搜索定位为实验能力，可通过 `XHS_NATIVE_SEARCH=1` 显式开启。实验路径从 `/explore` 的真实搜索框进入，不再直接导航 `/search_result`，并会区分登录墙、安全验证和真实退出登录。

* **Twitter / X**：
  * **原生搜索、推文详情与回复**：通过 CDP 捕获 X Web 客户端自身的 GraphQL 数据流（SearchTimeline / TweetDetail），结构化解析目标推文及其回复树，并以 DOM 作为补充与兜底；支持 `from:`、`since:`、`until:` 等搜索算子。

单次详情抓取最多附带 30 条评论或回复，单条内容最多保留 800 个字符；仍有后续分页或楼中楼内容时会明确标记为截断，避免无界占用模型上下文。

Agent 使用 `小红书:` 或 `X:` 作为平台路由前缀。前缀只负责选择平台，插件会在实际站内搜索前移除它；例如 `小红书: DeepSeek Harness` 最终输入小红书搜索框的是 `DeepSeek Harness`。

* **通用 Web 降级 (Web Fallback)**：平台来源未启用、运行时暂不可用或发生可重试故障时，改由已配置的通用搜索或抓取 Provider 处理；登录失效、访问受限、无效详情地址等非重试错误会直接返回，不会用索引内容冒充原生详情或评论。
* **登录态自动验证**：完成登录后插件会检查所需 Cookie；已保存的 Profile 会在状态查询和平台操作前复核，登录失效时仍需重新登录。

<p align="center">
  <img src="https://raw.githubusercontent.com/A3Boy/dsh-web-tools/main/assets/platformSessions.png" width="900" alt="小红书与 Twitter X 登录态自动验证" />
</p>

---

## 调度策略与容灾机制

* **多 API Key 负载与容灾**：支持为单个 Provider 配置多个 API Key，并发调用优先分配低 `inFlight` 的 Key，鉴权失败自动切换备用 Key。
* **确定性 Provider Fallback**：遇到网络异常、超时、5xx 服务端错误、429 限流或配额耗尽时，自动降级至链条中的下一搜索源。
* **429 Retry-After 临时冷却**：遭遇限流并携带 `Retry-After` 时触发零请求冷却，避免在冷却期内产生无效请求。
* **搜索路由策略**：`web_search` 支持顺序模式（Ordered）、轮询模式（Round-Robin）和随机模式（Random）；`web_fetch` 始终按可抓取 Provider 的确定性链条执行。
* **会话级联网搜索 (Search Mode)**：开启后要求 Agent 在回答前至少完成一次 `web_search` 或 `web_fetch` 调用；失败也算已尝试，但 Agent 会被要求说明哪些内容未能验证。
* **代理支持**：支持 Windows 系统代理、`HTTP_PROXY`、`HTTPS_PROXY` 和 `NO_PROXY`，本地回环地址自动绕过代理。

---

## 安装与更新

```bash
# 安装插件
dsh plugin --profile web add github:A3Boy/dsh-web-tools

# 更新插件
dsh plugin --profile web update dsh-web-tools

# 卸载插件
dsh plugin --profile web remove dsh-web-tools

```

重启 `dsh web`，在左侧侧边栏进入：`Settings` → `Web Search`。

---

## Provider 支持矩阵

| Provider | 搜索 (Search) | 抓取/提取 (Fetch / Extract) | 核心特性与深度适配能力 | 配额查询 (Quota) |
| --- | --- | --- | --- | --- |
| [Exa](https://exa.ai) | 支持 | 支持，`/contents` | 语义检索 (`auto` / `fast` / `deep`)、垂直分类映射、Query-aware 高亮切片、ISO 日期范围与域名限制 | 控制台自查 |
| [Tavily](https://tavily.com) | 支持 | 支持，`/extract` | 搜索深度 (`basic` / `advanced` / `fast` / `ultra-fast`)，前三种模式支持分块控制，并映射 `news` / `finance`、日期、国家与域名参数 | 官方 API |
| [Firecrawl](https://firecrawl.dev) | 支持 | 支持，`/scrape` | 技术查询映射 `github` 分类、学术查询映射 `research`，支持 `tbs`、域名限制与 Clean Markdown 提取 | 官方 API |
| [Parallel](https://parallel.ai) | 支持 | 支持，`/v1/extract` | 双层语义检索 (`advanced` / `basic` / `turbo`)、`objective` 软引导、`source_policy` 域名/时效过滤 | 控制台自查 |
| [Brave Search](https://brave.com/search/api/) | 支持 | — | 默认优先 LLM Context 预提取模式，支持时效/区域语言过滤，不支持时自动回退 Classic 搜索 | 响应头自动捕获 |
| [You.com](https://you.com) | 支持 | 支持，`/v1/contents` | 搜索高亮片段提取、原生 **`boost_domains`** 软加权、时效与国家过滤、Markdown 正文接口 | 官方 API |
| [Jina](https://jina.ai) | 支持 | 支持，Reader | 搜索关键词降噪、ReaderLM-v2 高精度 Markdown 转换、Token 预算控制 | 尽力解析 |
| [SearXNG](https://docs.searxng.org) | 支持 | — | 开源自托管元搜索引擎，映射 `categories` (it/science/news) 与受支持的 `time_range`，适配器无需 API Key | 由自建实例决定 |

### 快速选型指南

新安装默认首选 Provider 为 **Exa**；已有安装继续沿用已保存的 Provider 配置。

| 需求场景 | 推荐首选 | 说明 |
| --- | --- | --- |
| **社媒内容发现 / 详情抓取** | **小红书 / Twitter / X** | X 支持原生搜索与详情；小红书使用 Web 发现 + 原生笔记详情抓取 |
| **语义检索 / 技术文档** | **Exa** | 支持语义模式、分类、日期、域名与高亮参数 |
| **预提取搜索上下文** | **Brave Search** | 优先使用 LLM Context，失败时回退 Classic Search |
| **可调深度搜索与正文提取** | **Tavily** / **Parallel** | 提供 Provider 原生深度档位与内容提取接口 |
| **正文转 Markdown** | **Firecrawl** / **Jina** | 支持正文提取、主内容过滤或 Reader 转换 |
| **时效、地区与域名偏好** | **You.com** | 支持 freshness、地区语言和 `boost_domains` 参数 |
| **自托管元搜索** | **SearXNG** | 使用用户自己的 SearXNG 地址，适配器不要求 API Key |

---

## 本地开发

```bash
pnpm install          # 安装依赖
pnpm test             # 运行测试套件
pnpm run typecheck    # 类型检查
pnpm run build        # 编译构建 (产物输出至 lib/)

```

---

## 常见问题

若使用本地包或软链接升级遇到缓存问题，可前往 Profile 目录重新安装：

```bash
cd ~/.dsh/profiles/web && pnpm install

```

Exa 和 Parallel 的余额需要在 Provider 控制台查看；Brave 的配额信息来自实际搜索响应头。配额展示仅用于状态说明，不影响正常检索与降级。

小红书和 Twitter / X 分别使用独立的本地浏览器 Profile。插件不会把原始 Cookie 导出到配置、日志或第三方中转服务；浏览器会按正常登录与访问流程将 Cookie 发送给对应的平台域名。

---

## 许可

[MIT](LICENSE) © A3Boy
