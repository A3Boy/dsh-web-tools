/**
 * dsh-web-tools — SearchHints semantic extraction layer.
 *
 * Deterministic, zero-LLM lightweight semantic extraction from user queries.
 * Extracts high-confidence hints:
 *  - topic: "code" | "news" | "finance" | "research" | "general"
 *  - freshness: preset ("day" | "week" | "month" | "year"), after_date (YYYY-MM-DD), before_date
 *  - domains: include (hard filter, e.g. site:github.com), exclude (-site:), prefer (soft preference, e.g. "官方文档/official docs")
 *  - locale: language, country
 *  - cleanQuery: query with syntax operators (site:, -site:) stripped for pure keyword matching
 *
 * Principle: ONLY explicit constraints become hard filters (include/exclude domains).
 * Soft preferences (preferDomains / official sources) steer the objective rather than killing recall.
 * @module
 */

export type SearchTopic = "general" | "news" | "finance" | "code" | "research";

export type FreshnessPreset = "day" | "week" | "month" | "year";

export interface FreshnessHint {
  preset?: FreshnessPreset;
  /** RFC 3339 date string YYYY-MM-DD */
  after?: string;
  /** RFC 3339 date string YYYY-MM-DD */
  before?: string;
}

export interface DomainHints {
  /** Hard filter: results MUST come from these domains (e.g. from site:foo.com) */
  include?: string[];
  /** Hard filter: results MUST NOT come from these domains (e.g. from -site:bar.com) */
  exclude?: string[];
  /** Soft preference: prefer/boost these domains or official primary documentation */
  prefer?: string[];
  /** Whether the query explicitly preferred official/primary documentation */
  preferOfficial?: boolean;
}

export interface LocaleHint {
  language?: string;
  country?: string;
}

export interface SearchHints {
  topic?: SearchTopic;
  freshness?: FreshnessHint;
  domains?: DomainHints;
  locale?: LocaleHint;
  /** Cleaned query string with explicit operators (e.g. site:) removed */
  cleanQuery: string;
  /** The original unmodified query */
  rawQuery: string;
}

/**
 * Format a Date object to YYYY-MM-DD
 */
