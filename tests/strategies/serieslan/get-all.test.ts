import test from "node:test";
import assert from "node:assert";
import {
  GetAll,
  mapSeriesLanItemToMovie,
} from "../../../strategies/serieslan/get-all.operation.ts";
import type { SeriesLanItem } from "../../../strategies/serieslan/types.ts";

test("mapSeriesLanItemToMovie maps item correctly to MediaItem domain model", () => {
  const item: SeriesLanItem = {
    catalog_item_id: 12345,
    slug: "chicago-pd",
    title: "Chicago P.D.",
    year: 2014,
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    kind: "serie",
    vote_average: 8.4,
    url: "/serie/chicago-pd",
  };

  const movie = mapSeriesLanItemToMovie(item);

  assert.strictEqual(movie.id, "chicago-pd");
  assert.strictEqual(movie.title, "Chicago P.D.");
  assert.strictEqual(movie.year, "2014");
  assert.strictEqual(movie.image, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.strictEqual(movie.link, "/serie/chicago-pd");
  assert.strictEqual(movie.type, "serie");
  assert.strictEqual(movie.provider, "serieslan");
  assert.strictEqual(movie.rating, "8.4");
});

test("GetAll returns empty movies list without calling API when filter is movies", async () => {
  const getAll = new GetAll();
  const response = await getAll.operation(undefined, "movies", 1);

  assert(response !== undefined);
  assert.deepStrictEqual(response.movies, []);
  assert.strictEqual(response.lastPageNumber, 0);
  assert.strictEqual(response.hasMore, false);
});

test("GetAll fetches catalog and maps items when filter is series or undefined", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const mockItem: SeriesLanItem = {
    catalog_item_id: 1,
    slug: "breaking-bad",
    title: "Breaking Bad",
    year: 2008,
    poster_path: "/bb.jpg",
    backdrop_path: "/bb-back.jpg",
    kind: "serie",
    vote_average: 9.5,
    url: "/serie/breaking-bad",
  };

  global.fetch = (async (url: string) => {
    assert(url.includes("/api/rest/v1/listing"));
    assert(url.includes("kind=series"));
    return new Response(
      JSON.stringify({
        items: [mockItem],
        pagination: {
          page: 1,
          limit: 24,
          total: 1,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as unknown as typeof fetch;

  const getAll = new GetAll();
  const response = await getAll.operation(undefined, "series", 1);

  assert(response !== undefined);
  assert.strictEqual(response.movies.length, 1);
  assert.strictEqual(response.movies[0].title, "Breaking Bad");
  assert.strictEqual(response.lastPageNumber, 1);
  assert.strictEqual(response.hasMore, false);
});

test("GetAll executes keyword search when search query is provided", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const mockItem: SeriesLanItem = {
    catalog_item_id: 2,
    slug: "dragon-ball-z",
    title: "Dragon Ball Z",
    year: 1989,
    poster_path: "/dbz.jpg",
    backdrop_path: "/dbz-back.jpg",
    kind: "serie",
    vote_average: 8.9,
    url: "/serie/dragon-ball-z",
  };

  global.fetch = (async (url: string) => {
    assert(url.includes("/api/rest/v1/search"));
    assert(url.includes("q=dragon"));
    return new Response(
      JSON.stringify({
        items: [mockItem],
        pagination: {
          page: 1,
          limit: 24,
          total: 1,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as unknown as typeof fetch;

  const getAll = new GetAll();
  const response = await getAll.operation("dragon", undefined, 1);

  assert(response !== undefined);
  assert.strictEqual(response.movies.length, 1);
  assert.strictEqual(response.movies[0].id, "dragon-ball-z");
  assert.strictEqual(response.movies[0].link, "/serie/dragon-ball-z");
});
