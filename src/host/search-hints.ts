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

export type SearchSort =
  | "general"
  | "time_descending"
  | "popularity_descending"
  | "comment_descending"
  | "collect_descending";

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
  sort?: SearchSort;
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

/**
 * Normalize an arbitrary sort string into canonical SearchSort.
 */
export function normalizeSearchSort(raw: unknown): SearchSort | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (/^(?:time|latest|newest|date|time_descending)$/.test(s)) return "time_descending";
  if (/^(?:likes?|popularity|hot|popular|popularity_descending)$/.test(s)) return "popularity_descending";
  if (/^(?:comments?|comment_descending)$/.test(s)) return "comment_descending";
  if (/^(?:collects?|collect_descending)$/.test(s)) return "collect_descending";
  if (/^(?:general|relevance|default)$/.test(s)) return "general";
  return undefined;
}

// Sort intent indicators and query cleaners (ordered by precedence)
const SORT_COMMENT_RE = /(?:按评论(?:量|数)?(?:排序)?|最多评论|评论(?:最多|最高|量最高|量排序|数排序)|最热评|most commented|sort by comments)/i;
const SORT_POPULARITY_RE = /(?:按点赞(?:量|数)?(?:排序)?|最多点赞|点赞(?:最多|最高|量最高|量排序|数排序)|最高赞|最多赞|按热度(?:排序)?|最热|热门|最火|most liked|most popular|sort by likes|top liked)/i;
const SORT_COLLECT_RE = /(?:按收藏(?:量|数)?(?:排序)?|最多收藏|收藏(?:最多|最高|量最高|量排序|数排序)|most collected|sort by collects)/i;
const SORT_TIME_RE = /(?:按(?:发布)?时间(?:排序)?|按最新(?:排序)?|时间倒序|最新(?!消息|动态|资讯|进展|版本|模型|论文|功能|特性|新闻|公告|通知|更新)|实时|刚发布|sort by (?:time|date)|newest|latest(?!\s+(?:news|version|update|model|paper|release)))/i;

const SORT_EXTRACTORS: Array<{ re: RegExp; sort: SearchSort }> = [
  { re: SORT_COMMENT_RE, sort: "comment_descending" },
  { re: SORT_POPULARITY_RE, sort: "popularity_descending" },
  { re: SORT_COLLECT_RE, sort: "collect_descending" },
  { re: SORT_TIME_RE, sort: "time_descending" },
];

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
const STRONG_CODE_INDICATORS = [
  /\b(github|gitlab|npm|pnpm|cargo|pip|pypi|nuget|crates\.io|stackoverflow|golang|typescript|python|rust|c\+\+|javascript|react|vue|svelte|docker|k8s|kubernetes|bash|powershell|postgres|redis|graphql|grpc|webhook|stacktrace|exception|panic|segfault|traceback|compiler)\b/i,
  /(?:代码|函数|报错|崩溃|源码|组件|编译|堆栈)/,
  /\b(pull request|async\/await|npm install|git commit|git push|git clone)\b/i,
];

const AMBIGUOUS_CODE_INDICATORS = [
  /\b(api|sdk|rest|bug|error|issue|pr|git|linux|sql|syntax)\b/i,
  /(?:接口|仓库|提交|版本号|配置|异常)/,
];

// News topic indicators
const STRONG_NEWS_INDICATORS = [
  /\b(breaking news|press release|headline)\b/i,
  /(?:快讯|发布会|突发新闻|动态播报)/,
];

const AMBIGUOUS_NEWS_INDICATORS = [
  /\b(news|breaking|announced|announcement|report|coverage)\b/i,
  /(?:新闻|报道|最新消息|动态|头条)/,
];

// Finance topic indicators
const STRONG_FINANCE_INDICATORS = [
  /\b(stock|shares|nasdaq|nyse|sec|10-k|10-q|earnings|revenue|market cap|valuation|ipo|crypto|bitcoin|ethereum|dividend|fiscal|quarterly|ebitda|bond issue|treasury yield|balance sheet|cash flow)\b/i,
  /(?:财报|股价|营收|市值|估值|财季|分红|股票|证券|上市|收益率|净利润|债券发行|资产负债表|现金流)/,
];

const AMBIGUOUS_FINANCE_INDICATORS = [
  /\b(bank|bond|fund|fed|inflation|interest rate|yield)\b/i,
  /(?:基金|银行|利率|通胀|国债)/,
];

// Research topic indicators
const STRONG_RESEARCH_INDICATORS = [
  /\b(arxiv|ablation|methodology|neurips|icml|iclr|cvpr|acl|ieee|springer|nature|science|state-of-the-art|sota)\b/i,
  /(?:论文|学术|消融实验|学术会议|研报|文献)/,
];

