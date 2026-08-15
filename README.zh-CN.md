<div align="center">

# 🔎 dsh-web-tools

**DeepSeek Harness 的开源多搜索引擎 Web 工具插件**

统一 Web Search / Fetch · 多 Provider · BYOK · 账号池 · 额度查询 · 自动故障切换

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) | **简体中文**

</div>

---

## ✨ 为什么用 dsh-web-tools？

DeepSeek Harness 官方只带一个 DeepSeek 搜索 provider，而社区的单引擎插件（Exa、Firecrawl、Tavily…）又各自为战。**dsh-web-tools 把搜索引擎聚合到一个 provider 里**：

- 🧩 **一个插件 = 7 家搜索引擎**：Tavily / Exa / Firecrawl / Brave / You.com / Jina / SearXNG
- 🎛️ **模型工具面保持极简**：模型永远只看到官方的 `web_search` / `web_fetch` 两个工具，复杂性全部收敛在 Provider 边界之下
- 🔑 **BYOK + 账号池**：每家引擎可配多个 key（逗号分隔），搜索时**最少使用优先**自动轮换，失败 key 自动标记不健康
- 📊 **真实额度仪表盘**：Tavily / Firecrawl / You.com 显示**官方权威余额**，Jina best-effort，SearXNG 自托管无额度
- 🔄 **确定性 fallback**：429 / 408 / 5xx / 超时 / 网络 / auth 错误自动切下一家；Quota-aware（确认耗尽才跳过）
- 🛡️ **安全第一**：API key 经 `ctx.credentials` 存储，**永远不回传浏览器**；配置读写走 loopback 围栏
- 🖥️ **原生设置 UI**：`Settings → Plugins → Plugin configuration → dsh-web-tools`，无需改 YAML

---

## 📦 安装

```bash
# 1. 安装（npm 发布后：）
dsh plugin --profile web add dsh-web-tools

# 2. 在 profile package.json 的 dsh.profile.bundles 加入 "dsh-web-tools"
#    （file: 本地依赖需要手动加；npm 发布后 dsh plugin add 自动处理）

# 3. 完全重启
dsh web
```

> ⚠️ 本地开发：插件需要 peer 依赖解析（`@deepseek-ai/*`），可用 junction 指向 DSH profile 的 `node_modules`。

---

## 🚀 快速开始

1. 打开 `Settings → Plugins → Plugin configuration → dsh-web-tools`
2. 为每家引擎填入 API Key（多个 key 用逗号分隔 → 自动组成账号池）
3. 选择**默认搜索引擎**，配置 **fallback 顺序**
4. 点 **Test** 验证连接、点 **Test Search** 真实跑一次

### 支持的 Provider

| Provider | 类型 | 搜索 | Fetch | 额度查询 | 额度来源 |
|---|---|---|---|---|---|
| [Tavily](https://tavily.com) | AI 搜索 | ✅ | ✅ | ✅ | 官方 `/usage`（权威） |
| [Exa](https://exa.ai) | 语义搜索 | ✅ | ✅ | ⚠️ | 本地估算（非权威） |
| [Firecrawl](https://firecrawl.dev) | 搜索+抓取 | ✅ | ✅ | ✅ | 官方 credit-usage（权威） |
| [Brave](https://search.brave.com) | 独立索引 | ✅ | ❌ | 🚧 | 响应头（V2） |
| [You.com](https://you.com) | AI 搜索 | ✅ | ❌ | ✅ | 官方余额 API（权威） |
| [Jina](https://jina.ai) | Reader+搜索 | ✅ | ✅ | ✅ | best-effort |
| [SearXNG](https://docs.searxng.org) | 自托管 | ✅ | ❌ | — | 无平台额度 |

> **V2 计划**：Serper（无权威 quota）、Parallel（余额需 OAuth）、Perplexity（billing 为非官方 API）

---

## 🏗️ 架构

```
DSH Agent
   ↓   只见 web_search / web_fetch
dsh-tool-web（官方工具，由插件重新启用）
   ↓
ctx.web（searchProvider: dsh-web-tools）
   ↓
dsh-web-tools SearchHubProvider
   ├── Router    确定性 fallback + quota-aware skip
   ├── Pools     每引擎多 key 最少使用优先轮换
   ├── Quota     官方 API / best-effort / local estimate
   └── Providers Tavily · Exa · Firecrawl · Brave · You.com · Jina · SearXNG
```

```
设置页 (client card)
   ↓ fetch /web-tools/api/*（fenced，仅 loopback）
Host routes（config/save · credentials/set · test/* · quota/describe）
   ↓
ctx.settings（dsh-web-tools namespace，非敏感配置）
ctx.credentials（WEB_TOOLS_<PROVIDER>，key 池）
```

---

## 🔐 凭据

| Provider | Credential ref | 说明 |
|---|---|---|
| Tavily | `WEB_TOOLS_TAVILY` | 多 key 逗号分隔 |
| Exa | `WEB_TOOLS_EXA` | highlights 模式 |
| Firecrawl | `WEB_TOOLS_FIRECRAWL` | /search + /scrape |
| Brave | `WEB_TOOLS_BRAVE` | X-Subscription-Token |
| You.com | `WEB_TOOLS_YOU` | USD 余额 |
| Jina | `WEB_TOOLS_JINA` | s.jina.ai + r.jina.ai |
| SearXNG | `WEB_TOOLS_SEARXNG` | baseUrl（自托管） |

---

## 🛠️ 开发

```bash
npm install
npx tsc -p tsconfig.json --noEmit           # Host 类型检查
npx tsc -p tsconfig.client.json --noEmit    # Client 类型检查
npx tsc -p tsconfig.build.json              # 构建 lib/
node --experimental-strip-types --test src/host/logic.test.ts   # 单测
node --experimental-strip-types test/routes.smoke.mjs           # 路由冒烟
```

---

## 🤝 贡献

欢迎 PR！新增 Provider 只需实现 `ProviderAdapter` 契约并注册——详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 License

[MIT](LICENSE) © A3Boy
