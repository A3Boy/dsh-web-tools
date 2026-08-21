<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="160" />
</p>

# dsh-web-tools

DeepSeek Harness 的统一多 Provider Web Runtime。

继续使用 DSH 原生 `web_search` / `web_fetch`，在 Host 层提供多搜索源、自动 fallback、多 API Key、额度与健康状态、Provider 原生搜索偏好、页面正文读取和 Search Mode。

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

<p align="center">
  <img src="assets/overview.png" width="900" alt="dsh-web-tools 设置页" />
</p>

## 现在它不只是“接了 8 个搜索 API”

当前版本已经把搜索、正文读取和运行时调度整合到同一套 DSH 原生 Web contract 后面：

- **8 个搜索源**：Exa、Tavily、Firecrawl、Parallel、Brave、You.com、Jina、SearXNG
- **DSH 原生工具**：不新增 `web_search_exa` 之类的 Provider 私有工具，Agent 继续只用 `web_search` / `web_fetch`
- **多 query 并行**：适配 DSH `queries[]`，默认最多 4 条；Prompt 更偏向 1 条精确 query，只有真实存在多个独立未知量时才并行
- **多 API Key 池**：并发 reservation、认证失败自动切同 Provider 下一把 Key
- **Provider fallback**：超时、网络错误、5xx、限流、额度问题自动尝试下一家
- **429 Retry-After cooldown**：Provider 被限流后进入临时冷却，冷却期间零 HTTP，直接走下一家，避免下一轮重复撞 429
- **深度适配各搜索源原生能力**：Exa 智能搜索、Tavily 深度检索、Brave 快速搜索、Jina 网页解析、Firecrawl 内容提取——不只是简单调用 API，而是按每个搜索源的官方能力做适配；设置页用“搜索偏好”呈现代理，不暴露内部参数名
- **全局搜索模式**：推荐 / 快速 / 精准 / 节省 一键切换，自动为各搜索源应用合适的原生参数和搜索顺序；也可以切到“自定义”手动调整
- **原生正文 / Extract 后端**：Search 找 URL，Fetch 读取页面正文；不同 Provider 会调用自己的 Contents / Extract / Scrape / Reader 接口
- **Search Mode**：会话级「联网搜索」开关，强制当前回答先完成联网研究；失败时会明确告诉 Agent 哪些信息没有完成联网验证
- **代理 / SearXNG**：支持系统代理、`HTTP(S)_PROXY`、`NO_PROXY` 和完全自托管的 SearXNG

插件不提供共享 API Key 或中转服务。请求由本地 DSH Host 直接访问对应 Provider。

## 安装

```bash
dsh plugin --profile web add github:A3Boy/dsh-web-tools
```

重启 `dsh web` 后打开：

```text
Settings → Web Search
```

更新：

```bash
dsh plugin --profile web update dsh-web-tools
```

移除：

```bash
dsh plugin --profile web remove dsh-web-tools
```

当前开发分支已经在 DSH rc.8 运行环境完成 P5 实测；`package.json` 仍保持兼容 rc.6 peer range。

## Provider 能力

