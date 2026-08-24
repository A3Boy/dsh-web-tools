import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  extractTweetsFromSearchTimeline,
  isSearchTimelineResponse,
  normalizeTweet,
  parseXDateToken,
  unwrapTweetResult,
} from "../src/host/sources/x/normalize.ts";
import type { XTimelineInstruction } from "../src/host/sources/x/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "x-searchtimeline.json"), "utf-8"),
) as {
  timeline: Array<{
    entryId: string;
    rest_id: string;
    legacy: any;
    core: any;
    note_tweet?: any;
  }>;
};

/**
 * Wrap the desensitized fixture entries into the real SearchTimeline envelope
 * shape (instruction.type = "TimelineAddEntries", tweet under
 * content.itemContent.tweet_results.result with __typename "Tweet").
 */
function buildEnvelope(entries: typeof fixture.timeline): unknown {
  const instruction: XTimelineInstruction = {
    type: "TimelineAddEntries",
    entries: entries.map((e) => ({
      entryId: e.entryId,
      content: {
        __typename: "TimelineItem",
        entryType: "TimelineTimelineItem",
        itemContent: {
          __typename: "TimelineTweet",
          itemType: "TimelineTweet",
          tweetDisplayType: "Tweet",
          tweet_results: {
            result: {
              __typename: "Tweet",
              rest_id: e.rest_id,
              legacy: e.legacy,
              core: e.core,
              note_tweet: e.note_tweet,
            },
          },
        },
      },
    })),
  };
  return {
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: { instructions: [instruction] },
        },
      },
    },
  };
}

test("P7.2-A: extracts real tweets from the SearchTimeline fixture", () => {
  const envelope = buildEnvelope(fixture.timeline);
  const items = extractTweetsFromSearchTimeline(envelope);

  assert.equal(items.length, 3);

  // Entry 0: long-form note_tweet wins over truncated full_text; author parsed
  const first = items[0];
  assert.equal(first.id, "2091712775324381209");
  assert.ok(first.text!.includes("pi install"), "note_tweet text must win");
  assert.ok(first.text!.startsWith("如果你有 ChatGPT Plus 订阅"));
  assert.equal(first.author?.name, "LinearUncle");
  assert.equal(first.author?.handle, "@LinearUncle");
  assert.equal(first.url, "https://x.com/LinearUncle/status/2091712775324381209");
  assert.ok(first.publishedAt, "created_at must parse to RFC3339");
  assert.equal(first.likes, 18);
  assert.equal(first.retweets, 0);
  assert.equal(first.replies, 2);
  assert.deepEqual(first.images, ["https://pbs.twimg.com/media/HQc_eMGbYAII57c.jpg"]);

  // Entry 2: video poster via extended_entities.media
  const third = items[2];
  assert.equal(third.author?.name, "OpenAI");
  assert.equal(third.author?.handle, "@OpenAI");
  assert.deepEqual(third.images, [
    "https://pbs.twimg.com/amplify_video_thumb/2090884941819285504/img/JpIf7VDQGLhawgzB.jpg",
  ]);
  assert.equal(third.coverImage, third.images![0]);
});

test("P7.2-A: t.co short links are expanded via entities.urls.expanded_url", () => {
  const noteTweet: typeof fixture.timeline[number] = {
    entryId: "tweet-1",
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
          rest_id: "u1",
          core: { name: "Dev", screen_name: "dev" },
        },
      },
    },
  };
  const items = extractTweetsFromSearchTimeline(buildEnvelope([noteTweet]));
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
  assert.equal(isSearchTimelineResponse(buildEnvelope(fixture.timeline)), true);
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