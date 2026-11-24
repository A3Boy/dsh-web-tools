import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMediaSection,
  pickHighestBitrateMp4,
  resolveXhsOriginalImage,
  toOriginalXImageUrl,
  withMediaSection,
} from "../src/host/sources/media.ts";

test("media: X image URLs are upgraded to the original-size variant", () => {
  assert.equal(
    toOriginalXImageUrl("https://pbs.twimg.com/media/ABC123?format=jpg&name=small"),
    "https://pbs.twimg.com/media/ABC123?format=jpg&name=orig",
  );
  assert.equal(
    toOriginalXImageUrl("https://pbs.twimg.com/media/ABC123"),
    "https://pbs.twimg.com/media/ABC123?format=jpg&name=orig",
  );
  assert.equal(toOriginalXImageUrl(""), "");
});

test("media: the highest-bitrate MP4 variant wins", () => {
  const url = pickHighestBitrateMp4([
    { content_type: "application/x-mpegURL", url: "https://video/m3u8" },
    { content_type: "video/mp4", bitrate: 832000, url: "https://video/832k.mp4" },
    { content_type: "video/mp4", bitrate: 2176000, url: "https://video/2176k.mp4" },
  ]);
  assert.equal(url, "https://video/2176k.mp4");
  assert.equal(pickHighestBitrateMp4(undefined), undefined);
});

test("media: the section lists images, video and tags; empty media adds nothing", () => {
  const section = formatMediaSection({
    images: ["https://img/1.jpg", "https://img/2.jpg"],
    videoUrl: "https://video/1080.mp4",
    tags: ["穿搭", "#数码"],
  });
  assert.ok(section.startsWith("[Media]"));
  assert.ok(section.includes("Images (2):"));
  assert.ok(section.includes("- https://img/1.jpg"));
  assert.ok(section.includes("Video (MP4): https://video/1080.mp4"));
  assert.ok(section.includes("Tags: #穿搭 #数码"));

  assert.equal(formatMediaSection({}), "");
  assert.equal(withMediaSection("正文", {}), "正文");
  assert.equal(withMediaSection(undefined, { videoUrl: "u" }), "[Media]\nVideo (MP4): u");
  assert.ok(withMediaSection("正文", { images: ["i"] })!.startsWith("正文\n\n[Media]"));
});

test("media: 小红书 image URLs map to the watermark-free CDN node", () => {
  const mapped = resolveXhsOriginalImage(
    "https://sns-webpic-qc.xhscdn.com/202601/abc/1040g2sg31b7d9n3l00005o1a1a1a1a1!nd_dft_wlteh_webp_3",
  );
  assert.equal(mapped, "https://sns-img-hw.xhscdn.com/1040g2sg31b7d9n3l00005o1a1a1a1a1?imageView2/2/w/format/png");

  const untouched = "https://ci.xiaohongshu.com/cover666.jpg";
  assert.equal(resolveXhsOriginalImage(untouched), untouched);
  assert.equal(resolveXhsOriginalImage(undefined), undefined);
});
