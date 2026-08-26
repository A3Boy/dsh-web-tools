import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  extractTweetFromTweetDetail,
  extractCommentsFromTweetDetail,
  extractTweetIdFromUrl,
  extractTweetsFromSearchTimeline,
  isSearchTimelineResponse,
  isTweetDetailResponse,
  normalizeTweet,
  parseXDateToken,
  unwrapTweetResult,
} from "../src/host/sources/x/normalize.ts";
import type { XTimelineInstruction } from "../src/host/sources/x/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "x-searchtimeline.json"), "utf-8"),
);

test("P7.2-A: extracts real tweets directly from the SearchTimeline full GraphQL envelope fixture", () => {
  assert.equal(isSearchTimelineResponse(fixture), true, "fixture must match recognized SearchTimeline schema");
  const items = extractTweetsFromSearchTimeline(fixture);

  assert.equal(items.length, 3);

  // Entry 0: Tibo @thsottiaux
  const first = items[0];
  assert.equal(first.id, "2091688655828246890");
  assert.equal(first.author?.name, "Tibo");
  assert.equal(first.author?.handle, "@thsottiaux");
  assert.equal(first.url, "https://x.com/thsottiaux/status/2091688655828246890");
  assert.ok(first.publishedAt, "created_at must parse to RFC3339");
  assert.equal(first.likes, 7271);
  assert.equal(first.retweets, 311);
  assert.equal(first.replies, 1046);

  // Entry 1: LinearUncle note_tweet wins over truncated full_text
  const second = items[1];
  assert.equal(second.id, "2091712775324381209");
  assert.ok(second.text!.includes("pi install"), "note_tweet text must win");
  assert.ok(second.text!.startsWith("如果你有 ChatGPT Plus 订阅"));
  assert.equal(second.author?.name, "LinearUncle");
  assert.equal(second.author?.handle, "@LinearUncle");
  assert.equal(second.url, "https://x.com/LinearUncle/status/2091712775324381209");
  assert.deepEqual(second.images, ["https://pbs.twimg.com/media/HQc_eMGbYAII57c.jpg"]);

  // Entry 2: animated_gif poster via extended_entities.media
  const third = items[2];
  assert.equal(third.author?.name, "Mete Polat");
  assert.equal(third.author?.handle, "@metedata");
  assert.deepEqual(third.images, [
    "https://pbs.twimg.com/tweet_video_thumb/HPvf3PMWUAAH5u1.jpg",
  ]);
  assert.equal(third.coverImage, third.images![0]);
});

