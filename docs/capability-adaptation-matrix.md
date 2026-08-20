# Capability Adaptation Matrix

> 基于 dsh-web-tools（A3Boy/dsh-web-tools @ f089093）代码分析 + 实验仓库 18 个提交的 live 验证结果。
> 目标：把 ProviderAdapter 的 `search(query, maxResults)` 扩展为 provider 原生能力适配，不让 Agent 的"认真搜"在狭管里丢失。

## 核心问题

当前 `ProviderAdapter` 接口：

```ts
search(query: string, maxResults: number, apiKey: string, baseUrl: string | undefined, signal?: AbortSignal): Promise<SearchOutcome>
```

Agent 只能传 `query` + `maxResults`，无法控制任何 provider 的高级搜索参数（type、category、date range、search_depth、livecrawl 等）。这是"搜出来全是泛泛结果"的根因——不是 Prompt 不够认真，是**参数通道太窄**。

## 迁移策略

**不改变 ProviderAdapter 契约**（registry/pool/fallback 全依赖它）。新增一个**可选 Capability 层**：
- 每个 provider 导出 `capabilities: ProviderCapability[]`（声明式能力描述）
- 扩展 `search` 签名：`search(query, maxResults, apiKey, baseUrl, signal, capabilities?: Record<string, unknown>)`
- 向后兼容：不传 capabilities 时行为不变
- Agent 的 tool 定义通过 Prompt 注入各 provider 的能力参数；Agent 在 tool call 中传参

## 各 Provider 能力矩阵

### 1. Exa

| 当前 | 固定值 | 可扩展能力 | 实验验证 |
|------|--------|------------|----------|
| type | `"auto"` | `type: "keyword" \| "neural" \| "auto"` | ✅ live 验证所有 type 有效 |
| contents | `{highlights: true}` | `contents: {highlights?, text?, summary?, maxCharacters?, maxAgeHours?}` | ✅ highlights 是 evidence 最佳来源 |
| 无 | - | `category: "news" \| "company" \| "research paper" \| ...` | ✅ 按类别过滤 |
| 无 | - | `include_domains` / `exclude_domains` | ✅ 域过滤 |
| 无 | - | `start_published_date` / `end_published_date` | 绝对日期范围 |
| 无 | - | `num_results`（独立于 maxResults） | 语义搜索与数量解耦 |

**建议**：Exa 的核心优势是 semantic search + 类别过滤 + 日期范围，Agent 应该能指定 `type` 和 `category`。

### 2. Tavily

| 当前 | 固定值 | 可扩展能力 | 实验验证 |
|------|--------|------------|----------|
| search_depth | 无（默认 `basic`） | `search_depth: "basic" \| "advanced"` | ✅ advanced 返回更多 chunks |
| include_answer | 无 | `include_answer: boolean` | 大模型摘要（非 evidence） |
| include_image_descriptions | 无 | `include_image_descriptions: boolean` | 实验未验证 |
| include_raw_content | 无 | `include_raw_content: boolean` | 实验未验证（大 body） |
| max_results | 默认 | 独立于 maxResults | ✅ 控制返回数 |
| 无 | - | `include_domains` / `exclude_domains` | ✅ 域过滤 |

**建议**：Tavily 的 `search_depth: "advanced"` 是提升搜索质量最直接的参数（实验验证 extra chunks 含更多 evidence），应优先暴露。

### 3. Firecrawl

| 当前 | 固定值 | 可扩展能力 | 实验验证 |
|------|--------|------------|----------|
| 无 | - | `sources: "web" \| "news" \| "social"` | ✅ 源类型过滤 |
| 无 | - | `scrapeOptions: {formats: ["markdown"]}` | 搜索时同时返回内容 |
| 无 | - | `limit`（独立于 maxResults） | 搜索与返回数解耦 |
| 无 | - | country / locale 地理过滤 | 实验未验证 |

**建议**：Firecrawl 的 `sources` 参数让 Agent 能指定搜索源类型（web/news/social），对精确搜索场景（如"找新闻"）很有价值。

### 4. Parallel

| 当前 | 固定值 | 可扩展能力 | 实验验证 |
|------|--------|------------|----------|
| search_queries | 从 query 派生 1 条 | 多 query 组合 | ✅ 多 query 并行搜索显著提升召回 |
| mode | `"basic"` | `mode: "basic" \| "deep"` | 实验用 basic |
| 无 | - | `max_results` 独立控制 | ✅ 已验证 |

**建议**：Parallel 的核心能力是**多 query 并行搜索**，但当前只传一条 query 入 `search_queries`。Agent 应该能提供多条 query（如 ["AI frameworks 2026", "latest LLM releases"]）让 Parallel 同时搜索，显著提升召回质量。

