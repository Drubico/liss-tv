import { test } from "node:test";
import assert from "node:assert/strict";

export function resolveFallbackSource(params: {
  currentSrc: string;
  fallbackUrl?: string | null;
  fallbackFn?: () => Promise<string | null>;
}): Promise<string | null> {
  const { currentSrc, fallbackUrl, fallbackFn } = params;

  if (fallbackUrl && fallbackUrl !== currentSrc) {
    return Promise.resolve(fallbackUrl);
  }

  if (fallbackFn) {
    return fallbackFn().then((url) => {
      if (url && url !== currentSrc) return url;
      return null;
    });
  }

  return Promise.resolve(null);
}

test("resolveFallbackSource switches to fallbackUrl on fatal error when available", async () => {
  const primary = "https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fprimary.cdn.com%2Fmaster.txt";
  const fallback = "https://app.example.com/api/video/m3u8?url=https%3A%2F%2Ffallback.cdn.com%2Fmaster.m3u8";

  const nextSrc = await resolveFallbackSource({
    currentSrc: primary,
    fallbackUrl: fallback,
  });

  assert.strictEqual(nextSrc, fallback);
});

test("resolveFallbackSource resolves fallback function when fallbackUrl is absent", async () => {
  const primary = "https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fprimary.cdn.com%2Fmaster.txt";
  const fallbackResolved = "https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fsecondary.cdn.com%2Fmaster.m3u8";

  const nextSrc = await resolveFallbackSource({
    currentSrc: primary,
    fallbackFn: async () => fallbackResolved,
  });

  assert.strictEqual(nextSrc, fallbackResolved);
});

test("resolveFallbackSource returns null if fallback is identical to currentSrc", async () => {
  const primary = "https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fprimary.cdn.com%2Fmaster.txt";

  const nextSrc = await resolveFallbackSource({
    currentSrc: primary,
    fallbackUrl: primary,
  });

  assert.strictEqual(nextSrc, null);
});
