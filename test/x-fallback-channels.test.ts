import assert from "node:assert/strict";
import test from "node:test";
import {
  XSource,
  setSyndicationFetcher,
  setFxTwitterFetcher,
  mapFxTwitterTweet,
  mergeFxTwitterInto,
} from "../src/host/sources/x.ts";
import { mapSyndicationTweet } from "../src/host/sources/x.ts";
import { SpecializedSourceRegistry } from "../src/host/sources/registry.ts";
import type { SpecializedSource, SourceStatus, SourceItem } from "../src/host/sources/types.ts";

const TWEET_URL = "https://x.com/vincent_ddup/status/2122917213342720381";

// Shape mirrors a real api.fxtwitter.com response (fields verified live).
const FX_PAYLOAD = {
  url: TWEET_URL,
  id: "2122917213342720381",
  text: "想把 Muse 变成 X 情报研究高手，这 4 个工具可以试试！！！",
  author: {
    screen_name: "vincent_ddup",
    name: "V哥来了",
    url: "https://x.com/vincent_ddup",
  },
  likes: 283,
  retweets: 28,
  replies: 46,
  created_timestamp: 1765196280,
  created_at: "Wed Nov 18 04:58:00 +0000 2026",
  media: {
    photos: [{ type: "photo", url: "https://pbs.twimg.com/media/abc.jpg" }],
    videos: [{ type: "video", url: "https://video.twimg.com/xyz.mp4", contentType: "video/mp4" }],
  },
};

const SYNDICATION_PAYLOAD = {
  id_str: "2122917213342720381",
  text: "想把 Muse 变成 X 情报研究高手，这 4 个工具可以试试！！！",
  user: { screen_name: "vincent_ddup", name: "V哥来了" },
  created_at: "Wed Nov 18 04:58:00 +0000 2026",
  favorite_count: 283,
  conversation_count: 46,
};

test("mapFxTwitterTweet: maps text, author, engagement, media, and ISO date", () => {
  const item = mapFxTwitterTweet(FX_PAYLOAD, TWEET_URL);
  assert.ok(item);
  assert.equal(item.id, "2122917213342720381");
  assert.equal(item.platform, "x");
  assert.match(item.text ?? "", /Muse/);
  assert.equal(item.likes, 283);
  assert.equal(item.retweets, 28);
  assert.equal(item.replies, 46);
  assert.equal(item.author?.handle, "@vincent_ddup");
  assert.equal(item.author?.name, "V哥来了");
  assert.deepEqual(item.images, ["https://pbs.twimg.com/media/abc.jpg"]);
  assert.equal(item.videoUrl, "https://video.twimg.com/xyz.mp4");
  assert.equal(item.publishedAt, new Date(1765196280 * 1000).toISOString());
});

test("mapFxTwitterTweet: returns null for an empty payload and tolerates missing media", () => {
  assert.equal(mapFxTwitterTweet(null, TWEET_URL), null);
  assert.equal(mapFxTwitterTweet({}, TWEET_URL), null);
  const minimal = mapFxTwitterTweet({ id: "123", text: "hi" }, TWEET_URL);
  assert.ok(minimal);
  assert.equal(minimal.images, undefined);
  assert.equal(minimal.videoUrl, undefined);
});

test("mergeFxTwitterInto: fills gaps additively, never overrides first-party values", () => {
  const base = mapSyndicationTweet(SYNDICATION_PAYLOAD, TWEET_URL)!;
  // First-party values present: likes / replies / text / author stay.
  assert.equal(base.likes, 283);
  // Gaps syndication does not carry: retweets, images, video.
  mergeFxTwitterInto(base, FX_PAYLOAD);
  assert.equal(base.retweets, 28);
  assert.deepEqual(base.images, ["https://pbs.twimg.com/media/abc.jpg"]);
  assert.equal(base.videoUrl, "https://video.twimg.com/xyz.mp4");
  assert.equal(base.likes, 283, "syndication value must win over the proxy value");
});

function stubRuntime(authenticated: boolean) {
  return {
    verifyAuthenticationForOperation: async () => authenticated,
    createPage: async () => {
      throw new Error("browser must not be used in these tests");
    },
  } as any;
}

test("XSource.fetch: public fallbacks never serve or merge a different tweet", async () => {
  setSyndicationFetcher(async () => ({ ...SYNDICATION_PAYLOAD, id_str: "999" }));
  setFxTwitterFetcher(async () => ({ ...FX_PAYLOAD, id: "888" }));
  try {
    const source = new XSource(stubRuntime(false));
    const outcome = await source.fetch(TWEET_URL);
    assert.equal(outcome.item, undefined, "wrong identity must not be relabelled with the requested URL");
    setSyndicationFetcher(async () => SYNDICATION_PAYLOAD);
    const matched = await source.fetch(TWEET_URL);
    assert.equal(matched.item?.id, SYNDICATION_PAYLOAD.id_str);
    assert.equal(matched.item?.retweets, undefined, "unrelated tweet metrics must not enrich the target");
  } finally {
    setSyndicationFetcher(async () => null);
    setFxTwitterFetcher(async () => null);
  }
});