export function formatDateYMD(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculate an after_date string from a preset relative to a reference date.
 */
export function calculateAfterDate(preset: FreshnessPreset, now: Date = new Date()): string {
  const d = new Date(now.getTime());
  switch (preset) {
    case "day":
      d.setUTCDate(d.getUTCDate() - 1);
      break;
    case "week":
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    case "month":
      d.setUTCMonth(d.getUTCMonth() - 1);
      break;
    case "year":
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      break;
  }
  return formatDateYMD(d);
}

// Regex patterns for operator extraction
const SITE_INCLUDE_RE = /(?:^|\s)site:([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\b|\s|$)/gi;
const SITE_EXCLUDE_RE = /(?:^|\s)-site:([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\b|\s|$)/gi;

// Code topic indicators (keywords or patterns)
const CODE_INDICATORS = [
  /\b(github|gitlab|npm|pnpm|cargo|pip|pypi|nuget|crates\.io|stackoverflow|golang|typescript|python|rust|c\+\+|javascript|react|vue|svelte|docker|k8s|kubernetes|linux|bash|powershell|sql|postgres|redis|git|api|sdk|graphql|rest|grpc|webhook|bug|error|issue|pr|pull request|stacktrace|exception|panic|segfault|syntax|compiler|traceback)\b/i,
  /(?:代码|函数|接口|报错|崩溃|源码|组件|配置|版本号|仓库|提交|异常|编译)/,
];

// News topic indicators
const NEWS_INDICATORS = [
  /\b(news|breaking|announced|announcement|press release|headline|journal|report|coverage)\b/i,
  /(?:新闻|快讯|发布会|报道|最新消息|突发|动态|头条)/,
];

// Finance topic indicators
const FINANCE_INDICATORS = [
  /\b(stock|shares|nasdaq|nyse|sec|10-k|10-q|earnings|revenue|market cap|valuation|ipo|crypto|bitcoin|ethereum|dividend|fiscal|quarterly|ebitda)\b/i,
  /(?:财报|股价|营收|市值|估值|财季|分红|股票|证券|上市|收益率|净利润)/,
];

// Research topic indicators
const RESEARCH_INDICATORS = [
  /\b(arxiv|paper|research|benchmark|ablation|evaluation|dataset|methodology|conference|neurips|icml|iclr|cvpr|acl|ieee|springer|nature|science)\b/i,
  /(?:论文|学术|评测|基准|消融实验|数据集|学术会议|研报|文献)/,
];

// Freshness indicators
const DAY_INDICATORS = [
  /\b(today|past 24 hours|last 24 hours|24h|today's)\b/i,
  /(?:今天|今日|过去24小时|24小时内|当天)/,
];
const WEEK_INDICATORS = [
  /\b(this week|past week|last 7 days|7d|recent week)\b/i,
  /(?:本周|这一周|过去7天|近7天|最近一周)/,
];
const MONTH_INDICATORS = [
  /\b(this month|past month|last 30 days|latest|recently|recent|newest|current)\b/i,
  /(?:本月|过去30天|近1个月|最近|最新|近期|近来)/,
];
const YEAR_INDICATORS = [
  /\b(this year|past year|last 12 months|annual)\b/i,
  /(?:今年|本年度|近1年|过去一年)/,
];

// Explicit date range in query (e.g. 2026-08-01..2026-08-20 or after:2026-01-01)
const AFTER_DATE_RE = /\bafter:(\d{4}-\d{2}-\d{2})\b/i;
const BEFORE_DATE_RE = /\bbefore:(\d{4}-\d{2}-\d{2})\b/i;

// Official source preference indicators
const OFFICIAL_PREFERENCE_INDICATORS = [
  /\b(official|primary doc|primary documentation|official docs?|official website|canonical source)\b/i,
  /(?:官方文档|官网|官方|权威来源|正规文档|官方指南)/,
];

/**
 * Extract structured SearchHints from a raw query.
 * Pure function: deterministic, fast, testable, zero side-effects.
 */
export function extractSearchHints(query: string, now: Date = new Date()): SearchHints {
  const rawQuery = (query ?? "").trim();
  let cleanQuery = rawQuery;

  // 1. Extract domain include/exclude
  const includeDomains: string[] = [];
  const excludeDomains: string[] = [];

  let match: RegExpExecArray | null;

  // Extract -site:
  const excludeRe = new RegExp(SITE_EXCLUDE_RE.source, "gi");
  while ((match = excludeRe.exec(rawQuery)) !== null) {
    const domain = match[1]?.toLowerCase();
    if (domain && !excludeDomains.includes(domain)) {
      excludeDomains.push(domain);
    }
  }
  cleanQuery = cleanQuery.replace(SITE_EXCLUDE_RE, " ");

  // Extract site:
  const includeRe = new RegExp(SITE_INCLUDE_RE.source, "gi");
  while ((match = includeRe.exec(rawQuery)) !== null) {
    const domain = match[1]?.toLowerCase();
    if (domain && !includeDomains.includes(domain)) {
      includeDomains.push(domain);
    }
  }
  cleanQuery = cleanQuery.replace(SITE_INCLUDE_RE, " ");

  // 2. Extract explicit after: / before: dates
  let afterDate: string | undefined;
  let beforeDate: string | undefined;
  const afterMatch = AFTER_DATE_RE.exec(cleanQuery);
  if (afterMatch) {
    afterDate = afterMatch[1];
    cleanQuery = cleanQuery.replace(AFTER_DATE_RE, " ");
  }
  const beforeMatch = BEFORE_DATE_RE.exec(cleanQuery);
  if (beforeMatch) {
    beforeDate = beforeMatch[1];
    cleanQuery = cleanQuery.replace(BEFORE_DATE_RE, " ");
  }

  // 3. Extract freshness preset
  let freshnessPreset: FreshnessPreset | undefined;
  if (!afterDate && !beforeDate) {
    if (DAY_INDICATORS.some((re) => re.test(rawQuery))) {
      freshnessPreset = "day";
    } else if (WEEK_INDICATORS.some((re) => re.test(rawQuery))) {
      freshnessPreset = "week";
    } else if (MONTH_INDICATORS.some((re) => re.test(rawQuery))) {
      freshnessPreset = "month";
    } else if (YEAR_INDICATORS.some((re) => re.test(rawQuery))) {
      freshnessPreset = "year";
    }
  }

  const freshness: FreshnessHint | undefined =
    freshnessPreset || afterDate || beforeDate
      ? {
          preset: freshnessPreset,
          after: afterDate ?? (freshnessPreset ? calculateAfterDate(freshnessPreset, now) : undefined),
          before: beforeDate,
        }
      : undefined;

  // 4. Topic classification
  let topic: SearchTopic = "general";
  if (includeDomains.some((d) => d.includes("github.com") || d.includes("gitlab.com") || d.includes("stackoverflow.com")) ||
      CODE_INDICATORS.some((re) => re.test(rawQuery))) {
    topic = "code";
  } else if (includeDomains.some((d) => d.includes("arxiv.org")) ||
             RESEARCH_INDICATORS.some((re) => re.test(rawQuery))) {
    topic = "research";
  } else if (FINANCE_INDICATORS.some((re) => re.test(rawQuery))) {
    topic = "finance";
  } else if (NEWS_INDICATORS.some((re) => re.test(rawQuery))) {
    topic = "news";
  }

  // 5. Official / Prefer domains
  const preferOfficial = OFFICIAL_PREFERENCE_INDICATORS.some((re) => re.test(rawQuery));
  const preferDomains: string[] = [];
  if (includeDomains.length > 0) {
    // If includeDomains is present, it's also a preferred domain
    preferDomains.push(...includeDomains);
  }

  const domains: DomainHints | undefined =
    includeDomains.length > 0 || excludeDomains.length > 0 || preferDomains.length > 0 || preferOfficial
      ? {
          include: includeDomains.length > 0 ? includeDomains : undefined,
          exclude: excludeDomains.length > 0 ? excludeDomains : undefined,
          prefer: preferDomains.length > 0 ? preferDomains : undefined,
          preferOfficial,
        }
      : undefined;

  // 6. Locale hint detection (simple language / country cues)
  let locale: LocaleHint | undefined;
  const hasChinese = /[\u4e00-\u9fa5]/.test(rawQuery);
  const hasJapanese = /[\u3040-\u30ff]/.test(rawQuery);
  if (hasChinese) {
    locale = { language: "zh", country: "CN" };
  } else if (hasJapanese) {
    locale = { language: "ja", country: "JP" };
  }

  // Clean extra whitespaces in cleanQuery
  cleanQuery = cleanQuery.replace(/\s+/g, " ").trim();
  if (!cleanQuery) cleanQuery = rawQuery;

  return {
    topic,
    freshness,
    domains,
    locale,
    cleanQuery,
    rawQuery,
  };
}
