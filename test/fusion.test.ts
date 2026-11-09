import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeUrl, reciprocalRankFusion, type ProviderResultSet } from "../src/host/fusion.ts";

test("canonicalizeUrl normalizes host, ports, fragments and tracking params", () => {
  const url1 = "https://EXAMPLE.COM/page?utm_source=twitter&utm_medium=social#section-1";
  assert.equal(canonicalizeUrl(url1), "https://example.com/page");

  const url2 = "https://example.com/?fbclid=abc";
  assert.equal(canonicalizeUrl(url2), "https://example.com");

  const url3 = "http://example.com:80/docs/?fbclid=12345&important_arg=true";
  assert.equal(canonicalizeUrl(url3), "http://example.com/docs?important_arg=true");
});

test("canonicalizeUrl deduplicates www/non-www and trailing-slash variants", () => {
  assert.equal(canonicalizeUrl("https://www.example.com/a/"), canonicalizeUrl("https://example.com/a"));
  assert.equal(canonicalizeUrl("https://example.com/a/?utm_campaign=x"), canonicalizeUrl("https://example.com/a"));
});

test("canonicalizeUrl sorts query params so ordering does not split entries", () => {
  assert.equal(canonicalizeUrl("https://example.com/s?b=2&a=1"), canonicalizeUrl("https://example.com/s?a=1&b=2"));
});

test("canonicalizeUrl keeps ambiguous params instead of merging distinct pages", () => {
  // `source` / `from` / `ref` are meaningful on many sites; the previous list
  // stripped them and merged genuinely different documents.
  assert.equal(canonicalizeUrl("https://example.com/x?source=api"), "https://example.com/x?source=api");
  assert.equal(canonicalizeUrl("https://example.com/y?ref=docs"), "https://example.com/y?ref=docs");
  assert.notEqual(canonicalizeUrl("https://example.com/x?source=api"), canonicalizeUrl("https://example.com/x?source=human"));
});

test("reciprocalRankFusion promotes items matching across multiple providers", () => {
  const setA: ProviderResultSet = {
    provider: "brave",
    sources: [
      { url: "https://example.com/alpha", title: "Alpha Brave", snippet: "Short snippet" },
      { url: "https://example.com/beta", title: "Beta", snippet: "Beta snippet" },
    ],
  };

  const setB: ProviderResultSet = {
    provider: "tavily",
    sources: [
      { url: "https://example.com/gamma", title: "Gamma", snippet: "Gamma snippet" },
      { url: "https://www.example.com/alpha/?utm_source=newsletter", title: "Alpha Tavily", snippet: "Much longer and more informative snippet for alpha" },
    ],
  };

  const fused = reciprocalRankFusion([setA, setB]);

  // Alpha appeared in both sets (rank 1 in brave, rank 2 in tavily)
  // RRF score: 1/(60+1) + 1/(60+2) = 0.01639 + 0.01612 = ~0.0325
  // Gamma appeared rank 1 in tavily: 1/(60+1) = ~0.01639
  // Beta appeared rank 2 in brave: 1/(60+2) = ~0.01612
  assert.equal(fused[0].url, "https://example.com/alpha");
  assert.equal(fused[0].matchedProviders.length, 2);
  assert.ok(fused[0].matchedProviders.includes("brave"));
  assert.ok(fused[0].matchedProviders.includes("tavily"));
  // Snippet should be the longer one
  assert.equal(fused[0].snippet, "Much longer and more informative snippet for alpha");

  // Alpha's score must be strictly greater than Gamma's and Beta's
  assert.ok(fused[0].rrfScore > fused[1].rrfScore);
  assert.ok(fused[1].rrfScore > fused[2].rrfScore);
});

test("reciprocalRankFusion respects maxResults cap", () => {
  const set: ProviderResultSet = {
    provider: "serper",
    sources: [
      { url: "https://example.com/1", title: "1" },
      { url: "https://example.com/2", title: "2" },
      { url: "https://example.com/3", title: "3" },
      { url: "https://example.com/4", title: "4" },
    ],
  };

  const fused = reciprocalRankFusion([set], 60, 2);
  assert.equal(fused.length, 2);
  assert.equal(fused[0].url, "https://example.com/1");
  assert.equal(fused[1].url, "https://example.com/2");
});

test("reciprocalRankFusion keeps the first-seen original URL for display", () => {
  const fused = reciprocalRankFusion([
    { provider: "a", sources: [{ url: "https://www.example.com/page/" }] },
    { provider: "b", sources: [{ url: "https://example.com/page?utm_source=x" }] },
  ]);
  assert.equal(fused.length, 1);
  assert.equal(fused[0].url, "https://www.example.com/page/");
});
