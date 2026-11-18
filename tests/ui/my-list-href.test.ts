import test from "node:test";
import assert from "node:assert";
import { formatFavoriteHref } from "../../utils/navigation.ts";

test("formatFavoriteHref appends provider query parameter when present", () => {
  const itemWithProvider = {
    link: "serie/breaking-bad",
    title: "Breaking Bad",
    image: "https://example.com/img.jpg",
    provider: "seriesmetro",
  };
  assert.strictEqual(
    formatFavoriteHref(itemWithProvider),
    "/serie/breaking-bad?provider=seriesmetro"
  );
});

test("formatFavoriteHref preserves existing query params when appending provider", () => {
  const itemWithQuery = {
    link: "/pelicula/scream?lang=lat",
    title: "Scream",
    image: "https://example.com/img.jpg",
    provider: "megadede",
  };
  assert.strictEqual(
    formatFavoriteHref(itemWithQuery),
    "/pelicula/scream?lang=lat&provider=megadede"
  );
});

test("formatFavoriteHref returns clean link when provider is absent", () => {
  const legacyItem = {
    link: "pelicula/scream-3",
    title: "Scream 3",
    image: "https://example.com/img.jpg",
  };
  assert.strictEqual(formatFavoriteHref(legacyItem), "/pelicula/scream-3");
});
