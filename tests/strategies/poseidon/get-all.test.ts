import test from "node:test";
import assert from "node:assert";
import { mapPoseidonItemToMovie } from "../../../strategies/poseidon/get-all.operation.ts";
import type { PoseidonMovieItem } from "../../../strategies/poseidon/types.ts";

test("mapPoseidonItemToMovie maps movie item correctly", () => {
  const item: PoseidonMovieItem = {
    TMDbId: "12345",
    titles: { name: "Batman Inicia" },
    images: { poster: "https://image.tmdb.org/t/p/original/poster.jpg" },
    releaseDate: "2005-06-15T00:00:00.000Z",
    rate: { average: 8.2 },
    url: { slug: "movies/12345/batman-inicia" },
  };
  const movie = mapPoseidonItemToMovie(item);
  assert.strictEqual(movie?.title, "Batman Inicia");
  assert.strictEqual(movie?.link, "/pelicula/batman-inicia");
  assert.strictEqual(movie?.year, "2005");
  assert.strictEqual(movie?.rating, "8.2");
});

test("mapPoseidonItemToMovie maps series item correctly", () => {
  const item: PoseidonMovieItem = {
    TMDbId: "999",
    titles: { name: "Dark" },
    images: { poster: "https://image.tmdb.org/t/p/original/dark.jpg" },
    releaseDate: "2017-12-01T00:00:00.000Z",
    url: { slug: "series/999/dark" },
  };
  const serie = mapPoseidonItemToMovie(item);
  assert.strictEqual(serie?.link, "/serie/dark");
  assert.strictEqual(serie?.year, "2017");
});