test("XSource.fetch: caller cancellation stays aborted across public fallbacks", async () => {
  const controller = new AbortController();
  setSyndicationFetcher(async () => { controller.abort(); return null; });
  setFxTwitterFetcher(async () => null);
  try {
    const outcome = await new XSource(stubRuntime(false)).fetch(TWEET_URL, controller.signal);
    assert.equal(outcome.error?.code, "aborted");
  } finally {
    setSyndicationFetcher(async () => null);
    setFxTwitterFetcher(async () => null);
  }
});

test("XSource.fetch: merges syndication + FxTwitter when signed out, marks public-api", async () => {
  setSyndicationFetcher(async () => SYNDICATION_PAYLOAD);
  setFxTwitterFetcher(async () => FX_PAYLOAD);
  try {
    const source = new XSource(stubRuntime(false));
    const outcome = await source.fetch(TWEET_URL);
    assert.ok(outcome.item);
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.retrievalMode, "public-api");
    assert.equal(outcome.item.retweets, 28, "FxTwitter fills the syndication gap");
    assert.equal(outcome.item.likes, 283, "first-party value wins");
  } finally {
    setSyndicationFetcher(async () => null);
    setFxTwitterFetcher(async () => null);
  }
});

test("XSource.fetch: FxTwitter alone is enough when syndication is down", async () => {
  setSyndicationFetcher(async () => null);
  setFxTwitterFetcher(async () => FX_PAYLOAD);
  try {
    const source = new XSource(stubRuntime(false));
    const outcome = await source.fetch(TWEET_URL);
    assert.ok(outcome.item);
    assert.equal(outcome.retrievalMode, "public-api");
    assert.equal(outcome.item.retweets, 28);
  } finally {
    setSyndicationFetcher(async () => null);
    setFxTwitterFetcher(async () => null);
  }
});

test("XSource.fetch: auth-required when both public channels fail and signed out", async () => {
  setSyndicationFetcher(async () => null);
  setFxTwitterFetcher(async () => null);
  try {
    const source = new XSource(stubRuntime(false));
    const outcome = await source.fetch(TWEET_URL);
    assert.equal(outcome.item, undefined);
    assert.equal(outcome.error?.code, "auth-required");
  } finally {
    setSyndicationFetcher(async () => null);
    setFxTwitterFetcher(async () => null);
  }
});

function stubSource(impl: Partial<SpecializedSource>): SpecializedSource {
  return {
    id: "x",
    name: "stub",
    status: async (): Promise<SourceStatus> => ({ id: "x", name: "stub", enabled: true, runtimeAvailable: false, runtimeState: "unavailable", authenticated: false }),
    search: async () => ({ items: [] }),
    fetch: async () => ({ error: { code: "unknown", message: "not stubbed", retryable: false } }),
    ...impl,
  } as SpecializedSource;
}

const GENERAL_PAGE = {
  url: "https://publish.twitter.com/oembed?url=https%3A%2F%2Fx.com%2Fvincent_ddup%2Fstatus%2F2122917213342720381",
  metadata: { title: "oEmbed" },
  body: { content: "{\"html\":\"...\"}" },
};

test("registry: publish.twitter.com falls to general fetch instead of hard-failing in the native source", async () => {
  const registry = new SpecializedSourceRegistry();
  let nativeCalls = 0;
  registry.registerSource(
    stubSource({
      fetch: async () => {
        nativeCalls++;
        return { error: { code: "parse-failed", message: "Invalid X status URL", retryable: false } };
      },
    }),
  );
  registry.setFallbackProviders(undefined, {
    fetch: async ({ url }: { url: string }) => ({ ...GENERAL_PAGE, url }),
  } as any);

  const outcome = await registry.fetch(GENERAL_PAGE.url);
  assert.equal(nativeCalls, 0, "a twitter.com domain without a status ID must not reach the native source");
  assert.equal(outcome.retrievalMode, "general-web");
  assert.equal(outcome.error, undefined);
});

test("registry: real status URLs still route native, and public-api labels are preserved", async () => {
  const registry = new SpecializedSourceRegistry();
  registry.registerSource(
    stubSource({
      fetch: async () => ({
        item: { id: "2122917213342720381", title: "t", url: TWEET_URL, platform: "x" } as SourceItem,
        retrievalMode: "public-api",
      }),
    }),
  );

  const outcome = await registry.fetch(TWEET_URL);
  assert.ok(outcome.item);
  assert.equal(
    outcome.retrievalMode,
    "public-api",
    "a source-declared public-api channel must not be relabelled native-browser",
  );
});
