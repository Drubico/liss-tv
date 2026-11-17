import test from "node:test";
import assert from "node:assert";
import {
  MEGADEDE_BASE_URL,
  MegadedeError,
  megadedeFetch,
} from "../../../strategies/megadede/client.ts";

test("MegadedeError inherits from Error and preserves status", () => {
  const err = new MegadedeError("Test error", 404);
  assert.strictEqual(err.name, "MegadedeError");
  assert.strictEqual(err.message, "Test error");
  assert.strictEqual(err.status, 404);
  assert(err instanceof Error);
});

test("megadedeFetch resolves relative paths against MEGADEDE_BASE_URL", async (t) => {
  const originalFetch = global.fetch;
  let requestedUrl = "";
  let requestedHeaders: Record<string, string> = {};

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = input.toString();
    requestedHeaders = (init?.headers as Record<string, string>) || {};
    return new Response("<html>OK</html>", { status: 200 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const res = await megadedeFetch("/peliculas?page=1");
  assert.strictEqual(requestedUrl, `${MEGADEDE_BASE_URL}/peliculas?page=1`);
  assert.strictEqual(requestedHeaders["Referer"], `${MEGADEDE_BASE_URL}/`);
  assert(requestedHeaders["User-Agent"]?.includes("Mozilla/5.0"));
  const text = await res.text();
  assert.strictEqual(text, "<html>OK</html>");
});

test("megadedeFetch throws MegadedeError on 4xx/5xx responses", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response("Not Found", { status: 404 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  await assert.rejects(
    async () => {
      await megadedeFetch("/not-existing");
    },
    (err: unknown) => {
      assert(err instanceof MegadedeError);
      assert.strictEqual(err.status, 404);
      assert(err.message.includes("404"));
      return true;
    }
  );
});