| Provider | Search | Page / Extract | 主要适配 |
| --- | :---: | :---: | --- |
| [Exa](https://exa.ai) | ✅ | ✅ `/contents` | `auto` / `fast` / deep 系列、query-aware highlights、内容新鲜度 |
| [Tavily](https://tavily.com) | ✅ | ✅ `/extract` | basic / advanced / fast / ultra-fast、auto parameters |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ `/scrape` | Search discovery、正文清洗、`onlyMainContent`、缓存策略 |
| [Parallel](https://parallel.ai) | ✅ | ✅ `/v1/extract` | advanced / basic / turbo、LLM-ranked excerpts、`max_chars_total` |
| [Brave Search](https://brave.com/search/api/) | ✅ | — | LLM Context 优先，Classic Web Search 自动回退 |
| [You.com](https://you.com) | ✅ | ✅ `/v1/contents` | Search highlights、Markdown 正文读取、抓取超时/缓存 |
| [Jina](https://jina.ai) | ✅ | ✅ Reader | Search + Reader、LLM-friendly 页面内容 |
| [SearXNG](https://docs.searxng.org) | ✅ | — | 自托管 meta-search，无 API Key |

> Parallel 当前官方公开文档列出的正式 Search modes 是 `turbo` / `basic` / `advanced`。Turbo 当前官方注明主要支持英文和日文查询，因此本项目不把它设成全局默认。

<p align="center">
  <img src="assets/providerDetail.png" width="900" alt="Provider 配置与搜索偏好" />
</p>

## 推荐起点

新安装默认 Provider 现在是 **Exa**。这是项目自己的 P5 固定任务评测得出的产品默认，不代表对所有场景的绝对排名。

| 用途 | 可以先试 |
| --- | --- |
| 默认 / 技术搜索 | **Exa** |
| 低延迟 Agent grounding | Brave LLM Context |
| Search + Extract | Tavily / Parallel |
| 正文抓取 | Firecrawl / Jina / You.com |
| Web / News | You.com |
| 自托管 | SearXNG |

只配置一个 Provider 就可以使用；配置多个后会得到自动 fallback。

## P5：不是凭感觉调默认值

这一版专门跑了一轮固定评测：

- 7 个 Provider × 36 条固定任务
- 252 次默认档搜索
- 132 次 Provider 配置 A/B
- multi-query、fallback、Key trim、Provider options isolation

当前默认档 Top-3 answer-bearing rate：

| Provider | Top-1 | Top-3 | Official source | 泛泛率 | 中位延迟 |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Exa** | **72.2%** | **97.2%** | **75.0%** | **0%** | 1.35s |
| Brave | 50.0% | 94.4% | 50.0% | 2.8% | **0.90s** |
| You.com | 55.6% | 91.7% | 55.6% | **0%** | 1.26s |
| Parallel | 52.8% | 88.9% | 58.3% | 5.6% | 1.95s |
| Tavily | 47.2% | 88.9% | 47.2% | 5.6% | 2.18s |

完整报告和原始输出在：

```text
reports/p5/
```

重点结论：

- Exa 是当前综合最稳的默认候选，因此新安装默认从 Tavily 调整为 Exa
- Exa `fast` 更快，但完整证据还不足以取代官方推荐的 `auto`，所以默认继续 `auto`
- Tavily `basic` 在本轮 A/B 里比 `advanced` 更划算，因此没有因为“advanced”名字更高级就强行升默认
- 2 条独立 query 是 multi-query 的明显甜点；4 条更多是在增加 URL 多样性和成本
- 同义改写 spam 不值得，因此 Prompt 明确禁止拿多个近义 query 填满数组
- Firecrawl 更适合作为正文读取 / fallback，而不是默认搜索源

这些数字只代表本项目固定 corpus、当时账户和 API 状态下的结果，不是第三方 Provider 的通用排行榜。

## Provider 搜索偏好

每个 Provider 的底层参数保持原生，但 UI 不要求用户查 API 文档。

例如：

```text
Exa
自动平衡 / 快速响应 / 深度检索

Tavily
平衡 / 高质量 / 快速 / 极速

Brave
智能上下文 / 传统网页搜索

You.com
AI 相关片段 / 简短摘要

Parallel
高质量 / 平衡 / 极速
```

设置页只保存你真正修改过的 override；点「恢复推荐」会删除 override，重新跟随当前版本的推荐默认。

## Search + Extract / Fetch

搜索只是第一步。当前插件已经给多家 Provider 接入了它们原生的正文/Extract 接口：

```text
Exa        /contents
Tavily     /extract
Firecrawl  /scrape
Parallel   /v1/extract
You.com    /v1/contents
Jina       Reader
```

典型流程：

```text
web_search
    ↓
找到相关 URL
    ↓
web_fetch
    ↓
读取正文 / Extract 后的页面内容
```

Search 和 Fetch 不要求使用同一家 Provider。例如：

```text
Brave LLM Context
    ↓
找到页面
    ↓
Parallel Extract
```

下一条长期路线会继续研究 query-aware focused extraction，而不是只增加更多 Search 参数。

## 搜索顺序与 fallback

Provider 可以拖动排序。第一项是默认搜索源。

例如：

```text
Exa → Brave → You.com → Tavily → Parallel → Firecrawl → Jina
```

如果当前 Provider 出现：

```text
限流
超时
网络错误
5xx
额度不足
```

插件会尝试下一家。

API Key 认证失败时，如果同一个 Provider 配置了多把 Key，会先尝试下一把可用 Key。

### Retry-After cooldown

如果 Provider 返回 429 且带 `Retry-After`：

```text
Provider A
   ↓ 429 + Retry-After
进入临时 cooldown
   ↓
当前请求 fallback 到 Provider B
```

在 cooldown 到期前，后续搜索不会再次向 A 发 HTTP 请求，而是直接跳过，避免重复撞限流。

## 多 API Key

每个 Hosted Provider 可以配置多个 API Key：

```text
Exa
├── Key A
├── Key B
└── Key C
```

并发搜索会优先分散到低 `inFlight` 的可用 Key；完整 Key 不会返回给浏览器端。

## Quota

当前额度支持：

| Provider | Quota |
| --- | :---: |
| Tavily | ✅ |
| Firecrawl | ✅ |
| Brave | ✅（Search response headers） |
| You.com | ✅ |
| Jina | Best effort |
| Exa | — |
| Parallel | Dashboard only |
| SearXNG | Self-hosted |

Quota 主要用于设置页展示，不会因为估算余额自动改变你的 Provider 顺序。

## Test Search

设置页可以直接测试真实 Provider chain，并显示：

- 最终使用的 Provider
- 搜索耗时
- 结果数量
- 每次 Provider attempt
- success / timeout / rate limit / authentication failure
- 搜索结果

<p align="center">
  <img src="assets/overviewAndTestSearch.png" width="850" alt="Test Search" />
</p>

Test Search 和 Agent 使用同一套 Registry / Provider settings。

## 会话「联网搜索」

输入框左侧有「联网搜索」开关：

- **关闭**：让 Agent 自己判断当前问题是否需要联网
- **开启**：每轮回答前至少完成一次联网研究；给了具体 URL 时优先 `web_fetch`，否则使用 `web_search`
- 一个明确事实默认用 1 条精确 query
- 只有两个独立未知量 / 两个真实 source angle 时才建议同时发 2 条 query
- 3–4 条只用于确实存在对应数量独立事实的任务
- 不用同义改写填满 `queries[]`
- 第一轮泛泛时只做一次更精确的 reformulation
- 搜索失败时要求 Agent 明确说明哪些当前事实没有完成联网验证

<p align="center">
  <img src="assets/searchMode.png" width="480" alt="联网搜索开关" />
</p>

## 免费额度参考

<details>
<summary>免费额度 / 新用户额度（请始终以各 Provider 官方当前规则为准）</summary>

免费额度变化很快，本项目不把它作为稳定 API contract。设置前建议直接查看对应 Provider 官方 Pricing / Billing 页面。

</details>

## 网络代理

支持：

```text
HTTPS_PROXY
HTTP_PROXY
Windows 系统代理
NO_PROXY
```

本地地址默认绕过代理：

```text
localhost
127.0.0.1
::1
*.local
```

## SearXNG

SearXNG 不需要 API Key，只需要自己的实例 URL：

```text
http://127.0.0.1:8080
```

既可以单独使用，也可以放在 fallback chain 最后。

## 安全

- API Key 只在 DSH Host 侧使用
- 浏览器端不会拿到完整 API Key
- 日志不输出完整 Key
- 请求不经过本项目中转服务器
- 不上传搜索使用记录
- 支持完全自托管 SearXNG
- Provider 错误和运行时状态不会包含 Authorization / API Key 明文

## 开发

安装依赖：

```bash
npm install
```

测试：

```bash
npm test
```

类型检查：

```bash
npm run typecheck
```

构建：

```bash
npm run build
```

改动 `src/` 后请重新 build，并把生成的 `lib/` 一起提交。包没有 `prepare` 脚本，GitHub 安装会直接使用仓库里已提交的 build 产物。

Provider adapters：

```text
src/host/providers/
```

P5 评测资产：

```text
reports/p5/
```

更多开发说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 更新后还是旧代码？

更新插件并重启后仍表现为旧版本时：

```bash
cd ~/.dsh/profiles/web
pnpm install
```

本地开发建议使用 `link:`，避免 `file:` 安装加载旧快照。

## Contributing

欢迎 Issue / Pull Request，也欢迎新的 Provider、Extract 能力和真实 benchmark 数据。

## License

[MIT](LICENSE) © A3Boy
