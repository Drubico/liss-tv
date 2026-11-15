import test from "node:test";
import assert from "node:assert";
import {
  serieslanFetch,
  buildSerieslanUrl,
  SERIESLAN_BASE_URL,
} from "../../../strategies/serieslan/client.ts";

test("buildSerieslanUrl builds correct absolute URL with query parameters", () => {
  const url = buildSerieslanUrl("/api/rest/v1/listing", {
    kind: "series",
    order: "recent",
    page: 2,
  });

  assert.strictEqual(
    url,
    `${SERIESLAN_BASE_URL}/api/rest/v1/listing?kind=series&order=recent&page=2`
  );
});

test("serieslanFetch wraps HTTP failure in ProviderError", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = (async () => {
    return new Response("Not Found", { status: 404, statusText: "Not Found" });
  }) as unknown as typeof fetch;

  await assert.rejects(
    async () => {
      await serieslanFetch("/api/rest/v1/unknown");
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert(err.message.includes("[SeriesLanClient] Request to"));
      assert(err.message.includes("failed with HTTP status 404"));
      return true;
    }
  );
});

test("serieslanFetch parses JSON response successfully", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const mockPayload = { items: [{ title: "Test" }], pagination: { total: 1 } };
  global.fetch = (async () => {
    return new Response(JSON.stringify(mockPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;

  const result = await serieslanFetch<typeof mockPayload>("/api/rest/v1/listing");
  assert.strictEqual(result.items[0].title, "Test");
  assert.strictEqual(result.pagination.total, 1);
});
