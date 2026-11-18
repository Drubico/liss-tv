import test from "node:test";
import assert from "node:assert";
import {
  seriesmetroFetch,
  SERIESMETRO_BASE_URL,
  SeriesmetroError,
} from "../../../strategies/seriesmetro/client.ts";

test("seriesmetroFetch prepends base URL and attaches desktop headers", async (t) => {
  const originalFetch = global.fetch;
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return new Response("<html>OK</html>", { status: 200 });
  }) as typeof fetch;

  const res = await seriesmetroFetch("/cartelera-peliculas/");
  assert.strictEqual(
    capturedUrl,
    `${SERIESMETRO_BASE_URL}/cartelera-peliculas/`
  );
  assert(capturedHeaders["User-Agent"]?.includes("Mozilla/5.0"));
  assert(capturedHeaders["Referer"]?.includes(SERIESMETRO_BASE_URL));
  assert.strictEqual(res.status, 200);
});

test("seriesmetroFetch throws SeriesmetroError on HTTP error status", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = (async () =>
    new Response("Not Found", { status: 404 })) as typeof fetch;

  await assert.rejects(
    async () => {
      await seriesmetroFetch("/error-endpoint");
    },
    (err: unknown) => {
      assert(err instanceof SeriesmetroError);
      assert.strictEqual(err.status, 404);
      assert(err.message.includes("404"));
      return true;
    }
  );
});
