import test from "node:test";
import assert from "node:assert";
import { mapPoseidonMovieDetail, mapPoseidonSerieDetail } from "../../../strategies/poseidon/get-detail.operation.ts";
import type { PoseidonThisMovie, PoseidonThisSerie } from "../../../strategies/poseidon/types.ts";

test("mapPoseidonMovieDetail extracts movie detail and preserves videos in context", () => {
  const movie: PoseidonThisMovie = {
    TMDbId: "100",
    titles: { name: "Inception" },
    images: {
      poster: "https://image.tmdb.org/t/p/original/p.jpg",
      backdrop: "https://image.tmdb.org/t/p/original/b.jpg",
    },
    overview: "A thief who steals corporate secrets...",
    releaseDate: "2010-07-16T00:00:00.000Z",
    runtime: 148,
    genres: [{ name: "Sci-Fi" }, { name: "Action" }],
    rate: { average: 8.8 },
    url: { slug: "movies/100/inception" },
    videos: {
      latino: [
        {
          cyberlocker: "vidara",
          result: "https://player.poseidonhd2.co/player.php?h=abc",
        },
      ],
    },
  };

  const detail = mapPoseidonMovieDetail(movie);
  assert.strictEqual(detail.title, "Inception");
  assert.strictEqual(detail.duration, "148 min");
  assert.deepStrictEqual(detail.tags, ["Sci-Fi", "Action"]);
  assert.strictEqual(detail.image, "https://image.tmdb.org/t/p/original/p.jpg");
  assert.strictEqual(detail.backgroundImage, "https://image.tmdb.org/t/p/original/b.jpg");
  assert.ok(detail.context?.videos);
});

test("mapPoseidonSerieDetail filters out empty season 0 and maps episodes", () => {
  const serie: PoseidonThisSerie = {
    TMDbId: "200",
    titles: { name: "Breaking Bad" },
    images: { poster: "https://image.tmdb.org/t/p/original/bb.jpg" },
    overview: "A chemistry teacher...",
    url: { slug: "series/200/breaking-bad" },
    seasons: [
      { number: 0, episodes: [] },
      {
        number: 1,
        episodes: [
          {
            number: 1,
            title: "Pilot",
            image: "https://image.tmdb.org/t/p/original/ep1.jpg",
            url: { slug: "series/200/breaking-bad/seasons/1/episodes/1" },
          },
        ],
      },
    ],
  };

  const detail = mapPoseidonSerieDetail(serie, "breaking-bad");
  assert.strictEqual(detail.episodes?.length, 1);
  assert.strictEqual(detail.episodes?.[0].season, "1");
  assert.strictEqual(detail.episodes?.[0].episodes[0].numberEpisode, "1");
  assert.strictEqual(detail.episodes?.[0].episodes[0].caption, "Pilot");
  assert.strictEqual(
    detail.episodes?.[0].episodes[0].link,
    "/serie/200/breaking-bad/temporada/1/episodio/1",
  );
});