test("P7.2-A: t.co short links are expanded via entities.urls.expanded_url", () => {
  const envelope = {
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: {
            instructions: [
              {
                type: "TimelineAddEntries",
                entries: [
                  {
                    entryId: "tweet-1",
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: "Tweet",
                            rest_id: "1",
                            legacy: {
                              full_text: "Check this https://t.co/short123",
                              created_at: "Mon Aug 24 00:00:00 +0000 2026",
                              entities: {
                                urls: [
                                  {
                                    url: "https://t.co/short123",
                                    expanded_url: "https://github.com/example/repo",
                                  },
                                ],
                              },
                            },
                            core: {
                              user_results: {
                                result: {
                                  core: { name: "Dev", screen_name: "dev" },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };
  const items = extractTweetsFromSearchTimeline(envelope);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "Check this https://github.com/example/repo");
});

test("P7.2-A: unwrapTweetResult handles TweetWithVisibilityResults and discards tombstones", () => {
  const inner = { __typename: "Tweet", rest_id: "42", legacy: { full_text: "visible" } } as any;
  const wrapped = { __typename: "TweetWithVisibilityResults", tweet: inner } as any;
  assert.equal((unwrapTweetResult(wrapped) as any)?.rest_id, "42");
  assert.equal(unwrapTweetResult(inner)?.rest_id, "42");
  assert.equal(unwrapTweetResult({ __typename: "TweetTombstone" } as any), undefined);
  assert.equal(unwrapTweetResult(undefined), undefined);
});

test("P7.2-A: parseXDateToken converts X legacy date to RFC3339", () => {
  const iso = parseXDateToken("Mon Aug 24 02:22:42 +0000 2026");
  assert.equal(iso, "2026-08-24T02:22:42.000Z");
  assert.equal(parseXDateToken("garbage"), undefined);
  assert.equal(parseXDateToken(undefined), undefined);
});

test("P7.2-A: normalizeTweet drops tweets without id or usable text", () => {
  assert.equal(normalizeTweet({} as any), undefined);
  assert.equal(
    normalizeTweet({ __typename: "Tweet", rest_id: "1", legacy: { full_text: "" } } as any),
    undefined,
  );
  assert.equal(
    normalizeTweet({ __typename: "Tweet", rest_id: "1", legacy: {} } as any),
    undefined,
  );
});

test("P7.2-A: isSearchTimelineResponse recognizes valid / rejects invalid shapes", () => {
  assert.equal(isSearchTimelineResponse(fixture), true);
  assert.equal(isSearchTimelineResponse({ data: {} }), false);
  assert.equal(isSearchTimelineResponse(null), false);
  assert.equal(isSearchTimelineResponse("string"), false);
});

test("P7.2-A: extraction ignores cursor, promoted, and tombstones without crashing", () => {
  const cursorEntry = {
    entryId: "cursor-bottom-abc",
    content: { itemContent: { tweet_results: { result: { __typename: "Tweet", rest_id: "99" } } } },
  };
  const promotedEntry = {
    entryId: "promoted-tweet-1",
    content: { itemContent: { tweet_results: { result: { __typename: "Tweet", rest_id: "88" } } } },
  };
  const tombstoneEntry = {
    entryId: "tweet-dead",
    content: { itemContent: { tweet_results: { result: { __typename: "TweetTombstone" } } } },
  };
  const envelope = {
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: {
            instructions: [
              {
                type: "TimelineAddEntries",
                entries: [cursorEntry, promotedEntry, tombstoneEntry],
              },
            ],
          },
        },
      },
    },
  };
  const items = extractTweetsFromSearchTimeline(envelope);
  assert.equal(items.length, 0);
});

test("P7.2-A: unsupported instruction types are skipped (no false positives)", () => {
  const envelope = {
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: {
            instructions: [
              {
                type: "TimelineModule",
                entries: [
                  {
                    entryId: "tweet-1",
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: "Tweet",
                            rest_id: "1",
                            legacy: { full_text: "module tweet should be ignored" },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };
  const items = extractTweetsFromSearchTimeline(envelope);
  assert.equal(items.length, 0, "only add/pin/replace instructions are collected");
});

test("P7.2-B: extractTweetIdFromUrl parses tweet IDs reliably", () => {
  assert.equal(extractTweetIdFromUrl("https://x.com/thsottiaux/status/2091688655828246890"), "2091688655828246890");
  assert.equal(extractTweetIdFromUrl("https://twitter.com/i/status/123456789?s=20"), "123456789");
  assert.equal(extractTweetIdFromUrl("https://x.com/home"), undefined);
  assert.equal(extractTweetIdFromUrl(""), undefined);
});

test("P7.2-B: extracts focal tweet from live TweetDetail fixture", () => {
  const detailFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "x-tweetdetail.json"), "utf-8"),
  );
  assert.equal(isTweetDetailResponse(detailFixture), true);

  const focal = extractTweetFromTweetDetail(detailFixture, "2091688655828246890");
  assert.ok(focal, "must find focal tweet by ID");
  assert.equal(focal.id, "2091688655828246890");
  assert.equal(focal.author?.name, "Tibo");
  assert.equal(focal.author?.handle, "@thsottiaux");
  assert.ok(focal.text!.startsWith("Good Sunday"));
  assert.equal(focal.likes, 7470);
  assert.equal(focal.platform, "x");

  // Mismatch returns undefined
  const missing = extractTweetFromTweetDetail(detailFixture, "non_existent_id");
  assert.equal(missing, undefined);
});

test("P7.2-B: extracts the focal tweet's reply tree from live TweetDetail fixture", () => {
  const detailFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "x-tweetdetail.json"), "utf-8"),
  );
  const comments = extractCommentsFromTweetDetail(detailFixture, "2091688655828246890");

  assert.deepEqual(comments.map((comment) => comment.id), [
    "2091691767267774755",
    "2091709346371838240",
  ]);
  assert.equal(comments[0].parentId, "2091688655828246890");
  assert.equal(comments[1].parentId, "2091691767267774755");
  assert.equal(comments[0].author?.handle, "@hooftly");
});

test("P7.2-B: extracts nested conversation thread replies by target ID", () => {
  const threadFixture = {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [
          {
            type: "TimelineAddEntries",
            entries: [
              {
                entryId: "conversationthread-1",
                content: {
                  items: [
                    {
                      item: {
                        itemContent: {
                          tweet_results: {
                            result: {
                              __typename: "Tweet",
                              rest_id: "reply_999",
                              legacy: {
                                full_text: "This is a nested thread reply",
                                created_at: "Mon Aug 24 01:00:00 +0000 2026",
                                favorite_count: 5,
                              },
                              core: {
                                user_results: {
                                  result: {
                                    core: { name: "Replier", screen_name: "replier" },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  };

  const item = extractTweetFromTweetDetail(threadFixture, "reply_999");
  assert.ok(item);
  assert.equal(item.id, "reply_999");
  assert.equal(item.author?.name, "Replier");
  assert.equal(item.text, "This is a nested thread reply");
});
