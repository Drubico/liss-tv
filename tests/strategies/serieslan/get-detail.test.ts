import test from "node:test";
import assert from "node:assert";
import {
  GetDetail,
  cleanSlug,
} from "../../../strategies/serieslan/get-detail.operation.ts";
import type {
  SeriesLanContentDetail,
  SeriesLanEpisodesResponse,
} from "../../../strategies/serieslan/types.ts";

test("cleanSlug removes leading /serie/ or /pelicula/ and slashes", () => {
  assert.strictEqual(cleanSlug("/serie/chicago-pd"), "chicago-pd");
  assert.strictEqual(cleanSlug("chicago-pd/"), "chicago-pd");
  assert.strictEqual(cleanSlug("/pelicula/some-movie"), "some-movie");
  assert.strictEqual(cleanSlug("breaking-bad"), "breaking-bad");
});

test("GetDetail returns undefined for movie paths", async () => {
  const getDetail = new GetDetail();
  const res = await getDetail.operation("/pelicula/avatar");
  assert.strictEqual(res, undefined);
});

test("GetDetail maps series detail and batches episode loading across seasons", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const mockDetail: SeriesLanContentDetail = {
    item: {
      catalog_item_id: 100,
      slug: "chicago-pd",
      title: "Policías de Chicago",
      year: 2014,
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      kind: "serie",
      vote_average: 8.4,
      url: "/serie/chicago-pd",
      overview: "Distrito 21 del departamento de policía.",
      tmdb_id: 58841,
    },
    episode_seasons: [
      {
        season: 1,
        count: 1,
        first_episode: 1,
        last_episode: 1,
        name: "Temporada 1",
        overview: null,
        playable_count: 1,
        poster_path: "/s1.jpg",
        air_date: "2014-01-08",
      },
    ],
  };

  const mockEpisodes: SeriesLanEpisodesResponse = {
    item_id: 100,
    season: 1,
    total: 1,
    episodes: [
      {
        episode: 1,
        season: 1,
        title: "Pasado sangriento",
        playable: true,
        player_url: "https://player.serieslan.live/e/tv/58841/1/1",
        still_path: "/ep1.jpg",
        url: "/serie/chicago-pd/temporada-1/episodio-1",
        air_date: "2014-01-08",
      },
    ],
  };

  global.fetch = (async (url: string) => {
    if (url.includes("/api/rest/v1/content/serie/chicago-pd")) {
      return new Response(JSON.stringify(mockDetail), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/rest/v1/episodes")) {
      return new Response(JSON.stringify(mockEpisodes), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  }) as unknown as typeof fetch;

  const getDetail = new GetDetail();
  const detail = await getDetail.operation("/serie/chicago-pd");

  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Policías de Chicago");
  assert.strictEqual(detail.year, "2014");
  assert.strictEqual(detail.rating, "8.4");
  assert.strictEqual(detail.caption, "Distrito 21 del departamento de policía.");
  assert.strictEqual(detail.image, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.strictEqual(detail.backgroundImage, "https://image.tmdb.org/t/p/original/backdrop.jpg");
  assert.strictEqual(detail.episodes?.length, 1);
  assert.strictEqual(detail.episodes[0].season, 1);
  assert.strictEqual(detail.episodes[0].episodes.length, 1);

  const ep = detail.episodes[0].episodes[0];
  assert.strictEqual(ep.numberEpisode, "1");
  assert.strictEqual(ep.title, "Pasado sangriento");
  assert.strictEqual(ep.link, "/serie/chicago-pd/player?season=1&episode=1");
  assert.strictEqual(ep.context?.tmdb_id, 58841);
  assert.strictEqual(ep.context?.player_url, "https://player.serieslan.live/e/tv/58841/1/1");
});
