/**
 * X / Twitter GraphQL raw wire types for the CDP Network Capture path.
 *
 * IMPORTANT: these reflect the REAL schema captured from a live SearchTimeline
 * response (test/fixtures/x-searchtimeline.json), not a hand-guessed mock.
 * Key modernizations vs legacy Twitter API:
 *  - timeline instructions carry `type` (not `__typename`): "TimelineAddEntries"
 *  - user identity lives at core.user_results.result.core.{name,screen_name}
 *    (the legacy `legacy` block on user results is gone)
 *  - long-form tweets prefer note_tweet.note_tweet_results.result.text
 */
export {};
