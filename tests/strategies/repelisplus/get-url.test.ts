import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GetUrl } from "@/strategies/repelisplus/get-url.operation";
import { RepelisPlusError } from "@/strategies/repelisplus/types";

describe("RepelisPlus GetUrl Operation", () => {
  it("should resolve servers from detailContext and return primary and fallback streams", async () => {
    const mockFlareFetch = async () => new Response("", { status: 200 });
    const mockResolver = async (url: string) => {
      if (url.includes("server1")) return "https://cdn.example.com/stream1.m3u8";
      if (url.includes("server2")) return "https://cdn.example.com/stream2.m3u8";
      return null;
    };

    const getUrl = new GetUrl(mockFlareFetch, mockResolver);
    const result = await getUrl.operation("/pelicula/silent-night/", {
      detailContext: {
        servers: ["https://example.com/e/server1", "https://example.com/e/server2"],
      },
    });

    assert.equal(result.url, "https://cdn.example.com/stream1.m3u8");
    assert.equal(result.fallbackUrl, "https://cdn.example.com/stream2.m3u8");
  });

  it("should throw RepelisPlusError when no valid streams can be resolved", async () => {
    const mockFlareFetch = async () => new Response("<html>No servers</html>", { status: 200 });
    const mockResolver = async () => null;

    const getUrl = new GetUrl(mockFlareFetch, mockResolver);
    await assert.rejects(
      async () => await getUrl.operation("/pelicula/broken/"),
      (err: unknown) => {
        assert.ok(err instanceof RepelisPlusError);
        assert.ok((err as RepelisPlusError).message.includes("No playable stream found"));
        return true;
      },
    );
  });
});
