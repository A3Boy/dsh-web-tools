<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="dsh-web-tools" width="160" />
</p>

# dsh-web-tools

DeepSeek Harness 多搜索源 Web Search / Fetch 插件。

支持 Tavily、Exa、Firecrawl、Parallel、Brave、You.com、Jina 和 SearXNG，可配置搜索顺序、自动切换搜索源、多 API Key 和额度查看。

继续使用 DSH 原生的 `web_search` / `web_fetch`。

<p align="center">
  <a href="https://github.com/A3Boy/dsh-web-tools/stargazers">
    <img src="https://img.shields.io/github/stars/A3Boy/dsh-web-tools?style=flat-square&label=Stars" alt="GitHub Stars" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-2ea44f?style=flat-square" alt="MIT License" />
  </a>
  <a href="https://github.com/deepseek-ai/deepseek-harness">
    <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-4D6BFE?style=flat-square" alt="DeepSeek Harness" />
  </a>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Providers-8-111111?style=flat-square" alt="8 Providers" />
  <img src="https://img.shields.io/badge/Fallback-supported-2ea44f?style=flat-square" alt="Fallback" />
  <img src="https://img.shields.io/badge/Multi--Key-supported-2ea44f?style=flat-square" alt="Multi-Key" />
  <img src="https://img.shields.io/badge/BYOK-yes-2ea44f?style=flat-square" alt="BYOK" />
  <img src="https://img.shields.io/badge/SearXNG-self--hosted-555555?style=flat-square" alt="SearXNG" />
</p>

[English](README.md) | **简体中文**

</div>

<p align="center">
  <img src="assets/overview.png" width="900" alt="dsh-web-tools 设置页" />
</p>

## 功能

- 8 个搜索源
- 自定义搜索顺序
- 搜索失败自动切换下一家
- Provider 独立启用 / 禁用
- 每个 Provider 支持多个 API Key
- API Key 健康状态
- 额度 / 余额 / Rate Limit 查看
- 多 Key 额度合并
- 后台自动刷新额度
- Provider 连接测试
- Test Search
- 搜索失败过程展示
- 系统代理 / Windows 系统代理
- SearXNG 自托管
- 中文 / English 界面
- API Key 保存到 DSH Credentials

插件不提供共享 Key 或中转服务，请求由本地 DSH 直接访问对应 Provider。

## 安装

```bash
dsh plugin --profile web add github:A3Boy/dsh-web-tools
```

重启 `dsh web` 后打开：

```text
Settings → Web Search
```

检查插件：

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

当前针对 DeepSeek Harness `0.1.0-rc.6` 开发和测试。

## Providers