### 5. Brave

| 当前 | 固定值 | 可扩展能力 | 实验验证 |
|------|--------|------------|----------|
| 端点 | `res/v1/web/search` | `res/v1/llm/context`（LLM pre-extracted） | ✅ LLM Context 端点返回 passage 质量更高 |
| 无 | - | `freshness: "day" \| "week" \| "month" \| "year"` | 时间新鲜度 |
| 无 | - | `result_filter: "web" \| "news" \| "video"` | 结果类型过滤 |
| 无 | - | `country` / `search_lang` | 地理+语言 |
| 无 | - | `safesearch: "strict" \| "moderate" \| "off"` | 安全搜索 |
| 无 | - | `extra_snippets: boolean` | 额外 snippet |

**建议**：Brave 的 llm/context 端点比 web/search 更适合 Agent 场景（预提取的 passage 直接作为 evidence），但当前用 web/search。Agent 应能选择端点和 freshness。

### 6. You.com

| 当前 | 固定值 | 可扩展能力 | 实验验证 |
|------|--------|------------|----------|
| 端点 | `/v1/search` | `/ydc-index.io/search`（latest API） | 实验用 ydc-index.io 成功 |
| 无 | - | `count`（独立于 maxResults） | ✅ |
| 无 | - | `livecrawl: "always" \| "fallback" \| "never"` | 实验验证 livecrawl 返回 content |
| 无 | - | `country` / `search_lang` | 地理+语言 |
| 无 | - | `chat` / `add_params` | 扩展参数 |

**建议**：You.com 当前用 POST `/v1/search`，但实验验证 ydc-index.io 端点和 livecrawl 参数有效。`livecrawl: "always"` 让 You 实时抓取页面而非仅用缓存，适合需要最新信息的场景。

### 7. Jina

| 当前 | 固定值 | 可扩展能力 | 实验验证 |
|------|--------|------------|----------|
| count | 从 maxResults 派生 | `count` 独立控制 | ✅ |
| 无 | - | `query` 放在 URL path | 编码处理 |
| 输出 | JSON 搜索 | Reader 端点纯文本（全文抓取） | ✅ 实验验证 selectRelevantPassages |
| 无 | - | retry / language | 可选 |

**建议**：Jina 当前已用 JSON 搜索（正确）。Reader 端点作为 fetch 已实现。能力扩展空间相对有限。

## 推荐架构变更

### 第一步（最小侵入）：ProviderCapability 类型

```ts
// src/host/providers/types.ts 新增
export interface ProviderCapability {
  /** 参数名（Agent tool schema 中的 key） */
  name: string;
  /** 参数类型 */
  type: "string" | "number" | "boolean" | "string[]" | "object";
  /** 描述（用于 Prompt 注入） */
  description: string;
  /** 可选值（string 类型时） */
  enum?: string[];
  /** 默认值 */
  default?: unknown;
  /** 是否必选 */
  required?: boolean;
}

// ProviderMeta 扩展
export interface ProviderMeta {
  // ... 现有字段
  /** 该 provider 支持的搜索能力参数 */
  capabilities?: ProviderCapability[];
}
```

### 第二步：扩展 search 签名

```ts
search(
  query: string,
  maxResults: number,
  apiKey: string,
  baseUrl: string | undefined,
  signal?: AbortSignal,
  /** Provider 原生能力参数（由 Agent 在 tool call 中传入） */
  capabilities?: Record<string, unknown>,
): Promise<SearchOutcome>;
```

向后兼容：不传 `capabilities` 时行为不变，每个 provider 内部 `??` 当前固定值。

### 第三步：Agent 可见性

在 `web_search` tool 的 Prompt 描述中注入 active provider 的 `capabilities` 列表，让 Agent 知道当前 provider 还能接受哪些参数。例如：

```
Active provider: Exa
Available capabilities:
  - type: "keyword" | "neural" | "auto" (default: "auto")
  - category: "news" | "company" | "research paper" | ...
  - start_published_date: ISO date string
  - end_published_date: ISO date string
```

## 迁移优先级

| 优先级 | Provider | 能力 | 预期收益 |
|--------|----------|------|----------|
| P0 | Exa | `type` + `category` | 语义搜索 vs 关键词搜索、内容分类 |
| P0 | Tavily | `search_depth` | advanced 模式显著提升 evidence 质量 |
| P0 | Parallel | 多 `search_queries` | 并行搜索大幅提升召回 |
| P1 | Brave | `freshness` + llm/context 端点 | 时间敏感搜索 + 高质量 passage |
| P1 | Firecrawl | `sources` | 源类型过滤 |
| P1 | You.com | `livecrawl` | 实时抓取最新内容 |
| P2 | Jina | `count` | 数量控制 |