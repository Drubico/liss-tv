import { test } from "node:test";
import assert from "node:assert/strict";

test("segment responses set immutable public cache headers", () => {
  const headers = new Headers();
  headers.set("Content-Type", "video/mp2t");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Range");
  headers.set("Cache-Control", "public, max-age=86400, immutable");
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Range, Content-Length, Accept-Ranges",
  );

  assert.equal(headers.get("Cache-Control"), "public, max-age=86400, immutable");
  assert.equal(headers.get("Access-Control-Allow-Origin"), "*");
  assert.ok(headers.get("Access-Control-Expose-Headers")?.includes("Content-Range"));
});

test("upstream headers include referer when refererParam is provided", () => {
  const refererParam = "https://upstream.cdn/embed/123";
  const headers: Record<string, string> = {
    "user-agent": "Mozilla/5.0",
    ...(refererParam ? { referer: refererParam } : {}),
  };

  assert.equal(headers.referer, "https://upstream.cdn/embed/123");
});