| Provider | Search | Fetch | Quota |
| --- | :---: | :---: | :---: |
| [Tavily](https://tavily.com) | ✅ | ✅ | ✅ |
| [Exa](https://exa.ai) | ✅ | ✅ | — |
| [Firecrawl](https://firecrawl.dev) | ✅ | ✅ | ✅ |
| [Parallel](https://parallel.ai) | ✅ | ✅ | Dashboard |
| [Brave Search](https://brave.com/search/api/) | ✅ | — | ✅ |
| [You.com](https://you.com) | ✅ | — | ✅ |
| [Jina](https://jina.ai) | ✅ | ✅ | Best effort |
| [SearXNG](https://docs.searxng.org) | ✅ | — | Self-hosted |

<p align="center">
  <img src="assets/providerDetail.png" width="900" alt="Provider 配置与额度" />
</p>

简单选型：

| 用途 | 可以先试 |
| --- | --- |
| 普通搜索 | Tavily |
| 语义 / 技术搜索 | Exa |
| 搜索 + 网页正文 | Firecrawl / Parallel / Jina |
| 常规 Web 搜索 | Brave |
| Web / News | You.com |
| 自托管 | SearXNG |

不需要全部配置。

只配置一个 Provider 就可以使用；配置多个后可以使用自动切换。

## 免费额度参考

> 截至 2026-08-16。上游价格和免费计划可能调整，请以 Provider 官网为准。

| Provider | 免费额度 / 新用户额度 |
| --- | --- |
| Tavily | **1,000 credits / 月** |
| Exa | **注册送 $20 + 每月 $10** |
| Firecrawl | **1,000 credits / 月** |
| Parallel | **注册送最高 $80 + 每月 $5** |
| Brave Search | **每月 $5 credits** |
| You.com | **新账号 $100 credits** |
| Jina | **新 API Key 10M tokens** |
| SearXNG | **自托管，无平台额度** |

每月持续免费：

```text
Tavily       1,000 credits
Exa          $10
Firecrawl    1,000 credits
Parallel     $5
Brave        $5
```

一次性新用户额度：

```text
Parallel     最高 $80
Exa          $20
You.com      $100
Jina         10M tokens
```

部分 Provider 的免费额度需要注册或绑定支付方式，具体以官方规则为准。

Parallel 和 You.com 另外提供免费 MCP Search，但本插件当前使用它们的 REST API，因此仍需要填写对应 API Key。

## 搜索顺序

可以自己安排搜索源顺序：

```text
Tavily → Firecrawl → Exa → Parallel → Brave
```

第一项作为默认搜索源。

搜索链中的 Provider 可以拖动排序，也可以从搜索链移除。

移出搜索链不会删除 Provider 配置，仍然可以单独测试。

## 自动切换

如果当前 Provider 出现这些情况：

```text
限流
超时
网络错误
服务异常
额度不足
```

插件会尝试下一家。

例如：

```text
Tavily
   ↓ timeout
Firecrawl
   ↓
success
```

<p align="center">
  <img src="assets/searchfallback.png" width="850" alt="搜索源自动切换" />
</p>

API Key 认证失败时，如果同一个 Provider 配置了多把 Key，会先尝试下一把可用 Key。

## 多 API Key

每个 Provider 可以配置多个 API Key：

```text
Tavily
├── Key A
├── Key B
└── Key C
```

插件会自动选择可用 Key。

支持使用：

```text
换行
逗号
空格
分号
```

分隔多个 Key。

完整 API Key 不会返回给浏览器端，设置页只显示掩码信息。

## Quota

当前额度支持：

| Provider | 额度 |
| --- | :---: |
| Tavily | ✅ |
| Firecrawl | ✅ |
| Brave | ✅ |
| You.com | ✅ |
| Jina | Best effort |
| Exa | — |
| Parallel | Dashboard |
| SearXNG | Self-hosted |

支持多 Key 的 Provider 会合并显示总额度。

例如：

```text
Key A: 950 / 1000
Key B: 982 / 1000

Pool: 1932 / 2000
```

额度信息后台自动刷新，默认缓存时间为 5 分钟。

Brave 的额度来自 Search 返回的 `X-RateLimit-*` 信息，插件会保存最近一次查询结果。

Quota 只用于设置页显示，不影响正常搜索。

## Test Search

设置页可以直接测试完整搜索链。

会显示：

- 最终使用的 Provider
- 搜索耗时
- 返回结果数量
- 每次尝试的 Provider
- 是否成功 / 超时 / 限流 / 认证失败
- 搜索结果

<p align="center">
  <img src="assets/overviewAndTestSearch.png" width="850" alt="Test Search" />
</p>

Test Search 和 Agent 实际使用的是同一条搜索链。

## Web Fetch

支持正文读取的 Provider：

```text
Tavily
Exa
Firecrawl
Parallel
Jina
```

因此可以：

```text
web_search
    ↓
找到网页
    ↓
web_fetch
    ↓
读取正文
```

Search 和 Fetch 不要求使用同一家 Provider。

例如：

```text
Brave Search
    ↓
Parallel Fetch
```

## 网络代理

支持：

```text
HTTPS_PROXY
HTTP_PROXY
Windows 系统代理
```

以下本地地址默认不走代理：

```text
localhost
127.0.0.1
::1
*.local
```

也支持 `NO_PROXY`。

## SearXNG

SearXNG 不需要 API Key。

只需要填写自己的实例地址，例如：

```text
http://127.0.0.1:8080
```

可以单独使用：

```text
SearXNG
```

也可以放在 fallback 最后：

```text
Tavily → Exa → Brave → SearXNG
```

## 页面语言

Web Search 页面支持：

```text
跟随系统
中文
English
```

只修改这个插件页面，不影响 DSH 其他页面。

## 安全

- API Key 只在 DSH Host 侧使用
- 浏览器端不会拿到完整 API Key
- 日志不会输出完整 Key
- 请求不经过本项目的中转服务器
- 不上传搜索使用记录
- 可以只使用自托管 SearXNG

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
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.client.json --noEmit
```

构建：

```bash
npm run build
```

Provider Adapter 位于：

```text
src/host/providers/
```

新增 Provider 可以参考现有实现。

更多开发说明见：

[CONTRIBUTING.md](CONTRIBUTING.md)

## 更新后还是旧版本？

如果更新插件并重启后仍然是旧代码，可以在 profile 目录重新安装依赖：

```bash
cd ~/.dsh/profiles/web
pnpm install
```

本地开发如果使用 `file:` 指向插件目录，可能会加载旧快照。

可以改用 `link:`。

## Contributing

欢迎 Issue 和 Pull Request。

如果有新的 Search Provider 想接入，也欢迎提交。

## License

[MIT](LICENSE) © A3Boy
