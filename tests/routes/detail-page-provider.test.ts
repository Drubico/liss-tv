import test from "node:test";
import assert from "node:assert";
import { getDetails } from "../../app/actions/movie.ts";
import { upsert, remove } from "../../services/movie.store.ts";

test("getDetails forwards explicit providerId to driver resolution", async () => {
  const detail = await getDetails("pelicula/scream-3-la-mascara-de-la-muerte", "seriesmetro");
  assert(detail !== undefined);
  assert.strictEqual(detail.provider, "seriesmetro");
});

test("getDetails does not let another provider cache hijack active provider resolution", async () => {
  const testSlug = "serie/test-dexter-collision";
  remove("sololatino", testSlug);
  remove("seriesmetro", testSlug);

  // Pre-seed an alien cache entry under seriesmetro
  upsert("seriesmetro", testSlug, {
    title: "Dexter: Resurrección",
    image: "https://example.com/poster.jpg",
    backgroundImage: "https://example.com/backdrop.jpg",
    provider: "seriesmetro",
    type: "serie",
    episodes: [
      {
        season: "1",
        episodes: [
          {
            link: "test",
            title: "Ep 1",
            image: "https://example.com/ep1.jpg",
            numberEpisode: "1",
            caption: "Ep 1",
          },
        ],
      },
    ],
  });

  try {
    // When requesting without explicit providerId, active session provider (defaulting to megadede) must take precedence
    const detail = await getDetails(testSlug);
    // seriesmetro cache must NOT hijack resolution for the active megadede provider
    assert(detail === undefined || detail.provider !== "seriesmetro", "Expected detail to not be hijacked by seriesmetro cache");
  } finally {
    remove("seriesmetro", testSlug);
    remove("sololatino", testSlug);
  }
});

