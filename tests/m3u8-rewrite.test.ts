import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteManifest } from "../utils/m3u8.ts";

test("rewriteManifest proxies all URLs by default (backward compatible)", () => {
  const manifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nvariant.m3u8\n#EXTINF:10.0,\nsegment1.ts`;
  const result = rewriteManifest(manifest, "https://cdn.example.com/stream/master.m3u8", "https://app.example.com");

  assert.ok(result.includes("https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fvariant.m3u8"));
  assert.ok(result.includes("https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fsegment1.ts"));
});

test("rewriteManifest leaves segments direct when directSegments is true", () => {
  const manifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nvariant.m3u8\n#EXTINF:10.0,\nsegment1.ts\n#EXT-X-KEY:METHOD=AES-128,URI="enc.key"`;
  const result = rewriteManifest(manifest, "https://cdn.example.com/stream/master.m3u8", {
    baseOrigin: "https://app.example.com",
    directSegments: true,
  });

  // Variant sub-manifest should still be proxied
  assert.ok(result.includes("https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fvariant.m3u8&directSegments=true"));
  // Segment should point directly to upstream CDN
  assert.ok(result.includes("https://cdn.example.com/stream/segment1.ts"));
  assert.ok(!result.includes("/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fsegment1.ts"));
  // Key URI should still be proxied for CORS security
  assert.ok(result.includes('URI="https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fenc.key"'));
});

test("rewriteManifest appends referer to proxied URLs when provided", () => {
  const manifest = `#EXTM3U\n#EXTINF:10.0,\nsegment1.ts`;
  const result = rewriteManifest(manifest, "https://cdn.example.com/stream/index.m3u8", {
    baseOrigin: "",
    referer: "https://provider.example.com/embed/123",
  });

  assert.ok(result.includes("/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fsegment1.ts&referer=https%3A%2F%2Fprovider.example.com%2Fembed%2F123"));
});

test("rewriteManifest correctly recognizes and proxies .txt sub-manifests even with directSegments", () => {
  const masterManifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720
index.txt
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1920x1080
sub/video.m3u8
#EXTINF:10.0,
segment1.ts`;

  const result = rewriteManifest(
    masterManifest,
    "https://cdn.example.com/hls/master.txt",
    {
      baseOrigin: "https://app.example.com",
      directSegments: true,
      referer: "https://morencius.com/",
    }
  );

  assert.ok(
    result.includes(
      "https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Findex.txt&directSegments=true&referer=https%3A%2F%2Fmorencius.com%2F"
    )
  );
  assert.ok(
    result.includes(
      "https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Fsub%2Fvideo.m3u8&directSegments=true&referer=https%3A%2F%2Fmorencius.com%2F"
    )
  );
  // Segment should be direct when directSegments is true
  assert.ok(
    result.includes("https://cdn.example.com/hls/segment1.ts")
  );
});