const AMBIGUOUS_RESEARCH_INDICATORS = [
  /\b(paper|research|study|benchmark|evaluation|dataset)\b/i,
  /(?:基准|评测|数据集)/,
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
// Note: 2-letter country codes (US, CN, JP, UK, GB, SG, DE, FR, CA) MUST be uppercase
// without /i to prevent false positives on common words (e.g. "give us the latest React docs", "de", "ca").
const EXPLICIT_COUNTRY_PATTERNS: Array<{
  namesRe: RegExp;
  codeRe: RegExp;
  country: string;
}> = [
  { namesRe: /(?:美国|美股|美联储|United States|USA)/i, codeRe: /\bUS\b/, country: "US" },
  { namesRe: /(?:中国|国内|A股|China)/i, codeRe: /\bCN\b/, country: "CN" },
  { namesRe: /(?:日本|日经|Japan)/i, codeRe: /\bJP\b/, country: "JP" },
  { namesRe: /(?:英国|United Kingdom)/i, codeRe: /\b(?:UK|GB)\b/, country: "GB" },
  { namesRe: /(?:新加坡|Singapore)/i, codeRe: /\bSG\b/, country: "SG" },
  { namesRe: /(?:德国|Germany)/i, codeRe: /\bDE\b/, country: "DE" },
  { namesRe: /(?:法国|France)/i, codeRe: /\bFR\b/, country: "FR" },
  { namesRe: /(?:加拿大|Canada)/i, codeRe: /\bCA\b/, country: "CA" },
];

/**
 * Strip conversational tails that hurt IN-PLATFORM keyword search.
 *
 * Platform search (X, Xiaohongshu) matches literal tokens: "GPTPLus 还值得开吗"
 * asks the platform for posts containing 还/值得/开, which mostly returns
 * unrelated opinion posts. General web engines handle natural language fine, so
 * this refinement is applied ONLY to the native platform query.
 *
 * Deliberately conservative: only well-known question/opinion tails and
 * leading politeness are removed; everything else is left intact.
 */
export function refinePlatformQuery(query: string): string {
  const original = (query ?? "").trim();
  if (!original) return original;

  let q = original;
  // Leading politeness ("请问…", "想问下…").
  q = q.replace(/^(?:请问|求问|想问一下|想问下|想请教一下|请教一下)[\s,，:：]*/u, "");
  // "值得买吗 / 还值得开吗 / 值不值得订阅" style tails.
  q = q.replace(/\s*(?:还)?(?:值得|值不值)(?:得)?(?:开|买|订阅|续费|用|入手)?(?:吗|么|呢)?[?？]?$/u, "");
  // Plain evaluation questions.
  q = q.replace(/\s*(?:怎么样|好不好用|好不好|行不行|靠谱吗|好用吗|如何)[?？]?$/u, "");
  // Dangling question marks / punctuation.
  q = q.replace(/[?？\s]+$/u, "");

  const refined = q.trim();
  // Never return an empty query: fall back to the original when the whole
  // query was a question tail.
  return refined.length > 0 ? refined : original;
}

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

  // 1.2 Extract Sort Intent (comments, likes/popularity, collects, time)
  let sort: SearchSort | undefined;
  for (const extractor of SORT_EXTRACTORS) {
    if (extractor.re.test(cleanQuery)) {
      sort = extractor.sort;
      cleanQuery = cleanQuery.replace(new RegExp(extractor.re.source, "gi"), " ");
      break;
    }
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

  // 3. Topic classification: multi-signal scoring system
  // Prevents ambiguous words (e.g. "bond issue 财报", "pr crisis") from being misclassified as "code".
  let topic: SearchTopic = "general";
  const scores: Record<SearchTopic, number> = {
    code: 0,
    finance: 0,
    research: 0,
    news: 0,
    general: 0,
  };

  // Domain signals (decisive +10)
  if (includeDomains.some((d) => d.includes("github.com") || d.includes("gitlab.com") || d.includes("stackoverflow.com"))) {
    scores.code += 10;
  }
  if (includeDomains.some((d) => d.includes("arxiv.org"))) {
    scores.research += 10;
  }

  // Strong keywords (+3) and ambiguous keywords (+1)
  if (STRONG_CODE_INDICATORS.some((re) => re.test(rawQuery))) scores.code += 3;
  if (AMBIGUOUS_CODE_INDICATORS.some((re) => re.test(rawQuery))) scores.code += 1;

  if (STRONG_FINANCE_INDICATORS.some((re) => re.test(rawQuery))) scores.finance += 3;
  if (AMBIGUOUS_FINANCE_INDICATORS.some((re) => re.test(rawQuery))) scores.finance += 1;

  if (STRONG_RESEARCH_INDICATORS.some((re) => re.test(rawQuery))) scores.research += 3;
  if (AMBIGUOUS_RESEARCH_INDICATORS.some((re) => re.test(rawQuery))) scores.research += 1;

  if (STRONG_NEWS_INDICATORS.some((re) => re.test(rawQuery))) scores.news += 3;
  if (AMBIGUOUS_NEWS_INDICATORS.some((re) => re.test(rawQuery))) scores.news += 1;

  const candidates: Array<[SearchTopic, number]> = [
    ["code", scores.code],
    ["finance", scores.finance],
    ["research", scores.research],
    ["news", scores.news],
  ];
  candidates.sort((a, b) => b[1] - a[1]);

  const [topTopic, topScore] = candidates[0];
  const secondScore = candidates[1][1];

  if (topScore >= 2 && topScore > secondScore) {
    topic = topTopic;
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
    const matchedCountries = EXPLICIT_COUNTRY_PATTERNS.filter(
      (p) => p.namesRe.test(rawQuery) || p.codeRe.test(rawQuery),
    ).map((p) => p.country);
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
    sort,
    domains,
    locale,
    cleanQuery,
    rawQuery,
  };
}
