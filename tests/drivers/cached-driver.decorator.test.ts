import test from "node:test";
import assert from "node:assert/strict";
import { CachedDriverDecorator } from "@/drivers/cached-driver.decorator";
import type { MovieDriver } from "@/types/movie";
import { get, clearProvider } from "@/services/movie.store";

test("CachedDriverDecorator stores and retrieves details scoped to its own provider ID", async () => {
  clearProvider("test-provider-a");
  clearProvider("test-provider-b");

  let innerCallsA = 0;
  const mockDriverA: MovieDriver = {
    id: "test-provider-a",
    name: "Test Provider A",
    async getAll() { return undefined; },
    async getDetail(_link: string) {
      innerCallsA++;
      return {
        title: "Test Movie from Provider A",
        image: "https://img.test/poster-a.jpg",
        backgroundImage: "https://img.test/bg-a.jpg",
        provider: "test-provider-a",
      };
    },
    async getUrl() { return { url: "" }; },
  };

  let innerCallsB = 0;
  const mockDriverB: MovieDriver = {
    id: "test-provider-b",
    name: "Test Provider B",
    async getAll() { return undefined; },
    async getDetail(_link: string) {
      innerCallsB++;
      return {
        title: "Test Movie from Provider B",
        image: "https://img.test/poster-b.jpg",
        backgroundImage: "https://img.test/bg-b.jpg",
        provider: "test-provider-b",
      };
    },
    async getUrl() { return { url: "" }; },
  };

  const decoratorA = new CachedDriverDecorator(mockDriverA);
  const decoratorB = new CachedDriverDecorator(mockDriverB);

  // First fetch on Provider A caches it
  const firstA = await decoratorA.getDetail("/pelicula/test-cross-provider");
  assert.equal(firstA?.title, "Test Movie from Provider A");
  assert.equal(innerCallsA, 1);

  // Subsequent fetch on Provider A comes from cache
  const cachedA = await decoratorA.getDetail("/pelicula/test-cross-provider");
  assert.equal(cachedA?.title, "Test Movie from Provider A");
  assert.equal(innerCallsA, 1);

  // Fetch on Provider B for same link MUST call Provider B, not read Provider A's cache!
  const firstB = await decoratorB.getDetail("/pelicula/test-cross-provider");
  assert.equal(firstB?.title, "Test Movie from Provider B");
  assert.equal(innerCallsB, 1);
});

test("CachedDriverDecorator does not cache empty details from innerDriver", async () => {
  clearProvider("empty-provider");
  let innerCalls = 0;
  const emptyDriver: MovieDriver = {
    id: "empty-provider",
    name: "Empty Provider",
    async getAll() { return undefined; },
    async getDetail() {
      innerCalls++;
      return { title: "", image: "", backgroundImage: "" };
    },
    async getUrl() { return { url: "" }; },
  };

  const decorator = new CachedDriverDecorator(emptyDriver);
  await decorator.getDetail("/pelicula/empty-item");
  assert.equal(innerCalls, 1);

  // Since it was empty, it should NOT be in cache
  const inStore = get("empty-provider", "/pelicula/empty-item");
  assert.equal(inStore, undefined);

  // Second call must call innerDriver again instead of reading empty cache
  await decorator.getDetail("/pelicula/empty-item");
  assert.equal(innerCalls, 2);
});
