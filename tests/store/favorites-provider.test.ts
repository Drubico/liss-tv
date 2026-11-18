import test from "node:test";
import assert from "node:assert";

const memoryStore = new Map<string, string>();
const mockStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => memoryStore.set(key, value),
  removeItem: (key: string) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
  key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
  get length() {
    return memoryStore.size;
  },
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockStorage,
  configurable: true,
  writable: true,
});

import { useFavoritesStore, type FavoriteItem } from "../../store/useFavoritesStore.ts";

test("useFavoritesStore retains provider property on favorite items", async () => {
  const sampleItem: FavoriteItem = {
    link: "serie/breaking-bad",
    title: "Breaking Bad",
    image: "https://image.tmdb.org/t/p/w500/bb.jpg",
    provider: "seriesmetro",
    type: "serie",
  };

  await useFavoritesStore.getState().addFavorite(sampleItem);
  assert(useFavoritesStore.getState().isFavorite("serie/breaking-bad"));

  const saved = useFavoritesStore.getState().favorites.find((f) => f.link === "serie/breaking-bad");
  assert(saved !== undefined);
  assert.strictEqual(saved.provider, "seriesmetro");

  // Cleanup
  await useFavoritesStore.getState().removeFavorite("serie/breaking-bad");
});
