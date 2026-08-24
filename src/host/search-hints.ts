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

export type PlatformHint = "xiaohongshu" | "x";

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
  platform?: PlatformHint;
  /** Whether the query explicitly targeted the platform (e.g. "小红书", "推特", "site:x.com") */
  platformExplicit?: boolean;
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

// Platform indicators (high precision to avoid false positives on solitary 'x' or common words)
const XIAOHONGSHU_EXPLICIT_RE = /(?:小红书|rednote|\bxsec_token\b)/i;
const XIAOHONGSHU_CLEAN_RE = /(?:(?:请\s*)?(?:在|去)?\s*(?:小红书|rednote)(?:上|里|中)?\s*(?:搜索|搜|查找|找|看看)?)/gi;

const X_EXPLICIT_RE = /(?:twitter|推特|x\.com|twitter\.com|(?:在|上)X(?:上|里|中)?|X\s*(?:平台|推特|社区|帖子|动态|热搜)|^\s*X\s*[:：])/i;
const X_ROUTE_PREFIX_RE = /^\s*X\s*[:：]\s*/i;
const X_CLEAN_RE = /(?:(?:请\s*)?(?:在|去)?\s*(?:X(?:上|里|中)|(?:twitter|推特)(?:上|里|中)?|X\s*(?:平台|推特|社区|帖子|动态|热搜)(?:上|里|中)?)\s*(?:搜索|搜|查找|找|看看)?)/gi;

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

// Multi-country / Global suppressors: when user specifies multiple countries or global terms, avoid biasing to a single country.
const GLOBAL_SCOPE_INDICATORS = [
  /\b(international|worldwide|global|globally)\b/i,
  /(?:国内外|海内外|全球|世界范围|跨国|国际)/,
];

// Country indicators (only assign country when explicitly mentioned in the query)
const EXPLICIT_COUNTRY_PATTERNS: Array<{ re: RegExp; country: string }> = [
  { re: /(?:美国|美股|美联储|United States|USA|\bUS\b)/i, country: "US" },
  { re: /(?:中国|国内|A股|China|\bCN\b)/i, country: "CN" },
  { re: /(?:日本|日经|Japan|\bJP\b)/i, country: "JP" },
  { re: /(?:英国|United Kingdom|\bUK\b|\bGB\b)/i, country: "GB" },
  { re: /(?:新加坡|Singapore|\bSG\b)/i, country: "SG" },
  { re: /(?:德国|Germany|\bDE\b)/i, country: "DE" },
  { re: /(?:法国|France|\bFR\b)/i, country: "FR" },
  { re: /(?:加拿大|Canada|\bCA\b)/i, country: "CA" },
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

  // 1.1 Extract Platform Hint (Xiaohongshu vs X/Twitter)
  let platform: PlatformHint | undefined;
  let platformExplicit = false;

  const isXhsDomain = includeDomains.some((d) => d.includes("xiaohongshu.com") || d.includes("xhslink.com"));
  const isXDomain = includeDomains.some((d) => d.includes("x.com") || d.includes("twitter.com"));

  if (isXhsDomain || XIAOHONGSHU_EXPLICIT_RE.test(rawQuery)) {
    platform = "xiaohongshu";
    platformExplicit = true;
    cleanQuery = cleanQuery.replace(XIAOHONGSHU_CLEAN_RE, " ");
  } else if (isXDomain || X_EXPLICIT_RE.test(rawQuery)) {
    platform = "x";
    platformExplicit = true;
    cleanQuery = cleanQuery.replace(X_ROUTE_PREFIX_RE, " ").replace(X_CLEAN_RE, " ");
  }

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

  // 3. Topic classification (needed before freshness rules to avoid over-constraining evergreen technical queries)
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

  // 4. Extract freshness preset:
  // Hard freshness (day/week): applied across all topics.
  // Soft freshness (month/year keywords like latest/recent/current): applied ONLY if topic === "news"
  // or when explicit after/before is given, to avoid truncating evergreen docs like "latest React docs".
  let freshnessPreset: FreshnessPreset | undefined;
  if (!afterDate && !beforeDate) {
    if (DAY_INDICATORS.some((re) => re.test(rawQuery))) {
      freshnessPreset = "day";
    } else if (WEEK_INDICATORS.some((re) => re.test(rawQuery))) {
      freshnessPreset = "week";
    } else if (topic === "news" && MONTH_INDICATORS.some((re) => re.test(rawQuery))) {
      freshnessPreset = "month";
    } else if (topic === "news" && YEAR_INDICATORS.some((re) => re.test(rawQuery))) {
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

  // 6. Locale hint detection (language decoupled from country!)
  // ONLY set country when explicitly mentioned in query text.
  let language: string | undefined;
  const hasChinese = /[\u4e00-\u9fa5]/.test(rawQuery);
  const hasJapanese = /[\u3040-\u30ff]/.test(rawQuery);
  if (hasChinese) {
    language = "zh";
  } else if (hasJapanese) {
    language = "ja";
  }

  let country: string | undefined;
  const isGlobalScope = GLOBAL_SCOPE_INDICATORS.some((re) => re.test(rawQuery));
  if (!isGlobalScope) {
    const matchedCountries = EXPLICIT_COUNTRY_PATTERNS.filter((p) => p.re.test(rawQuery)).map((p) => p.country);
    const uniqueCountries = [...new Set(matchedCountries)];
    if (uniqueCountries.length === 1) {
      country = uniqueCountries[0];
    }
  }

  const locale: LocaleHint | undefined = language || country ? { language, country } : undefined;

  // Clean extra whitespaces in cleanQuery
  cleanQuery = cleanQuery
    .replace(/^[\s:：,，;；\-—]+|[\s:：,，;；\-—]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleanQuery) cleanQuery = rawQuery;

  return {
    topic,
    platform,
    platformExplicit: platformExplicit ? true : undefined,
    freshness,
    domains,
    locale,
    cleanQuery,
    rawQuery,
  };
}
